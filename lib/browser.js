'use strict';

const { TimedDiscovery, addService, removeService, search } = require('tinkerhub-discovery');

const dnsServiceTypes = require('multicast-dns-service-types');
const dnsTxt = require('dns-txt')();

const manager = Symbol('manager');
const name = Symbol('name');
const normalizedSearch = Symbol('normalizedSearch');
const mdns = Symbol('mdns');
const handleResponse = Symbol('handleResponse');

class Browser extends TimedDiscovery {
	static get type() {
		return 'mdns';
	}

	constructor(manager0, query, cacheTime) {
		super({
			maxStaleTime:(cacheTime || 1800) * 1000
		});

		this[name] = dnsServiceTypes.stringify(query.type, query.protocol || 'tcp') + '.local';
		this[normalizedSearch] = normalizeName(this[name]);

		this[manager] = manager0;
		this[handleResponse] = this[handleResponse].bind(this)
	}

	start() {
		if(this.active) return;

		super.start();

		this[mdns] = this[manager].requestHandle();
		this[mdns].on('response', this[handleResponse]);
	}

	stop() {
		if(! this.active) return;

		super.stop();

		this[mdns].destroy();
	}

	[handleResponse](packet) {
		const services = new Map();

		const everything = packet.answers.concat(packet.additionals);

		/*
		* Go through answers and find all PTR records that match our
		* query.
		*/
		for(const answer of everything) {
			if(answer.type === 'PTR' && normalizeName(answer.name) === this[normalizedSearch]) {
				console.log('hi', everything);
				const id = normalizeName(answer.data);
				if(answer.ttl <= 0) {
					// This service is a goodbye, remove it
					this[removeService](id);
				} else {
					// This is either a new service or an update
					services.set(id, {
						id: id,
						addresses: []
					});
				}
			}
		}

		// If there are no matching services, skip rest of work
		if(services.size === 0) return;

		/*
		 * Go through all answers and build up service information.
		 */
		for(const answer of everything) {
			const id = normalizeName(answer.name);

			// Get the service or continue if no need to update
			const service = services.get(id);
			if(! service) continue;

			if(answer.type === 'SRV') {
				/*
				 * SRV record tells a bit more about the service, such as the
				 * host name and port.
				 */
				service.ttl = answer.ttl;
				service.host = answer.data.target;
				service.port = answer.data.port;

				// Parse the name and set the type and protocol
				const idx = answer.name.indexOf('.');
				const type = dnsServiceTypes.parse(answer.name.substring(idx+1));
				service.type = type.name;
				service.protocol = type.protocol;
				service.subtypes = type.subtypes;

				// TODO: Handling of priority and weight?
			} else if(answer.type === 'TXT') {
				service.txt = dnsTxt.decode(answer.data);
				service.rawTxt = answer.data;
			}
		}

		/*
		 * Go through all the answers and assign services with connectivity.
		 */
		for(const answer of everything) {
			if(answer.type !== 'A' && answer.type !== 'AAAA') continue;

			for(const service of services.values()) {
				if(normalizeName(service.host) == normalizeName(answer.name)) {
					// Host matches, store the address
					service.addresses.push(answer.data);
				}
			}
		}

		/*
		 * Add or update all of the found services.
		 */
		for(const service of services.values()) {
			if(service.addresses.length > 0) {
				this[addService](service);
			}
		}
	}

	[search]() {
		this[mdns].query(this[name], 'PTR');
	}
}

function normalizeName(n) {
	return n ? n.toLowerCase() : n;
}

module.exports = Browser;
