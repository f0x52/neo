const React = require("react");
const create = require("create-react-class");

let File = create ({
  displayName: "fileUpload",
  componentDidMount: function() {
    document.getElementById("attachment").addEventListener('change', this.upload, false); //TODO: update to ref
  },

  upload: function() {
    console.log("starting upload");
    let room = this.props.room;
    let file = document.getElementById("attachment").files[0];
    this.setState({file: file});
    let upload_url = this.props.hs +
      "/_matrix/media/r0/upload" +
      "?access_token=" + this.props.token
    fetch(upload_url, {
      method: 'POST',
      body: this.state.file,
    }).then(
      response => response.json()
    ).then(response => {
      console.log("uploaded file");
      this.setState({"url": response.content_uri});

      let unixtime = Date.now()

      let msg_url = this.props.hs +
      "/_matrix/client/r0/rooms/" +
      this.props.room +
      "/send/m.room.message/" +
      unixtime +
      "?access_token=" +
      this.props.token;

      if (this.state.file.type.startsWith("image/")) { //image, so create a thumbnail as well
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
            console.log("uploaded thumb")
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
      } else {
        let body = {
          "msgtype": "m.file",
          "url": response.content_uri,
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
      }
    });
  },

  render: function() {
    return (
      <input id="attachment" type="file"/>
    )
  }
})

module.exports = File;
