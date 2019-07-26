import { TimerWheel, ActionHandle } from 'timer-wheel';
import multicastDns, { MulticastDNS, Answer } from 'multicast-dns';

import { MDNS } from './mdns';
import { MDNSResponse } from './response';
import { MDNSQuery } from './query';
import { Record, mapAnswer } from './records';

import debugFactory from 'debug';
const debug = debugFactory('th:mdns:manager');

interface RecordWithExpiration {
	record: Record;
	handle: ActionHandle;
}

/**
 * Basic manager for mDNS. Manages creation of the main instance that actually
 * listens for the mDNS broadcasts.
 */
export class Manager {
	private mdns?: MulticastDNS;
	private instances: MDNS[];

	private records: RecordWithExpiration[];
	private recordExpirer: TimerWheel;
	private recordExpirerInterval: any;

	constructor() {
		this.instances = [];

		this.records = [];
		this.recordExpirer = new TimerWheel();

		this.mapRecord = this.mapRecord.bind(this);
	}

	/**
	 * Remove a previously seen record.
	 *
	 * @param record
	 */
	private removeRecord(record: Record) {
		const idx = this.records.findIndex(item => item.record === record);
		if(idx >= 0) {
			this.records.splice(idx, 1);
			record.destroy();
			debug('REMOVED', record.type, record.name, ' total=', this.records.length);
		}
	}

	private mapRecord(answer: Answer): Record | null {
		if(answer.flush) {
			/*
			* Flush indicates that the cache should flush records with the
			* same type, class and name.
			*/
			let count = 0;

			this.records.forEach(item => {
				if(item.record.type === answer.type
					&& item.record.class === answer.class
					&& item.record.name === answer.name)
				{
					item.handle.remove();
					item.handle = this.scheduleRemoval(item.record, 0);

					count++;
				}
			});

			debug('FLUSH', answer.type, answer.class, answer.name, 'records=', count);
		}

		if(! answer.ttl) return null;

		const record = mapAnswer(answer);
		const previous = this.records.find(item => item.record.isEqual(record));
		if(previous) {
			// Already have a previous record with this data, refresh the TTL
			previous.handle.remove();
			previous.handle = this.scheduleRemoval(previous.record, answer.ttl);

			debug('REFRESH', answer.type, answer.class, answer.name, 'ttl=', answer.ttl, 'total=', this.records.length);

			return previous.record;
		}

		// Register the new record
		const handle = this.recordExpirer.schedule(() => this.removeRecord(record), answer.ttl * 1000);
		this.records.push({
			record: record,
			handle: handle
		});

		// Output some useful debug information
		debug('ADDED', answer.type, answer.class, answer.name, 'ttl=', answer.ttl, 'total=', this.records.length);

		return record;
	}

	private scheduleRemoval(record: Record, ttl: number) {
		return this.recordExpirer.schedule(() => this.removeRecord(record), ttl * 1000);
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

		this.recordExpirerInterval = setInterval(() => this.recordExpirer.advance(), 1000);
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
		this.recordExpirer.advance();

		for(const item of this.records) {
			if(predicate(item.record)) {
				return item.record;
			}
		}
	}

	public findAll(predicate: (record: Record) => boolean): Record[] {
		this.recordExpirer.advance();

		const result = [];

		for(const item of this.records) {
			if(predicate(item.record)) {
				result.push(item.record);
			}
		}

		return result;
	}
}
