import React from 'react';
import ReactDOM from 'react-dom';
import '../scss/layout.scss';
var create = require('create-react-class');
var neo = require('../assets/neo_full.png');
var loadingGif = require('../assets/loading.gif');
var homserver = "https://matrix.org";

var App = create({
  getInitialState: function() {
    return({
      json: {},
      loading: 0
    });
  },

  setJson: function(json) {
    this.setState({json: json});
  },

  setLoading: function(loading) {
    this.setState({loading: loading});
  },

  render: function() {
    let loading;
    if (this.state.loading) {
      loading = <img className="loading" src={loadingGif} alt="loading"/>
    }
    if (!this.state.json.access_token) {
      return (
        <div className="login">
          {loading}
          <Login setJson={this.setJson} setLoading={this.setLoading}/>
        </div>
      );
    }
    return (
      <div className="main" style="display: none">
        {loading}
        <div className="list no-select" id="list">
        </div>
        <div className="view">
          <div className="messages split" id="message_window">
          </div>

          <div className="input">
            <label for="">
              <img src="/img/dark/file.svg" id="file" className="dark"/>
              <img src="/img/light/file.svg" id="file" className="light"/>
            </label>
            <textarea id="text" rows="1" placeholder="Write a message..." spellcheck="false"></textarea>
            <img src="/img/dark/send.svg" id="send" className="dark"/>
            <img src="/img/light/send.svg" id="send" className="light"/>
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
    fetch(homserver + "/_matrix/client/r0/login", {
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

var Main 

var RoomEntry = create({
  render: function() {
    return (
      <div className="room_item">
        <input type="radio" className="room_radio"/>
        <label className="room">
          <img height="70px" width="70px"/>
          <span id="name"></span><br/>
          <span className="timestamp"></span>
          <span className="last_msg"></span>
          <span className="ts" style="display: none"></span>
        </label>
      </div>
  );
  }
})

var Message = create({
  render: function() {
    return (
      <div className="line">
        <div className="message" id="event_id">
          <img/>
          <div>
            <b></b><br/>
            <p></p>
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
