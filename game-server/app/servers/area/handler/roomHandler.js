/**
 * Copyright (c) 2015 深圳市辉游科技有限公司.
 */

var format = require('util').format;
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

module.exports = function(app) {
  return new RoomHandler(app);
};

var RoomHandler = function(app) {
  this.app = app;
  logger.info( format("[%s] RoomHandler created.", this.app.getServerId()) );
};

var handler = RoomHandler.prototype;

handler.enterRoom = function(msg, session, next) {
  var room_id = msg.room_id;
  var uid = msg.uid;
  var username = msg.username;
  var self = this;

  // var user = getUser(uid)

  session.bind(uid);
  session.set("room_id", room_id);
  session.pushAll( function(err) {
    if (err) {
      console.error('set room_id for session service failed! error is : %j', err.stack);
    }
  });

  var server_id = self.app.getServerId();

  logger.info("[roomHandler.enterRoom] server_id: %s, room_id: %s, uid: %s", server_id, room_id, uid);

  this.app.rpc.area.roomRemote.enter(session, uid, this.app.get('serverId'), room_id, function(room_server_id, users) {
    logger.info("[enterRoom] area.roomRemote.enter return: room_server_id: %s, users: %s", room_server_id, JSON.stringify(users));
    var resp = {
      users: users,
      room_server_id: room_server_id.toString(),
      server_id: self.app.getServerId()
    };

    next(null, resp);
  });

};

handler.queryRooms = function(msg, session, next) {
  logger.info('[Handler.prototype.queryRooms] msg => ', msg);
  this.app.rpc.area.roomRemote.queryRooms(session, {}, function(err, rooms) {
    logger.info('this.app.rpc.area.roomRemote.queryRooms returns : ', err, rooms);
    next(null, rooms);
  });


};
