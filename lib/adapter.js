'use strict';
const adapter = require('socket.io-redis');
/*
* This is the socket.io adapter that works with a redis store.
* */
module.exports = function(thorin, adapterConfig, done) {
  if(!adapterConfig || !adapterConfig.store) return done();
  const redisStore = thorin.store(adapterConfig.store),
    async = thorin.util.async,
    logger = thorin.logger('ws');
  if(!redisStore) {
    logger.warn(`Websocket redis adapter ${adapterConfig.store} is not loaded. Skipping.`);
    return done();
  }
  const calls = [];
  let pubClient, subClient;

  /* step one: fetch the publish connection */
  calls.push((done) => {
    redisStore.getConnection('publish:ws',{
      options: {
        return_buffers: true
      }
    }, (e, con) => {
      if(e) {
        logger.warn(`Could not initialize ws adapter for publishing, from store ${redisStore.name}`);
        return done(e);
      }
      pubClient = con;
      done();
    });
  });

  /* Step two: fetch the subscribe connection. */
  calls.push((done) => {
    redisStore.getConnection('subscribe:ws', {
      options: {
        return_buffers: true
      }
    }, (e, con) => {
      if(e) {
        logger.warn(`Could not initialize ws adapter for subscribing, from store ${redisStore.name}`);
        return done(e);
      }
      subClient = con;
      done();
    });
  });

  async.series(calls, (e) => {
    if(e) {
      logger.error(`Thorin ws adapter working withouth redis store.`);
      return done();
    }
    const key = adapterConfig.name + '.events';
    const opt = {
      key,
      pubClient,
      subClient,
      subEvent: key
    };
    const redisAdapter = adapter(opt);
    done(redisAdapter);
  });

}