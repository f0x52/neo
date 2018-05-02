const React = require("react");
const create = require("create-react-class");
let urllib = require('url');
let riot = require('../lib/riot-utils.js');

let File = create ({
  displayName: "fileUpload",
  componentDidMount: function() {
    document.getElementById("attachment").addEventListener('change', this.upload, false); //TODO: update to ref
  },

  upload: function() {
    let room = this.props.room;
    let file = document.getElementById("attachment").files[0];
    this.setState({file: file});
    let upload_url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: "/_matrix/media/r0/upload/",
      query: {
        access_token: this.props.user.access_token
      }
    }));
    fetch(upload_url, {
      method: 'POST',
      body: this.state.file,
    }).then(
      response => response.json()
    ).then(response => {
      this.setState({"url": response.content_uri});
      let unixtime = Date.now()

      let msg_url = urllib.format(Object.assign({}, this.props.user.hs, {
        pathname: `/_matrix/client/r0/rooms/${room}/send/m.room.message/${unixtime}`,
        query: {
          access_token: this.props.user.access_token
        }
      }));

      if (this.state.file.type.startsWith("image/")) { //m.image, so create a thumbnail as well
        this.uploadImage(upload_url, msg_url);
      } else if (this.state.file.type.startsWith("video/")) { //m.video
        this.uploadVideo(msg_url);
      } else {
        this.uploadFile(msg_url);
      }
    });
  },

  uploadImage: function(upload_url, msg_url) {
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
      this.setState({"info": imageInfo});
      fetch(upload_url, {
        method: 'POST',
        body: result.thumbnail,
      }).then(
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
        }

        fetch(msg_url, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        }).then(res => res.json())
        .catch(error => console.error('Error:', error))
        .then(response => console.log('sent image event', response));
    })});
  },

  uploadVideo: function(msg_url) {
    let body = {
      "msgtype": "m.video",
      "url": this.state.url,
      "body": this.state.file.name,
      "info": {
        "mimetype": this.state.file.type
      }
    }

    fetch(msg_url, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: new Headers({
        'Content-Type': 'application/json'
      })
    }).then(res => res.json())
    .catch(error => console.error('Error:', error))
    .then(response => console.log('sent file event', response));
  },

  uploadFile: function(msg_url) {
    let body = {
      "msgtype": "m.file",
      "url": this.state.url,
      "body": this.state.file.name,
      "info": {
        "mimetype": this.state.file.type
      }
    }

    fetch(msg_url, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: new Headers({
        'Content-Type': 'application/json'
      })
    }).then(res => res.json())
    .catch(error => console.error('Error:', error))
    .then(response => console.log('sent file event', response));
  },

  render: function() {
    return (
      <input id="attachment" type="file"/>
    )
  }
})

module.exports = File;
