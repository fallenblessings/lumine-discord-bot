import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client, TextBasedChannel } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

type StatusNode = {
	region?: string;
	url?: string;
	healthy?: boolean;
	latency_ms?: number;
	active_users?: number;
	error?: string;
};

type StatusApiBody = {
	status?: string;
	data?: {
		nodes?: StatusNode[];
	};
	nodes?: StatusNode[];
	error?: {
		message?: string;
	};
	message?: string;
};

type StatusChannel = TextBasedChannel & {
	send: (options: { embeds: EmbedBuilder[] }) => Promise<{ id: string }>;
	messages: {
		fetch: (options?: { limit?: number } | string) => Promise<any>;
	};
};

class ApiStatus extends Base {
	private statusIntervalId: NodeJS.Timeout | null = null;
	private statusMessageId: string | null = null;
	private client: Client | null = null;
	private statusUpdateInProgress = false;

	private readonly statusChannelId =
		process.env.LUMINE_STATUS_CHANNEL_ID?.trim() ||
		process.env.STATUS_CHANNEL_ID?.trim() ||
		'1464859865716363345';

	private readonly statusUpdateIntervalMs = 30000;
	private readonly statusApiTimeoutMs = this.resolveStatusApiTimeoutMs();
	private readonly statusFetchAttempts = 3;
	private readonly statusFetchRetryDelayMs = 1000;

	constructor() {
		super('lumine_status', 'Lumine API status');
		this.initializeCommands();
		const moduleInstance = this;
		this.registerEventHandler('clientReady', async function (this: Client) {
			await moduleInstance.startAutoStatusUpdates(this);
		});
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('lumine_status')
				.setDescription('Check Lumine API status')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2]),
			execute: this.executeApiStatus.bind(this)
		});
	}

	private async startAutoStatusUpdates(client: Client): Promise<void> {
		this.client = client;
		console.info(`[LumineStatus] Auto status updates started for channel ${this.statusChannelId}.`);
		await this.runStatusUpdateTick();

		if (!this.statusIntervalId) {
			this.statusIntervalId = setInterval(() => {
				void this.runStatusUpdateTick();
			}, this.statusUpdateIntervalMs);
			console.info(`[LumineStatus] Status interval running every ${Math.floor(this.statusUpdateIntervalMs / 1000)}s.`);
		}
	}

	private buildLastUpdatedLine(): string {
		const timestamp = Math.floor(Date.now() / 1000);
		return `Last updated <t:${timestamp}:R>`;
	}

	private async buildStatusEmbed(includeLastUpdated: boolean): Promise<EmbedBuilder> {
		const API_ENDPOINT = process.env.API_ENDPOINT;
		const lastUpdatedLine = includeLastUpdated ? this.buildLastUpdatedLine() : null;

		if (!API_ENDPOINT) {
			return new EmbedBuilder()
				.setTitle('Error')
				.setDescription(
					lastUpdatedLine
						? `API configuration missing. Please check environment variables.\n\n${lastUpdatedLine}`
						: 'API configuration missing. Please check environment variables.'
				)
				.setColor(EMBED_COLOR_ERROR);
		}

		try {
			const { response, body } = await this.fetchStatusPayload(API_ENDPOINT);

			const nodes = this.extractNodes(body);
			const healthyNodes = nodes.filter((node) => node?.healthy);
			const totalOnlineUsers = healthyNodes.reduce(
				(sum, node) => sum + (typeof node.active_users === 'number' ? node.active_users : 0),
				0
			);
			const apiOnline = response.ok && body?.status === 'success';

			const embed = new EmbedBuilder()
				.setTitle('Lumine API Status')
				.setColor(apiOnline ? EMBED_COLOR_PRIMARY : EMBED_COLOR_ERROR);

			const lines: string[] = [];

			if (nodes.length === 0) {
				lines.push(`No node data returned after ${this.statusFetchAttempts} attempts.`);
			} else {
				nodes.forEach((node, idx) => {
					const region = node.region ? node.region.toUpperCase() : `NODE ${idx + 1}`;
					const isHealthy = Boolean(node.healthy);
					const activeUsers = isHealthy && typeof node.active_users === 'number' ? node.active_users : 0;
					const statusText = isHealthy
						? `Online, ${activeUsers} Player${activeUsers === 1 ? '' : 's'} Online`
						: `Offline${node.error ? ` (${node.error})` : ''}`;

					lines.push(`**${region}** | ${statusText}`);
				});
			}

			if (lines.length > 0) {
				lines.push('');
			}
			lines.push(`${totalOnlineUsers} Total Online Users`);
			if (lastUpdatedLine) {
				lines.push('');
				lines.push(lastUpdatedLine);
			}

			embed.setDescription(lines.join('\n'));

			return embed;
		} catch (error) {
			return new EmbedBuilder()
				.setTitle('API Error')
				.setDescription(
					lastUpdatedLine
						? `Failed to reach API: ${error instanceof Error ? error.message : String(error)}\n\n${lastUpdatedLine}`
						: `Failed to reach API: ${error instanceof Error ? error.message : String(error)}`
				)
				.setColor(EMBED_COLOR_ERROR);
		}
	}

	private resolveStatusApiTimeoutMs(): number {
		const raw = process.env.LUMINE_STATUS_API_TIMEOUT_MS || process.env.STATUS_API_TIMEOUT_MS || '30000';
		const parsed = Number.parseInt(raw, 10);
		if (!Number.isFinite(parsed) || parsed < 1000) {
			return 30000;
		}
		return parsed;
	}

	private extractNodes(body: StatusApiBody): StatusNode[] {
		const nodesPayload = body?.data?.nodes ?? body?.nodes;
		return Array.isArray(nodesPayload) ? nodesPayload : [];
	}

	private async sleep(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	private isStatusChannel(channel: unknown): channel is StatusChannel {
		if (!channel || typeof channel !== 'object') {
			return false;
		}

		const candidate = channel as {
			isTextBased?: () => boolean;
			send?: unknown;
			messages?: { fetch?: unknown };
		};

		return (
			typeof candidate.isTextBased === 'function' &&
			candidate.isTextBased() &&
			typeof candidate.send === 'function' &&
			typeof candidate.messages?.fetch === 'function'
		);
	}

	private async fetchStatusPayload(apiEndpoint: string): Promise<{ response: Response; body: StatusApiBody }> {
		let lastResult: { response: Response; body: StatusApiBody } | null = null;
		let lastError: unknown = null;

		for (let attempt = 1; attempt <= this.statusFetchAttempts; attempt++) {
			try {
				const result = await this.fetchStatusPayloadOnce(apiEndpoint, this.statusApiTimeoutMs);
				lastResult = result;

				const nodes = this.extractNodes(result.body);
				if (nodes.length > 0) {
					return result;
				}

				if (!result.response.ok) {
					return result;
				}

				if (attempt < this.statusFetchAttempts) {
					console.warn(
						`[LumineStatus] Empty node payload from /status (attempt ${attempt}/${this.statusFetchAttempts}). Retrying...`
					);
					await this.sleep(this.statusFetchRetryDelayMs);
				}
			} catch (error) {
				lastError = error;
				if (attempt < this.statusFetchAttempts) {
					console.warn(
						`[LumineStatus] Status fetch failed (attempt ${attempt}/${this.statusFetchAttempts}). Retrying...`
					);
					await this.sleep(this.statusFetchRetryDelayMs);
				}
			}
		}

		if (lastResult) {
			return lastResult;
		}
		throw lastError instanceof Error ? lastError : new Error('Status endpoint failed after retries');
	}

	private async fetchStatusPayloadOnce(
		apiEndpoint: string,
		timeoutMs: number
	): Promise<{ response: Response; body: StatusApiBody }> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(`${apiEndpoint}/status`, {
				method: 'GET',
				signal: controller.signal
			});

			let body: StatusApiBody = {};
			try {
				body = (await response.json()) as StatusApiBody;
			} catch {
				body = {};
			}

			return { response, body };
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`Status endpoint timed out after ${timeoutMs}ms`);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private async runStatusUpdateTick(): Promise<void> {
		if (this.statusUpdateInProgress) {
			console.warn('[LumineStatus] Skipping tick: previous status update still running.');
			return;
		}

		this.statusUpdateInProgress = true;
		try {
			await this.updateStatusMessage();
		} catch (error) {
			console.error('[LumineStatus] Status update tick failed:', error);
		} finally {
			this.statusUpdateInProgress = false;
		}
	}

	private async updateStatusMessage(): Promise<void> {
		if (!this.client) {
			return;
		}

		const channel = await this.client.channels.fetch(this.statusChannelId).catch((error) => {
			console.error(`[LumineStatus] Failed to fetch channel ${this.statusChannelId}:`, error);
			return null;
		});

		if (!this.isStatusChannel(channel)) {
			console.error(`[LumineStatus] Channel ${this.statusChannelId} is not a writable text channel.`);
			return;
		}

		const textChannel = channel;
		const embed = await this.buildStatusEmbed(true);

		if (!this.statusMessageId) {
			try {
				const recentMessages = await textChannel.messages.fetch({ limit: 25 });
				const existingMessage = recentMessages.find(
					(message) =>
						message.author.id === this.client?.user?.id &&
						message.embeds[0]?.title === 'Lumine API Status'
				);
				if (existingMessage) {
					this.statusMessageId = existingMessage.id;
				}
			} catch (error) {
				console.error('[LumineStatus] Failed to scan recent messages for status embed:', error);
			}
		}

		if (this.statusMessageId) {
			const message = await textChannel.messages.fetch(this.statusMessageId).catch(() => null);
			if (message) {
				try {
					await message.edit({ embeds: [embed] });
					console.info(`[LumineStatus] Updated status message ${this.statusMessageId}.`);
					return;
				} catch (error) {
					console.error(`[LumineStatus] Failed to edit status message ${this.statusMessageId}:`, error);
				}
			}
			this.statusMessageId = null;
		}

		try {
			const sentMessage = await textChannel.send({ embeds: [embed] });
			this.statusMessageId = sentMessage.id;
			console.info(`[LumineStatus] Created new status message ${this.statusMessageId}.`);
		} catch (error) {
			console.error('[LumineStatus] Failed to send status message:', error);
		}
	}

	async executeApiStatus(interaction: ChatInputCommandInteraction): Promise<void> {
		const LUMINE_USERS = process.env.LUMINE_USERS ? process.env.LUMINE_USERS.split(',') : [];
		if (LUMINE_USERS.length > 0 && !LUMINE_USERS.includes(interaction.user.id)) {
			const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('You are not authorized to use this command.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		// Defer reply to avoid 3-second timeout (gives us 15 minutes)
		await interaction.deferReply();
		const embed = await this.buildStatusEmbed(false);
		await interaction.editReply({ embeds: [embed] });
	}
}

export = ApiStatus;
