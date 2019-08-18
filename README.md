# drachtio-fn-b2b-sugar

A selection of useful and reusable functions dealing with common [B2BUA](https://drachtio.org/api#srf-create-b2bua) scenarios for the [drachtio](https://drachtio.org) SIP server.

## simring function

A common need is to do a simultaneous ring of multiple SIP endpoints in response to an incoming call, connecting the caller to the first answering device and terminating the other requests.

This function provides a forking outdial B2BUA that connects the caller to the first endpoint that answers.

##### basic usage
In basic usage, the exported `simring` function acts almost exactly like [Srf#createB2BUA](https://drachtio.org/api#srf-create-b2bua), except that you pass an array of sip URIs rather than a single sip URI.
```js
const {simring} = require('drachtio-fn-b2b-sugar');
srf.invite(async (req, res) {
  try {
    const {uas, uac} = await simring(req, res, ['sip:123@example.com', 'sip:456@example.com']);
    console.info(`successfully connected to ${uas.remote.uri}`);
  } catch (err) {
    console.log(err, 'Error connecting call');
  }
});
```
All of the options that you can pass to [Srf#createB2BUA](https://drachtio.org/api#srf-create-b2bua) can be passed to `simring`.

##### with logging
If you want logging from simring, you can treat the exported `simring` reference as a factory function that you invoke with a single argument, that being the logger object that you want to be used.  That object must provide 'debug', 'info', and 'error' functions (e.g. [pino](https://www.npmjs.com/package/pino)).

Invoking the factory function then returns another function that does the actual simring.
```js
const logger = require('pino')();
const {simring} = require('drachtio-fn-b2b-sugar');
const doSimring = simring(logger);
srf.invite(async (req, res) {
  try {
    const {uas, uac} = await doSimring(req, res, ['sip:123@example.com', 'sip:456@example.com']);
    console.info(`successfully connected to ${uas.remote.uri}`);
  } catch (err) {
    console.log(err, 'Error connecting call');
  }
});
```
## Simring class
A more advanced usage is to to start a simring against a list of endpoints, and then later (before any have answered) add one or more new endpoints to the simring list.  

This would be useful, for instance, in a scenario where you are ringing all of the registered devices for a user and while doing that a new device registers that you also want to include.

In this case, you would use the Simring class, which exports a `Simring#addUri` method to do just that.
```js
const logger = require('pino')();
const {Simring} = require('drachtio-fn-b2b-sugar');

srf.invite(async (req, res) {
  const simring = new Simring(req, res, ['sip:123@example.com', 'sip:456@example.com']);
  simring.start()
    .then(({uas, uc}) => {
      console.info(`successfully connected to ${uas.remote.uri}`);
    })
    .catch((err) => console.log(err, 'Error connecting call'));
  
  // assume we are alerted when a new device registers
  someEmitter.on('someRegisterEvent', () => {
    if (!simring.finished) simring.addUri('sip:789@example.com');
  });
```

## transfer (REFER handler)

Handle REFER messasges in your B2B dialogs.

```js
const {transfer} = require('drachtio-fn-b2b-sugar');

const auth = (username) => {
  // Valid username can make REFER/transfers
  //if (username == 'goodGuy') {
  //  return true;
  //} else {
  //  return false;
  //}
}

const destLookUp = (username) => {
  // do lookup on username here
  // to get an IP address or domain
  // const ipAddress = someLook();
  // return ipAddress;
};

srf.invite(async (req, res) {
  try {
    const {uas, uac} = await srf.createB2BUA(req, res, destination, {localSdpB: req.body});
    uac.on('refer', async (req, res) => {
      const opts = {
        srf, // required
        req, // required
        res,  // required
        transferor: uac, // required
        // authLookup: referAuthLookup, // optional, unless auth is true
        // destinationLookUp: this.referDestinationLookup, // optional
      }
      const { transfereeDialog, transferTargetDialog } = await transfer(opts);
    });

    uas.on('refer', async (req, res) => {
      const opts = {
        srf, // required
        req, // required
        res,  // required
        transferor: uas, // required
        authLookup: auth, // optional, unless auth is true
        destinationLookUp: destLookUp, // optional
      }
      const { transfereeDialog, transferTargetDialog } = await transfer(opts);
    });
  } catch (error) {
    console.log(error);
  }
});
```

### Options

* authLookup: function - used to verify endpoint sending REFER is allowed to REFER calls in your environment
* destinationLookUp: function - used to determine what IP address (or domain) to use when calling the transferTarget (the person being transferred to). If not set, whatever is put in the `Refer-To` uri will be used

## forwardInDialogRequests

This function forwards in-dialog requests received on one Dialog in a B2B to the paired Dialog.  It does _not_ handle in-dialog INVITEs (e.g. re-INVITEs) or UPDATE requests, however, as these usually require application-specific processing.

The signature is: `forwardInDialogRequests(dlg, requestTypes)`, e.g.:
```
const {forwardInDialogRequests} = require('drachtio-fn-b2b-sugar');
const {uas, uac} = await srf.createB2BUA(..);
forwardInDialogRequests(uas, ['info', 'options', 'notify']);
```
The list of request types to forward is optional; if not specified all request types (except, as per above, INVITEs and UPDATEs) will for forwarded:
```
forwardInDialogRequests(uas);
```
