'use strict';
/*
 * This is the event representation from server-client communication.
 * The websocket event must contain simple {type, payload} information
 * that can be passed to any websocket connections.
 * */
module.exports = function (thorin) {
  const logger = thorin.logger('ws'),
    DEFAULT_EVENT = 'action',
    raw = Symbol();

  class WsEvent {

    constructor(actionName, _payload) {
      this._event = DEFAULT_EVENT;
      this.name = actionName;
      this._payload = (typeof _payload === 'object' && _payload ? _payload : {});
      this._rooms = null; // the room we want to use to send the event only in that room.
      this._targetId = null;  // the specific socket id target. If specified, we send to a single socket.
    }

    /* Override the default event */
    event(name) {
      this._event = name;
      return this;
    }

    /* Adds a new room  */
    addRoom(roomName) {
      if (this._rooms == null) this._rooms = [];
      const type = typeof roomName;
      if (type === 'string' || type === 'number') {
        this._rooms.push(roomName.toString());
      }
      return this;
    }

    /*
     * Sets the raw data to send.
     * */
    setRawData(data) {
      if (typeof data !== 'object' || !data) return this;
      this[raw] = data;
      return this;
    }

    /*
     * Manually set the payload
     * */
    payload(obj) {
      if (typeof obj === 'object' && obj) {
        this._payload = obj;
      }
      return this;
    }


    /* PRIVATE FUNCTIONS USED BY THE WS TRANSPORT */

    /* Populates the event information from an intent. */
    _fromIntent(intentObj) {
      // TODO
    }

    /* Returns the actual {type,payload} representation of the client. */
    _toClient() {
      if(typeof this[raw] !== 'undefined') {
        return this[raw];
      }
      let d = {
        type: this.name,
        payload: this._payload
      };
      return d;
    }

    /* Checks if we have any room, or is it a broadcast. */
    _hasRooms() {
      if (this._rooms == null) return false;
      return (this._rooms.length > 0);
    }

    /* Checks if we have a specific socket target attacked. */
    _hasTarget() {
      return (this._targetId !== null);
    }
  }

  return WsEvent;

};