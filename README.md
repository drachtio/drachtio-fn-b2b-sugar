# drachtio-fn-b2b-sugar

A selection of useful and reusable functions dealing with common [B2BUA](https://drachtio.org/api#srf-create-b2bua) scenarios for the [drachtio](https://drachtio.org) SIP server.

## simring

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