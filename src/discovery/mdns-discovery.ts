import { HostAndPort, BasicDiscovery } from 'tinkerhub-discovery';

import { stringify, parse } from 'multicast-dns-service-types';

import { MDNSService } from '../service';
import { Protocol } from '../protocol';

import { createMDNS, MDNS, MDNSResponse, PTRRecord, SRVRecord, ARecord, AAAARecord, TXTRecord } from '../manager';
import { ServiceData } from './service-data';
import { RecordHandle } from './record-handle';
import { RecordArray } from './record-array';

type RecordWithIP = ARecord | AAAARecord;

export interface MDNSDiscoveryOptions {
	type: string;

	protocol?: Protocol;
}

/**
 * Discovery that finds services exposed over Multicast DNS on the local
 * network.
 */
// TODO: Expose type, protocol and subtypes?
// TODO: Slight chance that address records get several listeners
export class MDNSDiscovery extends BasicDiscovery<MDNSService> {
	private readonly searchName: string;
	private readonly normalizedSearchName: string;

	private readonly mdns: MDNS;
	private readonly serviceData: Map<string, ServiceData>;

	private readonly searchInterval: any;
	private readonly queuedRefreshes: Set<string>;

	constructor(
		options: MDNSDiscoveryOptions
	) {
		super('mdns');

		this.serviceData = new Map();
		this.queuedRefreshes = new Set();

		this.searchName = stringify(options.type, options.protocol || 'tcp') + '.local';
		this.normalizedSearchName = normalizeName(this.searchName);

		this.mdns = createMDNS();
		this.mdns.onResponse(this.handleResponse.bind(this));

		this.searchInterval = setInterval(() => {
			this.debug('Searching for services');
			try {
				this.search();
			} catch(ex) {
				this.logAndEmitError(ex, 'Caught error during search');
			}
		}, 30 * 60 * 1000);

		this.search();
	}

	public destroy() {
		clearInterval(this.searchInterval);

		super.destroy();

		this.mdns.destroy();
	}

	protected search() {
		this.mdns.query(this.searchName, 'PTR');
	}

	private isMatching(PTR: PTRRecord) {
		const normalizedRecordName = normalizeName(PTR.name);
		return normalizedRecordName === this.normalizedSearchName;
	}

	private handleResponse(response: MDNSResponse) {
		for(const record of response.mergedRecords) {
			if(record instanceof PTRRecord && this.isMatching(record)) {
				/*
				* This PTR is what we're looking for. Next step is to
				* check if we already have it stored.
				*/
				if(this.queuedRefreshes.has(record.hostname)) {
					continue;
				}

				this.queuedRefreshes.add(record.hostname);
				setTimeout(() => this.refreshService(record.hostname), 1000);
			}
		}
	}

	private refreshService(name: string) {
		this.debug('Refreshing service', name);

		// Remove from the refresh queue
		this.queuedRefreshes.delete(name);

		let data = this.serviceData.get(name);
		const PTR = this.mdns.find(record => record instanceof PTRRecord && record.hostname === name) as PTRRecord;

		if(! data) {
			if(! PTR) {
				this.debug('Requested refresh of non-existent service', name, 'without an initial PTR record');
				return;
			}

			const refreshThis = () => {
				if(this.queuedRefreshes.has(name)) return;

				this.queuedRefreshes.add(name);
				setTimeout(() => this.refreshService(name), 1000);
			};

			data = {
				PTR: new RecordHandle(refreshThis),
				SRV: new RecordHandle(refreshThis),
				addressRecords: new RecordArray(refreshThis),
				txtRecords: new RecordArray(refreshThis)
			};

			data.PTR.record = PTR;

			// Store the service data for next refresh
			this.serviceData.set(name, data);
		} else if(PTR) {
			if(data.PTR.record !== PTR) {
				// The PTR record has changed
				this.debug('Updating', name, 'with new PTR');
				data.PTR.record = PTR;
			}
		} else {
			// PTR has expired
			this.debug('Removing', name, 'due to no PTR');
			this.invalidateService(name);
			return;
		}

		const SRV = this.mdns.find(record => record instanceof SRVRecord && record.name === name) as SRVRecord;
		if(SRV) {
			if(data.SRV.record !== SRV) {
				// This is a new SRV record - update our record
				this.debug('Updating', name, 'with new SRV');
				data.SRV.record = SRV;
			}
		} else {
			// No SRV - invalidate the service
			this.debug('Removing', name, 'due to no SRV');
			this.invalidateService(name);
			return;
		}

		// Collect all of the addresses the service can be reached at
		const port = SRV.port;
		const host = SRV.target;

		const records = this.mdns.findAll(record =>
			(record instanceof ARecord || record instanceof AAAARecord)
			&& record.name === host) as RecordWithIP[];
		data.addressRecords.items = records;

		if(records.length === 0) {
			this.debug('Removing', name, 'due to no addresses available');
			this.invalidateService(name);
			return;
		}

		const addresses = records
			.map(record => new HostAndPort(record.ip, port))
			.sort(HostAndPort.compare);

		// Map TXT records into data
		const txtData = new Map<string, string | boolean>();
		const binaryData: Buffer[] = [];

		const txtRecords = this.mdns.findAll(record => record instanceof TXTRecord && record.name === name) as TXTRecord[];

		for(const record of txtRecords) {
			for(const [ key, value ] of record.data.entries()) {
				txtData.set(key, value);
			}

			for(const buffer of record.binaryData) {
				binaryData.push(buffer);
			}
		}

		// Map the final service data and add/update service
		const service: MDNSService = {
			id: name,

			addresses: addresses,

			data: txtData,

			binaryData: binaryData
		};

		this.updateService(service);
	}

	private invalidateService(name: string) {
		this.removeService(name);
		this.serviceData.delete(name);
	}
}

function normalizeName(n: string) {
	return n ? n.toLowerCase() : n;
}
