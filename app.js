const Srf = require('drachtio-srf');
const SipRequest = Srf.SipRequest;
const SipResponse = Srf.SipResponse;
const assert = require('assert');
const noop = () => {};
const noopLogger = {debug: noop, info: noop, error: console.error};
const CallManager = require('./lib/call-manager');

function simring(logger) {
  logger = logger || noopLogger;

  return function(req, res, uriList, opts, notifiers) {
    assert(req instanceof SipRequest);
    assert(res instanceof SipResponse);
    assert(Array.isArray(uriList));

    const manager = new CallManager({req, res, uriList, opts, notifiers, logger});
    return manager.simring();
  };
}


module.exports = {simring};
