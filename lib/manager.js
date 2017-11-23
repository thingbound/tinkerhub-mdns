'use strict';

const multicastDns = require('multicast-dns');

/**
 * Basic manager for
 */
module.exports = class Manager {
	constructor() {
		this.handles = 0;
	}

	requestHandle() {
		if(this.handles === 0) {
			this.mdns = multicastDns();
			this.handles++;
		}

		return new Handle(this, this.mdns);
	}

	unref() {
		this.handles--;
		if(this.handles === 0) {
			this.mdns.destroy();
		}
	}
};

class Handle {
	constructor(parent, mdns) {
		this.parent = parent;
		this.mdns = mdns;
		this.listeners = [];
	}

	on(event, listener) {
		this.listeners.push(listener);
		this.mdns.on(event, listener);
	}

	query(...args) {
		this.mdns.query(...args);
	}

	respond(...args) {
		this.mdns.respond(...args);
	}

	destroy() {
		if(this.destroyed) return;

		this.destroyed = true;
		this.parent.unref(this);
	}
}
