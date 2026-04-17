import dgram, { RemoteInfo } from 'node:dgram';
import { lookup } from 'node:dns/promises';

const START_TIME = Date.now();
const DEFAULT_BEDROCK_PORT = 19132;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RESEND_INTERVAL_MS = 400;

const RAKNET = {
	MAGIC: '00ffff00fefefefefdfdfdfd12345678',
	UNCONNECTED_PING: 0x01,
	UNCONNECTED_PONG: 0x1c
};

const QUERY = {
	STATISTIC: 0x00,
	HANDSHAKE: 0x09,
	MAGIC: 0xfefd,
	KEYVAL_END: 1
};

export interface BedrockPingOptions {
	port?: number;
	timeoutMs?: number;
	resendIntervalMs?: number;
}

export interface BedrockPingResult {
	advertise: string;
	serverId: string;
	pingId: string;
	game: string;
	version: string;
	name: string;
	cleanName: string;
	currentPlayers?: number;
	maxPlayers?: number;
	latencyMs: number;
	rinfo: RemoteInfo;
	connected: true;
}

export interface BedrockQueryOptions {
	port?: number;
	timeoutMs?: number;
}

export interface BedrockQueryResult {
	hostname?: string;
	gametype?: string;
	game?: string;
	version?: string;
	serverEngine?: string;
	plugins?: string;
	map?: string;
	currentPlayers?: number;
	maxPlayers?: number;
	whitelist?: boolean;
	hostIp?: string;
	hostPort?: string;
	players: string[];
	latencyMs: number;
	ackId: number;
	rinfo: RemoteInfo;
	connected: true;
}

const RAKNET_MAGIC_BUFFER = Buffer.from(RAKNET.MAGIC, 'hex');

function isIPv4(host: string): boolean {
	const blocks = host.split('.');
	return (
		blocks.length === 4 &&
		blocks.every((block) => {
			const num = Number(block);
			return Number.isInteger(num) && num >= 0 && num <= 255;
		})
	);
}

async function resolveHost(host: string): Promise<string> {
	if (isIPv4(host)) return host;
	const result = await lookup(host, { family: 4 });
	return result.address;
}

function buildUnconnectedPing(pingId: bigint): Buffer {
	const buf = Buffer.alloc(1 + 8 + RAKNET_MAGIC_BUFFER.length + 8);
	let offset = 0;
	buf.writeUInt8(RAKNET.UNCONNECTED_PING, offset);
	offset += 1;
	buf.writeBigInt64BE(pingId, offset);
	offset += 8;
	RAKNET_MAGIC_BUFFER.copy(buf, offset);
	offset += RAKNET_MAGIC_BUFFER.length;
	buf.writeBigInt64BE(0n, offset);
	return buf;
}

function parseAdvertise(advertise: string) {
	const parts = advertise.split(/;/g);
	const game = parts[0] ?? '';
	const name = parts[1] ?? '';
	const version = parts[3] ?? '';
	const currentPlayers = parts[4] ? Number(parts[4]) : undefined;
	const maxPlayers = parts[5] ? Number(parts[5]) : undefined;
	return {
		game,
		name,
		cleanName: name.replace(/\xA7[0-9A-FK-OR]/gi, ''),
		version,
		currentPlayers: Number.isFinite(currentPlayers) ? currentPlayers : undefined,
		maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : undefined
	};
}

function parseUnconnectedPong(msg: Buffer, rinfo: RemoteInfo, startedAt: number): BedrockPingResult {
	if (msg.length < 35) {
		throw new Error('Packet too small');
	}
	const id = msg.readUInt8(0);
	if (id !== RAKNET.UNCONNECTED_PONG) {
		throw new Error('Unexpected packet type');
	}
	const pingId = msg.readBigInt64BE(1);
	const serverId = msg.readBigInt64BE(9);
	const nameLengthOffset = 1 + 8 + 8 + RAKNET_MAGIC_BUFFER.length;
	if (msg.length < nameLengthOffset + 2) {
		throw new Error('Missing advertise length');
	}
	const nameLength = msg.readUInt16BE(nameLengthOffset);
	const nameStart = nameLengthOffset + 2;
	if (msg.length < nameStart + nameLength) {
		throw new Error('Incomplete advertise payload');
	}
	const advertise = msg.toString('utf8', nameStart, nameStart + nameLength);
	const parsed = parseAdvertise(advertise);

	return {
		advertise,
		serverId: serverId.toString(),
		pingId: pingId.toString(),
		...parsed,
		latencyMs: Math.max(0, Date.now() - startedAt),
		rinfo,
		connected: true
	};
}

function buildChallengePacket(): Buffer {
	const buf = Buffer.alloc(2 + 1 + 4);
	buf.writeUInt16BE(QUERY.MAGIC, 0);
	buf.writeUInt8(QUERY.HANDSHAKE, 2);
	buf.writeInt32BE(1, 3);
	return buf;
}

function parseChallengeResponse(buf: Buffer): number {
	if (buf.length < 5) {
		throw new Error('Challenge response too small');
	}
	const challengeTokenStr = buf.toString('ascii', 5).replace(/\0.*$/, '');
	const challengeToken = Number.parseInt(challengeTokenStr, 10);
	if (!Number.isFinite(challengeToken)) {
		throw new Error('Invalid challenge token');
	}
	return challengeToken;
}

function buildStatRequest(challengeToken: number): Buffer {
	const buf = Buffer.alloc(2 + 1 + 4 + 4 + 4);
	buf.writeUInt16BE(QUERY.MAGIC, 0);
	buf.writeUInt8(QUERY.STATISTIC, 2);
	buf.writeInt32BE(1, 3);
	buf.writeInt32BE(challengeToken, 7);
	buf.writeInt32BE(0, 11);
	return buf;
}

function peekUint16BE(buf: Buffer, offset: number): number {
	if (offset + 2 > buf.length) return 0;
	return buf.readUInt16BE(offset);
}

function readCString(buf: Buffer, cursor: { value: number }): string {
	if (cursor.value >= buf.length) return '';
	const end = buf.indexOf(0x00, cursor.value);
	if (end === -1) {
		const value = buf.toString('utf8', cursor.value);
		cursor.value = buf.length;
		return value;
	}
	const value = buf.toString('utf8', cursor.value, end);
	cursor.value = end + 1;
	return value;
}

function parseStatResponse(buf: Buffer, rinfo: RemoteInfo, startedAt: number): BedrockQueryResult {
	const cursor = { value: 16 };
	const data: Record<string, string> = {};

	while (peekUint16BE(buf, cursor.value) !== QUERY.KEYVAL_END && cursor.value < buf.length) {
		const key = readCString(buf, cursor);
		const value = readCString(buf, cursor);
		if (key) data[key] = value;
	}

	// Skip padding between key/values and player list
	cursor.value += 11;

	const players: string[] = [];
	let player = readCString(buf, cursor);
	while (player.length > 0) {
		players.push(player);
		player = readCString(buf, cursor);
	}

	const toNumber = (val?: string): number | undefined => {
		if (typeof val === 'undefined') return undefined;
		const num = Number(val);
		return Number.isFinite(num) ? num : undefined;
	};

	return {
		hostname: data.hostname,
		gametype: data.gametype,
		game: data.gameId ?? data.game_id ?? data.game,
		version: data.version,
		serverEngine: data.server_engine ?? data.serverEngine,
		plugins: data.plugins,
		map: data.map,
		currentPlayers: toNumber(data.numplayers),
		maxPlayers: toNumber(data.maxplayers),
		whitelist: data.whitelist === 'on',
		hostIp: data.hostip,
		hostPort: data.hostport,
		players,
		latencyMs: Math.max(0, Date.now() - startedAt),
		ackId: Math.max(0, Date.now() - START_TIME),
		rinfo,
		connected: true
	};
}

export async function bedrockPing(host: string, options: BedrockPingOptions = {}): Promise<BedrockPingResult> {
	const port = options.port ?? DEFAULT_BEDROCK_PORT;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const resendIntervalMs = options.resendIntervalMs ?? DEFAULT_RESEND_INTERVAL_MS;
	const targetHost = await resolveHost(host);

	return await new Promise<BedrockPingResult>((resolve, reject) => {
		const socket = dgram.createSocket('udp4');
		let closed = false;
		const startedAt = Date.now();
		const packet = buildUnconnectedPing(BigInt(Date.now() - START_TIME));

		const cleanup = (err?: Error) => {
			if (closed) return;
			closed = true;
			clearInterval(intervalId);
			clearTimeout(timeoutId);
			socket.removeAllListeners();
			socket.close();
			if (err) {
				reject(err);
			}
		};

		const sendPing = () => {
			socket.send(packet, port, targetHost, (err) => {
				if (err) cleanup(err);
			});
		};

		const intervalId = setInterval(sendPing, resendIntervalMs);
		const timeoutId = setTimeout(() => cleanup(new Error('Ping session timed out.')), timeoutMs);

		socket.on('message', (msg, rinfo) => {
			try {
				const parsed = parseUnconnectedPong(msg, rinfo, startedAt);
				cleanup();
				resolve(parsed);
			} catch {
				// Ignore unexpected packets
			}
		});

		socket.on('error', (err) => cleanup(err));

		sendPing();
	});
}

export async function bedrockQuery(host: string, options: BedrockQueryOptions = {}): Promise<BedrockQueryResult> {
	const port = options.port ?? DEFAULT_BEDROCK_PORT;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const targetHost = await resolveHost(host);

	return await new Promise<BedrockQueryResult>((resolve, reject) => {
		const socket = dgram.createSocket('udp4');
		let closed = false;
		const startedAt = Date.now();

		const cleanup = (err?: Error) => {
			if (closed) return;
			closed = true;
			clearTimeout(timeoutId);
			socket.removeAllListeners();
			socket.close();
			if (err) reject(err);
		};

		const timeoutId = setTimeout(() => cleanup(new Error('Query session timed out.')), timeoutMs);

		socket.on('message', (msg, rinfo) => {
			const type = msg.readUInt8(0);
			if (type === QUERY.HANDSHAKE) {
				try {
					const token = parseChallengeResponse(msg);
					const statPacket = buildStatRequest(token);
					socket.send(statPacket, port, targetHost);
				} catch (err) {
					cleanup(err as Error);
				}
			} else if (type === QUERY.STATISTIC) {
				try {
					const result = parseStatResponse(msg, rinfo, startedAt);
					cleanup();
					resolve(result);
				} catch (err) {
					cleanup(err as Error);
				}
			}
		});

		socket.on('error', (err) => cleanup(err));

		const challengePacket = buildChallengePacket();
		socket.send(challengePacket, port, targetHost);
	});
}
