import React from 'react';
import ReactDOM from 'react-dom';
import '../scss/layout.scss';
var create = require('create-react-class');
var neo = require('../assets/neo_full.png');
var blank = require('../assets/blank.jpg');
var loadingGif = require('../assets/loading.gif');
var homeserver = "https://matrix.org";

var icon = {
  file: {dark: require('../assets/dark/file.svg'), light: require('../assets/light/file.svg')},
  send: {dark: require('../assets/dark/send.svg'), light: require('../assets/light/send.svg')}
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
      this.setState({json: responseJson});
      this.setLoading(0);
      this.setState({syncing: 0});
    });
    clearInterval(this.timer);
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
        <List room={this.state.room} json={this.state.json} token={this.state.loginJson.access_token} setRoom={this.setRoom}/>
        <div className="view">
        <div className="messages split" id="message_window">
          <Messages json={this.state.json.rooms.join} room={this.state.room} />
        </div>

          <div className="input">
            <label htmlFor="">
              <img src={icon.file.dark} id="file" className="dark"/>
              <img src={icon.file.light} id="file" className="light"/>
            </label>
            <textarea id="text" rows="1" placeholder="Write a message..." spellCheck="false"></textarea>
            <img src={icon.send.dark} id="send" className="dark"/>
            <img src={icon.send.light} id="send" className="light"/>
          </div>
        </div>
      </div>
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
    let rooms = this.props.json.rooms.join;
    let list = Object.keys(rooms).map((room) => 
      <RoomEntry active={this.props.room == room} key={room} id={room} token={this.props.token} setRoom={this.props.setRoom} />
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
          this.setState({img: homeserver + "/_matrix/media/r0/download/" + responseJson.url.substring(6)});
        }
      })
  },

  render: function() {
    return (
      <div id="room_item" className={this.props.active ? "active" : ""} onClick={() => this.props.setRoom(this.props.id)}>
        <div id={this.props.id}>
          <img height="70px" width="70px" src={this.state.img}/>
          <span id="name">{this.state.name}</span><br/>
          <span className="timestamp">{this.state.timestamp}</span>
          <span className="last_msg">{this.state.last_msg}</span>
          <span className="ts" style={{display: "none"}}>{this.state.ts}</span>
        </div>
      </div>
    );
  }
})

var Messages = create({
  render: function() {
    let rooms = this.props.json;
    if (this.props.room == 0) {
      return null;
    }

    let messages = Object.keys(rooms[this.props.room].timeline.events).map((event_num) =>
      {
        let event = rooms[this.props.room].timeline.events[event_num];
        if (event.type == "m.room.message") {
          return <Message key={event.event_id} id={event.sender} content={event.content.body}/>
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
  getInitialState: function() {
    return ({
      name: this.props.id,
      img: blank,
    });
  },

  componentDidMount: function() { //TODO: reuse previous requests for same user, cancel fetch when umnounted
    let url = homeserver +
      "/_matrix/client/r0/profile/" +
      this.props.id +
      "/displayname?access_token=" +
      this.props.token;
    this.nameFetch = fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.displayname != undefined) {
          this.setState({name: responseJson.displayname});
        }
      })

    this.imgFetch = url = homeserver +
      "/_matrix/client/r0/profile/" +
      this.props.id +
      "/avatar_url?access_token=" +
      this.props.token;
    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if(responseJson.errcode == undefined && responseJson.avatar_url != undefined) {
          this.setState({img: homeserver + "/_matrix/media/r0/thumbnail/" + responseJson.avatar_url.substring(6) + "?width=64&height=64"});
        }
      })
  },

  render: function() {
    let classArray = ["message", this.props.id, "in"].join(" ");
    return (
      <div className="line">
        <div className={classArray} id={this.props.id}>
          <img src={this.state.img} />
          <div>
            <b>{this.state.name}</b><br/>
            <p>{this.props.content}</p>
          </div>
          <span className="timestamp"></span>
        </div>
      </div>
    );
  }
})


ReactDOM.render(
  <App />,
  document.getElementById('root')
)
