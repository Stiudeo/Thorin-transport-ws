'use strict';
/*
* Here are some examples of the actions one can do with the ws transport
* */
const wsObj = thorin.transport('ws');

setTimeout(() => {
  const eObj = new wsObj.Event("my.event.name", {
    withSome: 'data'
  });
  eObj.addRoom('room_1'); // send to room_1
  wsObj.sendIntent(eObj);
}, 1000);


/*
* Action executed whenever a new websocket wants to connect.
* */
function checkAuthToken(token) {
  return true;
}
dispatcher
  .addAction('ws#socket.connect')
  .use((intentObj, next) => {
    const authToken = intentObj.authorization;  // this will be either the cookieId or the Authorization: Bearer header
    if(checkAuthToken(authToken)) {
      intentObj.socketData({
        informationAbout: 'the current',
        connectedSocket: 'which will persist between',
        other: 'events'
      });
      intentObj.socket.join('connected.users'); // join the connected users room
      return next();  // allow the socket to connect.
    }
    next(thorin.error('AUTH', 'Invalid authorization', 403));
  });


/*
* Called when a socket wants to join a room (socketObj.emit("room.join", {roomName}, {payload})
* */
dispatcher
  .addAction('ws#room.join')
  .use((intentObj, next) => {
    const socketObj = intentObj.socket,
      room = intentObj.room;
    console.log(`Socket ${socketObj.id} wants to join room ${room}`);
    intentObj.result({
      welcome: 'to the new room'
    }).send();
  });

/*
* We can also listen for specific room joins
* */
dispatcher
  .addAction('ws#room.join:roomName')
  .use((intentObj, next) => {
    const socketObj = intentObj.socket;
    console.log('Socket wants to join roomName');
    next();
  });

/*
* Called when a socket wants to leave a room (socketObj.emit("room.leave", {roomName}, {payload})
* */
dispatcher
  .addAction('ws#room.leave')
  .use((intentObj, next) => {
    const socketObj = intentObj.socket,
      room = intentObj.room;
    console.log(`Socket ${socketObj.id} wants to leave room ${room}`);
    next();
    // the app layer will automatically remove the socket from the room, or
    // you can manually call socketObj.leave(roomName)
  });

/*
 * We can also listen for specific room joins
 * */
dispatcher
  .addAction('ws#room.leave:roomName')
  .use((intentObj, next) => {
    const socketObj = intentObj.socket;
    console.log('Socket wants to leave roomName');
    next();
  });

/*
* Called when a socket wants to clear all the rooms he's in. (socketObj.emit("room.clear", {payload})
* */
dispatcher
  .addAction('ws#room.clear')
  .use((intentObj, next) => {
    console.log(`Socket ${socketObj.id} wants to leave all its rooms.`);
    next();
  });

/*
* Called when a previously authorized socket disconnects.
* */
dispatcher
  .addAction('ws#socket.disconnect')
  .use((intentObj, next) => {
    console.log("Disconnected socket bro.");
    next();
  });