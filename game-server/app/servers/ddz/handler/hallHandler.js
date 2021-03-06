/**
 * Copyright (c) 2015 深圳市辉游科技有限公司.
 */

var format = require('util').format;
var logger = require('pomelo-logger').getLogger(__filename);
var utils = require('../../../util/utils');
var Result = require('../../../domain/result');
var User = require('../../../domain/user');
//var MyPlayed = require('../../../domain/myPlayed');
//var MyFriend = require('../../../domain/myFriend');
//var MyMessageBox = require('../../../domain/myMessageBox');
var DdzUserAsset = require('../../../domain/ddzUserAsset');
var DdzGoodsPackage = require('../../../domain/ddzGoodsPackage');

var ErrorCode = require('../../../consts/errorCode');
var Q = require('q');

//var friendService = require('../../../services/friendService');
//var addFriendQ = Q.nbind(friendService.addFriend, friendService);
//var confirmAddFriendQ = Q.nbind(friendService.confirmAddFriend, friendService);
//

module.exports = function(app) {
  return new Handler(app);
};

var Handler = function(app) {
  logger.info("connector.HallHandler created.");
  this.app = app;
};

Handler.prototype.getShopItems = function(msg, session, next) {
  var channelId = session.get('channelId');
  this.app.rpc.area.hallRemote.getGoodsPackages.toServer('room-server', session.uid, channelId, null, null, function(err, packages) {
    logger.info('[Handler.prototype.getShopItems] hallRemote.getGoodsPackages =>', packages);
    utils.invokeCallback(next, null, packages);
//    utils.invokeCallback(next, null, JSON.stringify(packages));
//    next(null, {result: 'ok'});
  });
};

Handler.prototype.buyItem = function(msg, session, next) {
  msg.uid = session.uid;
  msg.channelId = session.get('channelId');

  this.app.rpc.area.hallRemote.buyPackage.toServer('room-server', msg, function(err, pkg) {
    var result;
    if (!err) {
      result = new Result(0);
      result.pkg = pkg;
    } else {
      result = new Result(1000, 0, err.toString());
    }
    utils.invokeCallback(next, null, result);
  });
};

Handler.prototype.getAssetItems = function(msg, session, next) {
  var userId = session.uid;
  var now = Date.now();

  DdzUserAsset.findQ({userId: userId, $or: [{expired_at: null}, {expired_at: {$gt: now}}] })
    .then(function(userAssets) {
      var assetsMap = {};
      var asset;
      for (var i=0; i< userAssets.length; i++) {
        asset = userAssets[i];
        if (!!assetsMap[asset.goodsId]) {
          assetsMap[asset.goodsId].count = assetsMap[asset.goodsId].count + 1;
          if (!!asset.expired_at) {
            assetsMap[asset.goodsId].using = true;
            assetsMap[asset.goodsId].count--;
            assetsMap[asset.goodsId].remainingSeconds = Math.floor((asset.expired_at - Date.now()) / 1000);
          }
        } else {
          asset.count = 1;
          assetsMap[asset.goodsId] = asset;
          if (!!asset.expired_at) {
            asset.using = true;
            asset.remainingSeconds = Math.floor((asset.expired_at - Date.now()) / 1000);
            asset.count--;
          }
        }
      }

      var reducedAssets = [];
      for (var key in assetsMap) {
        reducedAssets.push(assetsMap[key]);
      }

      utils.invokeCallback(next, null, {assets: reducedAssets.toParams({exclude:['goodsAction']})});
    })
    .fail(function(err){
      logger.error('[HallHandler.getAssetItems] Error: ', err);
      utils.invokeCallback(next, null, {error: 500});
    });
};

Handler.prototype.useAssetItem = function(msg, session, next) {
  var userId = session.uid;
  var assetId = msg.assetId;
  var user = null;
  var ddzUserAsset = null;

  DdzUserAsset.findOneQ({_id: assetId})
    .then(function(_asset) {
      logger.debug('[HallHandler.useAssetItem] _asset: ', _asset );
      ddzUserAsset = _asset;
      var err = null;
      if (ddzUserAsset.userId != userId) {
        err = new Error("道具不属于该用户", 5001);
        err.errCode = 5001;
        throw err;
      } else if (!!ddzUserAsset.expired_at) {
        err = new Error("道具已在使用");
        err.errCode = 5002;
        throw err;
      }

      ddzUserAsset.used_at = Date.now();
      var duration = ddzUserAsset.goodsProps.duration;
      var unit = duration[duration.length-1];
      var elapsed = parseInt(duration) * 1000; // default seconds
      if (elapsed == 0) {
        elapsed = 1000;
      }
      if (unit == 'd') {
        elapsed = elapsed * 24 * 60 * 60; // 1d = 24h x 60min x 60sec
      } else if (unit == 'h') {
        elapsed = elapsed * 60 * 60; // 1h = 60min x 60sec
      } else if (unit == 'm') {
        elapsed = elapsed * 60; // 1min = 60sec
      }

      ddzUserAsset.expired_at = new Date(ddzUserAsset.used_at.getTime() + elapsed);
      logger.debug('duration: %s, used_at: %s, elapsed: %d, expired_at: %s',
        duration,
        ddzUserAsset.used_at,
        elapsed,
        ddzUserAsset.expired_at);

      return ddzUserAsset.saveQ();
    })
    .then(function() {
      utils.invokeCallback(next, null, new Result(0) )
    })
    .fail(function(err) {
      logger.error('[HallHandler.useAssetItem] Error: ', err);
      var result = new Result(err.errCode || 1000, 0, err.toString());
      utils.invokeCallback(next, null, result);
    });

};


