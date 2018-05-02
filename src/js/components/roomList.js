const React = require("react");
const create = require("create-react-class");
const Promise = require('bluebird');
const urllib = require('url');

let blank = require('../../assets/blank.jpg');
let neo = require('../../assets/neo.png');

let List = create({
  displayName: "List",
  getInitialState: function() {
    return({
      menu: false,
      element: null
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
        user={this.props.user}
        setParentState={this.props.setParentState}
      />
    );

    return(
      <React.Fragment>
        <div className="darken" />
        <div className="list no-select" id="list">
          <div className="header">
            <img src={this.props.icon.hamburger.dark} alt="menu" onClick={this.toggleMenu}/>
            <span>Neo</span> {/* Can be used for search later*/}
          </div>
          <Menu
            menu={this.state.menu}
            setParentState={this.setStateFromChild}
            logout={this.props.logout}
            user={this.props.user}
          />
          <div className="joinedRooms">
            {list}
          </div>
        </div>
      </React.Fragment>
    );
  },
})

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
    this.props.setParentState("menu", false);
    this.props.logout();
  },

  render: function() {
    let style={};
    let content = null;

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
            <img src={neo} alt="Neo"/>
            <span>Username</span>
          </div>
          {/*<div>New Room</div>*/}
          <div onClick={this.join}>Join Room</div>
          <div onClick={this.settings}>Settings</div>
          <div onClick={this.logout}>Log out</div>
        </div>
        <Settings settings={this.state.settings}/>
        <Join join={this.state.join} user={this.props.user}/>
      </React.Fragment>
    );
  }
})

let Settings = create({
  render: function() {
    if (this.props.settings) {
      return (
        <div id="settings">
          <h1>No settings yet!</h1>
        </div>
      );
    }
    return null;
  }
})

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
      })
  },

  setRef: function(element) {
    if (element != null) {
      element.addEventListener("submit", this.join)
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
    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${this.props.id}/state/m.room.name`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.name != undefined) {
          this.setState({name: responseJson.name});
        }
      })

    url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${this.props.id}/state/m.room.avatar`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if(responseJson.errcode == undefined) {
          let avatar_url = responseJson.url.substring(6);
          this.setState({
            img: urllib.format(Object.assign({}, this.props.user.hs, {
              pathname: `/_matrix/media/r0/download/${avatar_url}`
            }))
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
          this.props.setParentState("room", this.props.id);
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

let darken = function() {
  // Darken the whole screen, except dialog, resolve on click
  return new Promise(function(resolve, reject) {
    let div = document.getElementsByClassName("darken")[0];
    div.onclick = () => {
      let div = document.getElementsByClassName("darken")[0];
      div = Object.assign(div.style, {zIndex: "-1", backgroundColor: "hsla(0, 0%, 0%, 0)"});
      resolve();
    };
    div = Object.assign(div.style, {zIndex: "50", backgroundColor: "hsla(0, 0%, 0%, 0.5)"});
  });
}

module.exports = List;
