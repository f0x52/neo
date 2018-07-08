'use strict';

const React = require("react");
const create = require("create-react-class");
const urllib = require('url');
const defaultValue = require('default-value');
const rfetch = require('fetch-retry');
const marked = require('marked');
const sanitize = require('sanitize-html');
//const debounce = require('debounce');

const icons = require('./icons.js');
const Event = require('../lib/Events.js');
const Riot = require('../lib/riot-utils.js');

const options = {retries: 5, retryDelay: 200};

let icon = {
  file: {
    dark: require('../../assets/dark/file.svg'),
    light: require('../../assets/light/file.svg')
  },
  send: {
    dark: require('../../assets/dark/send.svg'),
    light: require('../../assets/light/send.svg')
  }
};

const File = require('./fileUpload');

let Send = create({
  displayName: "Send",
  getInitialState: function() {
    return({
      count: 0,
      selectedOption: 0
    });
  },

  setRef: function(element) {
    if (element != null) {
      element.addEventListener('change',  this.resize_textarea);
      element.addEventListener('cut',     this.resize_textarea_delayed);
      element.addEventListener('paste',   this.resize_textarea_delayed);
      element.addEventListener('drop',    this.resize_textarea_delayed);
      element.addEventListener('keydown', this.resize_textarea_delayed);
      element.addEventListener('keydown', this.shift_enter);
      element.addEventListener('keydown', this.tabComplete);
      this.setState({
        ref: element
      });
    }
  },

  tabComplete: function(event) {
    if (event.keyCode == 9) {
      event.preventDefault();
    }
    if (this.state.completions == undefined || this.state.completions.length > 1) {
      if (event.keyCode == 38 || event.keyCode == 40) {
        event.preventDefault();
      }
    }
    setTimeout(() => {
      let content = event.target.value;
      let cursorPos = event.target.selectionStart;
      let wordStart = content.lastIndexOf(" ", cursorPos);
      if (wordStart == -1) {
        wordStart = 0;
      }
      let word = content.substr(wordStart, cursorPos-wordStart).trim();
      if (!word.startsWith("@")) {
        this.setState({
          completions: []
        });
        return;
      }
      if (event.keyCode == 9) { //tab, update text content
        let completions = this.state.completions;
        let option = this.state.selectedOption;
        if (completions.length != 0 && completions[option] != undefined) { //completion is possible
          let completion = this.state.completions[option][0];
          let completion_parts = completion.split(":");
          completion = completion_parts[0];
          let start = content.substr(0, wordStart);
          if (start.trim() != "") {
            start = start + " ";
          }
          let end = content.substr(cursorPos);
          let replacement = start + completion + end;
          if (replacement != undefined) {
            event.target.value = replacement;
          }
        }
        option = (option + 1) % completions.length;
        if (isNaN(option)) { //why?
          option = 0;
        }

        this.setState({
          selectedOption: option
        });
      } else { //update suggestions
        let completions = getUserCompletion(this.props.roomIdIds[this.props.roomIdId].users, word);
        let option = this.state.selectedOption;
        if (event.keyCode == 38) { // up arrow
          option = (option - 1) % completions.length;
        } else if (event.keyCode == 40) { //down arrow
          option = (option + 1) % completions.length;
        }

        if (isNaN(option)) { //why?
          option = 0;
        }
        this.setState({
          completions: completions,
          selectedOption: option
        });
      }
    }, 1); //to be able to see current text content correctly
  },

  shift_enter: function(event) {
    setTimeout(this.completion, 1);
    if (event.keyCode == 13 && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  },

  resize_textarea: function(element) {
    if (element == undefined) {
      return;
    }
    let ref = element.target;
    if (ref != undefined) {
      ref.style.height = 'auto';
      ref.style.height = ref.scrollHeight+'px';
    }
  },

  resize_textarea_delayed: function(e) {
    setTimeout(() => this.resize_textarea(e), 5);
  },

  send: function() {
    if (this.state.ref == null) {
      return;
    }
    let textarea = this.state.ref;
    if(textarea.value == "") {
      return;
    }

    let msg = textarea.value.replace(/^\s+|\s+$/g, '');
    textarea.value = "";
    let unixtime = Date.now();

    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${this.props.roomId}/send/m.room.message/${unixtime}`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    let msgId = this.state.count;
    let rooms = this.props.localState.rooms;
    let roomId = this.props.roomId;
    let room = rooms[roomId];
    let msgType = "m.text";


    let isEmote;
    if (msg.startsWith("/me ")) {
      isEmote = true;
      msg = msg.substr(4);
    }

    let formattedBody = msg;
    let stripReply = /<mx-reply>.+<\/mx-reply>/;
    formattedBody = marked(msg).trim().replace(/\n/g, "<br/>");
    formattedBody.replace(stripReply, "");

    let eventBody = sanitize(msg, {allowedTags: []});

    if (isEmote) {
      msgType = "m.emote";
      formattedBody = Riot.sanitize(formattedBody);
      //formattedBody = sanitize(formattedBody, {transformTags: {'p': 'span'}});
    }

    let body = {
      "msgtype": msgType,
      "body": eventBody,
      "formatted_body": formattedBody,
      "format": "org.matrix.custom.html"
    };

    if (this.props.replyId) {
      let replyEvent = this.props.localState.rooms[this.props.roomId].events[this.props.replyId];
      let replyToBody = replyEvent.content.body;

      if (replyEvent.content.formatted_body != undefined) {
        replyToBody = replyEvent.content.formatted_body.replace(stripReply, "");
      }

      let fallback_msg = `${replyEvent.sender}: >${replyEvent.content.body.trim()}\n\n${eventBody}`;
      let fallback_html = `<mx-reply><blockquote><a href=\"https://matrix.to/#/${roomId}/${this.props.replyId}\">In reply to</a> <a href=\"https://matrix.to/#/${replyEvent.sender}\">${replyEvent.sender}</a><br>${replyToBody}</blockquote></mx-reply>${formattedBody}`;

      body = {
        "msgtype": "m.text",
        "body": fallback_msg,
        "format": "org.matrix.custom.html",
        "formatted_body": fallback_html,
        "m.relates_to": {
          "m.in_reply_to": {
            event_id: this.props.replyId
          }
        }
      };
    }

    this.setState({
      count: this.state.count+1
    });


    //FIXME: LOCALECHO
    let roomUnsent = defaultValue(room.unsentEvents, {});
    roomUnsent[msgId] = {
      content: body,
      sender: this.props.user.user_id,
      origin_server_ts: Date.now(),
      real: false,
      sent: false,
      count: this.state.count
    };

    room.unsentEvents = roomUnsent;
    rooms[roomId] = room;
    this.props.setGlobalState("rooms", rooms);

    this.props.setGlobalState("replyId", undefined);
    rfetch(url, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: new Headers({
        'Content-Type': 'application/json'
      })
    }, options).then(res => res.json())
      .catch(error => console.error('Error:', error))
      .then(response => {
        let roomUnsent = this.props.localState.rooms[roomId].unsentEvents;
        console.log('Success:', response);
        roomUnsent[msgId].sent = true;
        roomUnsent[msgId].id = response.event_id;

        room.unsentEvents = roomUnsent;
        rooms[roomId] = room;
        this.props.setGlobalState("rooms", rooms);
      });
  },

  send2: function() {
    if (this.state.ref == null) {
      return;
    }
    let textarea = this.state.ref;
    if(textarea.value == "") {
      return;
    }
    let msg = textarea.value.replace(/^\s+|\s+$/g, '');
    textarea.value = "";
    let unixtime = Date.now();

    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${this.props.roomId}/send/m.room.message/${unixtime}`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    let msgId = this.state.count;
    let rooms = this.props.localState.rooms;
    let roomId = this.props.roomId;
    let room = rooms[roomId];

    let formattedBody = msg;
    let stripReply = /<mx-reply>.+<\/mx-reply>/;
    formattedBody = marked(msg).trim().replace(/\n/g, "<br/>");
    formattedBody.replace(stripReply, "");

    let eventBody = sanitize(msg, {allowedTags: []});

    let body = {
      "msgtype": "m.text",
      "body": eventBody,
      "formatted_body": formattedBody,
      "format": "org.matrix.custom.html"
    };

    if (this.props.replyId) {
      let replyEvent = this.props.localState.rooms[this.props.roomId].events[this.props.replyId];
      let replyToBody = replyEvent.content.body;

      if (replyEvent.content.formatted_body != undefined) {
        replyToBody = replyEvent.content.formatted_body.replace(stripReply, "");
      }

      let fallback_msg = `${replyEvent.sender}: >${replyEvent.content.body.trim()}\n\n${eventBody}`;
      let fallback_html = `<mx-reply><blockquote><a href=\"https://matrix.to/#/${roomId}/${this.props.replyId}\">In reply to</a> <a href=\"https://matrix.to/#/${replyEvent.sender}\">${replyEvent.sender}</a><br>${replyToBody}</blockquote></mx-reply>${formattedBody}`;

      body = {
        "msgtype": "m.text",
        "body": fallback_msg,
        "format": "org.matrix.custom.html",
        "formatted_body": fallback_html,
        "m.relates_to": {
          "m.in_reply_to": {
            event_id: this.props.replyId
          }
        }
      };
    }

    this.setState({
      count: this.state.count+1
    });


    //FIXME: LOCALECHO
    let roomUnsent = defaultValue(room.unsentEvents, {});
    roomUnsent[msgId] = {
      content: body,
      sender: this.props.user.user_id,
      origin_server_ts: Date.now(),
      real: false,
      sent: false,
      count: this.state.count
    };

    room.unsentEvents = roomUnsent;
    rooms[roomId] = room;
    this.props.setGlobalState("rooms", rooms);

    this.props.setGlobalState("replyId", undefined);
    rfetch(url, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: new Headers({
        'Content-Type': 'application/json'
      })
    }, options).then(res => res.json())
      .catch(error => console.error('Error:', error))
      .then(response => {
        let roomUnsent = this.props.localState.rooms[roomId].unsentEvents;
        console.log('Success:', response);
        roomUnsent[msgId].sent = true;
        roomUnsent[msgId].id = response.event_id;

        room.unsentEvents = roomUnsent;
        rooms[roomId] = room;
        this.props.setGlobalState("rooms", rooms);
      });
  },

  render: function() {
    let completions;
    let replyTo;
    if (this.state.completions != undefined && this.state.completions.length > 0) {
      completions = (
        <div className="completions">
          {
            this.state.completions.map((completion, id) => {
              let className;
              if (id == this.state.selectedOption) {
                className = "active";
              }
              return (
                <div key={completion} className={className}>
                  <img src={completion[2]}/>
                  <b>{completion[1]}</b> {completion[0]}
                </div>
              );
            })
          }
        </div>);
    } else if (this.props.replyId) {
      let replyEvent = this.props.localState.rooms[this.props.roomId].events[this.props.replyId];

      replyTo = (
        <div className="reply">
          <span className="replyIcon">
            {icons.reply}
          </span>
          {Event.asText(replyEvent)}
          <span className="onclick close" onClick={() => this.props.setGlobalState("replyId", undefined)}>
            {icons.close}
          </span>
        </div>
      );
    }

    return (
      <div className="compose">
        <label htmlFor="attachment">
          <img src={icon.file.dark} id="file" className="dark"/>
          <img src={icon.file.light} id="file" className="light"/>
        </label>
        <File {...this.props}
          rooms={this.props.localState.rooms}
        />
        {replyTo}
        {completions}
        <textarea
          id="text"
          rows="1"
          placeholder="Write a message..."
          ref={this.setRef}
          spellCheck="false">
        </textarea>
        <img src={icon.send.dark} id="send" onClick={() => this.send}className="dark"/>
        <img src={icon.send.light} id="send" onClick={() => this.send} className="light"/>
      </div>
    );
  }
});

function getUserCompletion(list, str) {
  let completionList = [];
  console.log("neo: getting completion for", str);
  if (str.trim() == "") {
    return completionList;
  }
  str = str.toUpperCase();
  Object.keys(list).forEach((completion) => {
    if (completion.toUpperCase().includes(str) || list[completion].display_name.toUpperCase().includes(str)) {
      completionList.push([completion, list[completion].display_name, list[completion].img]);
    }
  });
  return(completionList);
}

module.exports = Send;
