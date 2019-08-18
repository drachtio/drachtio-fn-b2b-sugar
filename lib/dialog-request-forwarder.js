const assert = require('assert');
const Dialog = require('drachtio-srf').Dialog;
const immutableHdrs = ['via', 'from', 'to', 'call-id', 'cseq', 'max-forwards', 'content-length'];
const requestTypes = ['bye', 'info', 'notify', 'options', 'message'];

function forwardInDialogRequests(dlg, opts) {
  assert.ok(dlg instanceof Dialog, 'forwardInDialogRequests: SipDialog must be first argument');
  assert.ok(dlg.other instanceof Dialog, 'forwardInDialogRequests: SipDialog must be in a b2b');
  const methods = [];

  // default to forwarding all request types (except invite and update, which we dont handle)
  if (!opts) methods.push.apply(methods, requestTypes);
  else if (Array.isArray(opts)) {
    if (opts.includes('*')) methods.push.apply(methods, requestTypes);
    methods.push.apply(methods, opts);
  }

  [dlg, dlg.other].forEach((dialog) => {
    methods.forEach((method) => {
      dialog.on(method, async(req, res) => {
        const headers = {};
        Object.keys(req.headers).forEach((h) => {
          if (!immutableHdrs.includes(h)) headers[h] = req.headers[h];
        });
        try {
          //NB: as of 4.4.15 Dialog#request resolves to the response recved to the request sent;
          //in the future this may change to be resolved to the request sent
          const response = await dialog.other.request({method: method.toUpperCase(), headers, body: req.body});
          const responseHeaders = {};
          if (response.has('Content-Type')) {
            Object.assign(responseHeaders, {'Content-Type': response.get('Content-Type')});
          }
          res.send(response.status, {headers: responseHeaders, body: response.body});
        } catch (err) {
          console.error(err, 'Error forwarding in-dialog request');
        }
      });
    });
  
  });
}

module.exports = forwardInDialogRequests;
