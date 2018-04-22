import React from 'react';
import ReactDOM from 'react-dom';
import '../scss/layout.scss';
var create = require('create-react-class');
var neo = require('../assets/neo_full.png');
var blank = require('../assets/blank.jpg');
var loadingGif = require('../assets/loading.gif');
var homeserver = "https://matrix.org";

var icon = {
  file: {
    dark: require('../assets/dark/file.svg'),
    light: require('../assets/light/file.svg')
  },
  send: {
    dark: require('../assets/dark/send.svg'),
    light: require('../assets/light/send.svg')
  }
}

var App = create({
  getInitialState: function() {
    let loginJson = {};
    if(localStorage.getItem("loginJson")) {
      loginJson = JSON.parse(localStorage.getItem("loginJson"));
      this.timer = setInterval(
        () => this.sync(),
        2000
      )
      console.log("loaded loginJson from storage");
    }
    return({
      loginJson: loginJson,
      json: {rooms:{join:{}}},
      rooms: [],
      messages: [],
      loading: 0,
      syncing: 0,
      room: 0
    });
  },

  setJson: function(json) {
    this.setState({loginJson: json});
    localStorage.setItem("loginJson", JSON.stringify(json));
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

  componentWillUnmount: function() {
    if (this.timer != undefined) {
      clearInterval(this.timer);
    }
  },

  sync: function() {
    if (this.state.syncing) {
      return;
    }
    this.setLoading(1);
    this.setState({syncing: 1});
    let url = homeserver + 
      "/_matrix/client/r0/sync?timeout=30000&access_token=" + 
      this.state.loginJson.access_token;
    if(this.state.json.next_batch != undefined) {
      url = url + "&since=" + this.state.json.next_batch;
    }
    fetch(url)
    .then((response) => response.json())
      .then((responseJson) => {
        let rooms = responseJson.rooms.join;
        let roomsState = this.state.rooms;
        let messages = this.state.messages;
        for(let roomid in rooms) {
          let events = rooms[roomid].timeline.events;
          if (messages[roomid] != undefined) {
            messages[roomid].concat(events);
            for (let event in events) {
              messages[roomid].push(events[event]);
            }
          } else {
            messages[roomid] = events;
          }
          messages[roomid].sort(
            function(a, b) {
             return a.origin_server_ts-b.origin_server_ts
            }
          );
          roomsState[roomid] = messages[roomid][messages[roomid].length - 1];
          for (let i=messages[roomid].length - 1; i>0; i--) {
            if(messages[roomid][i].content.body != undefined) {
              roomsState[roomid].lastmessage = messages[roomid][i].content.body;
              roomsState[roomid].origin_server_ts = messages[roomid][i].origin_server_ts;
              break;
            }
          }
        }
        this.setState({
          messages: messages,
          json: responseJson,
          rooms: roomsState
        });
        this.setLoading(0);
        this.setState({syncing: 0});
    });
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
          <Login setJson={this.setJson} setLoading={this.setLoading}/>
        </div>
      );
    }
    return (
      <div className="main">
        {loading}
        <List
          room={this.state.room}
          rooms={this.state.rooms}
          json={this.state.json}
          token={this.state.loginJson.access_token}
          setRoom={this.setRoom}
        />
        <div className="view">
        <div className="messages split" id="message_window">
          <Messages
            messages={this.state.messages[this.state.room]}
            json={this.state.json}
            token={this.state.loginJson.access_token}
            room={this.state.room}
            user={this.state.loginJson.user_id}
          />
        </div>
          <div className="input">
            <label htmlFor="">
              <img src={icon.file.dark} id="file" className="dark"/>
              <img src={icon.file.light} id="file" className="light"/>
            </label>
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

var observe = function (element, event, handler) {
  element.addEventListener(event, handler, false)
}

function extend(obj, src) {
    Object.keys(src).forEach(function(key) { obj[key] = src[key]; });
    return obj;
}

var Send = create({
  componentDidMount: function() {
    var textarea = document.getElementById('text')
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
    var textarea = document.getElementById('text')
    textarea.style.height = 'auto'
    textarea.style.height = text.scrollHeight+'px'
  },

  resize_textarea_delayed: function() {
    window.setTimeout(this.resize_textarea, 5);
  },

  send: function() {
    var textarea = document.getElementById('text')
    if(textarea.value != "") {
        var msg = textarea.value.replace(/^\s+|\s+$/g, '')
        textarea.value = ""
        var unixtime = Date.now()

        var url = homeserver +
        "/_matrix/client/r0/rooms/" +
        this.props.room +
        "/send/m.room.message/" +
        unixtime +
        "?access_token=" +
        this.props.token

        var body = {
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
    console.log(msg);
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

var Login = create({
  getInitialState: function() {
    return ({
      user: "",
      pass: "",
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

  login: function(event) {
    event.preventDefault();
    this.props.setLoading(1);
    let data = {
      "user": this.state.user,
      "password": this.state.pass,
      "type": "m.login.password",
      "initial_device_display_name": "Neo Webclient",
    };
    fetch(homeserver + "/_matrix/client/r0/login", {
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

var List = create({
  render: function() {
    let rooms = this.props.rooms;
    let sortedRooms = Object.keys(rooms).sort(
      function(a, b) {
        return rooms[b].origin_server_ts - rooms[a].origin_server_ts;
      }
    );
    let list = sortedRooms.map((roomid) => 
      <RoomEntry
        lastEvent={rooms[roomid]}
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

var RoomEntry = create({
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
        onClick={() => this.props.setRoom(this.props.id)}>
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
          {this.props.lastEvent.lastmessage}
        </span>
      </div>
    );
  }
})

var Messages = create({
  getInitialState: function() {
    return({
      userinfo: []
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

  render: function() {
    if (this.props.room == 0 || this.props.messages == undefined) {
      return null;
    }

    let messages = Object.keys(this.props.messages).map((event_num) => {
        let event = this.props.messages[event_num];
        if (this.state.userinfo[event.sender] == undefined) {
          this.get_userinfo(event.sender);
        }

        if (event.type == "m.room.message") {
          return (
            <Message
              key={event.event_id}
              info={this.state.userinfo[event.sender]}
              id={event.sender}
              event={event}
              source={event.sender == this.props.user ? "out" : "in"}
            />
          )
        }
      }
    );
    return (
      <div>
        {this.props.room}
        {messages}
      </div>
    )
  }

})

var Message = create({
  render: function() {
    let classArray = ["message", this.props.id, this.props.source].join(" ");
    let time = new Date(this.props.event.origin_server_ts)
    let time_string = time.getHours().toString().padStart(2, "0") +
      ":" + time.getMinutes().toString().padStart(2, "0");

    let media = "";
    if (this.props.event.content.msgtype == "m.image" || this.props.event.content.msgtype == "m.video") {
      if (this.props.event.content.msgtype == "m.image") {
        media = <img
            src={m_thumbnail(this.props.event.content.url, 720, 1280)}
          />;
      } else {
        media = <video
            src={m_download(this.props.event.content.url)}
            poster={m_download(this.props.event.content.info.thumbnail_url)}
            controls
            preload="none"
          ></video>;
      }
    }
    return (
      <div className="line">
        <div className={classArray} id={this.props.id}>
          <img id="avatar" src={this.props.info.img} onError={(e)=>{e.target.src = blank}}/>
          <div>
            <b>{this.props.info.name}</b><br/>
            <p>{this.props.event.content.body}</p>
            {media}
          </div>
          <span className="timestamp">{time_string}</span>
        </div>
      </div>
    );
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


ReactDOM.render(
  <App />,
  document.getElementById('root')
)
