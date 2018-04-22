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

import Promise from 'bluebird';
require("blueimp-canvas-to-blob");

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
    })
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
  }
}
