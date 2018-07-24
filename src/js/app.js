'use strict';

const React = require('react');
const ReactDOM = require('react-dom');
//const Promise = require('bluebird');
const rfetch = require('fetch-retry');

require('../scss/layout.scss');

let create = require('create-react-class');
let urllib = require('url');

let options = {retries: 5, retryDelay: 200};

// Components
let RoomList = require('./components/roomList');
let RoomView = require('./components/messageView');

let Matrix = require('./lib/Matrix.js');

let neo = require('../assets/neo_full.png');
let blank = require('../assets/blank.jpg');
let loadingGif = require('../assets/loading.gif');

let VERSION = "alpha0.07-dev";

let App = create({
  displayName: "App",
  getInitialState: function() {
    let user = {};
    let localState = {
      userInfo: {},
      rooms: {},
      invites: {
        open: {},
        closed: []
      }
    };

    if(localStorage.getItem("version") == VERSION) {
      user = JSON.parse(localStorage.getItem("user"));
      localState = JSON.parse(localStorage.getItem("localState"));
      console.log("loaded user data from storage");
    }

    return({
      user: user,
      localState: localState,
      loading: 0,
      roomId: 0,
      backlog: 0
    });
  },

  componentDidMount: function() {
    if (this.state.user.access_token != undefined) {
      this.initialSync();
    }
  },

  loginCallback: function(json) {
    let user = json;
    user.username = user.user_id.split(':')[0].substr(1);
    user.settings = {
      bool: {
        split: false,
        bubbles: false
      },
      input: {
        highlights: ""
      }
    };
    localStorage.setItem("version", VERSION);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("localState", JSON.stringify(this.state.localState));

    this.setState({
      user: user,
    });

    this.initialSync();
  },

  userInfo: function(userId) {
    if (this.state.localState.userInfo[userId] != undefined) {
      return this.state.localState.userInfo[userId];
    } 
    Matrix.userInfo.get(this.state.user, userId)
      .then((userInfo) => {
        let localState = this.state.localState;
        localState.userInfo[userId] = userInfo;
        localStorage.setItem("localState", JSON.stringify(localState));
        this.setState({localState: localState});
        return null;
      })
      .catch((err) => {
        console.error("Error fetching", userId, err);
      });

    let userInfo = {display_name: userId, img: blank};
    let localState = this.state.localState;
    localState.userInfo[userId] = userInfo;
    this.setState({localState: localState});
    return userInfo;
  },

  get_userinfo: function(id, user) { // Should only be neccessary in edgecases
    let userState = this.state.user;
    if (user != undefined) {
      userState = user;
    }
    let localState = this.state.localState;
    localState.userInfo[id] = {display_name: id, img: blank};
    this.setState({localState: localState});

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
          let localState = this.state.localState;
          localState.userInfo[id].display_name = responseJson.displayname;
          this.setState({localState: localState});
          localStorage.setItem("localState", JSON.stringify(this.state.localState));
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
          let localState = this.state.localState;
          localState.userInfo[id].img = Matrix.m_thumbnail(userState.hs, responseJson.avatar_url, 64, 64);
          this.setState({localState: localState});
          localStorage.setItem("localState", JSON.stringify(this.state.localState));
        }
      });
  },

  setGlobalState: function(prop, value) {
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
      .then((returnArray) => {
        let localState = this.state.localState;
        Object.assign(localState, {
          rooms: returnArray[0],
          userInfo: returnArray[1]
        });

        this.setState({
          localState: localState
        });

        localStorage.setItem("localState", JSON.stringify(localState));
        this.sync();
      })
      .catch((error) => {
        console.error('Error:', error);
        console.error("RETRY initialSync");
        this.initialSync();
      });
  },

  sync: function() {
    Matrix.syncRequest(this.state.user, this.state.localState).then((syncedRooms) => {
      let localState = this.state.localState;
      Object.assign(localState, {
        rooms: syncedRooms[0],
        invites: syncedRooms[1]
      });

      this.setState({
        localState: localState
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

      localStorage.setItem("localState", JSON.stringify(localState));
      setTimeout(this.sync(), 200);
    });
  },

  removeInvite: function(roomId) {
    let localState = this.state.localState;
    let openInvites = localState.invites.open;
    let closedInvites = localState.invites.closed;
    delete openInvites[roomId];
    closedInvites[roomId] = true;

    Object.assign(localState, {
      invites: {
        open: openInvites,
        closed: closedInvites
      }
    });

    this.setState({
      localState: localState
    });
    localStorage.setItem("localState", JSON.stringify(localState));
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
            setGlobalState={this.setGlobalState}
          />
        </div>
      );
    }

    let view;
    if (this.state.roomId != 0) {
      let usercount = Object.keys(this.state.localState.rooms[this.state.roomId].users).length;
      console.log(this.state.localState.rooms[this.state.roomId]);
      view = (
        <React.Fragment>
          <div className="info">
            <b>
              {this.state.localState.rooms[this.state.roomId].info.name}
            </b><br/>
            {usercount} member{usercount > 1 && "s"}<br/>
            {this.state.localState.rooms[this.state.roomId].info.topic}
          </div>
          <RoomView {...this.state}
            backlog={this.getBacklog}
            userInfo={this.userInfo}
            setGlobalState={this.setGlobalState}
          />
        </React.Fragment>
      );
    }

    return (
      <div className="main">
        <div>{loading}</div>
        <RoomList
          roomId={this.state.roomId}
          localState={this.state.localState}
          user={this.state.user}
          get_userinfo={this.get_userinfo}
          userInfo={this.userInfo}
          setGlobalState={this.setGlobalState}
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
    this.props.setGlobalState("loading", 1);
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
        this.props.setGlobalState("loading", 0);
      })
      .catch((error) => {
        this.setState({json: {error: "Error contacting homeserver"}});
        console.error(error);
        this.props.setGlobalState("loading", 0);
      });
  }
});

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
