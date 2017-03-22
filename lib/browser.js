'use strict';

const EventEmitter = require('events').EventEmitter;

class Browser {
	constructor(bonjour, query, cacheTime) {
		this.cacheTime = (cacheTime || 1800) * 1000;

		this._events = new EventEmitter();
		this._services = {};

		const browser = this._browser = bonjour.find(query);
		browser._addService = this._addService.bind(this);
		browser._removeService = this._removeService.bind(this);

		this.start();
	}

	on(event, cb) {
		this._events.on(event, cb);
	}

	off(event, cb) {
		this._events.off(event, cb);
	}

	start() {
		if(this._searchHandle) return;

		this._searchHandle = setInterval(this._search.bind(this), this.cacheTime / 3);
		this._removeStaleHandle = setInterval(this._removeStale.bind(this), this.cacheTime);

		this._browser.start();
	}

	stop() {
		clearInterval(this._searchHandle);
		clearInterval(this._removeStaleHandle);

		this._searchHandle = null;
		this._removeStaleHandle = null;

		this._browser.stop();
	}

	_addService(service) {
		const added = ! this._services[service.fqdn];
		service.id = service.fqdn;

		this._services[service.fqdn] = service;
		service.lastSeen = Date.now();

		if(added) {
			this._events.emit('available', service);
		}
	}

	_removeService(name) {
		const service = this._services[name];
		if(! service) return;

		delete this._services[name];
		this._events.emit('unavailable', service);
	}

	_search() {
		this._browser.update();
	}

	_removeStale() {
		const staleTime = Date.now() - this.cacheTime;
		Object.keys(this._services).forEach(key => {
			const service = this._services[key];
			if(service.lastSeen < staleTime) {
				delete this._services[key];
				this._events.emit('unavailable', service);
			}
		})
	}
}

module.exports = Browser;
