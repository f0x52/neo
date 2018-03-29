import React from 'react';
import ReactDOM from 'react-dom';
import '../style.css';
var create = require('create-react-class');


var App = create({
  render: function() {
    return (
      Hello World
    );
  }
})

ReactDOM.render(
  <App />,
  document.getElementById('root')
)
