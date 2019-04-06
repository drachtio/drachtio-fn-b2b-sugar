const Emitter = require('events');
const DEFAULT_TIMEOUT = 20;

class CallManager extends Emitter {
  constructor(opts) {
    super();

    this.logger = opts.logger;
    this.req = opts.req;
    this.res = opts.res;
    this.srf = this.req.srf;
    this.uriList = opts.uriList;
    this.callOpts = opts.opts || {};
    this.callOpts.localSdp = this.callOpts.localSdpB;
    this.notifiers = opts.notifiers || {};

    //calls in progress: uri -> SipRequest
    this.cip = new Map();

    this.callerGone = false;
    this.callAnswered = false;
    this.bridged = false;
    this.callTimeout = this.callOpts.timeout || DEFAULT_TIMEOUT;
    this.req.on('cancel', () => {
      this.callerGone = true;
      this.killCalls();
    });
  }

  simring() {
    this.strategy = 'simring';
    const simrings = this.uriList.map((uri) => this._attemptOne(uri));
    return oneSuccess(simrings);
  }

  _attemptOne(uri) {
    let timer = null;
    let uac, uas;

    // return a Promise that resolves to a {uac, uas} pair
    const p = this.srf.createUAC(uri, this.callOpts,
      {
        cbRequest: (err, reqSent) => {
          if (this.notifiers.cbRequest) this.notifiers.cbRequest(err, reqSent);
          this.cip.set(uri, reqSent);
          this.logger.debug(
            `CallManager#_attemptOne: launched call to ${reqSent.uri}; ${this.cip.size} calls in progress`);
        },
        cbProvisional: (response) => {
          if (this.notifiers.cbProvisional) this.notifiers.cbProvisional(response);
          if (this.strategy === 'hunt' && [180, 183].includes(response.status) && response.body) {
            // TODO: cut through audio on early media..
          }
        }
      })
      .then((dlg) => {
        if (this.callAnswered) {
          dlg.destroy();
          this.logger.info(`race condition; hanging up call ${dlg.sip.callid} because another leg answered`);
          throw new this.srf.SipError(500);
        }
        this.callAnswered = true;
        uac = dlg;
        this.killCalls(uri);
        this.cip.delete(uri);
        if (timer) clearTimeout(timer);

        const sdpA = uac.remote.sdp;
        const localSdpA = this.callOpts.localSdpA;
        if (typeof localSdpA === 'string') return localSdpA;
        if (typeof localSdpA === 'function') return localSdpA(uac.remote.sdp, uac.res);
        return sdpA;
      })
      .then((sdpA) => {
        return this.srf.createUAS(this.req, this.res, {headers: this.copyUACHeadersToUAS(uac.res), localSdp: sdpA});
      })
      .then((dlg) => {
        uas = dlg;
        return {uas, uac};
      })
      .catch((err) => {
        if (!this.callerGone) {
          this.logger.info(`CallManager#attemptOne: call to ${uri} failed with ${err.status}`);
        }
        throw err;
      });

    timer = setTimeout(() => {
      if (this.cip.has(uri)) {
        this.logger.info(`CallManager#attemptOne: timeout on call to ${uri}; tearing down call`);
        const req = this.cip.get(uri);
        this.cip.delete(uri);
        req.cancel();
      }
    }, this.callTimeout * 1000);

    return p;
  }

  killCalls(spareMe) {
    for (const arr of this.cip) {
      const uri = arr[0];
      const req = arr[1];

      if (spareMe === uri) {
        this.logger.info(`not killing call to ${uri} because we were asked to spare it`);
      }
      else {
        this.logger.info(`killing call to ${uri}`);
        req.cancel();
      }
    }
    this.cip.clear();
  }

  copyUACHeadersToUAS(uacRes) {
    this.callOpts.headers = {} ;
    this.callOpts.proxyResponseHeaders.forEach((hdr) => {
      if (uacRes.has(hdr)) {
        this.callOpts[hdr] = uacRes.get(hdr) ;
      }
    });

    // after copying headers from A to B, apply any specific requested headerss
    if (typeof this.callOpts.responseHeaders === 'function') {
      Object.assign(this.callOpts.headers, this.callOpts.opts.responseHeaders(uacRes, this.callOpts.headers));
    }
    else if (typeof this.callOpts.responseHeaders === 'object') {
      Object.assign(this.callOpts.headers, this.callOpts.responseHeaders);
    }
    Object.assign(this.callOpts.headers, this.callOpts.responseHeaders);
    return this.callOpts.headers ;
  }
}

module.exports = CallManager;

function oneSuccess(promises) {

  // tricky reverse usage of Promise.all to return when first Promise succeeds
  return Promise.all(promises.map((p) => {
    return p.then((val) => Promise.reject(val), (err) => Promise.resolve(err));
  }))
    .then(
      (errors) => Promise.reject(errors),
      (val) => Promise.resolve(val)
    );
}
