
declare module 'multicast-dns' {
	import { AddressInfo } from 'dgram';

	export default function create(options?: MulticastDNSOptions): MulticastDNS;

	export interface MulticastDNSOptions {
		multicast?: boolean;
		interface?: string;
		port?: number;
		ip?: string;
		ttl?: number;
		loopback?: boolean;
		reuseAddr?: boolean;
	}

	export interface MulticastDNS {
		on(event: 'error', listener: (err: Error) => void): void;
		on(event: 'query', listener: (packet: Packet, rinfo: AddressInfo) => void): void;
		on(event: 'response', listener: (packet: Packet, rinfo: AddressInfo) => void): void;

		query(packet: Packet): void;
		query(question: Question): void;
		query(name: string, type: string): void;
		respond(packet: Packet): void;
		respond(answer: Answer): void;

		destroy(): void;
	}

	export interface Packet {
		type?: 'query' | 'response';
		questions?: Question[];
		answers?: Answer[];
		additionals?: Answer[];
		authorities?: Answer[];
	}

	export interface Question {
		name: string;
		type: string;
		class: number;
	}

	export interface Answer {
		name?: string;
		type: string;
		class: string;
		ttl?: number;
		flush: boolean;
		data: any;
	}
}
