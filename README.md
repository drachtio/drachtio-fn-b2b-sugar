# drachtio-fn-b2b-sugar

Various utility functions that build on [drachtio-srf B2BUA](https://drachtio.org/api#srf-create-b2bua).

### simring

A forking outdial B2BUA that connects the caller to the first answer.

The exported `simring` reference is a factory function that must be invoked to return another function that will perform the simring.  The method signature of the generated function is similar to [createB2BUA](https://drachtio.org/api#srf-create-b2bua), except that an array of sip URIs are provided instead of a single URI, and also the method returns a Promise but does not support callback usage.

The exported `simring` function takes one optional parameter, which is a logger object that you can pass in.  A [pino](https://www.npmjs.com/package/pino) logger is example of a logger that can be passed in, but any object that exports `debug`, `info`, and `error` functions can be used for logging purposes.

example usage:

```js
const {simring} = require('drachtio-fn-b2b-sugar');
const doSimring = simring();
srf.invite(async (req, res) {
  try {
    const {uas, uac} = await doSimring(req, res, ['sip:123@example.com', 'sip:456@example.com']);
    console.info(`successfully connected to ${uas.remote.uri}`);
  } catch (err) {
    console.log(err, 'Error connecting call');
  }
});
```
With logging
```js
const logger = require('pino)();
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