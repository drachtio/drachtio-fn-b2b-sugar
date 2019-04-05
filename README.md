# drachtio-fn-b2b-sugar

Various utility functions that build on [drachtio-srf B2BUA](https://drachtio.org/api#srf-create-b2bua).

### simring

A forking outdial B2BUA that connects the caller to the first answer.  Method signature is similar to [createB2BUA](https://drachtio.org/api#srf-create-b2bua), except that an array of sip URIs are provided instead of a single URI, and also the method returns a Promise but does not support callback usage.

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