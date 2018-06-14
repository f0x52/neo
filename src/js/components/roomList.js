'use strict';

const React = require("react");
const create = require("create-react-class");
const Promise = require('bluebird');
const urllib = require('url');

let Event = require('../lib/Events.js');
let debounce = require('debounce');
let blank = require('../../assets/blank.jpg');
let icons = require('./icons.js');
//let neo = require('../../assets/neo.png');

let List = create({
  displayName: "List",
  getInitialState: function() {
    return({
      menu: false,
      element: null,
      filteredRooms: []
    });
  },

  toggleMenu: function() {
    this.setState({menu: true});
  },

  setStateFromChild: function(prop, value) {
    this.setState({
      [prop]: value
    });
  },

  setRef: function(element) {
    this.setState({element: element});
  },

  setFilterRef: function(element) {
    if (element != null) {
      this.setState({filterRef: element});
      element.addEventListener("keydown", () => {setTimeout(this.filterRooms, 1);});
      setTimeout(this.filterRooms, 1);
    }
  },

  getDerivedStateFromProps: function(props) {
    return ({
      filteredRooms: Object.keys(props.localState.rooms)
    });
  },

  resetFilter: function() {
    this.state.filterRef.value = "";
    this.filterRooms();
  },

  filterRooms: function() {
    let input = this.state.filterRef.value;
    let filteredRooms = getFilteredRooms(this.props.localState.rooms, input);
    this.setState({filteredRooms: filteredRooms});
  },

  render: function() {
    let rooms = this.props.localState.rooms;
    let sortedRooms = Object.keys(rooms).sort(
      function(a, b) {
        return rooms[b].lastEvent.origin_server_ts - rooms[a].lastEvent.origin_server_ts;
      }
    );
    let list = sortedRooms.map((roomId) => {
      if (this.state.filteredRooms[roomId] == false) {
        return null;
      }
      return (
        <RoomEntry {...this.props}
          lastEvent={rooms[roomId].lastEvent}
          filteredRooms={this.state.filteredRooms}
          roomId={roomId}
          active={this.props.roomId == roomId}
          key={roomId}
          id={roomId}
          resetFilter={this.resetFilter}
          notif={rooms[roomId].notif}
        />
      );
    });

    return(
      <React.Fragment>
        <div className="darken" />
        <div className="list no-select" id="list">
          <div className="header">
            <span onClick={this.toggleMenu}>{icons.hamburger}</span>
            {/*<span>Neo</span> {/* Can be used for search later*/}
            <div>
              <input ref={this.setFilterRef} type="text"/>
            </div>
          </div>
          <Menu {...this.props}
            menu={this.state.menu}
            setParentState={this.setStateFromChild}
            setUser={this.props.setGlobalState}
          />
          <div className="scroll">
            <Invites {...this.props}
              remove={this.props.removeInvite}
            />
            <div className="joinedRooms">
              {list}
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  },
});

let Menu = create({
  getInitialState: function() {
    return ({
      settings: false
    });
  },

  close: function() {
    this.props.setParentState("menu", false);
    this.setState({settings: false, join: false});
  },

  join: function() {
    this.props.setParentState("menu", false);
    this.setState({join: true});
  },

  settings: function() {
    this.props.setParentState("menu", false);
    this.setState({settings: true});
  },

  logout: function() {
    localStorage.setItem("logout", "true");
    this.props.setParentState("menu", false);
    this.props.logout();
  },

  render: function() {
    let style={};

    if (this.props.menu) {
      style = {width: "20vw"};
      darken().then(
        () => this.close()
      );
    }

    return (
      <React.Fragment>
        <div style={style} id="menu">
          <div id="user">
            <img src={this.props.userInfo(this.props.user.user_id).img}/>
            <span>{this.props.userInfo(this.props.user.user_id).display_name}</span>
          </div>
          {/*<div>New Room</div>*/}
          <div onClick={this.join}>Join Room</div>
          <div onClick={this.settings}>Settings</div>
          <div onClick={this.logout}>Log out</div>
        </div>
        <Settings
          settings={this.state.settings}
          user={this.props.user}
          setUser={this.props.setUser}
        />
        <Join join={this.state.join} user={this.props.user}/>
      </React.Fragment>
    );
  }
});

let Settings = create({
  setting: function(cat, setting, value) {
    let user = this.props.user;
    user.settings[cat][setting] = value;
    this.props.setUser("user", user);
    localStorage.setItem("user", JSON.stringify(user));
  },

  render: function() {
    if (!this.props.settings) {
      return null;
    }

    let booleans = Object.keys(this.props.user.settings.bool).map((setting, key) => {
      return (
        <div className="bool" key={key}>
          <label htmlFor={"bool-" + key} className="label">{setting.charAt(0).toUpperCase() + setting.slice(1)}</label>
          <label className="switch">
            <input id={"bool-" + key} type="checkbox" checked={this.props.user.settings.bool[setting]} onChange={(e) => {
              this.setting("bool", setting, e.target.checked);
            }}/>
            <span className="slider"/>
          </label>
          <br/>
        </div>
      );
    });

    let inputs = Object.keys(this.props.user.settings.input).map((setting, key) => {
      return (
        <div className="input" key={key}>
          <label htmlFor={"input-" + key} className="label">{setting.charAt(0).toUpperCase() + setting.slice(1)}</label>
          <input id={"input-" + key} type="input" value={this.props.user.settings.input[setting]} onChange={(e) => {
            debounce(this.setting("input", setting, e.target.value), 1000);
          }}/>
          <br/>
        </div>
      );
    });

    return (
      <div id="settings">
        <h1>Neo Settings</h1>
        <h3>Chat Settings</h3>
        <div className="boolean">
          {booleans}
        </div><br/>
        <div className="inputs">
          {inputs}
        </div>
      </div>
    );
  }
});

let Join = create({
  getInitialState: function() {
    return ({
      error: null
    });
  },

  join: function(event) {
    event.preventDefault();
    let id = document.getElementById("roomid").value;

    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/join/${id}`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url, {
      method: 'POST'
    })
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.error != undefined) {
          this.setState({error: responseJson.error});
        }
      });
  },

  setRef: function(element) {
    if (element != null) {
      element.addEventListener("submit", this.join);
    }
  },

  render: function() {
    if (this.props.join) {
      return (
        <div id="join">
          <h1>Join an existing Room</h1>
          <form ref={this.setRef}>
            <label htmlFor="roomid">Room Id or Alias: </label>
            <input type="text" id="roomid" />
            <input type="submit" value="Join room" />
            {this.state.error &&
              <div className="error">{this.state.error}</div>
            }
          </form>
        </div>
      );
    }
    return null;
  }
});

let Invites = create({
  displayName: "Invites",
  render: function() {
    let invites = this.props.localState.invites.open;
    if (invites == null) {
      return null;
    }
    let inviteKeys = Object.keys(invites);
    if (inviteKeys.length == 0) {
      return null;
    }
    let list = inviteKeys.map((roomId) => 
      <InviteEntry {...this.props}
        key={roomId}
        roomId={roomId}
        user={this.props.user}
        invite={invites[roomId]}
        remove={() => this.props.remove(roomId)}
      />
    );
    return (
      <div className="invites">
        {list}
      </div>
    );
  }
});

let InviteEntry = create({
  displayName: "InviteEntry",

  accept: function() {
    let id = this.props.roomId;
    console.log("accepting ", id);
    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${id}/join`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url, {
      method: 'POST'
    })
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.error != undefined) {
          console.error(responseJson);
        }
      });
    this.props.remove();
  },

  decline: function() {
    let id = this.props.roomId;
    console.log("declining ", id);

    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${id}/leave`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url, {
      method: 'POST'
    })
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.error != undefined) {
          console.error(responseJson);
        }
      });
    this.props.remove();
  },


  render: function() {
    let msg = "";
    if (this.props.invite.invitedBy != null) {
      msg = <React.Fragment><b>{this.props.userInfo(this.props.invite.invitedBy).display_name}</b> invited you</React.Fragment>;
    }
    return(
      <div
        id="invite_item">
        <img
          id="avatar"
          height="70px"
          width="70px"
          src={this.props.invite.avatar}
          onError={(e)=>{e.target.src = blank;}}
        />
        <span id="name">
          {this.props.invite.display_name}
        </span><br/>
        <span className="last_msg">
          {msg}
        </span><br/>
        <span className="response">
          <button onClick={this.accept} id="accept">Accept</button>
          <button onClick={this.decline} id="decline">Decline</button>
        </span>
      </div>
    );
  }
});

let RoomEntry = create({
  displayName: "RoomEntry",
  switchRoom: function() {
    this.props.resetFilter();
    this.props.setGlobalState("roomId", this.props.id);
    let user = this.props.user;

    let url = urllib.format(Object.assign({}, user.hs, {
      pathname: `/_matrix/client/r0/rooms/${this.props.id}/receipt/m.read/${this.props.lastEvent.event_id}`,
      query: {
        access_token: user.access_token
      }
    }));

    fetch(url, {
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST',
    });
    //let rooms = this.props.rooms;
    //rooms[this.props.id].notif = {unread: 0, highlight: 0};
    //this.props.setGlobalState("rooms", rooms);
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
    let user = this.props.userInfo(this.props.lastEvent.sender).display_name;
    let unread_count = this.props.notif.unread;
    if (this.props.notif.highlight > 0) {
      unread_count = "@";
    }

    let textual = Event.asText(this.props.lastEvent);
    let classes = this.props.active ? "active" : "";
    if (this.props.notif.unread > 0) {
      classes += "wrapUnread";
    }

    let currentRoomInfo = this.props.localState.rooms[this.props.roomId].info;
    return (
      <div
        id="room_item"
        className={classes}
        onClick={this.switchRoom}>
        <img
          id="avatar"
          height="70px"
          width="70px"
          src={currentRoomInfo.avatar}
          onError={(e)=>{e.target.src = blank;}}
        />
        <span id="name">
          {currentRoomInfo.name}
        </span><br/>
        <span className="align_right">
          <span className="timestamp">
            {time_string}
          </span><br/>
          {this.props.notif.unread > 0 &&
              <div className="unread">{unread_count}</div>
          }
        </span>
        <span className="last_msg">
          <b>{user}:</b> {textual}
        </span>
      </div>
    );
  }
});

let darken = function() {
  // Darken the whole screen, except dialog, resolve on click
  return new Promise(function(resolve) {
    let div = document.getElementsByClassName("darken")[0];
    div.onclick = () => {
      let div = document.getElementsByClassName("darken")[0];
      div.style = Object.assign(div.style, {zIndex: "-1", backgroundColor: "hsla(0, 0%, 0%, 0)"});
      resolve();
    };
    div = Object.assign(div.style, {zIndex: "50", backgroundColor: "hsla(0, 0%, 0%, 0.5)"});
  });
};

function getFilteredRooms(list, str) {
  let completionList = {};
  if (str.trim() == "") {
    return list;
  }
  str = str.toUpperCase();
  Object.keys(list).forEach((roomId) => {
    let completion = list[roomId].info.name;
    if (completion.toUpperCase().includes(str)) {
      completionList[roomId] = true;
    }
  });
  return(completionList);
}

module.exports = List;
