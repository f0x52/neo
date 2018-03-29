import React from 'react';
import ReactDOM from 'react-dom';
import '../scss/layout.scss';
var create = require('create-react-class');
var homserver = "https://matrix.org";

var App = create({
  getInitialState() {
    return({
      user: "",
      pass: "",
      homserver: "",
      token: undefined,
    });
  },

  render: function() {
    if (!this.state.token) {
      return (
        <Login />
      );
    }
    return (
      <div className="main" style="display: none">
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
  render: function() {
    return (
    <div className="login">
      <center>
        <img id="header" src="/img/neo_full.png"/>
        <form id="login">
          <input id="user" type="text" placeholder="username"/><br/>
            <input id="pass" type="password" placeholder="password"/><br/>
          <button type="submit">Log in</button>
        </form>
        <span id="error" className="red"></span>
      </center>
    </div>
    );
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
