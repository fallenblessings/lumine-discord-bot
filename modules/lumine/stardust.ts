import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

interface StarDustResponse {
	status: string;
	message?: string;
	star_dust?: number;
}

class StarDustManagement extends Base {
	constructor() {
		super('lumine_stardust', 'Star dust management commands for Lumine');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('lumine_stardust')
				.setDescription('Manage star dust for users')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2])
				.addStringOption(option =>
					option.setName('action')
						.setDescription('Action to perform')
						.setRequired(true)
						.addChoices(
							{ name: 'Add', value: 'add' },
							{ name: 'Remove', value: 'remove' },
							{ name: 'Set', value: 'set' },
							{ name: 'Get', value: 'get' }
						))
				.addStringOption(option =>
					option.setName('email')
						.setDescription('User email address')
						.setRequired(true))
				.addIntegerOption(option =>
					option.setName('amount')
						.setDescription('Amount of star dust (required for add/remove/set)')
						.setRequired(false)
						.setMinValue(0))
				.addStringOption(option =>
					option.setName('note')
						.setDescription('Reason for this update (optional)')
						.setRequired(false)),
			execute: this.executeStarDust.bind(this)
		});
	}

	async executeStarDust(interaction: ChatInputCommandInteraction): Promise<void> {
		// Check authorization
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

		// Check API configuration
		const API_ADMIN_KEY = process.env.API_ADMIN_KEY;
		const API_ENDPOINT = process.env.API_ENDPOINT;

		if (!API_ADMIN_KEY || !API_ENDPOINT) {
			const embed = new EmbedBuilder()
				.setTitle('Error')
				.setDescription('API configuration missing. Please check environment variables.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		const action = interaction.options.getString('action', true);
		const email = interaction.options.getString('email', true);
		const amount = interaction.options.getInteger('amount');
		const note = interaction.options.getString('note')?.trim() ?? '';

		// Validate amount is provided for add/remove/set actions
		if (action !== 'get' && (amount === null || amount === undefined)) {
			const embed = new EmbedBuilder()
				.setTitle('Error')
				.setDescription('Amount is required for add, remove, and set actions.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		// Defer reply for API call (public so others can see the result)
		await interaction.deferReply();

		try {
			const result = await this.callStarDustAPI(API_ENDPOINT, API_ADMIN_KEY, action, email, amount ?? 0, note);

			if (result.status !== 'success') {
				const embed = new EmbedBuilder()
					.setTitle('Error')
					.setDescription(result.message || 'An unknown error occurred.')
					.setColor(EMBED_COLOR_ERROR)
					.setTimestamp();
				await interaction.editReply({ embeds: [embed] });
				return;
			}

			const actionVerb = this.getActionVerb(action);
			const embed = new EmbedBuilder()
				.setTitle('Star Dust Updated')
				.setColor(EMBED_COLOR_PRIMARY)
				.addFields(
					{ name: 'Action', value: actionVerb, inline: true },
					{ name: 'Email', value: email, inline: true },
					{ name: 'Current Balance', value: `${result.star_dust?.toLocaleString() ?? 0} Star Dust`, inline: true }
				)
				.setTimestamp();

			if (action !== 'get' && amount !== null) {
				embed.addFields({ name: 'Amount', value: amount.toLocaleString(), inline: true });
			}
			if (note.length > 0) {
				embed.addFields({ name: 'Reason', value: note, inline: false });
			}

			await interaction.editReply({ embeds: [embed] });

			// Log the action
			await this.logStarDustAction(interaction.client, action, email, amount ?? 0, result.star_dust ?? 0, note, interaction.user);
		} catch (error) {
			const embed = new EmbedBuilder()
				.setTitle('API Error')
				.setDescription(`Failed to ${action} star dust: ${error instanceof Error ? error.message : String(error)}`)
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.editReply({ embeds: [embed] });
		}
	}

	private getActionVerb(action: string): string {
		switch (action) {
			case 'add': return 'Added';
			case 'remove': return 'Removed';
			case 'set': return 'Set';
			case 'get': return 'Retrieved';
			default: return action;
		}
	}

	private async callStarDustAPI(
		endpoint: string,
		adminKey: string,
		action: string,
		email: string,
		amount: number,
		note: string
	): Promise<StarDustResponse> {
		const actionEndpoints: Record<string, string> = {
			'add': '/admin/users/stardust/add',
			'remove': '/admin/users/stardust/remove',
			'set': '/admin/users/stardust/set',
			'get': '/admin/users/stardust/get'
		};

		const apiPath = actionEndpoints[action];
		if (!apiPath) {
			throw new Error(`Invalid action: ${action}`);
		}

		const fullEndpoint = `${endpoint}${apiPath}`;

		const body: Record<string, unknown> = {
			admin_key: adminKey,
			email: email.toLowerCase().trim()
		};

		// Add amount for non-get actions
		if (action !== 'get') {
			body.amount = amount;
		}
		if (note.length > 0) {
			body.note = note;
		}

		const response = await fetch(fullEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		const data = await response.json() as StarDustResponse;

		if (!response.ok && data.status !== 'success') {
			throw new Error(data.message || `API request failed: ${response.status} ${response.statusText}`);
		}

		return data;
	}

	private async logStarDustAction(
		client: any,
		action: string,
		email: string,
		amount: number,
		newBalance: number,
		note: string,
		executor: { tag: string; id: string }
	): Promise<void> {
		try {
			const logChannelId = '1439558418930208850';
			const channel = client.channels.cache.get(logChannelId);

			if (!channel) {
				console.error(`[StarDust] Log channel ${logChannelId} not found`);
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle('Star Dust Modified')
				.addFields(
					{ name: 'Action', value: this.getActionVerb(action), inline: true },
					{ name: 'Email', value: email, inline: true },
					{ name: 'New Balance', value: newBalance.toLocaleString(), inline: true }
				)
				.setFooter({ text: `${executor.tag} (${executor.id})` })
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp();

			if (action !== 'get') {
				embed.addFields({ name: 'Amount Changed', value: amount.toLocaleString(), inline: true });
			}
			if (note.length > 0) {
				embed.addFields({ name: 'Reason', value: note, inline: false });
			}

			await channel.send({ embeds: [embed] });
		} catch (error) {
			console.error('[StarDust] Error logging star dust action:', error);
		}
	}
}

export = StarDustManagement;
