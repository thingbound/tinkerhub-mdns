'use strict';

const debug = require('debug')('th:discovery:mdns:publisher');
const os = require('os');
const dnsServiceTypes = require('multicast-dns-service-types');
const dnsTxt = require('dns-txt')();

module.exports = class Publisher {
	constructor(manager) {
		this.manager = manager;
		this.services = new Set();
	}

	register(def) {
		const service = new Service(this, def);

		this.services.add(service);
		if(this.services.size === 1) {
			this.start();
		}

		// Announce this service
		const self = this;
		return service.announce()
			.then(() => ({
				stop() {
					service.stop();
					self.services.remove(service);
					if(self.services.size === 0) {
						self.stop();
					}
				}
			}));
	}

	start() {
		this.handle = this.manager.requestHandle();
		this.handle.on('query', this.handleQuery.bind(this));
	}

	stop() {
		for(const service of this.services) {
			service.stop();
		}

		this.handle.destroy();
	}

	handleQuery(query) {
		/*
		 * Go through each question in the query and build up answers.
		 */
		const answers = [];
		let needsInterfaceRecords = false;

		for(const question of query.questions) {
			/*
			 * Check the type of question this is.
			 */
			switch(question.type) {
				case 'ANY':
					this.handleQueryAny(answers);
					break;
				case 'PTR':
					if(question.name === '_services._dns-sd._udp.local') {
						this.handleQueryAny(answers);
					} else {
						needsInterfaceRecords = true;
						this.handleQueryPTR(question, answers);
					}
					break;
			}
		}

		if(answers.length === 0) return;

		const additionals = [];
		if(needsInterfaceRecords) {
			generateInterfaceRecords(additionals);
		}

		this.handle.respond({
			answers: answers,
			additionals: additionals
		}, err => {
			if(err) debug('Error occurred during query answer;', err);
		});
	}

	handleQueryAny(answers) {
		for(const service of this.services) {
			if(answers.find(answer => answer.data === service.id)) continue;

			answers.push({
				name: '_services._dns-sd._udp.local',
				type: 'PTR',
				ttl: 28880, // TODO: What is the correct PTR value?
				data: service.id
			});
		}
	}

	handleQueryPTR(q, answers) {
		const name = q.name.toLowerCase();
		for(const service of this.services) {
			// Check that is the correct type of service
			if(service.type.toLowerCase() !== name) continue;

			// Check that its not already included in the answers
			if(answers.find(answer => answer.data === service.id)) continue;

			answers.push(service.ptrRecord());
			answers.push(service.srvRecord());
			answers.push(service.txtRecord());
		}
	}
}

function generateInterfaceRecords(result) {
	// Collect A and AAAA by going through network interfaces
	const host = os.hostname();
	const ifs = os.networkInterfaces();
	for(const key of Object.keys(ifs)) {
		for(const address of ifs[key]) {
			if(address.internal) continue;

			switch(address.family) {
				case 'IPv4':
					result.push({
						name: host,
						type: 'A',
						ttl: 120,
						data: address.address
					});
					break;
				case 'IPv6':
					result.push({
						name: host,
						type: 'AAAA',
						ttl: 120,
						data: address.address
					});
					break;
			}
		}
	}
}

/**
 * Representation of a published service. Used to keep track of the service
 * and to create records.
 */
class Service {
	constructor(parent, def) {
		if(! def.name) throw new Error('name is required');
		if(! def.type) throw new Error('type is required');
		if(! def.port) throw new Error('port is required');

		this.parent = parent;

		this.name = def.name;

		this.port = def.port;

		this.type = dnsServiceTypes.stringify(def.type, def.protocol || 'tcp') + '.local';

		this.id = def.name + '.' + this.type;

		this.txt = def.txt || null;
	}

	/**
	 * Announce this service over the network.
	 */
	announce() {
		return new Promise((resolve) => {
			this.parent.handle.respond(this.records, () => {
				// TODO: Schedule repeat announcements

				resolve();
			});
		});
	}

	stop() {
		return new Promise((resolve, reject) => {
			this.parent.handle.respond([ this.ptrRecord(0) ], err => {
				if(err) {
					reject(err);
					return;
				}

				resolve();
			});
		});
	}

	get records() {
		// Always send PTR, SRV and TXT
		const result = [
			this.ptrRecord(),
			this.srvRecord(),
			this.txtRecord()
		];

		generateInterfaceRecords(result);

		return result;
	}

	ptrRecord(ttl=28800) {
		return {
			name: this.type,
			type: 'PTR',
			ttl: ttl,
			data: this.id
		};
	}

	srvRecord() {
		return {
			name: this.id,
			type: 'SRV',
			ttl: 120,
			data: {
				port: this.port,
				target: os.hostname()
			}
		};
	}

	txtRecord() {
		return {
			name: this.id,
			type: 'TXT',
			ttl: 4500,
			data: dnsTxt.encode(this.txt)
		};
	}
}
