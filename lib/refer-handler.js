const debug = require('debug');
const parseUri = require('drachtio-srf').parseUri;
const assert = require('assert');

class ReferHandler {
  constructor(opts) {

    // TODO: opts cans have a media server array
    // if so, we need to use that to modify sessions
    assert(typeof opts.req === 'object',
      '\'req\' is a required option for refer handling and must be an object of the Request class');
    assert(typeof opts.res === 'object',
      '\'res\' is a required option for refer handling and must be an object of the Response class');
    assert(typeof opts.transferor === 'object',
      '\'transferorDialog\' is a required option for refer handling and must be an object of the Dialog class');
    if (opts.authLookup) {
      assert(typeof opts.authLookup === 'function',
        '\'authLookup\' is a required option if opts.auth is true for refer handling and it must be a function');
    }
    if (opts.destinationLookUp) {
      assert(typeof opts.destinationLookUp === 'function',
        '\'destinationLookUp\' is optional for refer handling, but it must be a function');
    }

    this.req = opts.req;
    this.res = opts.res;
    this.srf = opts.srf;
    this.transferorDialog = opts.transferor;
    this.transfereeDialog = opts.transferor.other;
    if (opts.authLookup) {
      this.authLookup = opts.authLookup;
    }
    if (opts.destinationLookUp) {
      this.destinationLookUp = opts.destinationLookUp;
    }
  }

  // some phones will send a REFER-TO uri without any '@' symbol, just <sip:500>,
  // so I slightly modified the drachtio-sip uri parser here to catch it
  _shortReferToUriParser(s) {
    if (typeof s === 'object')
      return s;

    const re = /^(sips?):(?:([^\s>:@]+)(?::([^\s@>]+))?@?)?(?:(|(?:\[.*\])|(?:[0-9A-Za-z\-_]+\.)+[0-9A-Za-z\-_]+)|(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}))(?::(\d+))?((?:;[^\s=\?>;]+(?:=[^\s?\;]+)?)*)(?:\?(([^\s&=>]+=[^\s&=>]+)(&[^\s&=>]+=[^\s&=>]+)*))?$/;

    const r = re.exec(s);

    if (r) {
      return {
        family: /\[.*\]/.test(r[4]) ? 'ipv6' : 'ipv4',
        schema: r[1],
        user: r[2],
        password: r[3],
        host: r[4],
        port: +r[5],
        params: (r[6].match(/([^;=]+)(=([^;=]+))?/g) || [])
          .map(function(s) { return s.split('='); })
          .reduce(function(params, x) { params[x[0]] = x[1] || null; return params;}, {}),
        headers: ((r[7] || '').match(/[^&=]+=[^&=]+/g) || [])
          .map(function(s) { return s.split('='); })
          .reduce(function(params, x) { params[x[0]] = x[1]; return params; }, {})
      } ;
    }
  }

  _referToUriParser(referToUri) {
    const referUri = parseUri(referToUri) ? parseUri(referToUri) : this._shortReferToUriParser(referToUri);
    const referParams = referUri;

    if (referParams.headers && referParams.headers.Replaces) {
      referParams.replaces = true;
      const replacesRegex = /(.*)%3Bto-tag%3D(.*)%3Bfrom-tag%3D(.*)/;
      const replacesParams = referUri.headers.Replaces.match(replacesRegex);
      if (!replacesParams) {
        throw Error('No Replaces parameters found');
      } else {
        referParams.replacesCallId = decodeURIComponent(replacesParams[1]); // turn %40 to @
        referParams.replacesToTag = replacesParams[2];
        referParams.replacesFromTag = replacesParams[3];
        return referParams;
      }
    } else {
      return referParams;
    }
  }

  _modifyTargetAndTransferee(transfereeDialog, transferTargetDialog) {
    return new Promise((resolve, reject) => {
      const transfereeSDP = transfereeDialog.remote.sdp;
      const transferTargetSDP = transferTargetDialog.remote.sdp;

      debug(`ReferHandler#modifyTargetAndTransferee transfereeSDP: ${transfereeSDP}`);
      debug(`ReferHandler#modifyTargetAndTransferee transferTargetSDP: ${transferTargetSDP}`);

      const transferTargetModifyResult = transferTargetDialog.modify(transfereeSDP);
      const tranfereeModifyResult = transfereeDialog.modify(transferTargetSDP);

      // Send NOTIFY 200 OK on answer from both sides
      Promise.all([transferTargetModifyResult, tranfereeModifyResult])
        // eslint-disable-next-line promise/always-return
        .then(() => {
          debug('ReferHandler#modifyTargetAndTransferee transfer complete!');
          this.transferorDialog.request({
            method: 'NOTIFY',
            headers: {
              'Subscription-State': 'terminated;reason=noresource',
              'Event': 'refer',
              'Content-Type': 'message/sipfrag;version=2.0'
            },
            body: 'SIP/2.0 200 OK'
          });

          resolve();
        })
        .catch((error) => {
          // should I send NOTIFY with SIP error?
          reject(error);
        });
    });
  }

  _handleRefer(referParams) {
    return new Promise(async(resolve, reject) => {
      debug(`ReferHandler#_handleRefer transfering call to ${referParams.user}`);
      this.transferorDialog.request({
        method: 'NOTIFY',
        headers: {
          'Subscription-State': 'active',
          'Event': 'refer',
          'Content-Type': 'message/sipfrag;version=2.0' // or whatever
        },
        body: 'SIP/2.0 100 Trying'
      });

      let transferTargetDestination;
      if (this.destinationLookUp) {
        transferTargetDestination = this.destinationLookUp(referParams.user);
        if (transferTargetDestination === undefined) {
          debug(`ReferHandler#_handleRefer No destination IP was provided or \
            could be found for ${referParams.user}`);
          this.res.send(405);
          reject();
        }
      } else {
        if (referParams.destinationIp === undefined) {
          debug(`ReferHandler#_handleRefer No destination IP was provided or \
            could be found for ${referParams.user}`);
          this.res.send(405);
          reject();
        }
        transferTargetDestination = referParams.destinationIp;
      }

      debug(`ReferHandler#_handleRefer transferTarget: sip:${referParams.user}@${transferTargetDestination}`);

      try {
        const transferTargetDialog = await this.srf.createUAC(`sip:${referParams.user}@${transferTargetDestination}`, {
          localSdp: this.transferorDialog.local.sdp,
          headers: {
            'From': this.transferorDialog.local.contact,
            'Referred-By': referParams.referredBy,
          }
        });

        debug('ReferHandler#_handleRefer transferTarget answered. Sending notify to transferor');

        this.transferorDialog.request({
          method: 'NOTIFY',
          headers: {
            'Subscription-State': 'terminated;reason=noresource',
            'Event': 'refer',
            'Content-Type': 'message/sipfrag;version=2.0'
          },
          body: 'SIP/2.0 200 OK'
        });

        debug('ReferHandler#_handleRefer transferTarget answered. Modifying transferee dialog');
        this.transfereeDialog.modify(transferTargetDialog.remote.sdp);

        resolve(transferTargetDialog);
      } catch (error) {
        reject(error);
      }
    });
  }

  _handleReplacesRefer(referParams) {
    return new Promise(async(resolve, reject) => {
      debug(`Replacing Call-ID - ${referParams.replacesCallId}, \
      To-Tag - ${referParams.replacesToTag}, \
      From-Tag - ${referParams.replacesFromTag}`);

      // find transferTarget Dialog
      const replacesDialog = this.srf.findDialogByCallIDAndFromTag(referParams.replacesCallId,
        referParams.replacesFromTag);
      debug('ReferHandler#_handleReplacesRefer found replacesDialog. \
            Calling replacesDialog.other to get the side of the call to transfer to.');
      const transferTargetDialog = replacesDialog.other;

      // send NOTIFY 100 Trying
      this.transferorDialog.request({
        method: 'NOTIFY',
        headers: {
          'Subscription-State': 'active',
          'Event': 'refer',
          'Content-Type': 'message/sipfrag;version=2.0' // or whatever
        },
        body: 'SIP/2.0 100 Trying'
      });

      try {
        await this._modifyTargetAndTransferee(this.transfereeDialog, transferTargetDialog);

        resolve(transferTargetDialog);
      } catch (error) {
        reject(`ReferHandler#_handleReplacesRefer There was an error trying to \
                      modify transferTarget dialog and transferee dialog: ${error}`);
      }
    });
  }

  transfer() {
    return new Promise(async(resolve, reject) => {
      const referTo = this.req.getParsedHeader('Refer-to');
      const referParams = this._referToUriParser(referTo.uri);

      const referredByUri = this.req.getParsedHeader('Referred-By').replace('<', '').replace('>', '');
      referParams.referredBy = this._referToUriParser(referredByUri);

      if (this.authLookup) {
        if (!this.authLookup(referParams.referredBy.user)) {
          this.res.send(403);
          reject(`ReferHandler# error transfering call. ${referParams.referredBy.user} not authorized`);
        }
      }
      this.res.send(202);

      this.transferorDialog.on('destroy', () => {
        debug('ReferHandler# transferor hungup.');
      });

      try {
        if (referParams.replaces) {
          const transferTargetDialog = await this._handleReplacesRefer(referParams);
          // Link hangup between the two dialogs
          [this.transfereeDialog, transferTargetDialog].forEach((dialog) => {
            dialog.on('destroy', () => {
              debug('call ended');
              (dialog === transferTargetDialog ? this.transfereeDialog : transferTargetDialog).destroy();
            });
          });
          resolve({ transfereeDialog: this.transfereeDialog, transferTargetDialog});
        } else {
          const transferTargetDialog = await this._handleRefer(referParams);
          // Link hangup between the two dialogs
          [this.transfereeDialog, transferTargetDialog].forEach((dialog) => {
            dialog.on('destroy', () => {
              debug('call ended');
              (dialog === transferTargetDialog ? this.transfereeDialog : transferTargetDialog).destroy();
            });
          });
          resolve({ transfereeDialog: this.transfereeDialog, transferTargetDialog});
        }
      } catch (error) {
        reject(`ReferHandler# error transfering call: ${error}`);
      }
    });
  }
}

module.exports = ReferHandler;
