var isInitiator;

/****************************************************************************
* Signaling server
****************************************************************************/

var configuration = null;
var MY_INDEX = 0;
var isInitiator;
var room = window.location.hash.substring(1);
if (!room) {
  room = window.location.hash = randomToken();
}

// Connect to the signaling server
var socket = io.connect('http://127.0.0.1:3030');

socket.on('ipaddr', function(ipaddr) {
  console.log('Server IP address is: ' + ipaddr);
  updateRoomURL(ipaddr);
});

socket.on('created', function(room, clientId) {
  console.log('Room ' + room + ' was created' + '. Your CLIENT_ID: ' + clientId);
  isInitiator = true;
});

socket.on('joined', function(room, clientId) {
  console.log('You have joined to room ' + room + '. Your CLIENT_ID: ' + clientId);
  isInitiator = false;
  createPeerConnection(isInitiator, configuration, clientId);
});

socket.on('full', function(room) {
  alert('Room ' + room + ' is full. We will create a new room for you.');
  window.location.hash = '';
  window.location.reload();
});

socket.on('ready', function(clientId) {
  createPeerConnection(isInitiator, configuration, clientId);
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

var connections = {} //peerConnection : dataChannel

function signalingMessageCallback(message) {
  console.log(message)
  if (message.type === 'offer') {
    peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {},
                                  function(err){console.error('setRemoteDescription error',err)});
    peerConn.createAnswer(onLocalSessionCreated, function(err){console.error('createAnswer error',err)});

  } else if (message.type === 'answer') {
    peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {},
                                  function(err){console.error('setRemoteDescription error',err)});
        }
  else if (message.type === 'candidate') {
      peerConn.addIceCandidate(new RTCIceCandidate({
        candidate: message.candidate
      }));

    } else if (message === 'bye') {

           }
}

var counter = 0;
function createPeerConnection(isInitiator, config, clientId) {
  peerConn = new RTCPeerConnection(config);
  var dataChannel = {setted: false};
  connections[clientId] = {dataChannel: dataChannel, peerConnection: peerConn};

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
    console.log('ICECandidate:',event)
  };

  if (isInitiator) {
    connections[clientId].dataChannel = peerConn.createDataChannel('channel');
    onDataChannelCreated(connections[clientId].dataChannel);

    peerConn.createOffer(onLocalSessionCreated, function(err){console.error('createOffer error',err)});
  } else {
    peerConn.ondatachannel = function(event) {
      connections[clientId].dataChannel = event.channel;
      onDataChannelCreated(connections[clientId].dataChannel);
    };
  }
}

  function onLocalSessionCreated(desc) {
    peerConn.setLocalDescription(desc, function() {
      sendMessage(peerConn.localDescription);
    }, function(err){console.error('setLocalDescription error',err)});
  }

  function onDataChannelCreated(channel) {

    channel.onopen = function() {
      console.log('Channel opened!');
      channel.send({type: 'connection', value: 'connected'});
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
