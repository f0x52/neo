const React = require('react');
const ReactDOM = require('react-dom');
import Linkify from 'react-linkify';
const Promise = require('bluebird');

require('../scss/layout.scss');

let uniq = require('arr-uniq');
let defaultValue = require('default-value');
let create = require('create-react-class');
let urllib = require('url');
let debounce = require('debounce');

let persistLocalStorage = require('./lib/persist-local-storage');

// Components
let File = require('./components/fileUpload');
let RoomList = require('./components/roomList');

let neo = require('../assets/neo_full.png');
let blank = require('../assets/blank.jpg');
let loadingGif = require('../assets/loading.gif');

let VERSION = "alpha0.02";

let icon = {
  file: {
    dark: require('../assets/dark/file.svg'),
    light: require('../assets/light/file.svg')
  },
  send: {
    dark: require('../assets/dark/send.svg'),
    light: require('../assets/light/send.svg')
  },
  hamburger: {
    dark: require('../assets/dark/hamburger.svg')
  }
}

let App = create({
  displayName: "App",
  getInitialState: function() {
    let user = {};
    let userinfo = {};
    let rooms = {};
    let messages = {};
    if(localStorage.getItem("version") == VERSION) {
      user = JSON.parse(localStorage.getItem("user"));
      userinfo = JSON.parse(localStorage.getItem("userinfo"));
      console.log("loaded user data from storage");
    }
    return({
      user: user,
      userinfo: userinfo,
      rooms: rooms,
      invites: {},
      messages: messages,
      loading: 0,
      room: 0,
      backlog: 0
    });
  },

  componentDidMount: function() {
    if (this.state.user.access_token != undefined) {
      this.sync();
    }
  },

  loginCallback: function(json) {
    json.hs = urllib.parse("https://" + json.home_server);
    this.get_userinfo(json.user_id, json);
    localStorage.setItem("version", VERSION);
    localStorage.setItem("user", JSON.stringify(json));
    this.setState({
      user: json,
    });
    this.sync();
  },

  get_userinfo: function(id, user) {
    let userState = this.state.user;
    if (user != undefined) {
      userState = user;
    }
    let userinfo = this.state.userinfo;
    userinfo[id] = {name: id, img: blank};
    this.setState({userinfo: userinfo});

    let url = urllib.format(Object.assign({}, userState.hs, {
      pathname: `/_matrix/client/r0/profile/${id}/displayname`,
      query: {
        access_token: userState.access_token
      }
    }));

    this.nameFetch = fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.displayname != undefined) {
          userinfo = this.state.userinfo;
          userinfo[id].name = responseJson.displayname;
          this.setState({userinfo: userinfo});
          localStorage.setItem("userinfo", JSON.stringify(this.state.userinfo));
        }
      })

    url = urllib.format(Object.assign({}, userState.hs, {
      pathname: `/_matrix/client/r0/profile/${id}/avatar_url`,
      query: {
        access_token: userState.access_token
      }
    }));

    this.imgFetch = fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if(responseJson.errcode == undefined &&
          responseJson.avatar_url != undefined) {
          userinfo = this.state.userinfo;
          userinfo[id].img = urllib.format(Object.assign({}, userState.hs, {
            pathname: `/_matrix/media/r0/thumbnail/${responseJson.avatar_url.substring(6)}`,
            query: {
              width: 64,
              height: 64
            }
          }))
          this.setState({userinfo: userinfo});
          localStorage.setItem("userinfo", JSON.stringify(this.state.userinfo));
        }
      })
  },

  setStateFromChild: function(prop, value) {
    this.setState({
      [prop]: value
    });
  },

  logout: function() {
    localStorage.removeItem("user");
    this.setState({
      user: {},
      logout: true
    })
  },

  sync: function() {
    this.setState({loading: 1});
    let url = Object.assign({}, this.state.user.hs, {
      pathname: "/_matrix/client/r0/sync",
      query: {
        timeout: 30000,
        access_token: this.state.user.access_token
      }
    })

    if(this.state.user.next_batch != undefined) {
      url.query.since = this.state.user.next_batch;
    }
    fetch(urllib.format(url))
      .then((response) => response.json())
      .catch((error) => {
        console.error('Error:', error);
        this.sync(); //retry
      })
      .then((responseJson) => {
        if (responseJson == undefined) {
          return;
        }

        let remoteRooms = responseJson.rooms.join;
        let localRooms = this.state.rooms;
        let messages = this.state.messages;

        Object.keys(remoteRooms).forEach((roomId) => {
          let remoteRoom = remoteRooms[roomId];

          let combinedMessages = this.addMessages(roomId, remoteRoom.timeline.events);

          messages[roomId] = combinedMessages;

          function findLast(array, predicate) {
            return array.slice().reverse().find(predicate);
          }

          if (localRooms[roomId] == null) {
            localRooms[roomId] = {};
          }

          localRooms[roomId].lastMessage = findLast(combinedMessages, (message) => {
            return (message.content.body != null);
          });

          localRooms[roomId].lastMessage = defaultValue(
            localRooms[roomId].lastMessage,
            combinedMessages[combinedMessages.length - 1]
          )

          if (localRooms[roomId] == null) {
            localRooms[roomId].prev_batch = remoteRoom.timeline.prev_batch;
          }
        });

        //persistLocalStorage({
        //  messages: messages,
        //  rooms: localRooms
        //});

        let user = Object.assign(this.state.user, {
          next_batch: responseJson.next_batch
        })

        this.setState({
          messages: messages,
          user: user,
          rooms: localRooms,
          loading: 0
        });
        if (!this.state.logout) {
          this.sync();
        }
    });
  },

  addMessages: function (roomId, messages) {
    let concatenatedMessages = defaultValue(this.state.messages[roomId], []).concat(messages);
    let uniqueMessages = uniq(concatenatedMessages, uniqEvents).sort(sortEvents);

    /* FIXME: This should set state as well. */

    return uniqueMessages;
  },

  getBacklog: function(roomId) {
    if (this.state.backlog == 1) {
      return;
    }
    this.setState({backlog: 1});
    let messages = this.state.messages;
    let rooms = this.state.rooms;
    let from = rooms[roomId].prev_batch;

    let reqUrl = urllib.format(Object.assign({}, this.state.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${roomId}/messages`,
      query: {
        from: from,
        limit: 50,
        dir: "b",
        access_token: this.state.user.access_token
      }
    }));

    fetch(reqUrl)
      .then((response) => response.json())
      .then((responseJson) => {
        let combinedMessages = this.addMessages(roomId, responseJson.chunk);
        messages[roomId] = combinedMessages;

        rooms[roomId].prev_batch = responseJson.end;

        //persistLocalStorage({
        //  messages: messages,
        //  rooms: rooms
        //});

        this.setState({
          messages: messages,
          rooms: rooms,
          backlog: 0
        });
      })
  },

  render: function() {
    let loading;
    if (this.state.loading) {
      loading = <img className="loading" src={loadingGif} alt="loading"/>
    }
    if (!this.state.user.access_token) {
      return (
        <div className="login">
          {loading}
          <Login
            loginCallback={this.loginCallback}
            setLoading={this.setLoading}
            setParentState={this.setStateFromChild}
          />
        </div>
      );
    }

    return (
      <div className="main">
        <div>{loading}</div>
        <RoomList
          room={this.state.room}
          rooms={this.state.rooms}
          invites={this.state.invites}
          user={this.state.user}
          userinfo={this.state.userinfo}
          get_userinfo={this.get_userinfo}
          setParentState={this.setStateFromChild}
          icon={icon}
          logout={this.logout}
        />
        <div className="view">
          <Room
            backlog={this.getBacklog}
            messages={this.state.messages[this.state.room]}
            room={this.state.room}
            user={this.state.user}
            userinfo={this.state.userinfo}
            get_userinfo={this.get_userinfo}
          />
          <div className="input">
            <label htmlFor="attachment">
              <img src={icon.file.dark} id="file" className="dark"/>
              <img src={icon.file.light} id="file" className="light"/>
            </label>
            <File
              room={this.state.room}
              user={this.state.user}
            />
            <Send
              room={this.state.room}
              user={this.state.user}
            />
            <img src={icon.send.dark} id="send" className="dark"/>
            <img src={icon.send.light} id="send" className="light"/>
          </div>
        </div>
      </div>
    );
  }
})

let Send = create({
  displayName: "Send",
  componentDidMount: function() {
    let textarea = document.getElementById('text')
    observe(textarea, 'change',  this.resize_textarea);
    observe(textarea, 'cut',     this.resize_textarea_delayed);
    observe(textarea, 'paste',   this.resize_textarea_delayed);
    observe(textarea, 'drop',    this.resize_textarea_delayed);
    observe(textarea, 'keydown', this.resize_textarea_delayed);
    observe(textarea, 'keydown', this.shift_enter);

    observe(document.getElementById('send'), 'click', this.send);
  },

  shift_enter: function(event) {
    if (event.keyCode == 13 && !event.shiftKey) {
      event.preventDefault();
      this.send()
    }
  },

  resize_textarea: function() {
    let textarea = document.getElementById('text')
    textarea.style.height = 'auto'
    textarea.style.height = text.scrollHeight+'px'
  },

  resize_textarea_delayed: function() {
    window.setTimeout(this.resize_textarea, 5);
  },

  send: function() {
    let textarea = document.getElementById('text')
    if(textarea.value != "") {
        let msg = textarea.value.replace(/^\s+|\s+$/g, '')
        textarea.value = ""
        let unixtime = Date.now()

        let url = urllib.format(Object.assign({}, this.props.user.hs, {
          pathname: `/_matrix/client/r0/rooms/${this.props.room}/send/m.room.message/${unixtime}`,
          query: {
            access_token: this.props.user.access_token
          }
        }));

        let body = {
          "msgtype": "m.text",
          "body": msg,
        }

        fetch(url, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        }).then(res => res.json())
        .catch(error => console.error('Error:', error))
        .then(response => console.log('Success:', response));
    }
    textarea.value = "";
    this.resize_textarea();
  },

  render: function() {
    return (
      <textarea
        id="text"
        rows="1"
        placeholder="Write a message..."
        spellCheck="false">
      </textarea>
    );
  }
})

let Login = create({
  displayName: "Login",
  getInitialState: function() {
    return ({
      user: "",
      pass: "",
      homeserver: "https://matrix.org",
      json: {},
    });
  },

  render: function() {
    let error;
    if (this.state.json.error != undefined) {
      error = <span id="error" className="red">{this.state.json.error}</span>
    }
    return (
      <center>
          <img id="header" src={neo}/>
          <form id="login">
            <input id="user" type="text" placeholder="username"
              value={this.state.user} onChange={this.handleUser}/><br/>
            <input id="pass" type="password" placeholder="password"
              value={this.state.pass} onChange={this.handlePass}/><br/>
            <input id="hs" type="text" placeholder="homeserver"
              value={this.state.homeserver} onChange={this.handleHs}/><br/>
            <button type="submit" onClick={this.login}>Log in</button>
          </form>
          {error}
        </center>
    );
  },

  handleUser: function(event) {
    this.setState({user: event.target.value});
  },

  handlePass: function(event) {
    this.setState({pass: event.target.value});
  },

  handleHs: function(event) {
    this.setState({homeserver: event.target.value});
  },

  login: function(event) {
    event.preventDefault();
    this.props.setParentState("loading", 1);
    let homeserver = urllib.parse(this.state.homeserver); //TODO: Error handling
    let data = {
      "user": this.state.user,
      "password": this.state.pass,
      "type": "m.login.password",
      "initial_device_display_name": "Neo",
    };

    let url = urllib.format(Object.assign(homeserver, {
      pathname: "/_matrix/client/r0/login"
    }))

    fetch(url, {
      body: JSON.stringify(data),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST',
    }).then((response) => {
        if (!response.ok) {
          throw Error(response.statusText);
        }
        return response.json()
    }).then((responseJson) => {
      this.setState({json: responseJson});
      if(responseJson.access_token != undefined) {
        this.props.loginCallback(responseJson);
      }
      this.props.setParentState("loading", 0);
    }).catch((error) => {
      this.setState({json: {error: "Error contacting homeserver"}});
      console.error(error);
      this.props.setParentState("loading", 0);
    });
  }
})

let Room = create({
  displayName: "Room",
  getInitialState: function() {
    return({
      scroll: {},
      element: null
    });
  },

  setRef: function(element) {
    if (element != null) {
      element.addEventListener("scroll", debounce(this.onScroll, 10));
      this.setState({element: element});
    }
  },

  onScroll: function(event) {
    this.setState({
      scroll: Object.assign({}, this.state.scroll, {
        [this.props.room]: this.getScroll()
      })
    })
  },

  getScroll: function() {
    if (this.state.element == null) {
      return null;
    }
    return ({
      scrollTop: this.state.element.scrollTop,
      scrollHeight: this.state.element.scrollHeight,
      clientHeight: this.state.element.clientHeight
    });
  },
  
  componentDidUpdate: function() {
    if (this.props.room != this.state.lastRoom) {
      if (this.state.scroll[this.props.room] != undefined) {
        let scrollProps = this.state.scroll[this.props.room];
        if (scrollProps.scrollHeight - scrollProps.scrollTop - scrollProps.clientHeight < 100) {
          this.scrollToBottom();
        } else {
          this.state.element.scrollTop = scrollProps.scrollTop;
        }
      }
      this.setState({
        lastRoom: this.props.room
      });
    }
  },

  scrollToBottom: function() {
    let scrollProps = this.state.scroll[this.props.room];
    this.state.element.scrollTop = scrollProps.scrollHeight - scrollProps.clientHeight + 100;
  },

  render: function() {
    let scroll = {};
    if (this.state.scroll[this.props.room] != null) {
      scroll = this.state.scroll[this.props.room];
    }
    return(
      <div className="messages" id="message_window" ref={this.setRef}>
        <Messages
          backlog={this.props.backlog}
          messages={this.props.messages}
          room={this.props.room}
          user={this.props.user}
          scrollToBottom={this.scrollToBottom}
          getScroll={this.getScroll}
          onScroll={this.onScroll}
          scroll={scroll}
          userinfo={this.props.userinfo}
          get_userinfo={this.props.get_userinfo}
        />
      </div>
    );
  }
})

let Messages = create({
  displayName: "Messages",
  getInitialState: function() {
    return({
      userinfo: [],
      shouldGoToBottom: 0
    })
  },

  componentDidUpdate: function(prevProps, prevState) {
    let scrollState = this.props.getScroll();

    if (this.props.scroll.scrollTop == null) {
      this.props.onScroll();
      return;
    }

    if (this.props.scroll.scrollHeight != scrollState.scrollHeight) {
      //New messages were added
      if (scrollState.scrollHeight - scrollState.scrollTop - scrollState.clientHeight < 200) {
        this.props.scrollToBottom();
      }
    }
  },

  render: function() {
    if (this.props.room == 0 || this.props.messages == undefined) {
      return null;
    }
    let messages = Object.keys(this.props.messages).map((event_num) => {
      let event = this.props.messages[event_num];
      let next_event = parseInt(event_num)+1;

      if (event.grouped != 1 && event.type == "m.room.message") {
        if (this.props.userinfo[event.sender] == undefined) {
          this.props.get_userinfo(event.sender);
        }

        while (this.props.messages[next_event] != undefined &&
          this.props.messages[next_event].sender == event.sender &&
          this.props.messages[next_event].type == "m.room.message" &&
          (this.props.messages[next_event].content.msgtype == "m.text" ||
            this.props.messages[next_event].content.msgtype == "m.notice" ) &&
          (this.props.messages[next_event].origin_server_ts -
            event.origin_server_ts < 300000) && //max 5 min older
          this.props.messages[next_event].grouped != 1) {
          this.props.messages[next_event].grouped = 1;
          event.content.body += "\n" + this.props.messages[next_event].content.body;
          next_event++;
        }

        return (
          <Message
            key={event.event_id}
            info={this.props.userinfo[event.sender]}
            id={event.sender}
            event={event}
            source={event.sender == this.props.user ? "out" : "in"}
            group="no"
            user={this.props.user}
          />
        )
      } else if (event.type == "m.room.member") {
        let action = "";
        if (event.content.membership) {
          event.membership = event.content.membership;
        }
        switch (event.membership) {
          case "leave" :
            action = " left";
            break;
          case "join" :
            action = " joined";
            break;
          case "invite" :
            action = " invited " + event.state_key;
            break;
          default:
            action = " did something";
            console.log(event);
            break;
        }
        return (
          <div className="line member" key={event.event_id}>
            {event.sender} {action}
          </div>
        )
      }
    }
    );
    return (
      <div>
        <span onClick={() => this.props.backlog(this.props.room)}>
          Load more messages
        </span><br/>
        {this.props.room}
        {messages}
      </div>
    )
  }

})

let Message = create({
  displayName: "Message",
  render: function() {
    let classArray = ["message", this.props.id, this.props.source].join(" ");
    let time = new Date(this.props.event.origin_server_ts)
    let time_string = time.getHours().toString().padStart(2, "0") +
      ":" + time.getMinutes().toString().padStart(2, "0");

    let media = "";
    let media_width = "";
    if (this.props.event.content.msgtype == "m.image") {
      classArray += " media";
      if (this.props.event.content.info == undefined ||
        this.props.event.content.info.thumbnail_info == undefined) {
        let url = m_download(this.props.user.hs, this.props.event.content.url);
        if (this.props.event.content.info.h != undefined && this.props.event.content.info.w != undefined) {
          media = image(url, url, this.props.event.content.info.h, this.props.event.content.info.w)
        } else {
          media = image(url, url);
        }
      } else {
        media_width = this.props.event.content.info.thumbnail_info.w;
        let media_url = this.props.event.content.info.thumbnail_url;
        if (this.props.event.content.info.mimetype == "image/gif") {
          media_url = this.props.event.content.url;
        }

        media = image(
          m_download(this.props.user.hs, this.props.event.content.url),
          m_download(this.props.user.hs, media_url),
          this.props.event.content.info.thumbnail_info.h,
          this.props.event.content.info.thumbnail_info.w
        );
      }
    } else if (this.props.event.content.msgtype == "m.video") {
      let thumb = ""
      if (this.props.event.content.info != undefined &&
        this.props.event.content.info.thumbnail_url != undefined) {
        thumb = m_download(this.props.user.hs, this.props.event.content.info.thumbnail_url);
      }
      media = <video
          src={m_download(this.props.user.hs, this.props.event.content.url)}
          poster={thumb}
          controls
        ></video>;
      
    } else if (this.props.event.content.msgtype == "m.file") {
      media = <a
        className="file"
        target="_blank" 
        href={m_download(this.props.user.hs, this.props.event.content.url)}
      >
        <span>file download</span>
      </a>
    } else {
      if (!this.props.event.content.msgtype == "m.text") {
        console.log(this.props.event);
      }
    }

    if (this.props.event.content.body == undefined) {
      return null;
    }

    return (
      <div className="line">
        <img id="avatar" src={this.props.info.img} onError={(e)=>{e.target.src = blank}}/>
        <div className={classArray} id={this.props.id} style={{width: media_width}}>
          <div>
            <b>{this.props.info.name}</b>
            {media}
            <div className="flex">
              <p><Linkify component={MaybeAnImage}>{
                this.props.event.content.body.split('\n').map((item, key) => {
                  return <span key={key}>{item}<br/></span>
                })
              }</Linkify></p>
              <span className="timestamp">{time_string}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
})

let MaybeAnImage = create({
  getInitialState: function() {
    return({
      img: "no",
      url: ""
    });
  },

  componentDidMount: function() {
    let url = this.props.href.replace("http://", "https://");
    this.setState({
      url: url
    });
    let img = new Image();
    img.onload = () => this.setState({img: "yes"});
    img.src = url;
  },

  render: function() {
    if (this.state.img == "yes") {
      return(
        <span>
          <a href={this.props.href} target="_blank">{this.props.children}</a><br/>
          <img className="link" src={this.state.url} />
        </span>
      )
    }

    return (
      <a href={this.props.href} target="_blank">{this.props.children}</a>
    )
  }
})

function m_thumbnail(hs, mxc, w, h) {
  return urllib.format(Object.assign({}, hs, {
    pathname: `/_matrix/media/r0/thumbnail/${mxc.substring(6)}`,
    query: {
      width: w,
      height: h
    }
  }));
}

function m_download(hs, mxc) {
  return urllib.format(Object.assign({}, hs, {
    pathname: `/_matrix/media/r0/download/${mxc.substring(6)}`
  }));
}

function sortEvents(a, b) {
  return a.origin_server_ts-b.origin_server_ts
}

function uniqEvents(a, b) {
  return a.event_id === b.event_id;
}

function observe(element, event, handler) {
  element.addEventListener(event, handler, false)
}

function image(src, thumb, h, w) {
  return(
    <div>
      <a target="_blank" href={src}>
        <img
          src={thumb}
          height={h}
          width={w}
        />
      </a>
    </div>
  );
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
)
