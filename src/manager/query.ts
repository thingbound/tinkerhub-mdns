import { Packet, Answer, Question } from 'multicast-dns';
import { AddressInfo } from 'dgram';

import { AbstractPacket } from './abstract-packet';
import { Record } from './records';

export class MDNSQuery extends AbstractPacket {
	public readonly questions: Question[];

	constructor(
		packet: Packet,
		rinfo: AddressInfo,
		mapper: (answer: Answer) => Record | null
	) {
		super(packet, rinfo, mapper);

		this.questions = packet.questions || [];
	}
}
