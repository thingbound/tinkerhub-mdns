# mDNS browser

This library provides discovery of services using mDNS and DNS-SD also known
as Zeroconf/Bonjour.

To install:

```
npm install tinkerhub-mdns
```

Example:

```javascript
const browser = require('tinkerhub-mdns')
  .browser({
    type: 'miio',
    protocol: 'udp' // or tcp when omitted
  });

browser.on('available', d => console.log('available', d));
browser.on('unavailable', d => console.log('unavailable', d));

// Start discovering services
browser.start();

// Stop discovering services
browser.stop();
```

## Filtering and mapping services

It's possible to filter and map services found:

```javascript
// Filter and map services
const browser2 = browser.filter(service => /* return true to keep service */)
  .map(service => {
    // Change the identifier or anything else that is being tracked
    service.id = service.id + '-test';
    return service;
  });
```

## Exposing services

```javascript
const mdns = require('tinkerhub-mdns');

mdns.expose({
  name: 'unique-service-name',
  type: 'service-type',
  port: 9000
}).then(handle => {
	// handle.stop() stops exposing the service
});
```
