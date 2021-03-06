var SIGNALING_SERVER = "http://127.0.0.1:3030";
var DEFAULT_CHANNEL = 'TankiiUnrepeatableChannle'
var ICE_SERVERS = [
  {url:"stun:stun.l.google.com:19302"}
];


var signaling_socket = null;   /* our socket.io connection to our webserver */
var local_media_stream = null; /* our own microphone / webcam */
var peers = {};                /* keep track of our peerConnection connections, indexed by peer_id (aka socket.io id) */

initWebRtc();
















function initTanksRoom(){
  
}


function initWebRtc() {
  console.log("Connecting to signaling server");
  signaling_socket = io.connect(SIGNALING_SERVER);
  signaling_socket.on('connect', function() {
      console.log("Connected to signaling server");
      join_chat_channel(DEFAULT_CHANNEL, {'whatever-you-want-here': 'stuff'});
  });
  signaling_socket.on('disconnect', function() {
      console.log("Disconnected from signaling server");
      /* Tear down all of our peerConnection connections and remove all the
       * media divs when we disconnect */
      for (peer_id in peers) {
          peers[peer_id].recevingDataChannel.close();
          peers[peer_id].sendDataChannel.close();
      }
      peers = {};
  });

  function join_chat_channel(channel, userdata) {
      signaling_socket.emit('join', {"channel": channel, "userdata": userdata});
  }
  function part_chat_channel(channel) {
      signaling_socket.emit('part', channel);
  }
  /**
  * When we join a group, our signaling server will send out 'addPeer' events to each pair
  * of users in the group (creating a fully-connected graph of users, ie if there are 6 people
  * in the channel you will connect directly to the other 5, so there will be a total of 15
  * connections in the network).
  */
  signaling_socket.on('addPeer', function(config) {
      console.log('Signaling server said to add peerConnection:', config);
      var peer_id = config.peer_id;
      if (peer_id in peers) {
          /* This could happen if the user joins multiple channels where the other peerConnection is also in. */
          console.log("Already connected to peerConnection ", peer_id);
          return;
      }
      var peer_connection = new RTCPeerConnection(
          {"iceServers": ICE_SERVERS},
          {"optional": [{"DtlsSrtpKeyAgreement": true}]} /* this will no longer be needed by chrome
                                                          * eventually (supposedly), but is necessary
                                                          * for now to get firefox to talk to chrome */
      );
      peers[peer_id] = {};
      peers[peer_id].peerConnection = peer_connection;
      peers[peer_id].GameObjects = {};
      var sdchannel = peer_connection.createDataChannel(peer_id);

      sdchannel.onopen = function() {
        console.log('Channel opened!',sdchannel);
        sdchannel.send('Hi!');
      };
      peers[peer_id].peerConnection.ondatachannel = function(rdchannel) {
        console.log('Someone wants to verify his channel', rdchannel.channel)
        rdchannel.channel.onmessage = function(e){
          console.warn('MESSAGE!', e);
        }
        peers[peer_id].recevingDataChannel = rdchannel.channel;
        console.log(peers[peer_id].recevingDataChannel);
      }
      peers[peer_id].sendDataChannel = sdchannel;

      peer_connection.onicecandidate = function(event) {
          if (event.candidate) {
              signaling_socket.emit('relayICECandidate', {
                  'peer_id': peer_id,
                  'ice_candidate': {
                      'sdpMLineIndex': event.candidate.sdpMLineIndex,
                      'candidate': event.candidate.candidate
                  }
              });
          }
      }

      /* Only one side of the peerConnection connection should create the
       * offer, the signaling server picks one to be the offerer.
       * The other user will get a 'sessionDescription' event and will
       * create an offer, then send back an answer 'sessionDescription' to us
       */
      if (config.should_create_offer) {
          console.log("Creating RTC offer to ", peer_id);
          peer_connection.createOffer(
              function (local_description) {
                  console.log("Local offer description is: ", local_description);
                  peer_connection.setLocalDescription(local_description,
                      function() {
                          signaling_socket.emit('relaySessionDescription',
                              {'peer_id': peer_id, 'session_description': local_description});
                          console.log("Offer setLocalDescription succeeded");
                      },
                      function() { Alert("Offer setLocalDescription failed!"); }
                  );
              },
              function (error) {
                  console.log("Error sending offer: ", error);
              });
      }
  });

  /**
   * Peers exchange session descriptions which contains information
   * about their audio / video settings and that sort of stuff. First
   * the 'offerer' sends a description to the 'answerer' (with type
   * "offer"), then the answerer sends one back (with type "answer").
   */
  signaling_socket.on('sessionDescription', function(config) {
      console.log('Remote description received: ', config);
      var peer_id = config.peer_id;
      var peerConnection = peers[peer_id].peerConnection;
      var remote_description = config.session_description;
      console.log(config.session_description);
      var desc = new RTCSessionDescription(remote_description);
      var stuff = peerConnection.setRemoteDescription(desc,
          function() {
              console.log("setRemoteDescription succeeded");
              if (remote_description.type == "offer") {
                  console.log("Creating answer");
                  peerConnection.createAnswer(
                      function(local_description) {
                          console.log("Answer description is: ", local_description);
                          peerConnection.setLocalDescription(local_description,
                              function() {
                                  signaling_socket.emit('relaySessionDescription',
                                      {'peer_id': peer_id, 'session_description': local_description});
                                  console.log("Answer setLocalDescription succeeded");
                              },
                              function() { Alert("Answer setLocalDescription failed!"); }
                          );
                      },
                      function(error) {
                          console.log("Error creating answer: ", error);
                          console.log(peerConnection);
                      });
              }
          },
          function(error) {
              console.log("setRemoteDescription error: ", error);
          }
      );
      console.log("Description Object: ", desc);
  });

  /**
  * The offerer will send a number of ICE Candidate blobs to the answerer so they
  * can begin trying to find the best path to one another on the net.
  */
 signaling_socket.on('iceCandidate', function(config) {
     var peer = peers[config.peer_id];
     var ice_candidate = config.ice_candidate;
     peer.peerConnection.addIceCandidate(new RTCIceCandidate(ice_candidate));
 });
 /**
  * When a user leaves a channel (or is disconnected from the
  * signaling server) everyone will recieve a 'removePeer' message
  * telling them to trash the media channels they have open for those
  * that peerConnection. If it was this client that left a channel, they'll also
  * receive the removePeers. If this client was disconnected, they
  * wont receive removePeers, but rather the
  * signaling_socket.on('disconnect') code will kick in and tear down
  * all the peerConnection sessions.
  */
 signaling_socket.on('removePeer', function(config) {
     console.log('Signaling server said to remove peerConnection:', config);
     var peer_id = config.peer_id;
     if (peer_id in peers) {
         peers[peer_id].peerConnection.close();
     }
     delete peers[peer_id].peerConnection;
 });
}
