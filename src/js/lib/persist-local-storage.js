'use strict';

module.exports = function persistLocalStorage(data) {
  Object.keys(data).forEach((key) => {
    localStorage.setItem(key, JSON.stringify(data[key]));
  });
}
