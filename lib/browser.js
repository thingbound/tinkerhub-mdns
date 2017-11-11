'use strict';

const { TimedDiscovery, addService, removeService, search } = require('tinkerhub-discovery');

class Browser extends TimedDiscovery {
	constructor(bonjour, query, cacheTime) {
		super({
			maxStaleTime:(cacheTime || 1800) * 1000
		})

		const browser = this._browser = bonjour.find(query);
		browser._addService = this._addService.bind(this);
		browser._removeService = this._removeService.bind(this);

		this.start();
	}

	start() {
		super.start();

		this._browser.start();
	}

	stop() {
		super.stop();

		this._browser.stop();
	}

	_addService(service) {
		service.id = service.fqdn;
		this[addService](service);
	}

	_removeService(name) {
		this[removeService](name);
	}

	[search]() {
		this._browser.update();
	}
}

module.exports = Browser;
