'use strict';

const React = require("react");
const create = require("create-react-class");
let urllib = require('url');
let riot = require('../lib/riot-utils.js');
let defaultValue = require('default-value');
const rfetch = require('fetch-retry');
let options = {retries: 5, retryDelay: 200};
const icons = require('./icons.js');

let Matrix = require('../lib/Matrix.js');

let File = create ({
  displayName: "fileUpload",

  getInitialState: function() {
    return ({
      count: 0,
      fileCount: 0,
      fileList: {},
      dialog: false
    });
  },

  setCaptionRef: function(e) {
    if (e != null) {
      e.focus();
      e.addEventListener('keydown', (e) => {
        if (e.keyCode == 13) {
          setTimeout(this.send, 1);
        }
      });
      this.setState({
        captionRef: e
      });
    }
  },

  setFileRef: function(e) {
    if (e != null) {
      e.addEventListener('change', this.startUpload);
      this.setState({
        fileRef: e
      });
    }
  },

  startUpload: function() {
    this.setState({
      dialog: true
    });

    darken().then(() => {
      this.setState({
        fileList: {},
        dialog: false
      });
    });
  
    Array.from(this.state.fileRef.files).forEach((file) => {
      let fileList = this.state.fileList;
      let fileCount = this.state.fileCount;

      fileList[fileCount] = {
        file: file
      };

      this.setState({
        fileList: fileList,
        fileCount: fileCount + 1 
      });

      if (file.type.startsWith("image/")) {
        let reader = new FileReader();

        reader.onloadend = () => {
          let fileList = this.state.fileList;
          fileList[fileCount] = {
            file: file,
            preview: reader.result,
          };
          this.setState({
            fileList: fileList,
          });
        };
        reader.readAsDataURL(file);
      } 
    });
  },

  cancel: function(fileId) {
    let fileList = this.state.fileList;
    delete fileList[fileId];
    let dialog = true;
    if (Object.keys(fileList).length == 0) {
      let div = document.getElementsByClassName("darken")[0];
      div.style = Object.assign(div.style, {zIndex: "-1", backgroundColor: "hsla(0, 0%, 0%, 0)"});
      dialog = false;
    }
    this.setState({
      fileList: fileList,
      dialog: dialog
    });
  },

  render: function() {
    let filePreviews = Object.keys(this.state.fileList).map((fileId) => {
      let fileEntry = this.state.fileList[fileId];
      if (fileEntry.preview != null) {
        return (
          <div className="image" key={fileId}>
            <img src={fileEntry.preview} />
            <span className="onclick" onClick={() => this.cancel(fileId)}>{icons.close}</span>
          </div>
        );
      }
      return (
        <div className="file" key={fileId}>
          {icons.file} {fileEntry.file.name}
          <span className="onclick" onClick={() => this.cancel(fileId)}>{icons.close}</span>
        </div>
      );
    });

    let dialog;

    if (this.state.dialog) {
      dialog = (
        <div id="mediaPreview">
          <div className="files">
            {filePreviews}
          </div>
          <div className="bottom">
            Caption:<br/>
            <form onSubmit={this.send}>
              <input ref={this.setCaptionRef}/>
            </form>
            <span className="onclick" onClick={this.send}>Send</span>
          </div>
        </div>
      );
    }

    return (
      <div>
        <input id="attachment" type="file" ref={this.setFileRef} multiple/>
        {dialog}
      </div>
    );
  },

  send: function() {
    let div = document.getElementsByClassName("darken")[0];
    div.style = Object.assign(div.style, {zIndex: "-1", backgroundColor: "hsla(0, 0%, 0%, 0)"});

    this.setState({
      fileList: {},
      dialog: false
    });

    let roomId = this.props.roomId;
    let caption = this.state.captionRef.value;
    let fileBody = "";

    let fileListKeys = Object.keys(this.state.fileList);
    if (fileListKeys.length == 1) {
      fileBody = caption;
    } else if (fileListKeys.length > 0) {
      //send m.text with caption
      Matrix.sendEvent(this.props.user, roomId, caption);
    }

    fileListKeys.forEach((fileId) => {
      let fileObject = this.state.fileList[fileId];
      let mimeType = fileObject.file.type;

      this.localEcho(fileObject);
      let tasks = [
        this.uploadFile(this.props.user, roomId, fileObject.file),
        this.uploadThumbnail(this.props.user, roomId, fileObject.file)
      ];

      Promise.all(tasks).then((taskResults) => {
        console.log(taskResults);
        this.sendFileEvent(this.props.user, roomId, fileId, taskResults, mimeType, fileBody);
      });
    });
  },

  sendFileEvent: function(user, roomId, fileId, taskResults, mimeType, fileBody) {
    return new Promise((resolve, reject) => {
      let unixtime = Date.now();
      let url = urllib.format(Object.assign({}, user.hs, { //TODO: abstract to Matrix.js
        pathname: `/_matrix/client/r0/rooms/${roomId}/send/m.room.message/${unixtime}`,
        query: {
          access_token: user.access_token
        }
      }));

      let body;
      let fileMxId = taskResults[0].content_uri;
      let msgType = taskResults[1][0];

      if (msgType == "m.file") {
        body = {
          "msgtype": "m.file",
          "url": fileMxId,
          "body": fileBody,
          "info": {
            "mimetype": mimeType
          }
        };
      } else {
        let thumbMxId = taskResults[1][1].content_uri;
        let fileInfo = taskResults[1][2].info;

        if (msgType == "m.image") {
          let info = Object.assign({}, fileInfo, {
            thumbnail_url: thumbMxId,
            mimetype: mimeType
          });

          body = {
            "msgtype": "m.image",
            "url": fileMxId,
            "body": fileBody,
            "info": info
          };

        } else if (msgType == "m.video") {
          let info = Object.assign({}, fileInfo, {
            thumbnail_url: thumbMxId,
            mimetype: mimeType
          });

          body = {
            "msgtype": "m.video",
            "url": fileMxId,
            "body": fileBody,
            "info": info
          };
        }
      }

      rfetch(url, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: new Headers({
          'Content-Type': 'application/json'
        })
      }, options).then(res => res.json())
        .catch((error) => {
          console.error('Error:', error);
          reject(error);
        })
        .then((response) => {
          console.log('sent event', response);
        });
    });
  },

  localEcho: function(fileObject) {
    console.log(fileObject.file.name);
    //let msgId = this.state.count;
    //let rooms = this.props.rooms;
    //let room = rooms[roomId];
    //let roomUnsent = defaultValue(room.unsentEvents, {});
    //roomUnsent[msgId] = {
    //  content: {body: this.state.file.name},
    //  origin_server_ts: Date.now()
    //};
    // room.unsentEvents = roomUnsent;
    // rooms[roomId] = room;
    // this.props.setParentState("rooms", rooms);
  },

  uploadThumbnail: function(user, roomId, file) {
    console.log(file);
    return new Promise((resolve, reject) => {
      let eventType = "m.file";
      if (file.type.startsWith("image/")) {
        eventType = "m.image";
      } else if (file.type.startsWith("video/")) {
        eventType = "m.video";
      }

      if (eventType == "m.file") {
        resolve([eventType]);
      } else {
        //generate a thumbnail
        this.getThumbnail(file)
          .then((thumbResult) => {
            this.uploadFile(user, roomId, thumbResult.thumbnail)
              .then((response) => {
                resolve([eventType, response, thumbResult]);
              });
          });
      }
    });
  },

  getThumbnail: function(file) {
    return new Promise((resolve, reject) => {
      let thumbnailType = "image/png";

      if (file.type == "image/jpeg") {
        thumbnailType = "image/jpeg";
      }

      riot.loadImageElement(file)
        .then((img) => {
          return riot.createThumbnail(img,
            img.width,
            img.height,
            thumbnailType);
        })
        .catch((error) => {
          console.error("neo: error getting thumbnail", error);
          reject(error);
        })
        .then((thumbResult) => {
          resolve(thumbResult);
        });
    });
  },

  uploadFile: function(user, roomId, file) {
    return new Promise((resolve, reject) => {
      let upload_url = urllib.format(Object.assign({}, user.hs, {
        pathname: "/_matrix/media/r0/upload/",
        query: {
          access_token: user.access_token
        }
      }));

      rfetch(upload_url, {
        method: 'POST',
        body: file,
        headers: new Headers({
          'Content-Type': file.type
        })
      }, options)
        .then(response => response.json())
        .catch((error) => {
          console.error("neo: error uploading file", error);
          reject(error);
        })
        .then((response) => {
          // update localEcho
          resolve(response);
        });
    });
  },
});

let darken = function() {
  // Darken the whole screen, except dialog, resolve on click
  return new Promise(function(resolve, reject) {
    let div = document.getElementsByClassName("darken")[0];
    div.onclick = () => {
      let div = document.getElementsByClassName("darken")[0];
      div.style = Object.assign(div.style, {zIndex: "-1", backgroundColor: "hsla(0, 0%, 0%, 0)"});
      resolve();
    };
    div = Object.assign(div.style, {zIndex: "50", backgroundColor: "hsla(0, 0%, 0%, 0.5)"});
  });
};

module.exports = File;
