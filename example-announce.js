const discovery = require('./lib');

discovery.expose({
	name: 'test1',
	type: 'test',
	protocol: 'udp',
	port: 8010
}).then(() => console.log('service is now exposed done'));
