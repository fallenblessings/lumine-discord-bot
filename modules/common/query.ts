import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js';
import { bedrockPing, BedrockPingResult } from '../../core/lib/bedrock-ping';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');

class Query extends Base {
	constructor() {
		super('common_query', 'Query Minecraft server status (Java/Bedrock)');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('bedrock_ping')
				.setDescription('Ping a Bedrock server directly (UDP)')
                .setIntegrationTypes([0, 1])
                .setContexts([0, 1, 2])
				.addStringOption(opt =>
					opt.setName('address')
						.setDescription('Server IP or hostname')
						.setRequired(true))
				.addIntegerOption(opt =>
					opt.setName('port')
						.setDescription('Server port (default 19132)')
						.setRequired(false)),
			execute: this.executeBedrockPing.bind(this)
		});

		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('query_bedrock')
				.setDescription('Query a Bedrock server status')
                .setIntegrationTypes([0, 1])
                .setContexts([0, 1, 2])
				.addStringOption(opt =>
					opt.setName('address')
						.setDescription('Server IP or hostname')
						.setRequired(true))
				.addIntegerOption(opt =>
					opt.setName('port')
						.setDescription('Server port (default 19132)')
						.setRequired(false))
				.addBooleanOption(opt =>
					opt.setName('details')
						.setDescription('Show full details')
						.setRequired(false)),
			execute: this.executeQueryBedrock.bind(this)
		});

		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('query_java')
				.setDescription('Query a Java server status')
                .setIntegrationTypes([0, 1])
                .setContexts([0, 1, 2])
				.addStringOption(opt =>
					opt.setName('address')
						.setDescription('Server IP or hostname')
						.setRequired(true))
				.addIntegerOption(opt =>
					opt.setName('port')
						.setDescription('Server port (default 25565)')
						.setRequired(false))
				.addBooleanOption(opt =>
					opt.setName('details')
						.setDescription('Show full details')
						.setRequired(false)),
			execute: this.executeQueryJava.bind(this)
		});
	}

	async fetchServer(endpoint: string): Promise<any> {
		const headers = { 'User-Agent': 'LumineBot/1.0 (discord bot query)' };
		const res = await fetch(endpoint, { headers });
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new Error(`Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
		}
		return await res.json();
	}

    formatStatusEmbed(title: string, ip: string, data: any, platform: string, wantDetails: boolean = false): EmbedBuilder {
        const online = data.online === true;
        const color = EMBED_COLOR_PRIMARY;
		const embed = new EmbedBuilder()
			.setTitle(title)
			.setColor(color)
			.setTimestamp();

        // Put MOTD as the first line (description) if available
        if (online && data.motd && data.motd.clean && data.motd.clean.length > 0) {
			const motdTop = data.motd.clean.join(' ').slice(0, 256);
			embed.setDescription(motdTop);
		}

        embed.addFields({ name: 'Address', value: ip, inline: true });
		if (online) {
			if (data.ip) embed.addFields({ name: 'Direct address', value: String(data.ip), inline: true });
			if (typeof data.port !== 'undefined') embed.addFields({ name: 'Port', value: String(data.port), inline: true });
            if (data.hostname) embed.addFields({ name: 'Hostname', value: String(data.hostname), inline: true });
            if (data.version) embed.addFields({ name: 'Version', value: typeof data.version === 'string' ? data.version : (data.version.name || String(data.version)), inline: true });
			if (data.players && typeof data.players.online === 'number') {
				embed.addFields({ name: 'Players', value: `${data.players.online}/${data.players.max ?? '?'}`, inline: true });
			}
			if (data.gamemode && platform === 'bedrock') embed.addFields({ name: 'Gamemode', value: String(data.gamemode), inline: true });
			if (data.software) embed.addFields({ name: 'Software', value: String(data.software), inline: true });
			if (data.map && data.map.clean) embed.addFields({ name: 'Map', value: String(data.map.clean), inline: true });
            if (wantDetails) {
                const addChunkedField = (fieldName: string, fullText: string) => {
                    if (!fullText) return;
                    const max = 1024;
                    let idx = 0;
                    while (idx < fullText.length) {
                        const slice = fullText.slice(idx, idx + max);
                        embed.addFields({ name: idx === 0 ? fieldName : `${fieldName} (cont.)`, value: slice, inline: false });
                        idx += max;
                    }
                };
                if (data.motd) {
                    if (Array.isArray(data.motd.raw) && data.motd.raw.length > 0) {
                        addChunkedField('MOTD (raw)', data.motd.raw.join('\n'));
                    }
                    if (Array.isArray(data.motd.html) && data.motd.html.length > 0) {
                        addChunkedField('MOTD (html)', data.motd.html.join('\n'));
                    }
                }
                if (data.players && Array.isArray(data.players.list) && data.players.list.length > 0) {
                    const names = data.players.list
                        .map((p: any) => {
                            if (!p) return '';
                            const n = p.name ?? '';
                            const u = p.uuid ? ` (${p.uuid})` : '';
                            return `${n}${u}`;
                        })
                        .filter(Boolean)
                        .join('\n');
                    addChunkedField(`Players (${data.players.list.length})`, names || '—');
                }
                if (data.protocol && (data.protocol.name || data.protocol.version)) {
                    const proto = `${data.protocol.name ?? ''}${data.protocol.name && data.protocol.version ? ' • ' : ''}${data.protocol.version ?? ''}` || String(data.protocol);
                    embed.addFields({ name: 'Protocol', value: proto, inline: true });
                }
            
                if (typeof data.eula_blocked !== 'undefined') {
                    embed.addFields({ name: 'EULA blocked', value: String(data.eula_blocked), inline: true });
                }
                if (Array.isArray(data.plugins) && data.plugins.length > 0) {
                    const list = data.plugins
                        .map((p: any) => p && p.name ? `${p.name}${p.version ? ` ${p.version}` : ''}` : String(p))
                        .join('\n');
                    addChunkedField(`Plugins (${data.plugins.length})`, list || '—');
                }
                if (Array.isArray(data.mods) && data.mods.length > 0) {
                    const list = data.mods
                        .map((m: any) => m && m.name ? `${m.name}${m.version ? ` ${m.version}` : ''}` : String(m))
                        .join('\n');
                    addChunkedField(`Mods (${data.mods.length})`, list || '—');
                }
                if (data.map) {
                    if (data.map.raw) embed.addFields({ name: 'Map (raw)', value: String(data.map.raw), inline: true });
                    if (data.map.html) addChunkedField('Map (html)', String(data.map.html));
                }
                if (data.serverid) embed.addFields({ name: 'Server ID', value: String(data.serverid), inline: true });
                if (data.info && Array.isArray(data.info.clean) && data.info.clean.length > 0) {
                    const info = data.info.clean.join('\n');
                    addChunkedField('Info', info);
                }
                if (data.debug) {
                    const dbg = data.debug;
                    const onOff = (v: boolean) => (v ? 'on' : 'off');
                    const transport = [
                        typeof dbg.ping === 'boolean' ? `ping:${onOff(dbg.ping)}` : '',
                        typeof dbg.query === 'boolean' ? `query:${onOff(dbg.query)}` : '',
                        typeof dbg.srv === 'boolean' ? `srv:${onOff(dbg.srv)}` : '',
                        typeof dbg.bedrock === 'boolean' ? `bedrock:${onOff(dbg.bedrock)}` : ''
                    ].filter(Boolean).join(' • ');
                    const dns = [
                        typeof dbg.ipinsrv === 'boolean' ? `ipinsrv:${onOff(dbg.ipinsrv)}` : '',
                        typeof dbg.cnameinsrv === 'boolean' ? `cnameinsrv:${onOff(dbg.cnameinsrv)}` : ''
                    ].filter(Boolean).join(' • ');
                    const misc = [
                        typeof dbg.querymismatch === 'boolean' ? `querymismatch:${onOff(dbg.querymismatch)}` : '',
                        typeof dbg.animatedmotd === 'boolean' ? `animatedmotd:${onOff(dbg.animatedmotd)}` : ''
                    ].filter(Boolean).join(' • ');
                    const cacheLine = `cache:${dbg.cachehit ? 'hit' : 'miss'} • apiver:${dbg.apiversion}`;
                    const lines = [];
                    if (transport) lines.push(`Transport: ${transport}`);
                    if (dns) lines.push(`DNS: ${dns}`);
                    if (misc) lines.push(`Misc: ${misc}`);
                    lines.push(`Cache: ${cacheLine.replace(/^cache:/, '')}`);
                    embed.addFields({ name: 'Debug', value: lines.join('\n'), inline: false });
                    if (dbg.cachetime || dbg.cacheexpire) {
                        embed.addFields({ name: 'Cache Window', value: `${dbg.cachetime ?? ''} → ${dbg.cacheexpire ?? ''}`.trim(), inline: false });
                    }
                }
            }
		} else {
			embed.setDescription('Server appears to be offline.');
		}
		return embed;
	}

	buildAddress(ip: string, port: number | null): string {
		if (port && Number(port) > 0) return `${ip}:${port}`;
		return ip;
	}

    buildBedrockEmbed(address: string, payload: BedrockPingResult): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle('Bedrock Ping (UDP)')
            .setColor(EMBED_COLOR_PRIMARY)
            .setTimestamp();

        const motd = payload.cleanName || payload.name;
        if (motd) {
            embed.setDescription(motd.slice(0, 256));
        }

        const latency = Math.round(payload.latencyMs);
        const playersLine =
            typeof payload.currentPlayers === 'number'
                ? `${payload.currentPlayers}/${payload.maxPlayers ?? '?'}`
                : '—';

        embed.addFields(
            { name: 'Status', value: 'Online', inline: true },
            { name: 'Latency', value: `${latency} ms`, inline: true },
            { name: 'Players', value: playersLine, inline: true },
            { name: 'Game', value: payload.game || 'Unknown', inline: true },
            { name: 'Version', value: payload.version || 'Unknown', inline: true },
            { name: 'Address', value: address, inline: true }
        );

        if (payload.serverId) {
            embed.addFields({ name: 'Server ID', value: payload.serverId, inline: false });
        }

        return embed;
    }

    async executeBedrockPing(interaction: ChatInputCommandInteraction): Promise<void> {
		const ip = interaction.options.getString('address')!;
		const port = interaction.options.getInteger('port') ?? 19132;
		const address = this.buildAddress(ip, port);
        const alreadyResponded = interaction.deferred || interaction.replied;
        if (!alreadyResponded) {
            await interaction.deferReply();
        }

        try {
            const data = await bedrockPing(ip, { port });
            const embed = this.buildBedrockEmbed(address, data);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [embed] });
            } else {
				await interaction.reply({ embeds: [embed] });
			}
        } catch (error) {
            const embed = new EmbedBuilder()
				.setTitle('Ping Error')
				.setDescription(`Failed to reach bedrock server at ${address}: ${error instanceof Error ? error.message : String(error)}`)
                .setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp();
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ embeds: [embed], flags: 64 });
			} else {
				await interaction.editReply({ embeds: [embed] });
			}
        }
	}

    async executeQueryBedrock(interaction: ChatInputCommandInteraction): Promise<void> {
		const ip = interaction.options.getString('address')!;
		const port = interaction.options.getInteger('port') ?? 19132;
        const wantDetails = interaction.options.getBoolean('details') === true;
		const address = this.buildAddress(ip, port);
		const url = `https://api.mcsrvstat.us/bedrock/3/${encodeURIComponent(address)}`;
		try {
			const data = await this.fetchServer(url);
            const embed = this.formatStatusEmbed('Bedrock Server Status', address, data, 'bedrock', wantDetails);
			await interaction.reply({ embeds: [embed] });
		} catch (error) {
            const embed = new EmbedBuilder()
				.setTitle('Query Error')
				.setDescription(`Failed to query Bedrock server: ${error instanceof Error ? error.message : String(error)}`)
                .setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ embeds: [embed], flags: 64 });
			}
		}
	}

    async executeQueryJava(interaction: ChatInputCommandInteraction): Promise<void> {
		const ip = interaction.options.getString('address')!;
		const port = interaction.options.getInteger('port') ?? 25565;
        const wantDetails = interaction.options.getBoolean('details') === true;
		const address = this.buildAddress(ip, port);
		const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`;
		try {
			const data = await this.fetchServer(url);
            const embed = this.formatStatusEmbed('Java Server Status', address, data, 'java', wantDetails);
			await interaction.reply({ embeds: [embed] });
		} catch (error) {
            const embed = new EmbedBuilder()
				.setTitle('Query Error')
				.setDescription(`Failed to query Java server: ${error instanceof Error ? error.message : String(error)}`)
                .setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({ embeds: [embed], flags: 64 });
			}
		}
	}
}

export = Query;

