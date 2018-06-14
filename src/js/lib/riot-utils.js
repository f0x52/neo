'use strict';
/*
Copyright 2015, 2016 OpenMarket Ltd
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const Promise = require('bluebird');
const sanitize = require('sanitize-html');
require("blueimp-canvas-to-blob");
const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Create a thumbnail for a image DOM element.
 * The image will be smaller than MAX_WIDTH and MAX_HEIGHT.
 * The thumbnail will have the same aspect ratio as the original.
 * Draws the element into a canvas using CanvasRenderingContext2D.drawImage
 * Then calls Canvas.toBlob to get a blob object for the image data.
 *
 * Since it needs to calculate the dimensions of the source image and the
 * thumbnailed image it returns an info object filled out with information
 * about the original image and the thumbnail.
 *
 * @param {HTMLElement} element The element to thumbnail.
 * @param {integer} inputWidth The width of the image in the input element.
 * @param {integer} inputHeight the width of the image in the input element.
 * @param {String} mimeType The mimeType to save the blob as.
 * @return {Promise} A promise that resolves with an object with an info key
 *  and a thumbnail key.
 */

module.exports = {
  createThumbnail: function(element, inputWidth, inputHeight, mimeType) {
    return new Promise(function(resolve, reject) {
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 600;
  
      let targetWidth = inputWidth;
      let targetHeight = inputHeight;
      if (targetHeight > MAX_HEIGHT) {
        targetWidth = Math.floor(targetWidth * (MAX_HEIGHT / targetHeight));
        targetHeight = MAX_HEIGHT;
      }
      if (targetWidth > MAX_WIDTH) {
        targetHeight = Math.floor(targetHeight * (MAX_WIDTH / targetWidth));
        targetWidth = MAX_WIDTH;
      }
  
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.getContext("2d").drawImage(element, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(function(thumbnail) {
        resolve({
          info: {
            thumbnail_info: {
              w: targetWidth,
              h: targetHeight,
              mimetype: thumbnail.type,
              size: thumbnail.size,
            },
            w: inputWidth,
            h: inputHeight,
          },
          thumbnail: thumbnail,
        });
      }, mimeType);
    });
  },
  
  /**
   * Load a file into a newly created image element.
   *
   * @param {File} file The file to load in an image element.
   * @return {Promise} A promise that resolves with the html image element.
   */
  loadImageElement: function(imageFile) {
    return new Promise(function(resolve, reject) {
      // Load the file into an html element
      const img = document.createElement("img");
      const objectUrl = URL.createObjectURL(imageFile);
      img.src = objectUrl;
  
      // Once ready, create a thumbnail
      img.onload = function() {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = function(e) {
        reject(e);
      };
    });
  },

  /**
   * Load a file into a newly created video element.
   *
   * @param {File} file The file to load in an video element.
   * @return {Promise} A promise that resolves with the video image element.
   */
  loadVideoElement: function(videoFile) {
    return new Promise(function(resolve, reject) {
      // Load the file into an html element
      const video = document.createElement("video");
  
      const reader = new FileReader();
      reader.onload = function(e) {
        video.src = e.target.result;
  
        // Once ready, returns its size
        // Wait until we have enough data to thumbnail the first frame.
        video.onloadeddata = function() {
          resolve(video);
        };
        video.onerror = function(e) {
          reject(e);
        };
      };
      reader.onerror = function(e) {
        reject(e);
      };
      reader.readAsDataURL(videoFile);
    });
  },

  sanitize: function(html) {
    return sanitize(html, this.sanitizeHtmlParams);
  },

  sanitizeHtmlParams: {
    allowedTags: [
      'font', // custom to matrix for IRC-style font coloring
      'del', // for markdown
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'sup', 'sub',
      'nl', 'li', 'b', 'i', 'u', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
      'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img',
      'mx-reply'
    ],
    allowedAttributes: {
      // custom ones first:
      font: ['color', 'data-mx-bg-color', 'data-mx-color', 'style'], // custom to matrix
      span: ['data-mx-bg-color', 'data-mx-color', 'style'], // custom to matrix
      a: ['href', 'name', 'target', 'rel'], // remote target: custom to matrix
      img: ['src', 'width', 'height', 'alt', 'title'],
      ol: ['start'],
      code: ['class'], // We don't actually allow all classes, we filter them in transformTags
    },
    // Lots of these won't come up by default because we don't allow them
    selfClosing: ['img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta'],
    // URL schemes we permit
    allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'magnet'],

    allowProtocolRelative: false,

    transformTags: { // custom to matrix
    // add blank targets to all hyperlinks except vector URLs
      'img': function(tagName, attribs) {
        // Strip out imgs that aren't `mxc` here instead of using allowedSchemesByTag
        // because transformTags is used _before_ we filter by allowedSchemesByTag and
        // we don't want to allow images with `https?` `src`s.
        //if (!attribs.src || !attribs.src.startsWith('mxc://')) {
        return { tagName, attribs: {}};
        //}
        //attribs.src = MatrixClientPeg.get().mxcUrlToHttp(
        //  attribs.src,
        //  attribs.width || 800,
        //  attribs.height || 600
        //);
        //return { tagName: tagName, attribs: attribs };
      },

      'code': function(tagName, attribs) {
        if (typeof attribs.class !== 'undefined') {
          // Filter out all classes other than ones starting with language- for syntax highlighting.
          const classes = attribs.class.split(/\s+/).filter(function(cl) {
            return cl.startsWith('language-');
          });
          attribs.class = classes.join(' ');
        }
        return {
          tagName: tagName,
          attribs: attribs,
        };
      },

      '*': function(tagName, attribs) {
        // Delete any style previously assigned, style is an allowedTag for font and span
        // because attributes are stripped after transforming
        delete attribs.style;

        // Sanitise and transform data-mx-color and data-mx-bg-color to their CSS
        // equivalents
        const customCSSMapper = {
          'data-mx-color': 'color',
          'data-mx-bg-color': 'background-color',
          // $customAttributeKey: $cssAttributeKey
        };

        let style = "";
        Object.keys(customCSSMapper).forEach((customAttributeKey) => {
          const cssAttributeKey = customCSSMapper[customAttributeKey];
          const customAttributeValue = attribs[customAttributeKey];
          if (customAttributeValue &&
            typeof customAttributeValue === 'string' &&
            COLOR_REGEX.test(customAttributeValue)
          ) {
            style += cssAttributeKey + ":" + customAttributeValue + ";";
            delete attribs[customAttributeKey];
          }
        });

        if (style) {
          attribs.style = style;
        }

        return { tagName: tagName, attribs: attribs };
      },
    },
  }
};
