'use strict';
/**
 * Extend the WebSocket intent with additional functionality
 */
module.exports = function (thorin, transportName) {

  const Intent = thorin.Intent,
    logger = thorin.logger(transportName);

  const socket = Symbol(),
    startTs = Symbol();

  class ThorinIntent extends Intent {

    set socket(socketObj) {
      if (this.transport !== transportName || this[socket]) return;
      this[socket] = socketObj;
    }

    get socket() {
      return this[socket] || null;
    }

    /*
     * Manually make the socket join a room.
     * */
    joinRoom(roomName, _fn) {
      if (typeof _fn === 'function') {
        if (typeof this[socket].rooms[roomName] !== 'undefined') {
          _fn();
          return this;
        }
        this[socket].join(roomName, _fn);
        return this;
      }
      if (typeof this[socket].rooms[roomName] !== 'undefined') {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        this[socket].join(roomName, (e) => {
          if (e) return reject(e);
          resolve();
        });
      });
    }

    /*
     * Manually make the socket leave a room.
     * */
    leaveRoom(roomName, _fn) {
      if (typeof _fn === 'function') {
        if (typeof this[socket].rooms[roomName] === 'undefined') {
          _fn();
          return this;
        }
        this[socket].leave(roomName, _fn);
        return this;
      }
      if (typeof this[socket].rooms[roomName] === 'undefined') {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        this[socket].leave(roomName, (e) => {
          if (e) return reject(e);
          resolve();
        });
      });
    }

    socketConnectionTime() {
      if (!this[socket]) return 0;
      return Date.now() - this[socket].thorinStartTime;
    }

    socketData(d, v) {
      let socketObj = this.socket;
      if (this.transport !== transportName || socketObj == null) {
        logger.warn(`socketData() called on non-ws intent in action ${this.action}`);
        return this;
      }
      if (typeof socketObj.thorinData === 'undefined') socketObj.thorinData = {};
      if (typeof d === 'undefined') return socketObj.thorinData;
      if (typeof d === 'string') {
        if (typeof v === 'undefined') {
          return socketObj.thorinData[d] || null;
        }
        socketObj.thorinData[d] = v;
      } else if (typeof d === 'object') {
        if (d == null) {
          delete socketObj.thorinData;
        } else {
          socketObj.thorinData = d;
        }
      }
      return this;
    }


  }
  thorin.Intent = ThorinIntent;
};