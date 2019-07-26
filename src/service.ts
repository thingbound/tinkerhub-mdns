import { MultiAddressService } from 'tinkerhub-discovery';

export interface MDNSService extends MultiAddressService {
	data: Map<string, string | boolean>;

	binaryData: Buffer[];
}
