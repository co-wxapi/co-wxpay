'use strict';

var WxBase = require('co-wxbase');
var xml2js = require('xml2js');
var wxsign = require('co-wxsign');
var moment = require('moment');
var os = require('os');
var hostname = os.hostname();
if ( !hostname ) {
  hostname = "UNKNOWN";
}
else if ( hostname.length > 32 ){
  hostname = hostname.substr(0,32);
}

function co_parseXml(callback){
  return function xml2json(xml){
    xml2js.parseString(xml, { explicitArray : false, ignoreAttrs : true }, function(err, data){
      callback(err, data);
    });
  }
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function paddingFormat(x,len,base){
  var s = x.toString(base);
  if ( len == s.length ) {
    return s;
  }
  else if ( len > s.length ){
    s = new Array(len - s.length+1).join('0')+s;
  }
  else {
    s = s.substr(s.length - len);
  }
  return s;
}

function createOrderNo(){
  var ts = new Date();
  var no = paddingFormat(ts.getYear()%100, 2, 10)
      + paddingFormat((ts.getMonth()+1),2,10)
      + paddingFormat((ts.getDate()),2,10)
      + paddingFormat((ts.getHours()),2,10)
      + paddingFormat((ts.getMinutes()),2,10)
      + paddingFormat((ts.getSeconds()),2,10)
      + channelId;
  var max = Math.pow(2, 20);
  var min = 0;
  var rand1 = rand(min, max);
  var rand2 = rand(min, max);
  no += paddingFormat(rand1, 3, 36);
  no += paddingFormat(rand2, 3, 36);
  return no;
}

class WxPay extends WxBase {
  constructor(config){
    super(config);
    var merchantId = config.merchantId || config.merchant_id || config.mch_id;
    var merchantKey = config.merchantKey || config.merchant_key || config.mch_key;
    this.merchantId = merchantId;
    this.merchantKey = merchantKey;
  }

  generateTradeNo(prefix){
    prefix = prefix || 'WX';
    return prefix+createOrderNo();
  }

  *unifiedOrder(args){
    var url = `https://api.mch.weixin.qq.com/pay/unifiedorder`;
    var params = Object.assign({}, args);
    var now = new Date();
    if ( !params.nonce_str ) params.nonce_str = wxsign.generateNonceStr();
    if ( !params.time_start ) params.time_start = new Date();
    if ( !params.time_expire ) params.time_expire = new Date(now.getTime()+900000);
    if ( params.time_start instanceof Date ) {
      params.time_start = moment(params.time_start).format('YYYYMMDDHHmmss')
    }
    if ( params.time_expire instanceof Date ) {
      params.time_expire = moment(params.time_expire).format('YYYYMMDDHHmmss')
    }
    params.appid = this.appId;
    params.mch_id = this.merchantId;
    var result = this.xmlRequest(url, params);
    return result;
  }

  *queryOrder(id, wx){
    var params = {
      appid: this.appId,
      mch_id: this.merchantId,
      nonce_str: wxsign.generateNonceStr()
    }
    if ( wx ) params.transaction_id = id;
    else params.out_trade_no = id;
    var url = 'https://api.mch.weixin.qq.com/pay/orderquery';
    var result = yield this.xmlRequest(url, params);
    return result;
  }

  *closeOrder(trade_no, type){
    var url = 'https://api.mch.weixin.qq.com/pay/closeorder';
    var params = {
      appid: this.appId,
      mch_id: this.merchantId,
      nonce_str: wxsign.generateNonceStr(),
      out_trade_no: trade_no
    }
    var result = yield this.xmlRequest(url, params);
    return result;
  }

  *refund(args){
    var url = 'https://api.mch.weixin.qq.com/secapi/pay/refund';
    var params = Object.assign({
      appid: this.appId,
      mch_id: this.merchantId,
      nonce_str: wxsign.generateNonceStr(),
      device_info: hostname,
    }, args);
    if ( !params.out_refund_no ) {
      params.out_refund_no = this.generateTradeNo('WR');
    }
    var result = yield this.xmlRequest(url, params);
    return result;
  }

  *queryRefund(id, type) {
    var url = 'https://api.mch.weixin.qq.com/pay/refundquery';
    var params = {
      appid: this.appId,
      mch_id: this.merchantId,
      nonce_str: wxsign.generateNonceStr(),
      device_info: hostname,
    }
    if ( type == 'transaction' ) {
      params.transaction_id = id;
    }
    else if ( type == 'trade' ){
      params.out_trade_no = id;
    }
    else if ( type == 'refund' ){
      params.out_refund_no = id;
    }
    else {
      params.refund_id = id;
    }
    var result = yield this.xmlRequest(url, params);
    return result;
  }

  *parseNotifyXml(result){
    var result = yield co_parseXml(result);
    var intFields = ['total_fee','settlement_total_fee','cash_fee','coupon_fee','coupon_count'];
    intFields.forEach(function(field){
      var value = result[field];
      if ( value == null ) return;
      result[field] = parseInt(value) || 0;
    });
    var count = result.coupon_count;
    for ( var n = 0; n < count; ++ n ) {
      var field = 'coupon_type_'+n;
      if ( result[field] != null ) {
        result[field] = parseInt(result[field]) || 0;
      }
      field = 'coupon_fee_'+n;
      if ( result[field] != null ) {
        result[field] = parseInt(result[field]) || 0;
      }
    }
    return result;
  }
}

module.exports = function(config){
  var api = new WxPay(config);
  return api;
}
