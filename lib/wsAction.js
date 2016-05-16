'use strict';
/**
 * Created by Adrian on 14-Apr-16.
 */
const Route = require('route-parser');
module.exports = function(thorin, transportName) {

  /*
   * Specific ws actions are found under socketEvents.js
   * */

  const CUSTOM_WS_EVENTS = require('./socketEvents');
  let customEventIdx = 0;

  const wsAction = Symbol(),
    wsRoom = Symbol();

  class ThorinAction extends thorin.Action {

    constructor(name,b,c) {
      super(name,b,c);
      if(CUSTOM_WS_EVENTS.__contains(name)) {
        this[wsAction] = true;
        if(name === CUSTOM_WS_EVENTS.ROOM_JOIN || name === CUSTOM_WS_EVENTS.ROOM_LEAVE) {
          customEventIdx++;
          this.name += ':' + customEventIdx;
        }
        // this is a custom websocket action. Custom actions will not be saved in the dispatcher,
        // but rather saved in the websocket transport.
        this.getCustomOptions = function(opt) {
          opt.transport = transportName;
          return opt;
        }
      }
    }

    /*
    * WS Join/Leave events expose room() function for inner room routing.
    * */
    roomName(roomPattern) {
      if(typeof roomPattern === 'undefined') return this[wsRoom] || null;
      if(this[wsAction]) {
        this[wsRoom] = new Route(roomPattern);
      }
      return this;
    }

    /*
    * Check if we match the given pattern.
    * NOTE: if no roomName was attached, we match always.
    * */
    match(room) {
      if(typeof room !== 'string' || !room) return false;
      if(!this[wsRoom]) return true;
      let routePattern = this[wsRoom];
      let matchData = routePattern.match(room);
      if(!matchData) {
        return false;
      }
      return matchData;
    }

    alias() {
      if(this[wsAction]) return this;
      return super.alias.apply(this, arguments);
    }

  };

  thorin.Action = ThorinAction;

};