import { SubscriptionHandle } from 'atvik';
import { Record } from '../manager';

/**
 * Helper class for keeping a handle to a record. Will subscribe/unsubscribe
 * the refresher function when the value changes.
 */
export class RecordHandle<T extends Record> {
	private refresher: () => void;
	private _record?: T;
	private handle?: SubscriptionHandle;

	constructor(refresher: () => void) {
		this.refresher = refresher;
	}

	get record(): T | null {
		return this._record || null;
	}

	set record(v: T | null) {
		if(this._record === v) return;

		if(this._record && this.handle) {
			this.handle.unsubscribe();
		}

		this._record = v || undefined;

		if(v) {
			this.handle = v.onExpire(this.refresher);
		}
	}
}

