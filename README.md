# mDNS browser

This library provides discovery of devices using mDNS and DNS-SD.

```javascript
const browser = require('tinkerhub-mdns')
	.browser({
		type: 'miio',
		protocol: 'udp'
	});

browser.on('available', d => console.log('available', d));
browser.on('unavailable', d => console.log('unavailable', d));
```
