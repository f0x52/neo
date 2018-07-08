'use strict';

const React = require("react");
const create = require("create-react-class");
//const Promise = require('bluebird');
const urllib = require('url');
const defaultValue = require('default-value');
const Linkify = require('react-linkify').default;
const rfetch = require('fetch-retry');
const riot = require('../lib/riot-utils.js');

const Scroll = require("react-scroll");
const scroll = Scroll.animateScroll;

const Event = require('../lib/Events.js');
const Matrix = require('../lib/Matrix.js');
//const debounce = require('debounce');
const blank = require('../../assets/blank.jpg');
const icons = require('./icons.js');

const Send = require('./input.js');

let RoomView = create({
  displayName: "roomView",
  
  render: function() {
    return(
      <React.Fragment>
        <div className="messagesAndInput">
          <MessageView {...this.props} />
          <div className="input">
            <Send {...this.props} />
          </div>
        </div>
        <Userlist {...this.props} />
      </React.Fragment>
    );
  }
});

let MessageView = create({
  displayName: "scrollView",

  getInitialState: function() {
    return ({
      scrollOptions: {containerId: "messagesScrollView", duration: 200}
    });
  },

  scrollToBottom: function() {
    scroll.scrollToBottom(this.state.scrollOptions);
  },

  render: function () {
    let className = "messages";
    if (this.props.user.settings.bool.split) {
      className += " split";
    }

    let room = this.props.localState.rooms[this.props.roomId];
    let events = room.events;

    if (this.props.roomId == 0 || events == undefined) {
      return null;
    }

    let eventIndex = room.eventIndex;

    let messages = eventIndex.map((eventId) => {
      let event = events[eventId];
      //let next_event = parseInt(event_num)+1;

      let eventAsText = Event.asText(event);
      if (eventAsText == null) {
        //We can't render this
        return null;
      }

      let replyEvent;
      if (event.content["m.relates_to"] != null &&
        event.content["m.relates_to"]["m.in_reply_to"] != null) {
        let replyId = event.content["m.relates_to"]["m.in_reply_to"].event_id;
        replyEvent = events[replyId];
      }

      if (event.type == "m.room.message" || event.type == "m.sticker") {
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
            id={event.sender}
            event={event}
            source={event.sender == this.props.user.user_id ? "out" : "in"}
            group="yes"
            replyTo={replyEvent}
            eventId={event.event_id}
            users={room.users}
            real={true}
            {...this.props}
          />
        );
      } else {
        let className = "line";

        if (event.type == "m.room.member") {
          className += " member";
        }

        return (
          <div className={className} key={event.event_id} onContextMenu={(e) => {e.preventDefault(); console.log("event:", event);}}>
            {eventAsText}
          </div>
        );
      }
    });

    let unsentEvents = defaultValue(room.unsentEvents, {});
    let localEcho = Object.keys(unsentEvents).map((eventId) => {
      let event = unsentEvents[eventId];
      let isReal = defaultValue(event.real, true);

      let replyEvent;
      if (event.content["m.relates_to"] != null &&
        event.content["m.relates_to"]["m.in_reply_to"] != null) {
        let replyId = event.content["m.relates_to"]["m.in_reply_to"].event_id;
        replyEvent = events[replyId];
      }
  
      return (
        <Message
          key={defaultValue(event.event_id, event.count)}
          id={event.sender}
          event={event}
          source={event.sender == this.props.user.user_id ? "out" : "in"}
          group="yes"
          replyTo={replyEvent}
          eventId={event.event_id}
          users={room.users}
          real={isReal}
          sent={event.sent}
          {...this.props}
        />
      );
    });

    return (
      <div className="messagesScrollViewWrapper">
        <div className={className} id="messagesScrollView">
          {messages}
          {localEcho}
        </div>
        <span className="bottom onclick" onClick={this.scrollToBottom}>{icons.arrow.down}</span>
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
      let userListLength = Object.keys(this.props.localState.rooms[this.props.roomId].users).length;
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
    if (this.props.localState.rooms[this.props.roomId] != undefined) {
      let users = this.props.localState.rooms[this.props.roomId].users;
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
        <div className="invite">Invite</div>
        {userlist}
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
    let event = this.props.event;
    if (event.redacted_because != undefined) {
      return null;
    }
    let classArray = ["message", this.props.id];
    if (event.sent) {
      classArray.push("sent");
    }
    let highlights = this.props.user.settings.input.highlights.split(" ");
    highlights.push(this.props.user.username);
    if (event.content.body != undefined) {
      highlights.some((highlight) => {
        if (highlight == "") {
          return false;
        }
        if (event.content.body.includes(highlight)) {
          classArray.push("mention");
          return true;
        }
        return false;
      });
    }

    let localEchoClass = [];
    if (!this.props.real) { // localecho message
      localEchoClass.push("localecho");
      if (this.props.sent) {
        localEchoClass.push("unsent");
      }
    }

    if (!this.props.user.settings.bool.bubbles) {
      classArray.push("nobubble");
    }
    classArray = classArray.join(" ");
    localEchoClass = localEchoClass.join(" ");

    let time = new Date(event.origin_server_ts);
    let time_string = time.getHours().toString().padStart(2, "0") +
      ":" + time.getMinutes().toString().padStart(2, "0");

    let media = "";
    let media_width = "";
  
    let eventBody = event.content.body;

    if (event.content.msgtype == "m.image" || event.type == "m.sticker") {
      if (event.type == "m.sticker") {
        eventBody = "";
      }

      classArray += " media";
      if (event.content.info == undefined) {
        let url = Matrix.m_download(this.props.user.hs, event.content.url);
        media = displayMedia("image", this.state.ref, url, url);
      } else if (event.content.info.thumbnail_info == undefined) {
        let url = Matrix.m_download(this.props.user.hs, event.content.url);
        if (event.content.info.h != undefined && event.content.info.w != undefined) {
          media = displayMedia("image", this.state.ref, url, url, event.content.info.h, event.content.info.w);
        } else {
          media = displayMedia("image", this.state.ref, url, url);
        }
      } else {
        media_width = event.content.info.thumbnail_info.w;
        let media_url = event.content.info.thumbnail_url;
        if (event.content.info.mimetype == "image/gif") {
          media_url = event.content.url;
        }

        media = displayMedia(
          "image",
          this.state.ref,
          Matrix.m_download(this.props.user.hs, event.content.url),
          Matrix.m_download(this.props.user.hs, media_url),
          event.content.info.thumbnail_info.h,
          event.content.info.thumbnail_info.w
        );
      }
    } else if (event.content.msgtype == "m.video") {
      let thumb = "";
      if (event.content.info != undefined &&
        event.content.info.thumbnail_url != undefined) {
        thumb = Matrix.m_download(this.props.user.hs, event.content.info.thumbnail_url);
      }
      let h;
      let w;

      if (event.content.info.thumbnail_info != undefined) {
        h = event.content.info.thumbnail_info.h;
        w = event.content.info.thumbnail_info.w;
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
        Matrix.m_download(this.props.user.hs, event.content.url),
        thumb,
        h,
        w
      );
      
    } else if (event.content.msgtype == "m.file") {
      media = <a
        className="file"
        target="_blank" 
        href={Matrix.m_download(this.props.user.hs, event.content.url)}
      >
        <span>file download</span>
      </a>;
    } else {
      if (!event.content.msgtype == "m.text") {
        console.log(event);
      }
    }

    if (event.content.body == undefined) {
      return null;
    }

    let formattedEventBody = event.content.formatted_body;

    let replyContent;
    if (this.props.replyTo != undefined) {
      if (this.props.users[this.props.replyTo.sender] == undefined) {
        this.props.users[this.props.replyTo.sender] = {display_name: this.props.replyTo.sender}; //FIXME!!!
      }
      this.props.replyTo.reply = true;
      replyContent = (
        <div className="replyTo">
          <b id="reply">{this.props.users[this.props.replyTo.sender].display_name}</b>
          {Event.asText(this.props.replyTo)}
        </div>
      );
    }

    let saneHtml;
    if (event.content.formatted_body != undefined) {
      saneHtml = riot.sanitize(formattedEventBody);
      eventBody = <div dangerouslySetInnerHTML={{ __html: saneHtml }} />;
    }

    if (event.content.msgtype == "m.emote") {
      eventBody = <span dangerouslySetInnerHTML={{ __html: saneHtml }} />;
      eventBody = <React.Fragment>{icons.action} {event.sender} {eventBody}</React.Fragment>;
    }

    let link = <Linkify component={LinkInfo} properties={{user: this.props.user, sRef: this.state.ref}}>
      {eventBody}
    </Linkify>;

    let senderInfo = this.props.userInfo(event.sender);

    return (
      <div className={"line " + this.props.source + " " + localEchoClass} ref={this.setRef} onContextMenu={(e) => {e.preventDefault(); console.log("event:", event);}} >
        <img id="avatar" src={senderInfo.img} onError={(e)=>{e.target.src = blank;}}/>
        <div className={classArray} id={this.props.id} style={{width: media_width}}>
          <div className="messageContainer">
            <b title={this.props.id}>{senderInfo.display_name}</b>
            {replyContent}
            {media}
            <div className="flex">
              <div className="markdown">
                {link}
              </div>
            </div>
          </div>
          <div className="replyAndTime">
            <span id="reply" onClick={() => {this.props.setGlobalState("replyId", this.props.eventId);}}>
              Reply
            </span>
            <span className="timestamp">{time_string}</span>
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

module.exports = RoomView;
