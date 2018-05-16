'use strict';

const React = require("react");
//const create = require("create-react-class");
//const Promise = require('bluebird');
//const urllib = require('url');

const icons = require('./icons.js');

module.exports = {
  asText: function(event) {
    if (event.content == undefined ||
      (event.content.membership == undefined &&
        event.content.msgtype == undefined)) {
      console.log(event);
      return "please open an issue at github.com/f0x52/neo/issues, full event in console";
    }

    if (event.reply) {
      let doubleNewlineIndex = event.content.body.indexOf("\n\n")+1; //breaks on specific messages with two /n/n
      event.content.body = event.content.body.substr(doubleNewlineIndex);
    }

    if (event.type == "m.room.message") {
      let type = "";
      if (event.content.msgtype == "m.notice") {
        type = icons.notice;
      } else if (event.content.msgtype == "m.emote") {
        type = <React.Fragment>{icons.action} {event.sender} </React.Fragment>;
      } else if (event.content.msgtype == "m.image") {
        type = icons.image;
      } else if (event.content.msgtype == "m.video") {
        type = icons.video;
      } else if (event.content.msgtype == "m.file") {
        type = icons.file;
      } else if (event.content.msgtype == "m.location") {
        type = "[location]";
      } else if (event.content.msgtype == "m.audio") {
        type = "[audio]";
      }

      return <span>{`${type} ${event.content.body}`}</span>;
    } else if (event.type == "m.room.member") {
      let action = "";
      let reason = "";
      if (event.content.membership) {
        event.membership = event.content.membership;
      }
      if (event.membership == "leave") {
        if (event.sender == event.state_key) { //leave
          action = "left";
        } else { //kick
          action = "kicked " + event.state_key;
        }
      } else if (event.membership == "join") {
        action = "joined";
      } else if (event.membership == "invite") {
        action = "invited " + event.state_key;
      } else if (event.membership == "ban") {
        action = "banned " + event.state_key;
      } 
      else {
        action = "did something, please open an issue at github.com/f0x52/neo/issues, full event in console";
        console.log(event);
      }

      if (event.content.reason != undefined) {
        reason = "reason: " + event.content.reason;
      }
      return (`${event.sender} ${action} ${reason}`);
    }
  }
};

