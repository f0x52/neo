'use strict';

//const React = require('react');
const urllib = require('url');
const rfetch = require('fetch-retry');
const Event = require('./Events.js');
const defaultValue = require('default-value');
const Promise = require('bluebird');
const uniq = require('arr-uniq');

const options = {retries: 5, retryDelay: 200};

const blank = require('../../assets/blank.jpg');

module.exports = {
  initialSyncRequest: function(user) {
    return new Promise((resolve, reject) => {
      let localRooms = {};
      let url = urllib.format(Object.assign({}, user.hs, {
        pathname: "/_matrix/client/r0/joined_rooms",
        query: {
          access_token: user.access_token
        }
      }));

      rfetch(url, options)
        .then((response) => response.json())
        .catch((error) => {
          console.error('Error:', error);
          reject(error);
        })
        .then((responseJson) => {
          Promise.map(responseJson.joined_rooms, (roomId) => {
            // Get backlog and userlist for all rooms
            return this.getRoomInfo(user, roomId);
          }).then((roomInfoArray) => {
            roomInfoArray.forEach((roomInfo) => {
              localRooms[roomInfo[0]] = roomInfo[1];
              localRooms[roomInfo[0]].users = roomInfo[2];
            });

            console.log("neo: done getting all backlog/userlists");
            resolve(localRooms);
          });
        });
    });
  },

  getRoomInfo: function(user, roomId) {
    return Promise.all([
      roomId,
      this.getBacklog(user, roomId),
      this.getUserlist(user, roomId)
    ]);
  },

  getBacklog: function(user, roomId) {
    return new Promise((resolve, reject) => {
      let url = urllib.format(Object.assign({}, user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/messages`,
        query: {
          limit: 80,
          dir: "b",
          access_token: user.access_token
        }
      }));

      rfetch(url, options)
        .then((response) => response.json())
        .catch((error) => {
          console.error('Error:', error);
          reject(error);
        })
        .then((responseJson) => {
          let chunk = responseJson.chunk;
          let newEvents = {};
          chunk.forEach((event) => {
            newEvents[event.event_id] = event;
          });
          
          let localRoom = this.parseEvents({}, newEvents);

          localRoom.notif = {unread: 0, highlight: 0};

          resolve(localRoom);
        });
    });
  },

  getUserlist: function(user, roomId) {
    return new Promise((resolve, reject) => {
      let url = urllib.format(Object.assign({}, user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/joined_members`,
        query: {
          access_token: user.access_token
        }
      }));

      return rfetch(url, options)
        .then((response) => response.json())
        .catch((error) => {
          console.error('Error:', error);
          reject(error);
        })
        .then((responseJson) => {
          let remoteUsers = responseJson.joined;
          let localUsers = {};

          Object.keys(remoteUsers).forEach((userId) => {
            let remoteUser = remoteUsers[userId];
            if (remoteUser.display_name == undefined) {
              remoteUser.display_name = userId;
            }
            if (remoteUser.avatar_url == undefined) {
              remoteUser.img = blank;
            } else { 
              remoteUser.img = this.m_thumbnail(
                user.hs,
                remoteUser.avatar_url,
                64,
                64
              );
            }
            localUsers[userId] = remoteUser;
          });
          resolve(localUsers);
        });
    });
  },

  syncRequest: function(user, localRooms, localInvites) {
    return new Promise((resolve, reject) => {
      let url = Object.assign({}, user.hs, {
        pathname: "/_matrix/client/r0/sync",
        query: {
          timeout: 30000,
          access_token: user.access_token
        }
      });

      if(user.next_batch != undefined) {
        url.query.since = user.next_batch;
      }

      rfetch(urllib.format(url), options)
        .then((response) => response.json())
        .catch((error) => {
          console.error('Error:', error);
          reject(error);
        })
        .then((responseJson) => {
          if (responseJson == undefined) {
            console.log('response was undefined');
            return;
          }
          
          let remoteRooms = responseJson.rooms.join;

          Object.keys(remoteRooms).forEach((roomId) => {
            let room = defaultValue(localRooms[roomId], {});
            let remoteRoom = remoteRooms[roomId];

            let newEvents = {};
            remoteRoom.timeline.events.forEach((event) => {
              newEvents[event.event_id] = event;
            });

            room = this.parseEvents(room, newEvents);

            let unread = defaultValue(
              remoteRoom.unread_notifications.notification_count,
              0
            );

            let highlight = defaultValue(
              remoteRoom.unread_notifications.highlight_count,
              0
            );
            room.notif = {unread: unread, highlight: highlight};

            localRooms[roomId] = room;
          });

          let remoteInvites = responseJson.rooms.invite;
          localInvites = this.parseInvites(user, localInvites, remoteInvites);

          resolve([localRooms, localInvites]);
        });
    });
  },

  parseEvents: function(room, newEvents) {
    let oldEvents = defaultValue(room.events, {});

    let combinedEvents = Object.assign(
      {},
      oldEvents,
      newEvents
    );

    let eventIndex = Object.keys(combinedEvents);
    let sortedEventIndex = eventIndex.sort(function(a, b) {
      return combinedEvents[a].origin_server_ts-combinedEvents[b].origin_server_ts;
    });

    let uniqueEventIndex = uniq(sortedEventIndex);
    
    room = Object.assign(room, {
      events: combinedEvents,
      eventIndex: uniqueEventIndex
    });

    let lastEvent = {
      origin_server_ts: 0,
      content: {
        body: ""
      }
    };

    sortedEventIndex.slice().reverse().some((eventId) => {
      let event = combinedEvents[eventId];
      if (Event.asText(event) != null) {
        lastEvent = event;
        return true;
      }
      return false;
    });

    room.lastEvent = lastEvent;
    return room;
  },

  parseInvites: function(user, invites, remoteInvites) {
    let localInvites = {};
    Object.keys(remoteInvites).forEach((inviteId) => {
      if (localInvites[inviteId] == undefined) {
        //invites will stay in /sync until handled
      }
      let remoteInvite = remoteInvites[inviteId];
      let name = inviteId;
      let avatar = blank;
      let invitedBy = null;

      Object.keys(remoteInvite.invite_state.events).forEach((eventId) => {
        let event = remoteInvite.invite_state.events[eventId];
        switch(event.type) {
          case "m.room.name": // Should fallback to alias/pm username
            name = event.content.name;
            break;
          case "m.room.avatar":
            avatar = this.m_download(user.hs, event.content.url);
            break;
          case "m.room.member":
            if (event.content.membership == "invite") {
              invitedBy = event.sender;
            }
            break;
        }
      });
      localInvites[inviteId] = {display_name: name, avatar: avatar, invitedBy: invitedBy};
    });
    return localInvites;
  },

  deduplicateLocalEcho: function(roomId, roomEvents, unsentEvents) {
    if (Object.keys(unsentEvents).length > 0) {
      let stillUnsentKeys = Object.keys(unsentEvents).filter((msgId) => {
        let val = unsentEvents[msgId];
        if (val.sent && roomEvents[val.id] != null) {
          return false;
        }
        return true;
      });

      let updatedUnsent = {};
      stillUnsentKeys.forEach((key) => {
        updatedUnsent[key] = unsentEvents[key];
      });
      return unsentEvents;
    }
  },

  m_thumbnail: function(hs, mxc, w, h) {
    return urllib.format(Object.assign({}, hs, {
      pathname: `/_matrix/media/r0/thumbnail/${mxc.substring(6)}`,
      query: {
        width: w,
        height: h
      }
    }));
  },
  
  m_download: function(hs, mxc) {
    return urllib.format(Object.assign({}, hs, {
      pathname: `/_matrix/media/r0/download/${mxc.substring(6)}`
    }));
  }

};
