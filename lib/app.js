'use strict';
/**
 * Created by Adrian on 11-May-16.
 */
const path = require('path'),
  socketIo = require('socket.io'),
  getAppAdapter = require('./adapter'),
  fs = require('fs');

// When a client emits these events, we listen for them.
const ROOM_EVENT_LISTENER = {
  JOIN: 'room.join',
  LEAVE: 'room.leave',
  CLEAR: 'room.clear'
};

const PARSE_ERROR_CODE = 'TRANSPORT.INVALID_PAYLOAD',
  SOCKET_EVENT = require('./socketEvents');

module.exports = function(thorin, SocketEvent) {
  let uniqueRequestId = 0;
  const config = Symbol(),
    async = thorin.util.async,
    disabledActions = Symbol(),
    actions = Symbol(),
    pendingEmits = Symbol(),
    transportApp = Symbol(),
    trustProxy = Symbol(),
    aliasEvents = Symbol(),
    socketEvents = Symbol(),
    io = Symbol();

  let logger;

  class ThorinWsApp {

    constructor(appConfig, appLogger) {
      logger = appLogger;
      this.running = false;
      this[trustProxy] = false;
      this[config] = appConfig;
      this[io] = null;
      this[actions] = {};
      this[disabledActions] = {};
      this[aliasEvents] = [];
      this[pendingEmits] = [];
      this[socketEvents] = {};  // event:actionObj
    }

    /*
     * Handles an action through the default handler.
     * */
    addHandler(actionObj) {
      // we have a custom socketEvent
      if (SOCKET_EVENT.__contains(actionObj.name)) {
        if (typeof this[socketEvents][actionObj.name] !== 'undefined') {
          logger('warn', `WS socket event ${actionObj.name} is already registered. Skipping.`);
          return this;
        }
        this[socketEvents][actionObj.name] = actionObj;
        return this;
      }
      if (typeof this[actions][actionObj.name] === 'undefined') {
        this[actions][actionObj.name] = actionObj;
      }
      for (let i = 0; i < actionObj.aliases.length; i++) {
        let item = actionObj.aliases[i];
        if (typeof item.name === 'string' && typeof item.verb === 'undefined') {
          // we add an alias event
          this.addAlias(actionObj, item.name);
        }
      }
      return this;
    }

    /*
     * Adds an alias event to listen to, besides the default dispatch event
     * */
    addAlias(actionObj, name) {
      // step one, check if we don't have it already.
      for (let i = 0; i < this[aliasEvents].length; i++) {
        let item = this[aliasEvents][i];
        if (item.name === name) {
          logger.warn(`Action ${actionObj.name} alias ${name} already exists`);
          return this;
        }
      }
      // next, add it.
      this[aliasEvents].push({
        name,
        action: actionObj
      });
      return this;
    }

    /*
     * Disables a handler
     * */
    disableHandler(name) {
      this[disabledActions][name] = true;
    }

    enableHandler(name) {
      delete this[disabledActions][name];
    }

    /*
     * Binds the WS Server and starts listening for requests.
     * */
    attach(httpTransportObj) {
      thorin.on(thorin.EVENT.RUN, 'transport.' + httpTransportObj.name, () => {
        const tApp = httpTransportObj.app,
          server = tApp._getHttpServer();
        this[transportApp] = tApp;
        this[trustProxy] = httpTransportObj.trustProxy();
        if (!server) {
          logger('error', 'HTTP Transport does not expose HTTP Server. Skipping.');
          return;
        }
        const opt = thorin.util.extend({
          path: '/ws'
        }, this[config].options);
        getAppAdapter(thorin, this[config].adapter, (redisAdapter) => {
          this[io] = socketIo.listen(server, opt);
          bindApp.call(this, this[io], redisAdapter);
        });
      });
    }

    /*
     * Emit an event to all the connected sockets.
     * */
    emit(eventObj) {
      this._onConnected(() => {
        const app = this[io],
          data = eventObj._toClient();
        /* CHECK if we send to a specific socket. */
        if (eventObj._hasTarget()) {
          try {
            app.sockets.to(eventObj._targetId).emit(eventObj._event, data);
          } catch (e) {
            logger.warn(`Could not send event ${eventObj._event} to specific user.`, e);
          }
          return
        }
        /* CHECK if we send only to a specific room */
        if (eventObj._hasRooms()) {
          for (let i = 0, len = eventObj._rooms.length; i < len; i++) {
            let roomName = eventObj._rooms[i];
            try {
              app.to(roomName).emit(eventObj._event, data);
            } catch (e) {
              logger.warn(`Could not send event ${eventObj._event} to room ${roomName}`, e);
            }
          }
          return;
        }
        // if not, we have to broadcast to everyone.
        try {
          app.sockets.emit(eventObj._event, data);
        } catch (e) {
          logger.warn(`Could not broadcast to all users event ${eventObj._event}`, e);
        }
      });
      return this;
    }

    /* Waits till the io server is connected before we emit events. */
    _onConnected(fn) {
      if (this.running) return fn();
      this[pendingEmits].push(fn);
      return this;
    }
  }

  /*
   * Private function that listens to all the incoming connection events.
   * Properties attached to the socket:
   *   - thorinAuthorization
   *   - thorinConnected
   *   - thorinData
   * */
  function bindApp(io, adapter) {
    if (adapter) {
      io.adapter(adapter);
    }
    io.serveClient(false);
    io.use(handleClientAuthorization.bind(this));
    io.on('connection', (socketObj) => {
      // Once a socket has connected, we will start handling it, listenint for events
      socketObj.on(this[config].actionName, registerDefaultEvent.bind(this, socketObj));
      for (let i = 0, len = this[aliasEvents].length; i < len; i++) {
        let item = this[aliasEvents][i];
        socketObj.on(item.name, registerAliasEvent.bind(this, socketObj, item));
      }
      // Handle room events
      socketObj.on(ROOM_EVENT_LISTENER.JOIN, handleClientRoomEvent.bind(this, socketObj, SOCKET_EVENT.ROOM_JOIN));
      socketObj.on(ROOM_EVENT_LISTENER.LEAVE, handleClientRoomEvent.bind(this, socketObj, SOCKET_EVENT.ROOM_LEAVE));
      socketObj.on(ROOM_EVENT_LISTENER.CLEAR, handleClientRoomClear.bind(this, socketObj, SOCKET_EVENT.ROOM_CLEAR));

      /* Handle socket disconnects. */
      socketObj.on('disconnect', handleClientDisconnect.bind(this, socketObj));
      socketObj.on('error', handleClientError.bind(this, socketObj));
    });

    /* Flush any pending emit events. */
    this.running = true;
    for (let i = 0; i < this[pendingEmits].length; i++) {
      this[pendingEmits][i]();
    }
    this[pendingEmits] = [];
  }

  /*
   * Handle Websocket authorization
   * */
  function handleClientAuthorization(socketObj, next) {
    let headers;
    try {
      headers = socketObj.request.headers;
    } catch (e) {
      return next(thorin.error('TRANSPORT.AUTH_FAILED', 'Could not authorize websocket', 401));
    }
    /* We simulate a HTTP request */
    const req = {
      headers
    };
    let authData = this[transportApp]._getAuthorization(req);
    if (!authData) { // if no authorization found, we forbid.
      return next(thorin.error('TRANSPORT.AUTH_FAILED', 'Missing connection authorization', 403));
    }
    socketObj.thorinAuthorization = authData;
    handleSocketEvent.call(this, SOCKET_EVENT.CONNECT, socketObj, (wasError, d) => {
      if (wasError) {
        return next(d.error);
      }
      next();
    });

  }

  /*
   * Handles when a client disconnects.
   * */
  function handleClientDisconnect(socketObj) {
    socketObj.thorinDisconnected = true;
    if (!socketObj.thorinAuthorization) return;
    handleSocketEvent.call(this, SOCKET_EVENT.DISCONNECT, socketObj, () => {
      delete socketObj.thorinData;
      delete socketObj.thorinAuthorization;
    });
  }

  /*
   * Handles when a client wants to join a room.
   * The default functionality for when this happens is that we do NOT allow
   * the user to do whatever he wants.
   * */
  function handleClientRoomEvent(socketObj, actionType, roomName, _payload, _fn) {
    let fn = (typeof _payload === 'function' ? _payload : (typeof _fn === 'function' ? _fn : noop)),
      payload = (typeof roomName === 'object' && roomName) ? roomName : (typeof _payload === 'object' && _payload ? _payload : {});
    const req = {
      action: this[socketEvents][actionType],
      uniqueId: ++uniqueRequestId,
      startAt: Date.now(),
      socket: socketObj,
      fn,
      payload,
      intentData: {
        room: roomName
      }
    }
    if (typeof roomName !== 'string' || !roomName) {
      return sendEventError.call(this, req, thorin.error('ROOM.NAME', 'Missing room name', 400));
    }
    if (typeof req.action === 'undefined') {
      req.alias = roomName;
      return sendEventError.call(this, req, thorin.error('ROOM.UNAVAILABLE', 'The requested room is unavailable', 401));
    }
    const _opType = (actionType === SOCKET_EVENT.ROOM_JOIN ? 'join' : 'leave'),
      resType = (_opType === 'join' ? ROOM_EVENT_LISTENER.JOIN : ROOM_EVENT_LISTENER.LEAVE);
    if (thorin.env !== 'production' && req.action.hasDebug) {
      let logMsg = '[START ' + req.uniqueId + '] - ' + actionType + ' room ' + roomName;
      logger('trace', logMsg);
    }
    // Step one, check if we have a JOIN and the socket is already in the room. If so, we success back.
    if (actionType === SOCKET_EVENT.ROOM_JOIN && typeof socketObj.rooms[roomName] !== 'undefined') {
      return sendEventSuccess.call(this, req, {
        type: resType,
        room: roomName
      });
    }
    // Step two, check if we have a LEAVE event and the socket has already left the room
    if (actionType === SOCKET_EVENT.ROOM_LEAVE && typeof socketObj.rooms[roomName] === 'undefined') {
      return sendEventSuccess.call(this, req, {
        type: resType,
        room: roomName
      });
    }
    try {
      dispatchIntent.call(this, actionType, req, (wasErr, data) => {
        req.alias = roomName;
        if (wasErr) {
          return sendEventError.call(this, req, data);
        }
        data.type = resType;
        if(!data.room) data.room = roomName;
        // IF we've already added the user to the room, we automatically sent the result.
        if ((_opType === 'join' && typeof socketObj.rooms[roomName] !== 'undefined') ||
          (_opType === 'leave' && typeof socketObj.rooms[roomName]) === 'undefined') {
          return sendEventSuccess.call(this, req, data);
        }
        socketObj[_opType](roomName, (e) => {
          if (e) {
            logger('warn', `Could not make socket ${socketObj.id} ${_opType} room ${roomName}`, e);
            return sendEventError.call(this, req, thorin.error(e));
          }
          return sendEventSuccess.call(this, req, data);
        });
      });
    } catch (e) {
      logger('error', `Incoming ${actionType} could not room ${_opType} ${roomName} action`, e);
    }
  }

  /*
   * Called whenever somebody wants to leave all his rooms
   * */
  function handleClientRoomClear(socketObj, actionType, _payload, _fn) {
    let fn = (typeof _payload === 'function' ? _payload : (typeof _fn === 'function' ? _fn : noop)),
      payload = (typeof _payload === 'object' && _payload ? _payload : {});
    const req = {
      alias: ROOM_EVENT_LISTENER.CLEAR,
      action: this[socketEvents][actionType],
      uniqueId: ++uniqueRequestId,
      startAt: Date.now(),
      socket: socketObj,
      fn,
      payload
    }
    if (typeof req.action === 'undefined') {
      return sendEventError.call(this, req, thorin.error('ROOMS.UNAVAILABLE', 'The requested action is unavailable', 401));
    }
    if (thorin.env !== 'production' && req.action.hasDebug) {
      let logMsg = '[START ' + req.uniqueId + '] - ' + actionType + ' all rooms';
      logger('trace', logMsg);
    }
    try {
      dispatchIntent.call(this, actionType, req, (wasErr, data) => {
        if(wasErr) {
          return sendEventError.call(this, req, data);
        }
        data.type = ROOM_EVENT_LISTENER.CLEAR;
        let roomNames = Object.keys(socketObj.rooms);
        if(roomNames.length === 0) {
          return sendEventSuccess.call(this, req, data);  // socket left all rooms.
        }
        const calls = [];
        roomNames.forEach((name) => {
          calls.push((doneFn) => {
            socketObj.leave(name, doneFn);
          });
        });
        async.series(calls, (e) => {
          if(e) {
            logger('warn', `Could not leave all rooms for socket ${socketObj.id} clear rooms`, e);
            return sendEventError.call(this, req, thorin.error(e));
          }
          sendEventSuccess.call(this, req, data);
        });
      });
    } catch(e) {
      logger('error', `Incoming ${actionType} could not handle room clear`, e);
    }
  }

  /*
   * Handles when a client encounters an error.
   * */
  function handleClientError(socketObj, err) {
    logger('trace', `Client ${socketObj.id} encountered an error: ${err.message}`);
    handleSocketEvent.call(this, SOCKET_EVENT.ERROR, socketObj);
  }

  /* This is the default socket callback when a socket does not send a callback */
  function noop() {
  }

  /*
   * Default error handler.
   * */
  function sendEventError(req, err) {
    let actionName = req.action,
      hasDebug = true;
    if (typeof actionName === 'object' && actionName) {
      hasDebug = actionName.hasDebug;
      actionName = actionName.name;
    }
    if (!actionName) actionName = '';
    if (typeof err.error === 'object') err = err.error;
    if (hasDebug !== false) {
      let logMsg = '[ENDED',
        logLevel = 'trace',
        logErr;
      logMsg += ' ' + req.uniqueId;
      logMsg += '] ';
      if (actionName) {
        logMsg += ' ' + actionName + ' ';
      }
      if (req.alias) {
        logMsg += "(" + req.alias + ') ';
      }
      if (err && err.statusCode) {
        logMsg += '= ' + err.statusCode + ' ';
      }
      if (err.statusCode === 404) {
        if (err.code !== 'TRANSPORT.NOT_FOUND') {
          logMsg += '[' + err.code + '] ';
        }
        logMsg += err.message;
      } else if (err.statusCode < 500) {
        logMsg += '[' + err.code + '] ' + err.message;
      } else {
        logLevel = 'warn';
      }
      if (req.startAt) {
        let took = Date.now() - req.startAt;
        logMsg += " (" + took + "ms)";
      }
      logger(logLevel, logMsg, logErr);
    }
    try {
      if (this[config].debug && err.source) {
        logger('warn', err.source.stack);
      }
    } catch (e) {
    }
    if (req.socket.thorinDisconnected) return;
    if (req.fn === noop) return;
    try {
      req.fn(err);
    } catch (e) {
      logger.warn('Encountered an error while calling back with error to socket.', e);
    }
  }

  /*
   * Default success handler
   * */
  function sendEventSuccess(req, result) {
    let actionName = req.action,
      hasDebug = true;
    if (typeof actionName === 'object' && actionName) {
      hasDebug = actionName.hasDebug;
      actionName = actionName.name;
    }
    if (!actionName) actionName = '';
    const actionObj = req.action;
    if (hasDebug !== false) {
      let logMsg = '[ENDED ' + req.uniqueId + "] - ";
      logMsg += actionName + ' ';
      if (req.alias) {
        logMsg += "(" + req.alias + ') ';
      }
      logMsg += '= 200';
      if (req.startAt) {
        let took = Date.now() - req.startAt;
        logMsg += " (" + took + "ms)";
      }
      logger('trace', logMsg);
    }
    if (req.socket.thorinDisconnected) return;
    if (req.fn === noop) return;
    try {
      req.fn(null, result);
    } catch (e) {
      logger.warn('Encountered an error while calling back with results for socket.', e);
    }
  }

  /*
   * Handles the default incoming event, creating the intent and all the things a transport will do.
   * The default payload must:
   *   - be an object
   *   - contain "type" (String) -> the action name
   *   - (optional) contain "payload" (Any)
   *   - (optional) contains a callback function that is called when intent is done.
   * */
  function registerDefaultEvent(socketObj, data, _fn) {
    if (typeof data !== 'object' || !data) return; // ignore it, id does not have the data.
    if (typeof data.type !== 'string' || !data.type) return // ignore it, missing type.
    const actionType = data.type,
      payload = (typeof data.payload === 'object' && data.payload) ? data.payload : {},
      fn = (typeof _fn === 'function' ? _fn : noop);
    let actionObj = this[actions][actionType];
    // this is our unique request wrapper.
    const req = {
      uniqueId: ++uniqueRequestId,
      startAt: Date.now(),
      socket: socketObj,
      fn,
      payload
    }
    if (!actionObj) {
      return sendEventError.call(this, req, thorin.error('TRANSPORT.NOT_FOUND', 'The requested action was not found.'));
    }
    req.action = actionObj;
    try {
      handleIncomingAction.call(this, req);
    } catch (e) {
      logger('error', `Incoming action threw an error in default event with action: ${actionType}`, e);
    }
  }

  /*
   * Handles an aliased event.
   * */
  function registerAliasEvent(socketObj, alias, _payload, _fn) {
    const actionObj = alias.action,
      payload = (typeof _payload === 'object' && _payload) ? _payload : {},
      fn = (typeof _payload === 'function' ? _payload : (typeof _fn === 'function' ? _fn : noop));
    const req = {
      alias,
      uniqueId: ++uniqueRequestId,
      startAt: Date.now(),
      socket: socketObj,
      fn,
      payload
    }
    try {
      handleIncomingAction.call(this, req);
    } catch (e) {
      logger('error', `Incoming action threw an error in ${alias.name} event with action: ${alias.action}`, e);
    }
  }

  /*
   * Handles an incoming action from a socket.
   * */
  function handleIncomingAction(req) {
    const actionObj = req.action,
      socketObj = req.socket;
    if (this[disabledActions][actionObj.name] === true) {
      return sendEventError.call(this, req, thorin.error('TRANSPORT.UNAVAILABLE', 'The requested resource is temporary unavailable', 502));
    }
    if (thorin.env !== 'production' && actionObj.hasDebug) {
      let logMsg = '[START ' + req.uniqueId + '] - ' + actionObj.name;
      logger('trace', logMsg);
    }
    dispatchIntent.call(this, actionObj.name, req, (wasError, data) => {
      let sendFn = (wasError ? sendEventError : sendEventSuccess);
      sendFn.call(this, req, data);
    });
  }

  /*
   * Creates and dispatcher an intent with the given action and request info
   * */
  function dispatchIntent(actionType, req, onDone) {
    const intentObj = new thorin.Intent(actionType, req.payload, onDone),
      socket = req.socket;
    if (req.alias) {
      intentObj.alias = req.alias;
    }
    intentObj._setAuthorization('TOKEN', socket.thorinAuthorization);
    intentObj.transport = 'ws';
    const clientData = {
      headers: socket.request.headers
    };
    if (this[trustProxy]) {
      clientData.ip = clientData.headers['x-forwarded-for'] || null;
    }
    if (!clientData.ip) {
      clientData.ip = socket.handshake.address;
    }
    intentObj.client(clientData);
    // Attach the socketIO socket to the intent.
    intentObj.socket = req.socket;
    /* IF we have  an intentData attached to the request, we attach it directly to the intent. */
    if (req.intentData) {
      Object.keys(req.intentData).forEach((k) => {
        intentObj[k] = req.intentData[k];
      });
      delete req.intentData;
    }
    thorin.dispatcher.triggerIntent(intentObj);
  }

  /*
   * Handles a custom websocket event, like ws#socket.connect or such.
   * */
  function handleSocketEvent(eventName, socketObj, fn) {
    if (typeof fn !== 'function') fn = noop;
    if (!this[socketEvents][eventName]) return fn();
    const req = {
      socket: socketObj,
      payload: {}
    };
    dispatchIntent.call(this, eventName, req, fn);
  }

  return ThorinWsApp;
}