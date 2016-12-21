'use strict';
var isInitiator;
var configuration = null;

var isInitiator;
var room = window.location.hash.substring(1);
if (!room) {
  room = window.location.hash = randomToken();
}


/****************************************************************************
* Signaling server
****************************************************************************/

// Connect to the signaling server
var socket = io.connect('http://127.0.0.1:3030');

socket.on('ipaddr', function(ipaddr) {
  console.log('Server IP address is: ' + ipaddr);
  updateRoomURL(ipaddr);
});

socket.on('created', function(room, clientId) {
  isInitiator = true;
});

socket.on('joined', function(room, clientId) {
  isInitiator = false;
  createPeerConnection(isInitiator, configuration);
});

socket.on('full', function(room) {
  alert('Room ' + room + ' is full. We will create a new room for you.');
  window.location.hash = '';
  window.location.reload();
});

socket.on('ready', function() {
  createPeerConnection(isInitiator, configuration);
});

socket.on('log', function(array) {
});

socket.on('message', function(message) {
  signalingMessageCallback(message);
});

// Join a room
socket.emit('create or join', room);

if (location.hostname.match(/localhost|127\.0\.0/)) {
  socket.emit('ipaddr');
}

/**
* Send message to signaling server
*/
function sendMessage(message) {
  socket.emit('message', message);
}


var peerConn;
var dataChannel;

function signalingMessageCallback(message) {
  if (message.type === 'offer') {
    peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {},
                                  function(){console.error('setRemoteDescription error')});
    peerConn.createAnswer(onLocalSessionCreated, function(){console.error('createAnswer error')});

  } else if (message.type === 'answer') {
    peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {},
                                  function(){console.error('setRemoteDescription error')});
        }
  else if (message.type === 'candidate') {
      peerConn.addIceCandidate(new RTCIceCandidate({
        candidate: message.candidate
      }));

    } else if (message === 'bye') {

           }
}

function createPeerConnection(isInitiator, config) {
  peerConn = new RTCPeerConnection(config);

  // send any ice candidates to the other peer
  peerConn.onicecandidate = function(event) {
    if (event.candidate) {
      sendMessage({
        type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate
      });
    }
  };

  if (isInitiator) {
    dataChannel = peerConn.createDataChannel('photos');
    onDataChannelCreated(dataChannel);

    peerConn.createOffer(onLocalSessionCreated, function(){console.error('createOffer error')});
  } else {
    peerConn.ondatachannel = function(event) {
      dataChannel = event.channel;
      onDataChannelCreated(dataChannel);
    };
  }
  }

  function onLocalSessionCreated(desc) {
    peerConn.setLocalDescription(desc, function() {
      sendMessage(peerConn.localDescription);
    }, function(){console.error('setLocalDescription error')});
  }

  function onDataChannelCreated(channel) {

    channel.onopen = function() {
      console.log('Channel opened!');
      channel.send("Hello World!");
    };

    channel.onmessage = (adapter.browserDetails.browser === 'firefox') ?
    receiveDataFirefoxFactory() : receiveDataChromeFactory();
  }

  function receiveDataChromeFactory() {
    return function onmessage(event) {
      console.log('MESSAGE!!!!')
      console.log(event)
    };
  }


  function receiveDataFirefoxFactory() {
    return function onmessage(event) {
      console.log(event)
    };
  }

  function randomToken() {
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
  }

  function updateRoomURL(ipaddr) {
    var url;
    if (!ipaddr) {
      url = location.href;
    } else
      url = location.protocol + '//' + ipaddr + ':2013/#' + room;
    roomURL.innerHTML = url;
  }
