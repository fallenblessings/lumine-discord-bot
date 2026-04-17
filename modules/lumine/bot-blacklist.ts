import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, User } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

interface AdvertisementBlacklistResponse {
	status: string;
	message?: string;
	entries?: string[];
	error?: {
		code?: string;
		message?: string;
		details?: unknown;
	};
}

class BotBlacklist extends Base {
	constructor() {
		super('lumine_bot_blacklist', 'Manage Lumine bot blacklist usernames');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('lumine_bot_blacklist')
				.setDescription('Manage Lumine bot blacklist usernames')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2])
				.addStringOption(option =>
					option
						.setName('action')
						.setDescription('Action to perform')
						.setRequired(true)
						.addChoices(
							{ name: 'Add', value: 'add' },
							{ name: 'Remove', value: 'remove' },
							{ name: 'Get', value: 'get' }
						))
				.addStringOption(option =>
					option
						.setName('username')
						.setDescription('Username to check/add/remove (casing does not matter)')
						.setRequired(true)),
			execute: this.executeBotBlacklist.bind(this)
		});
	}

	private getPrivilegedUsers(): string[] {
		const rawPrivilegedUsers =
			process.env.PRIVILEGED_USERS ||
			process.env.PRIVILEGED ||
			'';

		return rawPrivilegedUsers
			.split(',')
			.map(value => value.trim())
			.filter(value => value.length > 0);
	}

	private getLumineUsers(): string[] {
		const rawLumineUsers = process.env.LUMINE_USERS || '';

		return rawLumineUsers
			.split(',')
			.map(value => value.trim())
			.filter(value => value.length > 0);
	}

	async executeBotBlacklist(interaction: ChatInputCommandInteraction): Promise<void> {
		const privilegedUsers = this.getPrivilegedUsers();
		const lumineUsers = this.getLumineUsers();
		if (privilegedUsers.length === 0 && lumineUsers.length === 0) {
			const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('Privileged users and LUMINE_USERS are not configured for this command.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed] });
			return;
		}

		const hasPrivilegedAccess = privilegedUsers.includes(interaction.user.id);
		const hasLumineAccess = lumineUsers.includes(interaction.user.id);
		if (!hasPrivilegedAccess && !hasLumineAccess) {
			const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('You are not authorized to use this command.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed] });
			return;
		}

		const apiAdminKey = process.env.API_ADMIN_KEY;
		const apiEndpoint = process.env.API_ENDPOINT;
		if (!apiAdminKey || !apiEndpoint) {
			const embed = new EmbedBuilder()
				.setTitle('Error')
				.setDescription('API configuration missing. Please check environment variables.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed] });
			return;
		}

		const action = interaction.options.getString('action', true);
		const username = interaction.options.getString('username', true).trim().toLowerCase();
		if (!username) {
			const embed = new EmbedBuilder()
				.setTitle('Missing Username')
				.setDescription('Username is required.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed] });
			return;
		}

		await interaction.deferReply();

		try {
			const result = await this.callBlacklistAPI(apiEndpoint, apiAdminKey, action, username);
			const entries = (result.entries ?? []).map(value => value.toLowerCase());
			const isBlacklisted = entries.includes(username);

			const embed = new EmbedBuilder()
				.setTitle('Lumine Bot Blacklist')
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp()
				.addFields(
					{ name: 'Action', value: this.toActionLabel(action), inline: true },
					{ name: 'Username', value: username, inline: true },
					{ name: 'Blacklisted', value: isBlacklisted ? 'Yes' : 'No', inline: true },
					{ name: 'Total Entries', value: `${entries.length}`, inline: true }
				);

			if (result.message) {
				embed.addFields({ name: 'Message', value: result.message, inline: false });
			}

			await interaction.editReply({ embeds: [embed] });
			await this.logBlacklistAction(interaction.client, action, username, isBlacklisted, entries.length, interaction.user);
		} catch (error) {
			const embed = new EmbedBuilder()
				.setTitle('API Error')
				.setDescription(`Failed to process blacklist request: ${error instanceof Error ? error.message : String(error)}`)
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.editReply({ embeds: [embed] });
		}
	}

	private toActionLabel(action: string): string {
		switch (action) {
			case 'add':
				return 'Add';
			case 'remove':
				return 'Remove';
			case 'get':
				return 'Get';
			default:
				return action;
		}
	}

	private async callBlacklistAPI(
		endpoint: string,
		adminKey: string,
		action: string,
		username: string
	): Promise<AdvertisementBlacklistResponse> {
		const apiPath = '/advertisement/blacklist';
		const fullEndpoint = `${endpoint}${apiPath}`;

		let method = 'GET';
		if (action === 'add') {
			method = 'POST';
		} else if (action === 'remove') {
			method = 'DELETE';
		} else if (action !== 'get') {
			throw new Error(`Invalid action: ${action}`);
		}

		const requestInit: RequestInit = {
			method,
			headers: {
				'Content-Type': 'application/json'
			}
		};

		if (action !== 'get') {
			requestInit.body = JSON.stringify({
				admin_key: adminKey,
				value: username
			});
		}

		const response = await fetch(fullEndpoint, requestInit);

		let data: AdvertisementBlacklistResponse = { status: 'error' };
		try {
			data = await response.json() as AdvertisementBlacklistResponse;
		} catch {
			// Leave default fallback payload.
		}

		if (!response.ok || data.status !== 'success') {
			const retryAfter = response.headers.get('Retry-After');
			const apiMessage =
				data.message ||
				data.error?.message ||
				`${response.status} ${response.statusText}`;
			if (response.status === 429 && retryAfter) {
				throw new Error(`${apiMessage} (retry after ${retryAfter}s)`);
			}
			throw new Error(apiMessage);
		}

		return data;
	}

	private async logBlacklistAction(
		client: any,
		action: string,
		username: string,
		isBlacklisted: boolean,
		totalEntries: number,
		executor: User
	): Promise<void> {
		try {
			const logChannelId = '1439558418930208850';
			const channel = client.channels.cache.get(logChannelId);

			if (!channel) {
				console.error(`[BotBlacklist] Log channel ${logChannelId} not found`);
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle('Bot Blacklist Updated')
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp()
				.addFields(
					{ name: 'Action', value: this.toActionLabel(action), inline: true },
					{ name: 'Username', value: username, inline: true },
					{ name: 'Blacklisted', value: isBlacklisted ? 'Yes' : 'No', inline: true },
					{ name: 'Total Entries', value: `${totalEntries}`, inline: true }
				)
				.setFooter({ text: `${executor.tag} (${executor.id})` });

			await channel.send({ embeds: [embed] });
		} catch (error) {
			console.error('[BotBlacklist] Error logging blacklist action:', error);
		}
	}
}

export = BotBlacklist;
