import { Packet, Answer } from 'multicast-dns';
import { AddressInfo } from 'dgram';

import { Record } from './records';

export class AbstractPacket {
	private packet: Packet;
	private rinfo: AddressInfo;
	private mapper: (answer: Answer) => Record | null;

	public readonly answers: Record[];
	public readonly additionals: Record[];

	constructor(
		packet: Packet,
		rinfo: AddressInfo,
		mapper: (answer: Answer) => Record | null
	) {
		this.packet = packet;
		this.rinfo = rinfo;
		this.mapper = mapper;

		this.answers = [];
		if(packet.answers) {
			for(const a of packet.answers) {
				const record = mapper(a);
				if(record) {
					this.answers.push(record);
				}
			}
		}

		this.additionals = [];
		if(packet.additionals) {
			for(const a of packet.additionals) {
				const record = mapper(a);
				if(record) {
					this.additionals.push(record);
				}
			}
		}
	}

	get mergedRecords(): Record[] {
		return [ ...this.answers, ...this.additionals ];
	}
}
