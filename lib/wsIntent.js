'use strict';
/**
 * Extend the WebSocket intent with additional functionality
 */
module.exports = function(thorin, transportName) {

  const Intent = thorin.Intent,
    logger = thorin.logger(transportName);

  const socket = Symbol();

  class ThorinIntent extends Intent {

    set socket(socketObj) {
      if(this.transport !== transportName || this[socket]) return;
      this[socket] = socketObj;
    }

    get socket() {
      return this[socket] || null;
    }

    socketData(d) {
      let socketObj = this.socket;
      if(this.transport !== transportName || socketObj == null) {
        logger.warn(`socketData() called on non-ws intent in action ${this.action}`);
        return this;
      }
      if(typeof socketObj.thorinData === 'undefined') socketObj.thorinData = {};
      if(typeof d === 'undefined') return socketObj.thorinData;
      return this;
    }


  }
  thorin.Intent = ThorinIntent;
};