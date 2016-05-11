'use strict';
/**
 * Created by Adrian on 14-Apr-16.
 */
module.exports = function(thorin, transportName) {

  /*
   * Specific ws actions are found under socketEvents.js
   * */

  const CUSTOM_WS_EVENTS = require('./socketEvents');

  const wsAction = Symbol();

  class ThorinAction extends thorin.Action {

    constructor(name,b,c) {
      super(name,b,c);
      if(typeof CUSTOM_WS_EVENTS[name] !== 'undefined') {
        this[wsAction] = true;
        // this is a custom websocket action. Custom actions will not be saved in the dispatcher,
        // but rather saved in the websocket transport.
        this.getCustomOptions = function(opt) {
          opt.save = false;
          opt.transport = transportName;
          return opt;
        }
      }
    }

    alias() {
      if(this[wsAction]) return this;
      return super.alias.apply(this, arguments);
    }

  };

  thorin.Action = ThorinAction;

};