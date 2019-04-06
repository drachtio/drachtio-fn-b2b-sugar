const Srf = require('drachtio-srf');
const SipRequest = Srf.SipRequest;
const SipResponse = Srf.SipResponse;
const assert = require('assert');
const noop = () => {};
const noopLogger = {debug: noop, info: noop, error: console.error};
const CallManager = require('./lib/call-manager');

function simring(...args) {
  if (args.length === 1) {
    const logger = args[0];
    assert.ok(typeof logger.debug === 'function' &&
    typeof logger.info === 'function' &&
    typeof logger.error === 'function', 'invalid logger object: must provide [debug|info|error] functions');

    return function(req, res, uriList, opts, notifiers) {
      assert(req instanceof SipRequest);
      assert(res instanceof SipResponse);
      assert(Array.isArray(uriList));

      const manager = new CallManager({req, res, uriList, opts, notifiers, logger});
      return manager.simring();
    };
  }

  assert.ok(args.length >= 3 &&
    args[0] instanceof SipRequest &&
    args[1] instanceof SipResponse && 
    Array.isArray(args[2]), 'invalid simring arguments: usage: simring(req, res, uriArray..)');

  const opts = {
    req: args[0],
    res: args[1],
    uriList: args[2],
    opts: args[3] || {},
    notifiers: args[4] || {},
    logger: noopLogger
  };
  const manager = new CallManager(opts);
  return manager.simring();
}


module.exports = {simring};
