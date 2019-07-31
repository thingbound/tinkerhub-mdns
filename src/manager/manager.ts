import { ReschedulingTimerWheel } from 'timer-wheel';
import multicastDns, { MulticastDNS, Answer } from 'multicast-dns';

import { MDNS } from './mdns';
import { MDNSResponse } from './response';
import { MDNSQuery } from './query';
import { Record, mapAnswer } from './records';

import debugFactory from 'debug';
const debug = debugFactory('th:mdns:manager');

/**
 * Basic manager for mDNS. Manages creation of the main instance that actually
 * listens for the mDNS broadcasts.
 */
export class Manager {
	private mdns?: MulticastDNS;
	private instances: MDNS[];

	private records: Record[];
	private recordExpirer: ReschedulingTimerWheel<Record>;
	private recordExpirerInterval: any;

	constructor() {
		this.instances = [];

		this.records = [];
		this.recordExpirer = new ReschedulingTimerWheel();

		this.mapRecord = this.mapRecord.bind(this);
	}

	/**
	 * Remove a previously seen record.
	 *
	 * @param record
	 */
	private removeRecord(record: Record) {
		const idx = this.records.findIndex(item => item === record);
		if(idx >= 0) {
			this.recordExpirer.unschedule(record);
			this.records.splice(idx, 1);
			record.destroy();
			debug('REMOVED', record.type, record.name, ' total=', this.records.length);
		}
	}

	private mapRecord(answer: Answer): Record | null {
		if(answer.flush) {
			/*
			* Flush indicates that the cache should flush records with the
			* same type, class and name that are older than a second.
			*/
			let count = 0;

			const oneSecondAgo = Date.now() - 1000;
			for(const item of this.records) {
				if(item.type === answer.type
					&& item.class === answer.class
					&& item.name === answer.name
					&& item.lastRefresh < oneSecondAgo)
				{
					this.scheduleRemoval(item, 0);

					count++;
				}
			}

			debug('FLUSH', answer.type, answer.class, answer.name, 'records=', count);
		}

		if(typeof answer.ttl !== 'number') return null;

		const record = mapAnswer(answer);
		const previous = this.records.find(item => item.isEqual(record));
		if(previous) {
			// Already have a previous record with this data, refresh the TTL
			previous.refresh(answer.ttl);
			this.scheduleRemoval(previous, answer.ttl);

			debug('REFRESH', answer.type, answer.class, answer.name, 'ttl=', answer.ttl, 'total=', this.records.length);

			return previous;
		}

		// Register the new record
		this.records.push(record);
		this.scheduleRemoval(record, answer.ttl);

		// Output some useful debug information
		debug('ADDED', answer.type, answer.class, answer.name, 'ttl=', answer.ttl, 'total=', this.records.length);

		return record;
	}

	private scheduleRemoval(record: Record, ttl: number) {
		return this.recordExpirer.schedule(record, ttl * 1000);
	}

	private advanceAndExpire() {
		for(const expired of this.recordExpirer.advance()) {
			this.removeRecord(expired);
		}
	}

	private createMulticastDNS() {
		this.mdns = multicastDns();
		this.mdns.on('error', err => {
			for(const instance of this.instances) {
				instance.receiveError(err);
			}
		});
		this.mdns.on('response', (packet, rinfo) => {
			const response = new MDNSResponse(packet, rinfo, this.mapRecord);
			for(const instance of this.instances) {
				instance.receiveResponse(response);
			}
		});
		this.mdns.on('query', (packet, rinfo) => {
			const query = new MDNSQuery(packet, rinfo, this.mapRecord);
			for(const instance of this.instances) {
				instance.receiveQuery(query);
			}
		});

		this.recordExpirerInterval = setInterval(() => this.advanceAndExpire(), 1000);
	}

	public requestHandle(): MDNS {
		if(this.instances.length === 0) {
			this.createMulticastDNS();
		}

		const result = new MDNS(this);
		this.instances.push(result);
		return result;
	}

	public release(instance: MDNS) {
		const idx = this.instances.indexOf(instance);
		if(idx < 0) return;

		this.instances.splice(idx, 1);
		if(this.instances.length === 0 && this.mdns) {
			this.mdns.destroy();
			this.mdns = undefined;

			clearInterval(this.recordExpirerInterval);
		}
	}

	public query(name: string, type: string) {
		if(! this.mdns) {
			throw new Error('No mDNS instance available');
		}

		this.mdns.query(name, type);
	}

	public find(predicate: (record: Record) => boolean): Record | undefined {
		this.advanceAndExpire();

		for(const item of this.records) {
			if(predicate(item)) {
				return item;
			}
		}
	}

	public findAll(predicate: (record: Record) => boolean): Record[] {
		this.advanceAndExpire();

		const result = [];

		for(const item of this.records) {
			if(predicate(item)) {
				result.push(item);
			}
		}

		return result;
	}
}
