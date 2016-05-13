'use strict';
const http = require('http'),
  path = require('path');

const initAction = require('./lib/wsAction'),
  initIntent = require('./lib/wsIntent'),
  initEvent = require('./lib/socketEvent'),
  initApp = require('./lib/app');

/**
 * The WS transport handles both incoming and outgoing events to the users.
 * Custom events that can be captured during the lifecycle of a socket:
 *  socket#connect -> when a socket connects, fires only once.
 *  socket#disconnect -> when a socket disconnects, fires only once
 *  socket#error -> if/when a client encounters an error.
 */
module.exports = function init(thorin) {
  initAction(thorin, 'ws');
  initIntent(thorin, 'ws');
  const SocketEvent = initEvent(thorin),
    SocketIoApp = initApp(thorin, SocketEvent),
    async = thorin.util.async,
    config = Symbol(),
    running = Symbol(),
    app = Symbol();

  class ws extends thorin.Interface.Transport {
    static publicName() { return "ws"; }

    constructor() {
      super();
      this.name = 'ws';
      this.type = thorin.Interface.BI_DIRECTIONAL;
      this[running] = false;
      this[config] = {};
      this[app] = null; // the socket.io app
    }
    get app() {
      if(!this[app]) return null;
      return this[app];
    }

    /*
     * Initializes the transport with config.
     * NOTE: Standalone version is currently unavailable and requires a http transport
     * to work with.
     * */
    init(wsConfig) {
      this[config] = thorin.util.extend({
        debug: true,
        adapter: {
          store: null,          // the redis store to use as an adapter.
          channel: 'thorin:ws'  // the channel to use for pubsub
        },
        authorization: null,  // if specified, override the default authorization of the http transport
        transport: 'http',
        actionName: 'dispatch', // the default action to listen to.
        options: {  // socket.io options
          path: '/ws'
        }
      }, wsConfig);
      this[app] = new SocketIoApp(this[config], this._log.bind(this));
    }

    /*
     * Send an intent to a specific client.
     * */
    sendIntent(intentObj, fn) {
      if(intentObj instanceof SocketEvent) {
        return this[app].emit(intentObj, fn);
      }
      // If we get an intent, we have to wrap it into a SocketEvent.
      let eventObj = new SocketEvent(intentObj.action);
      eventObj._fromIntent(intentObj);
      return this[app].emit(eventObj, fn);
    }
    /*
    * Proxy for sendEvent()
    * */
    sendEvent() {
      return this.sendIntent.apply(this, arguments);
    }

    /*
     * Sets up the directory structure of the project.
     * */
    setup(done) {
      const SETUP_DIRECTORIES = ['app/actions', 'app/middleware'];
      for(let i=0; i < SETUP_DIRECTORIES.length; i++) {
        try {
          thorin.util.fs.ensureDirSync(path.normalize(thorin.root + '/' + SETUP_DIRECTORIES[i]));
        } catch(e) {}
      }
      done();
    }

    /*
     * Runs the HTTP Server and binds it to the port.
     * */
    run(done) {
      const transportObj = thorin.transport(this[config].transport);
      if(!transportObj) {
        thorin.logger().error('WS transport requires a HTTP Transport in its config.');
        return done(thorin.error('TRANSPORT.WS', 'Invalid HTTP Transport'));
      }
      this.app.attach(transportObj);
      thorin.dispatcher.registerTransport(this);
      done();
    }

    /*
     * Registers an incoming intent action.
     * HTTP Actions work with aliases.
     * */
    routeAction(actionObj) {
      this.app.addHandler(actionObj);
    }

    /*
     * Temporary disable the action from being processed.
     * */
    disableAction(actionName) {
      this.app.disableHandler(actionName);
      return this;
    }

    /* Re-enables the action to be processed. */
    enableAction(actionName) {
      this.app.enableHandler(actionName);
      return this;
    }

    /*
     * This will handle the transport logger.
     * */
    _log() {
      if(this[config].debug === false) return;
      let logObj = thorin.logger(this.name);
      logObj.log.apply(logObj, arguments);
    }
  }
  /* Export the Event class */
  ws.prototype.Event = SocketEvent;
  return ws;
};
module.exports.publicName = 'ws';