'use strict';

const React = require("react");
const create = require("create-react-class");
//const Promise = require('bluebird');
const urllib = require('url');
const defaultValue = require('default-value');
const Linkify = require('react-linkify').default;
const rfetch = require('fetch-retry');

const Event = require('./Events.js');
const Matrix = require('./Matrix.js');
const debounce = require('debounce');
const blank = require('../../assets/blank.jpg');

let MessageView = create({
  displayName: "MessageView",

  getInitialState: function() {
    return({
      scroll: {},
      element: null,
    });
  },

  setRef: function(element) {
    if (element != null) {
      element.addEventListener("scroll", debounce(this.onScroll, 10));
      this.setState({element: element});
    }
  },

  onScroll: function() {
    this.setState({
      scroll: Object.assign({}, this.state.scroll, {
        [this.props.room]: this.getScroll()
      })
    });
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
    let className = "messages";
    if (this.props.user.settings.bool.split) {
      className += " split";
    }

    return(
      <div className="message_window_split">
        <div className={className} id="message_window" ref={this.setRef}>
          <Messages
            backlog={this.props.backlog}
            room={this.props.room}
            rooms={this.props.rooms}
            user={this.props.user}
            users={this.props.users}
            scrollToBottom={this.scrollToBottom}
            getScroll={this.getScroll}
            onScroll={this.onScroll}
            scroll={scroll}
            userinfo={this.props.userinfo}
            get_userinfo={this.props.get_userinfo}
            unsentEvents={this.props.unsentEvents}
            setReply={this.props.setReply}
            setParentState={this.props.setParentState}
          />
        </div>
        <Userlist
          roomId={this.props.room}
          rooms={this.props.rooms}
        />
      </div>
    );
  }
});

let Userlist = create({
  getInitialState: function() {
    return({
      userPagination: 32,
    });
  },

  componentDidUpdate: function() {
    if (this.props.roomId != this.state.lastRoom) {
      this.setState({
        lastRoom: this.props.roomId,
        userPagination: 32
      });
    }
  },

  userlistScroll: function(e) {
    let object = e.target;
    if (object.scrollHeight - object.scrollTop - object.clientHeight < 100) {
      let userPagination = this.state.userPagination + 50;
      let userListLength = Object.keys(this.props.rooms[this.props.roomId].users).length;
      if (userPagination > userListLength) {
        userPagination = userListLength;
      }
      this.setState({
        userPagination: userPagination
      });
    }
  },
  
  render: function() {
    let userlist;
    if (this.props.rooms[this.props.roomId] != undefined) {
      let users = this.props.rooms[this.props.roomId].users;
      if (users == undefined) {
        return null;
      }
      let sortedUsers = Object.keys(users).sort(sortByUsername);
      let paginatedUsers = sortedUsers.slice(0, this.state.userPagination);
      userlist = paginatedUsers.map((userId) => {
        return (
          <div key={userId} className="user">
            <img id="avatar" src={users[userId].img}/>
            <span className="username">
              <b>{users[userId].display_name}</b><br/>
              {userId}
            </span>
          </div>
        );
      });
    }

    return (
      <div className="userlist" onScroll={this.userlistScroll}>
        {userlist}
      </div>
    );
  }
});

let Messages = create({
  displayName: "Messages",
  getInitialState: function() {
    return({
      userinfo: [],
      shouldGoToBottom: 0
    });
  },

  componentDidUpdate: function() {
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
    let events = this.props.rooms[this.props.room].events;
    if (this.props.room == 0 || events == undefined) {
      return null;
    }

    let eventIndex = this.props.rooms[this.props.room].eventIndex;
    let messages = eventIndex.map((eventId) => {
      let event = events[eventId];
      //let next_event = parseInt(event_num)+1;

      if (event.type == "m.sticker") { //ugly hack
        event.type = "m.room.message";
        event.content.msgtype = "m.sticker";
      }

      if (event.grouped != 1 && event.type == "m.room.message") {
        if (this.props.userinfo[event.sender] == undefined) {
          this.props.get_userinfo(event.sender);
        }

        let replyEvent;
        if (event.content["m.relates_to"] != null &&
          event.content["m.relates_to"]["m.in_reply_to"] != null) {
          let replyId = event.content["m.relates_to"]["m.in_reply_to"].event_id;
          replyEvent = events[replyId];
        }

        //while (this.props.messages[next_event] != undefined &&
        //  this.props.messages[next_event].sender == event.sender &&
        //  this.props.messages[next_event].type == "m.room.message" &&
        //  (this.props.messages[next_event].content.msgtype == "m.text" ||
        //    this.props.messages[next_event].content.msgtype == "m.notice" ) &&
        //  (this.props.messages[next_event].origin_server_ts -
        //    event.origin_server_ts < 300000) && //max 5 min older
        //  this.props.messages[next_event].grouped != 1) {
        //  this.props.messages[next_event].grouped = 1;
        //  event.content.body += "\n" + this.props.messages[next_event].content.body;
        //  next_event++;
        //}

        return (
          <Message
            key={event.event_id}
            info={this.props.userinfo[event.sender]}
            id={event.sender}
            event={event}
            source={event.sender == this.props.user.user_id ? "out" : "in"}
            group="no"
            user={this.props.user}
            replyTo={replyEvent}
            event_id={event.event_id}
            users={this.props.rooms[this.props.room].users}
            setParentState={this.props.setParentState}
          />
        );
      } else if (event.type == "m.room.member") {
        let text = Event.asText(event);
        return (
          <div className="line member" key={event.event_id}>
            {text}
          </div>
        );
      }
      return null;
    });

    let unsentWrap;
    let roomUnsent = defaultValue(this.props.rooms[this.props.room].unsentEvents, {});
    let roomUnsentKeys = Object.keys(roomUnsent);
    if (roomUnsentKeys.length > 0) {
      let unsent = roomUnsentKeys.map((eventId) => {
        let event = roomUnsent[eventId];

        let replyEvent;
        if (event.content["m.relates_to"] != null &&
          event.content["m.relates_to"]["m.in_reply_to"] != null) {
          let replyId = event.content["m.relates_to"]["m.in_reply_to"].event_id;
          replyEvent = events[replyId];
        }

        return (
          <Message
            key={eventId}
            info={this.props.userinfo[this.props.user.user_id]}
            event={event}
            group="no"
            user={this.props.user}
            sent={event.sent}
            replyTo={replyEvent}
            event_id={eventId}
            users={this.props.rooms[this.props.room].users}
            setParentState={this.props.setParentState}
          />
        );
      });
      unsentWrap = (
        <div className="unsent">
          {unsent}
        </div>
      );
    }
    return (
      <div>
        <span onClick={() => this.props.backlog(this.props.room)}>
          Load more messages
        </span><br/>
        {this.props.room}
        {messages}
        {unsentWrap}
      </div>
    );
  }
});

let Message = create({
  displayName: "Message",
  getInitialState: function() {
    return({
      ref: null
    });
  },

  setRef: function(element) {
    if (element != null) {
      this.setState({ref: element});
    }
  },

  render: function() {
    let classArray = ["message", this.props.id];
    if (this.props.event.sent) {
      classArray.push("sent");
    }
    let highlights = this.props.user.settings.input.highlights.split(" ");
    highlights.push(this.props.user.username);
    if (this.props.event.content.body != undefined) {
      highlights.some((highlight) => {
        if (highlight == "") {
          return false;
        }
        if (this.props.event.content.body.includes(highlight)) {
          classArray.push("mention");
          return true;
        }
        return false;
      });
    }
    if (!this.props.user.settings.bool.bubbles) {
      classArray.push("nobubble");
    }
    classArray = classArray.join(" ");

    let time = new Date(this.props.event.origin_server_ts);
    let time_string = time.getHours().toString().padStart(2, "0") +
      ":" + time.getMinutes().toString().padStart(2, "0");

    let media = "";
    let media_width = "";
  
    let eventBody = this.props.event.content.body;

    if (this.props.event.content.msgtype == "m.image" || this.props.event.content.msgtype == "m.sticker") {
      if (this.props.event.content.msgtype == "m.sticker") {
        eventBody = "";
      }

      classArray += " media";
      if (this.props.event.content.info == undefined) {
        let url = Matrix.Matrix.m_download(this.props.user.hs, this.props.event.content.url);
        media = displayMedia("image", this.state.ref, url, url);
      } else if (this.props.event.content.info.thumbnail_info == undefined) {
        let url = Matrix.m_download(this.props.user.hs, this.props.event.content.url);
        if (this.props.event.content.info.h != undefined && this.props.event.content.info.w != undefined) {
          media = displayMedia("image", this.state.ref, url, url, this.props.event.content.info.h, this.props.event.content.info.w);
        } else {
          media = displayMedia("image", this.state.ref, url, url);
        }
      } else {
        media_width = this.props.event.content.info.thumbnail_info.w;
        let media_url = this.props.event.content.info.thumbnail_url;
        if (this.props.event.content.info.mimetype == "image/gif") {
          media_url = this.props.event.content.url;
        }

        media = displayMedia(
          "image",
          this.state.ref,
          Matrix.m_download(this.props.user.hs, this.props.event.content.url),
          Matrix.m_download(this.props.user.hs, media_url),
          this.props.event.content.info.thumbnail_info.h,
          this.props.event.content.info.thumbnail_info.w
        );
      }
    } else if (this.props.event.content.msgtype == "m.video") {
      let thumb = "";
      if (this.props.event.content.info != undefined &&
        this.props.event.content.info.thumbnail_url != undefined) {
        thumb = Matrix.m_download(this.props.user.hs, this.props.event.content.info.thumbnail_url);
      }
      let h;
      let w;

      if (this.props.event.content.info.thumbnail_info != undefined) {
        h = this.props.event.content.info.thumbnail_info.h;
        w = this.props.event.content.info.thumbnail_info.w;
      } else {
        h = 600;
        if (this.state.ref == undefined) {
          w = 500;
        } else {
          w = this.state.ref.clientWidth - 70;
        }
      }

      media = displayMedia(
        "video",
        this.state.ref,
        Matrix.m_download(this.props.user.hs, this.props.event.content.url),
        thumb,
        h,
        w
      );
      
    } else if (this.props.event.content.msgtype == "m.file") {
      media = <a
        className="file"
        target="_blank" 
        href={Matrix.m_download(this.props.user.hs, this.props.event.content.url)}
      >
        <span>file download</span>
      </a>;
    } else {
      if (!this.props.event.content.msgtype == "m.text") {
        console.log(this.props.event);
      }
    }

    if (this.props.event.content.body == undefined) {
      return null;
    }

    let replyContent;
    if (this.props.replyTo != undefined) {
      this.props.replyTo.reply = true;
      replyContent = (
        <div className="replyTo">
          <b id="reply">{this.props.users[this.props.replyTo.sender].display_name}</b>
          {Event.asText(this.props.replyTo)}
        </div>
      );
      let doubleNewlineIndex = this.props.event.content.body.indexOf("\n\n"); //breaks on specific messages with two /n/n
      eventBody = this.props.event.content.body.substr(doubleNewlineIndex+1);
    }

    let content = (
      eventBody.split('\n').map((item, key) => {
        if (item.trim() == "") {
          return null;
        }
        let items = item.split(" ").map((str, key) => {
          let returnVal = str + " ";
          highlights.some((highlight) => {
            if (highlight == "") {
              return false;
            }
            if (str.includes(highlight)) {
              returnVal = <span key={key} className="highlight">{str} </span>;
              return true;
            }
            return false;
          });
          return returnVal;
        });
        return <span key={key}>{items}<br/></span>;
      })
    );

    let link = <Linkify component={LinkInfo} properties={{user: this.props.user, sRef: this.state.ref}}>
      {content}
    </Linkify>;

    return (
      <div className={"line " + this.props.source} ref={this.setRef}>
        <img id="avatar" src={this.props.info.img} onError={(e)=>{e.target.src = blank;}}/>
        <div className={classArray} id={this.props.id} style={{width: media_width}}>
          <div>
            <b title={this.props.id}>{this.props.info.display_name} <span id="reply" onClick={() => {this.props.setParentState("replyId", this.props.event_id);}}>Reply</span></b>
            {replyContent}
            {media}
            <div className="flex">
              <p>
                {link}
              </p>
              <span className="timestamp">{time_string}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
});

let LinkInfo = create({
  displayName: "LinkInfo",
  getInitialState: function() {
    return({
      img: null,
      url: ""
    });
  },

  componentDidMount: function() {
    let url = this.props.href;
    this.setState({
      url: url
    });

    let m_url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: "/_matrix/media/r0/preview_url/",
      query: {
        url: url,
        access_token: this.props.user.access_token
      }
    }));

    rfetch(m_url)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson["og:image"] != undefined && responseJson["og:title"] == undefined) {
          this.setState({
            img: Matrix.m_download(this.props.user.hs, responseJson["og:image"]),
            h: responseJson["og:image:height"],
            w: responseJson["og:image:width"]
          });
        }
      });
  },

  render: function() {
    if (this.state.img) {
      //<img className="link" src={this.state.img} style={{minHeight: this.state.h, minWidth: this.state.w}}/>
      return(
        <span>
          <a href={this.props.href} target="_blank">{this.props.children}</a><br/>
          {displayMedia("inline-image", this.props.sRef, this.state.img, this.state.img, this.state.h, this.state.w, "link")}
        </span>
      );
    }

    return (
      <a href={this.props.href} target="_blank">{this.props.children}</a>
    );
  }
});

function sortByUsername(a, b) {
  var nameA = a.toUpperCase();
  var nameB = b.toUpperCase();
  if (nameA < nameB) {
    return -1;
  }
  if (nameA > nameB) {
    return 1;
  }
  return 0;
}

function displayMedia(type, container, src, thumb, h, w, className) {
  if (container == null) {
    return null;
  }

  let newHeight;
  let newWidth;

  let maxHeight = 600;
  let maxWidth = container.clientWidth - 70;

  let hRatio = maxHeight/h;
  let wRatio = maxWidth/w;

  if (hRatio <= wRatio) {
    newHeight = maxHeight;
  }
  if (hRatio >= wRatio) {
    newWidth = maxWidth;
  }

  if (h == undefined && w == undefined) {
    newHeight = maxHeight;
    newWidth = maxWidth;
  }

  if (type == "image") {
    return(
      <div>
        <a target="_blank" href={src}>
          <img
            src={thumb}
            style={{maxHeight: newHeight, maxWidth: newWidth}}
            className={className}
          />
        </a>
      </div>
    );
  } else if (type == "inline-image") {
    return(
      <img
        src={thumb}
        style={{maxHeight: newHeight, maxWidth: newWidth}}
        className={className}
      />
    );
  } else if (type == "video") {
    return(
      <video
        src={src}
        poster={thumb}
        controls
        style={{maxHeight: newHeight, maxWidth: newWidth}}
      ></video>
    );
  }
}

module.exports = MessageView;