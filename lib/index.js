'use strict';

const Manager = require('./manager');
const Browser = require('./browser');
const Publisher = require('./publisher');

const manager = new Manager();
const publisher = new Publisher(manager);

module.exports.browser = function(query, cacheTime) {
	return new Browser(manager, query, cacheTime);
};

module.exports.expose = function(def) {
	return publisher.register(def);
};
