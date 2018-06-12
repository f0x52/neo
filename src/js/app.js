'use strict';

const React = require('react');
const ReactDOM = require('react-dom');
//const Promise = require('bluebird');
const rfetch = require('fetch-retry');

require('../scss/layout.scss');

let uniq = require('arr-uniq');
let defaultValue = require('default-value');
let create = require('create-react-class');
let urllib = require('url');

let options = {retries: 5, retryDelay: 200};

//let persistLocalStorage = require('./lib/persist-local-storage');

// Components
let RoomList = require('./components/roomList');
let RoomView = require('./components/messageView');

let Matrix = require('./lib/Matrix.js');

let neo = require('../assets/neo_full.png');
let blank = require('../assets/blank.jpg');
let loadingGif = require('../assets/loading.gif');

let VERSION = "alpha0.06";

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
};

let App = create({
  displayName: "App",
  getInitialState: function() {
    let user = {};
    let userinfo = {};
    let rooms = {};
    let invites = {};
    if(localStorage.getItem("version") == VERSION && localStorage.getItem("logout") != "true") {
      user = JSON.parse(localStorage.getItem("user"));
      userinfo = JSON.parse(localStorage.getItem("userinfo"));
      invites = JSON.parse(localStorage.getItem("invites"));
      console.log("loaded user data from storage");
    }
    return({
      user: user,
      userinfo: userinfo,
      rooms: rooms,
      invites: invites,
      handledInvites: {},
      loading: 0,
      room: 0,
      backlog: 0
    });
  },

  componentDidMount: function() {
    if (this.state.user.access_token != undefined) {
      this.initialSync();
    }
  },

  loginCallback: function(json) {
    this.get_userinfo(json.user_id, json);
    json.username = json.user_id.split(':')[0].substr(1);
    json.settings = {
      bool: {
        split: false,
        bubbles: false
      },
      input: {
        highlights: ""
      }
    };
    localStorage.setItem("version", VERSION);
    localStorage.setItem("logout", "false");
    localStorage.setItem("user", JSON.stringify(json));
    localStorage.setItem("invites", "{}");
    this.setState({
      user: json,
    });
    this.initialSync();
  },

  get_userinfo: function(id, user) {
    let userState = this.state.user;
    if (user != undefined) {
      userState = user;
    }
    let userinfo = this.state.userinfo;
    userinfo[id] = {display_name: id, img: blank};
    this.setState({userinfo: userinfo});

    let url = urllib.format(Object.assign({}, userState.hs, {
      pathname: `/_matrix/client/r0/profile/${id}/displayname`,
      query: {
        access_token: userState.access_token
      }
    }));

    this.nameFetch = rfetch(url, options)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.displayname != undefined) {
          userinfo = this.state.userinfo;
          userinfo[id].display_name = responseJson.displayname;
          this.setState({userinfo: userinfo});
          localStorage.setItem("userinfo", JSON.stringify(this.state.userinfo));
        }
      });

    url = urllib.format(Object.assign({}, userState.hs, {
      pathname: `/_matrix/client/r0/profile/${id}/avatar_url`,
      query: {
        access_token: userState.access_token
      }
    }));

    this.imgFetch = rfetch(url, options)
      .then(response => response.json())
      .then(responseJson => {
        if(responseJson.errcode == undefined &&
          responseJson.avatar_url != undefined) {
          userinfo = this.state.userinfo;
          userinfo[id].img = Matrix.m_thumbnail(userState.hs, responseJson.avatar_url, 64, 64);
          this.setState({userinfo: userinfo});
          localStorage.setItem("userinfo", JSON.stringify(this.state.userinfo));
        }
      });
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
    });
  },

  initialSync: function() {
    Matrix.initialSyncRequest(this.state.user)
      .then((localRooms) => {
        this.setState({
          rooms: localRooms
        });

        this.sync();
      }); //retry on fail
  },

  sync: function() {
    Matrix.syncRequest(this.state.user, this.state.rooms, this.state.invites).then((syncedRooms) => {
      this.setState({
        rooms: syncedRooms[0],
        invites: syncedRooms[1]
      });

      // Auto kicker, use at own risk!

      //let kickRooms = ["!DGzyCNYwKufHpwWFTH:matrix.org"];
      //kickRooms.forEach((roomId) => {
      //  let users = syncedRooms[0][roomId].users;
      //  
      //  Object.keys(users).forEach((userId) => {
      //    if (userId.startsWith("@irc_") && userId.endsWith(":lain.haus")) {
      //      Matrix.kickUser(this.state.user, roomId, userId, "Automated Kick").then(
      //        (resp) => console.log("kicked", userId, resp));
      //    }
      //  });
      //});


      setTimeout(this.sync(), 200);
    });
  },

  addMessages: function (roomId, messages) {
    let concatenatedMessages = defaultValue(this.state.messages[roomId], []).concat(messages);
    let uniqueMessages = uniq(concatenatedMessages, uniqEvents).sort(sortEvents);

    /* FIXME: This should set state as well. */

    return uniqueMessages;
  },

  getBacklog: function(roomId) {
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

    rfetch(reqUrl, options)
      .then((response) => response.json())
      .then((responseJson) => {
        let combinedMessages = this.addMessages(roomId, responseJson.chunk);
        messages[roomId] = combinedMessages;

        rooms[roomId].prev_batch = responseJson.end;
        this.setState({
          messages: messages,
          rooms: rooms,
        });
      });
  },

  removeInvite: function(roomId) {
    let invites = this.state.invites;
    let handledInvites = this.state.handledInvites;
    delete invites[roomId];
    handledInvites[roomId] = true;

    this.setState({
      invites: invites,
      handledInvites: handledInvites
    });
    localStorage.setItem("invites", JSON.stringify(invites));
  },

  render: function() {
    let loading;
    if (this.state.loading) {
      loading = <img className="loading" src={loadingGif} alt="loading"/>;
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

    let view;
    if (this.state.room != 0) {
      let usercount = Object.keys(this.state.rooms[this.state.room].users).length;
      view = (
        <React.Fragment>
          <div className="info">
            <b>
              {this.state.rooms[this.state.room].info.name}
            </b><br/>
            {usercount} member{usercount > 1 && "s"}
          </div>
          <RoomView
            backlog={this.getBacklog}
            roomId={this.state.room}
            rooms={this.state.rooms}
            user={this.state.user}
            userinfo={this.state.userinfo}
            get_userinfo={this.get_userinfo}
            setParentState={this.setStateFromChild}
            replyId={this.state.replyId}
          />
        </React.Fragment>
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
          removeInvite={this.removeInvite}
        />
        <div className="view">
          {view}
        </div>
      </div>
    );
  }
});

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
        {this.state.json.error &&
          <span className="error">{this.state.json.error}</span>
        }
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
    }));

    rfetch(url, {
      body: JSON.stringify(data),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST',
    }, options).then((response) => response.json())
      .then((responseJson) => {
        this.setState({json: responseJson});
        if(responseJson.access_token != undefined) {
          responseJson.hs = homeserver;
          this.props.loginCallback(responseJson);
        }
        this.props.setParentState("loading", 0);
      })
      .catch((error) => {
        this.setState({json: {error: "Error contacting homeserver"}});
        console.error(error);
        this.props.setParentState("loading", 0);
      });
  }
});

function sortEvents(a, b) {
  return a.origin_server_ts-b.origin_server_ts;
}

function uniqEvents(a, b) {
  return a.event_id === b.event_id;
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
