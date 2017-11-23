const browser = require('./lib').browser({
	type: 'test',
	protocol: 'udp'
});

browser.on('available', d => console.log('available', d));
browser.on('unavailable', d => console.log('unavailable', d));

browser.start();
