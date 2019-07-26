import { RecordHandle } from './record-handle';
import { RecordArray } from './record-array';
import { PTRRecord, SRVRecord, ARecord, AAAARecord, TXTRecord } from '../manager';

/**
 * Data associated with a service. Used by the discovery to create the
 * MDNSService.
 */
export interface ServiceData {
	/**
	 * The original pointer for the service.
	 */
	PTR: RecordHandle<PTRRecord>;

	/**
	 * The SRV record containing more details
	 */
	SRV: RecordHandle<SRVRecord>;

	/**
	 * A and AAAA records.
	 */
	addressRecords: RecordArray<ARecord | AAAARecord>;

	/**
	 * TXT records.
	 */
	txtRecords: RecordArray<TXTRecord>;
}
