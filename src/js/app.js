import React from 'react';
import ReactDOM from 'react-dom';
import Linkify from 'react-linkify';

import '../scss/layout.scss';

let uniq = require('arr-uniq');
let defaultValue = require('default-value');
let create = require('create-react-class');
let urllib = require('url');
let debounce = require('debounce');

let persistLocalStorage = require('./lib/persist-local-storage');
let riot = require('./lib/riot-utils.js');

let neo = require('../assets/neo_full.png');
let blank = require('../assets/blank.jpg');
let loadingGif = require('../assets/loading.gif');

let homeserver = "https://matrix.org";
if (localStorage.getItem("hs")) {
  homeserver = localStorage.getItem("hs");
}

let icon = {
  file: {
    dark: require('../assets/dark/file.svg'),
    light: require('../assets/light/file.svg')
  },
  send: {
    dark: require('../assets/dark/send.svg'),
    light: require('../assets/light/send.svg')
  }
}

let App = create({
  displayName: "App",
  getInitialState: function() {
    let loginJson = {};
    let rooms = {};
    let messages = {};
    if(localStorage.getItem("loginJson")) {
      loginJson = JSON.parse(localStorage.getItem("loginJson"));
      console.log("loaded loginJson from storage");
    }
    return({
      loginJson: loginJson,
      json: {rooms:{join:{}}},
      rooms: rooms,
      messages: messages,
      loading: 0,
      syncing: 0,
      room: 0,
      backlog: 0
    });
  },

  setJson: function(json) {
    this.setState({loginJson: json});
    if (json.access_token) {
      this.timer = setInterval(
        () => this.sync(),
        2000
      )
    }
  },

  setLoading: function(loading) {
    this.setState({loading: loading});
  },

  setRoom: function(room) {
    this.setState({room: room});
  },

  setHs: function(hs) {
    this.setState({homeserver: hs});
  },

  componentDidMount: function() {
    this.sync();
  },

  componentWillUnmount: function() {
    if (this.timer != undefined) {
      clearInterval(this.timer);
    }
  },

  sync: function() {
    this.setLoading(1);
    let url = `${homeserver}/_matrix/client/r0/sync?timeout=30000&access_token=${this.state.loginJson.access_token}`;

    if(this.state.json.next_batch != undefined) {
      url = url + "&since=" + this.state.json.next_batch;
    }

    fetch(url)
      .then((response) => response.json())
      .catch((error) => {
        console.error('Error:', error)
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

        this.setState({
          messages: messages,
          json: responseJson,
          rooms: localRooms
        });

        this.setLoading(0);
        this.sync();
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

    let reqUrl = urllib.format(Object.assign(urllib.parse(homeserver), {
      pathname: `/_matrix/client/r0/rooms/${roomId}/messages`,
      query: {
        from: from,
        limit: 50,
        dir: "b",
        access_token: this.state.loginJson.access_token
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
    if (!this.state.loginJson.access_token) {
      return (
        <div className="login">
          {loading}
          <Login
            setJson={this.setJson}
            setHs={this.setHs}
            setLoading={this.setLoading}
          />
        </div>
      );
    }
    return (
      <div className="main">
        <div>{loading}</div>
        <List
          room={this.state.room}
          rooms={this.state.rooms}
          token={this.state.loginJson.access_token}
          setRoom={this.setRoom}
        />
        <div className="view">
          <Room
            backlog={this.getBacklog}
            messages={this.state.messages[this.state.room]}
            token={this.state.loginJson.access_token}
            room={this.state.room}
            user={this.state.loginJson.user_id}
          />
          <div className="input">
            <label htmlFor="attachment">
              <img src={icon.file.dark} id="file" className="dark"/>
              <img src={icon.file.light} id="file" className="light"/>
            </label>
            <Attachment
              room={this.state.room}
              token={this.state.loginJson.access_token}
            />
            <Send
              room={this.state.room}
              token={this.state.loginJson.access_token}
            />
            <img src={icon.send.dark} id="send" className="dark"/>
            <img src={icon.send.light} id="send" className="light"/>
          </div>
        </div>
      </div>
    );
  }
})

let observe = function (element, event, handler) {
  element.addEventListener(event, handler, false)
}

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

        let url = homeserver +
        "/_matrix/client/r0/rooms/" +
        this.props.room +
        "/send/m.room.message/" +
        unixtime +
        "?access_token=" +
        this.props.token

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

let Attachment = create ({
  displayName: "Attachment",
  componentDidMount: function() {
    document.getElementById("attachment").addEventListener('change', this.upload, false);
  },

  upload: function() {
    let file = document.getElementById("attachment").files[0];
    this.setState({file: file});
    let upload_url = homeserver +
      "/_matrix/media/r0/upload" +
      "?access_token=" + this.props.token
    fetch(upload_url, {
      method: 'POST',
      body: this.state.file,
    }).then(
      response => response.json()
    ).then(response => {
      console.log('Success:', response)
      this.setState({"url": response.content_uri});

      let unixtime = Date.now()

      let msg_url = homeserver +
      "/_matrix/client/r0/rooms/" +
      this.props.room +
      "/send/m.room.message/" +
      unixtime +
      "?access_token=" +
      this.props.token;

      if (this.state.file.type.startsWith("image/")) { //image, so create a thumbnail as well
        let thumbnailType = "image/png";
        let imageInfo;

        if (this.state.file.type == "image/jpeg") {
            thumbnailType = "image/jpeg";
        }

        riot.loadImageElement(this.state.file).bind(this).then(function(img) {
          return riot.createThumbnail(img,
            img.width,
            img.height,
            thumbnailType);
        }).then(function(result) {
          imageInfo = result.info;
          this.setState({"info": imageInfo});
          fetch(upload_url, {
            method: 'POST',
            body: result.thumbnail,
          }).then(
            response => response.json()
          ).then(response => {
            let info = this.state.info;
            info.thumbnail_url = response.content_uri;
            info.mimetype = this.state.file.type;

            let body = {
              "msgtype": "m.image",
              "url": this.state.url,
              "body": this.state.file.name,
              "info": info
            }

            fetch(msg_url, {
              method: 'PUT',
              body: JSON.stringify(body),
              headers: new Headers({
                'Content-Type': 'application/json'
              })
            }).then(res => res.json())
            .catch(error => console.error('Error:', error))
            .then(response => console.log('Success:', response));
        })});
      } else {
        let body = {
          "msgtype": "m.file",
          "url": response.content_uri,
          "body": this.state.file.name,
          "info": {
            "mimetype": this.state.file.type
          }
        }

        fetch(msg_url, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        }).then(res => res.json())
        .catch(error => console.error('Error:', error))
        .then(response => console.log('Success:', response));
      }
    });
  },

  render: function() {
    return (
      <input id="attachment" type="file"/>
    )
  }
})

let Login = create({
  displayName: "Login",
  getInitialState: function() {
    return ({
      user: "",
      pass: "",
      homeserver: "https://matrix.org",
      error: undefined,
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
    this.props.setLoading(1);
    this.props.setHs(this.state.homeserver);
    localStorage.setItem("hs", this.state.homeserver);
    homeserver = this.state.homeserver;
    let data = {
      "user": this.state.user,
      "password": this.state.pass,
      "type": "m.login.password",
      "initial_device_display_name": "Neo Webclient",
    };
    fetch(this.state.homeserver + "/_matrix/client/r0/login", {
      body: JSON.stringify(data),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST',
    })
    .then((response) => response.json())
    .then((responseJson) => {
      this.setState({json: responseJson});
      if(responseJson.access_token != undefined) {
        this.props.setJson(responseJson);
      }
      this.props.setLoading(0);
    });
  }
})

let List = create({
  displayName: "List",
  render: function() {
    let rooms = this.props.rooms;
    let sortedRooms = Object.keys(rooms).sort(
      function(a, b) {
        return rooms[b].lastMessage.origin_server_ts - rooms[a].lastMessage.origin_server_ts;
      }
    );
    let list = sortedRooms.map((roomid) =>
      <RoomEntry
        lastEvent={rooms[roomid].lastMessage}
        active={this.props.room == roomid}
        key={roomid}
        id={roomid}
        token={this.props.token}
        setRoom={this.props.setRoom}
      />
    );
    return(
      <div className="list no-select" id="list">
        {list}
      </div>
    );
  },
})

let RoomEntry = create({
  displayName: "RoomEntry",
  getInitialState: function() {
    return ({
      name: this.props.id,
      img: blank,
    });
  },

  componentDidMount: function() {
    let url = homeserver +
      "/_matrix/client/r0/rooms/" +
      this.props.id +
      "/state/m.room.name?access_token=" +
      this.props.token;
    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.name != undefined) {
          this.setState({name: responseJson.name});
        }
      })

    url = homeserver +
      "/_matrix/client/r0/rooms/" +
      this.props.id +
      "/state/m.room.avatar?access_token=" +
      this.props.token;
    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if(responseJson.errcode == undefined) {
          this.setState({
            img: homeserver +
            "/_matrix/media/r0/download/" +
            responseJson.url.substring(6)
          });
        }
      })
  },

  render: function() {
    let time = new Date(this.props.lastEvent.origin_server_ts);
    let now = new Date();
    let time_string;
    if (time.toDateString() == now.toDateString()) {
      time_string = time.getHours().toString().padStart(2, "0") +
        ":" + time.getMinutes().toString().padStart(2, "0");
    } else {
      time_string = time.getMonth().toString().padStart(2, "0") +
        "." + time.getDay().toString().padStart(2, "0") +
        "." + time.getFullYear();
    }
    return (
      <div
        id="room_item"
        className={this.props.active ? "active" : ""}
        onClick={() => {
          this.props.setRoom(this.props.id)
          let win = document.getElementById("message_window");
          win.scrollTop = win.scrollHeight; //force scroll to bottom
        }}>
        <img
          height="70px"
          width="70px"
          src={this.state.img}
          onError={(e)=>{e.target.src = blank}}
        />
        <span id="name">
          {this.state.name}
        </span><br/>
        <span className="timestamp">
          {time_string}
        </span>
        <span className="last_msg">
          {this.props.lastEvent.content.body}
        </span>
      </div>
    );
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
    element.addEventListener("scroll", debounce(this.onScroll, 10));
    this.setState({element: element});
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
          token={this.props.token}
          room={this.props.room}
          user={this.props.user}
          scrollToBottom={this.scrollToBottom}
          getScroll={this.getScroll}
          onScroll={this.onScroll}
          scroll={scroll}
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

  get_userinfo: function(id) {
    let token = this.props.token;
    let userinfo = this.state.userinfo;
    userinfo[id] = {};
    userinfo[id].name = id;
    userinfo[id].img  = blank;
    this.setState({userinfo: userinfo});

    let url = homeserver +
      "/_matrix/client/r0/profile/" +
      id +
      "/displayname?access_token=" +
      token;
    this.nameFetch = fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.displayname != undefined) {
          userinfo = this.state.userinfo;
          userinfo[id].name = responseJson.displayname;
          this.setState({userinfo: userinfo});
        }
      })

    this.imgFetch = url = homeserver +
      "/_matrix/client/r0/profile/" +
      id +
      "/avatar_url?access_token=" +
      token;
    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if(responseJson.errcode == undefined &&
          responseJson.avatar_url != undefined) {
          userinfo = this.state.userinfo;
          userinfo[id].img = homeserver +
            "/_matrix/media/r0/thumbnail/" +
            responseJson.avatar_url.substring(6) +
            "?width=64&height=64";
          this.setState({userinfo: userinfo});
        }
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
        if (this.state.userinfo[event.sender] == undefined) {
          this.get_userinfo(event.sender);
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
            info={this.state.userinfo[event.sender]}
            id={event.sender}
            event={event}
            source={event.sender == this.props.user ? "out" : "in"}
            group="no"
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
    if (this.props.event.content.msgtype == "m.image" || this.props.event.content.msgtype == "m.video") {
      classArray += " media";

      if (this.props.event.content.info == undefined ||
        this.props.event.content.info.thumbnail_info == undefined) {
        let url = m_download(this.props.event.content.url);
        media = image(url, url);
      } else {
        media_width = this.props.event.content.info.thumbnail_info.w;
        if (this.props.event.content.msgtype == "m.image") {
          let media_url = this.props.event.content.info.thumbnail_url;
          if (this.props.event.content.info.mimetype == "image/gif") {
            media_url = this.props.event.content.url;
          }
          media = image(
            m_download(this.props.event.content.url),
            m_download(media_url),
            this.props.event.content.info.thumbnail_info.h,
            this.props.event.content.info.thumbnail_info.w
          );
        } else {
          media = <video
              src={m_download(this.props.event.content.url)}
              poster={m_download(this.props.event.content.info.thumbnail_url)}
              controls
              preload="none"
            ></video>;
        }
      }
    } else if (this.props.event.content.msgtype == "m.file") {
      media = <a
        className="file"
        href={m_download(this.props.event.content.url)}
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
    return {img: "no"}
  },

  componentDidMount: function() {
    let img = new Image();
    img.onload = () => this.setState({img: "yes"});
    img.src = this.props.href;
  },

  render: function() {
    if (this.state.img == "yes") {
      return(
        <span>
          <a href={this.props.href} target="_blank">{this.props.href}</a><br/>
          <img className="link" src={this.props.href} />
        </span>
      )
    }

    return (
      <a href={this.props.href} target="_blank">{this.props.href}</a>
    )
  }
})

function m_thumbnail(mxc, w, h) {
  return homeserver +
    "/_matrix/media/r0/thumbnail/" +
    mxc.substring(6) +
    "?width=" + w +
    "&height=" + h;
}

function m_download(mxc) {
  return homeserver +
    "/_matrix/media/r0/download/" +
    mxc.substring(6);
}

function sortEvents(a, b) {
  return a.origin_server_ts-b.origin_server_ts
}

function uniqEvents(a, b) {
  return a.event_id === b.event_id;
}

function image(src, thumb, h, w) {
  return(
    <div>
      <a href={src}>
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
