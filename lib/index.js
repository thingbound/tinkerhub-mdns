'use strict';

const bonjour = require('bonjour');
const Browser = require('./browser');

let instance;
function getInstance() {
	if(instance) return instance;
	return instance = bonjour();
}

module.exports.browser = function(query, cacheTime) {
	return new Browser(getInstance(), query, cacheTime);
};

module.exports.expose = function(def) {
	const service = getInstance().publish(def);
	return {
		stop: function() {
			service.stop();
		}
	};
};
