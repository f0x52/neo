'use strict';

const React = require("react");
const create = require("create-react-class");
let urllib = require('url');
let riot = require('../lib/riot-utils.js');
let defaultValue = require('default-value');
const rfetch = require('fetch-retry');
let options = {retries: 5, retryDelay: 200};

let File = create ({
  displayName: "fileUpload",
  componentDidMount: function() {
    document.getElementById("attachment").addEventListener('change', this.upload, false); //TODO: update to ref
  },

  getInitialState: function() {
    return ({
      count: 0
    });
  },

  upload: function() {
    let roomId = this.props.room;
    let file = document.getElementById("attachment").files[0];
    this.setState({file: file});
    let upload_url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: "/_matrix/media/r0/upload/",
      query: {
        access_token: this.props.user.access_token
      }
    }));

    let msgId = this.state.count;
    let rooms = this.props.rooms;
    let room = rooms[roomId];
    let roomUnsent = defaultValue(room.unsentEvents, {});
    roomUnsent[msgId] = {
      content: {body: this.state.file.name},
      origin_server_ts: Date.now()
    };

    this.setState({
      count: this.state.count+1
    });
    
    room.unsentEvents = roomUnsent;
    rooms[roomId] = room;
    this.props.setParentState("rooms", rooms);


    rfetch(upload_url, {
      method: 'POST',
      body: this.state.file,
      headers: new Headers({
        'Content-Type': this.state.file.type
      })
    }, options).then(
      response => response.json()
    ).then(response => {
      console.log(response);
      this.setState({"url": response.content_uri});
      let unixtime = Date.now();

      let msg_url = urllib.format(Object.assign({}, this.props.user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/send/m.room.message/${unixtime}`,
        query: {
          access_token: this.props.user.access_token
        }
      }));

      if (this.state.file.type.startsWith("image/")) { //m.image
        this.uploadImage(upload_url, msg_url, rooms, roomId, msgId, this.props.setParentState);
      } else if (this.state.file.type.startsWith("video/")) { //m.video
        this.uploadVideo(upload_url, msg_url, rooms, roomId, msgId, this.props.setParentState);
      } else { //m.file
        this.uploadFile(msg_url, rooms, roomId, msgId, this.props.setParentState);
      }
    });
  },

  uploadImage: function(upload_url, msg_url, rooms, roomId, msgId, setParentState) {
    let thumbnailType = "image/png";
    let imageInfo;

    if (this.state.file.type == "image/jpeg") {
      thumbnailType = "image/jpeg";
    }

    riot.loadImageElement(this.state.file).bind(this).then(function(img) {
      return riot.createThumbnail(img,
        img.width,
        img.height,
        thumbnailType);
    }).then(function(result) {
      imageInfo = result.info;
      this.setState({info: imageInfo});
      rfetch(upload_url, {
        method: 'POST',
        body: result.thumbnail,
      }, options).then(
        response => response.json()
      ).then(response => {
        let info = this.state.info;
        info.thumbnail_url = response.content_uri;
        info.mimetype = this.state.file.type;

        let body = {
          "msgtype": "m.image",
          "url": this.state.url,
          "body": this.state.file.name,
          "info": info
        };

        let room = rooms[roomId];
        let roomUnsent = defaultValue(room.unsentEvents, {});

        roomUnsent[msgId].sent = true;
        roomUnsent[msgId].content.msgtype = "m.image";
        roomUnsent[msgId].content.url = this.state.url;
        roomUnsent[msgId].content.info = info;

        room.unsentEvents = roomUnsent;
        rooms[roomId] = room;
        setParentState("rooms", rooms);

        rfetch(msg_url, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        }, options).then(res => res.json())
          .catch((error) => console.error('Error:', error))
          .then((response) => {
            console.log('sent image event', response);
            roomUnsent[msgId].id = response.event_id;

            room.unsentEvents = roomUnsent;
            rooms[roomId] = room;
            setParentState("rooms", rooms);
          });
      });
    });
  },

  uploadVideo: function(upload_url, msg_url, rooms, roomId, msgId, setParentState) {
    const thumbnailType = "image/jpeg";
    let videoInfo;

    riot.loadVideoElement(this.state.file).bind(this).then(function(video) {
      return riot.createThumbnail(video, video.videoWidth, video.videoHeight, thumbnailType);
    }).then(function(result) {
      videoInfo = result.info;
      this.setState({info: videoInfo});
      rfetch(upload_url, {
        method: 'POST',
        body: result.thumbnail,
      }, options).then(
        response => response.json()
      ).then((response) => {
        let info = this.state.info;
        info.thumbnail_url = response.content_uri;
        info.mimetype = this.state.file.type;

        let body = {
          "msgtype": "m.video",
          "url": this.state.url,
          "body": this.state.file.name,
          "info": info
        };

        let room = rooms[roomId];
        let roomUnsent = defaultValue(room.unsentEvents, {});

        roomUnsent[msgId].sent = true;
        roomUnsent[msgId].content.msgtype = "m.video";
        roomUnsent[msgId].content.url = this.state.url;
        roomUnsent[msgId].content.info = info;

        room.unsentEvents = roomUnsent;
        rooms[roomId] = room;
        setParentState("rooms", rooms);

        rfetch(msg_url, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        }, options).then(res => res.json())
          .catch((error) => console.error('Error:', error))
          .then((response) => {
            console.log('sent file event', response);
            roomUnsent[msgId].id = response.event_id;

            room.unsentEvents = roomUnsent;
            rooms[roomId] = room;
            setParentState("rooms", rooms);
          });
      });
    });
  },

  uploadFile: function(msg_url, rooms, roomId, msgId, setParentState) {
    console.log("uploading file", this.state.file.name);
    let body = {
      "msgtype": "m.file",
      "url": this.state.url,
      "body": this.state.file.name,
      "info": {
        "mimetype": this.state.file.type
      }
    };


    let room = rooms[roomId];
    let roomUnsent = defaultValue(room.unsentEvents, {});

    roomUnsent[msgId].sent = true;
    roomUnsent[msgId].content.msgtype = "m.file";
    roomUnsent[msgId].content.url = this.state.url;

    room.unsentEvents = roomUnsent;
    rooms[roomId] = room;
    setParentState("rooms", rooms);

    rfetch(msg_url, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: new Headers({
        'Content-Type': 'application/json'
      })
    }, options).then(res => res.json())
      .catch(error => console.error('Error:', error))
      .then((response) => {
        console.log('sent file event', response);
        roomUnsent[msgId].id = response.event_id;

        room.unsentEvents = roomUnsent;
        rooms[roomId] = room;
        setParentState("rooms", rooms);
      });
  },

  render: function() {
    return (
      <input id="attachment" type="file"/>
    );
  }
});

module.exports = File;
