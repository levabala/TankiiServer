var os = require('os');
var nodeStatic = require('node-static');
var http = require('http');
var socketIO = require('socket.io');

var fileServer = new(nodeStatic.Server)();
var app = http.createServer(function(req, res) {
  fileServer.serve(req, res);
}).listen(3030);

var io = socketIO.listen(app);

/*************************/
/*** INTERESTING STUFF ***/
/*************************/
var channels = {};
var creators = {};
var sockets = {};

/**
 * Users will connect to the signaling server, after which they'll issue a "join"
 * to join a particular channel. The signaling server keeps track of all sockets
 * who are in a channel, and on join will send out 'addPeer' events to each pair
 * of users in a channel. When clients receive the 'addPeer' even they'll begin
 * setting up an RTCPeerConnection with one another. During this process they'll
 * need to relay ICECandidate information to one another, as well as SessionDescription
 * information. After all of that happens, they'll finally be able to complete
 * the peer connection and will be streaming audio/video between eachother.
 */
io.sockets.on('connection', function (socket) {
    console.log(channels)
    socket.channels = {};
    sockets[socket.id] = socket;
    sendServersList();

    console.log("["+ socket.id + "] connection accepted");
    socket.on('disconnect', function () {
        for (var channel in socket.channels) {
            part(channel);
        }
        console.log("["+ socket.id + "] disconnected");
        delete sockets[socket.id];
        console.log(channels)
    });

    socket.on('getServers', function(){
      sendServersList();
    });

    function sendServersList(){
      var list = [];
      for (var c in channels)
        list.push(c)
      socket.emit('Servers', list)
    }

    socket.on('join', function (config) {
        console.log("["+ socket.id + "] join ", config);
        var channel = config.channel;
        var userdata = config.userdata;

        if (channel in socket.channels) {
            console.log("["+ socket.id + "] ERROR: already joined ", channel);
            return;
        }

        if (!(channel in channels)) {
            channels[channel] = {peers: {}, creator: socket.id};
            socket.emit('NowYouAreHost');
            console.log('New Channel Created. Creator:', socket.id)
        }
        else socket.emit('JoinedToTheRoom', {hostId: channels[channel].creator});

        for (id in channels[channel].peers) {
            channels[channel].peers[id].emit('addPeer', {'peer_id': socket.id, 'should_create_offer': false});
            socket.emit('addPeer', {'peer_id': id, 'should_create_offer': true, 'creator': channels[channel].creator});
        }

        channels[channel].peers[socket.id] = socket;
        socket.channels[channel] = channel;
    });

    function part(channel) {
        console.log("["+ socket.id + "] part ");

        if (!(channel in socket.channels)) {
            console.log("["+ socket.id + "] ERROR: not in ", channel);
            return;
        }

        delete socket.channels[channel];
        delete channels[channel].peers[socket.id];


        if (socket.id == channels[channel].creator){
          console.log('Channel [',channel,'] has been closed')
          for (id in channels[channel].peers) {
              channels[channel].peers[id].emit('RoomClosed');
              delete sockets[id].channels[channel];
            }
          delete channels[channel];
          return;
        }

        for (id in channels[channel].peers) {
            channels[channel].peers[id].emit('removePeer', {'peer_id': socket.id});
            socket.emit('removePeer', {'peer_id': id});
            return;
        }

        if (Object.keys(channels[channel].peers).length == 0){
          delete channels[channel];
          return;
        }
    }
    socket.on('part', part);

    socket.on('relayICECandidate', function(config) {
        var peer_id = config.peer_id;
        var ice_candidate = config.ice_candidate;
        //console.log("["+ socket.id + "] relaying ICE candidate to [" + peer_id + "] ", ice_candidate);

        if (peer_id in sockets) {
            sockets[peer_id].emit('iceCandidate', {'peer_id': socket.id, 'ice_candidate': ice_candidate});
        }
    });

    socket.on('relaySessionDescription', function(config) {
        var peer_id = config.peer_id;
        var session_description = config.session_description;
        //console.log("["+ socket.id + "] relaying session description to [" + peer_id + "] ", session_description);

        if (peer_id in sockets) {
            sockets[peer_id].emit('sessionDescription', {'peer_id': socket.id, 'session_description': session_description});
        }
    });
});
