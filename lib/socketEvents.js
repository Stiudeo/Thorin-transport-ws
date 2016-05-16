'use strict';
/**
 * Created by Adrian on 11-May-16.
 */
module.exports = {
  // SOCKET SPECIFIC EVENTS
  CONNECT: 'ws#socket.connect',       // socket wants to connect to server
  DISCONNECT: 'ws#socket.disconnect', // socket disconnected
  ERROR: 'ws#socket.error',            // socket encountered an app error.

  // ROOM EVENTS
  ROOM_JOIN: 'ws#room.join',             // socket wants to join a channel
  ROOM_LEAVE: 'ws#room.leave',
  ROOM_CLEAR: 'ws#room.clear',        // leave all channels.
};
const VALUES = {};
Object.keys(module.exports).forEach((n) => VALUES[module.exports[n]] = true );
module.exports.__contains = function(name) {
  // If we have regular room.join and room.leave
  name = name.split('/')[0]
  name = name.split(':')[0];
  return typeof VALUES[name] !== 'undefined';
};
module.exports.__isRoomEvent = function(name) {
  name = name.split('/')[0]
  name = name.split(':')[0];
  if(name === module.exports.ROOM_JOIN) return module.exports.ROOM_JOIN;
  if(name === module.exports.ROOM_LEAVE) return module.exports.ROOM_LEAVE;
  return false;
}