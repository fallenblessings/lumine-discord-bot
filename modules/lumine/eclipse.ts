import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, User } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

// Matches api/types/response.go PremiumStatusResponse
interface PremiumResponse {
	status: string;
	message?: string;
	email?: string;
	premium_active?: boolean;
	premium_start_at?: string | null;
	premium_end_at?: string | null;
	premium_source?: string;
	premium_note?: string;
	error?: {
		code?: string;
		message?: string;
		details?: unknown;
	};
}

class EclipsePremium extends Base {
	constructor() {
		super('lumine_eclipse', 'Manage Lumine premium (Eclipse) access');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('lumine_eclipse')
				.setDescription('Manage Lumine premium status')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2])
				.addStringOption(option =>
					option
						.setName('action')
						.setDescription('Action to perform')
						.setRequired(true)
						.addChoices(
							{ name: 'Add (set Eclipse window)', value: 'add' },
							{ name: 'Clear (remove Eclipse)', value: 'clear' },
							{ name: 'Get (check status)', value: 'get' }
						))
				.addStringOption(option =>
					option
						.setName('email')
						.setDescription('User email address')
						.setRequired(true))
				.addIntegerOption(option =>
					option
						.setName('duration_seconds')
						.setDescription('Premium duration in seconds (required for add)')
						.setRequired(false)
						.setMinValue(1))
				.addStringOption(option =>
					option
						.setName('source')
						.setDescription('Premium source e.g. admin, promo (optional, for add)')
						.setRequired(false))
				.addStringOption(option =>
					option
						.setName('note')
						.setDescription('Optional note (for add)')
						.setRequired(false)),
			execute: this.executePremium.bind(this)
		});
	}

	private getPrivilegedUsers(): string[] {
		const rawPrivilegedUsers =
			process.env.LUMINE_USERS ||
			process.env.PRIVILEGED_USERS ||
			process.env.PRIVILEGED ||
			'';

		return rawPrivilegedUsers
			.split(',')
			.map(value => value.trim())
			.filter(value => value.length > 0);
	}

	async executePremium(interaction: ChatInputCommandInteraction): Promise<void> {
		const privilegedUsers = this.getPrivilegedUsers();
		if (privilegedUsers.length === 0 || !privilegedUsers.includes(interaction.user.id)) {
			const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('You are not authorized to use this command.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
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
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		const action = interaction.options.getString('action', true);
		const email = interaction.options.getString('email', true).toLowerCase().trim();
		const durationSeconds = interaction.options.getInteger('duration_seconds');
		const source = interaction.options.getString('source')?.trim() ?? undefined;
		const note = interaction.options.getString('note')?.trim() ?? undefined;

		if (action === 'add' && (!durationSeconds || durationSeconds <= 0)) {
			const embed = new EmbedBuilder()
				.setTitle('Invalid Input')
				.setDescription('**duration_seconds** is required and must be greater than 0 for add.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		if ((action === 'clear' || action === 'get') && durationSeconds) {
			const embed = new EmbedBuilder()
				.setTitle('Invalid Input')
				.setDescription('**duration_seconds** should only be used with add.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		await interaction.deferReply({ flags: 64 });

		try {
			const response = await this.callPremiumAPI(
				apiEndpoint,
				apiAdminKey,
				action,
				email,
				durationSeconds ?? undefined,
				source,
				note
			);

			const embed = new EmbedBuilder()
				.setTitle('Lumine Eclipse')
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp()
				.addFields(
					{ name: 'Action', value: this.actionLabel(action), inline: true },
					{ name: 'Premium', value: response.premium_active ? 'Enabled' : 'Disabled', inline: true },
					{ name: 'Email', value: response.email ?? email, inline: true }
				);

			if (durationSeconds && action === 'add') {
				embed.addFields({ name: 'Duration', value: `${durationSeconds.toLocaleString()}s`, inline: true });
			}
			const endAt = response.premium_end_at ?? null;
			if (endAt) {
				embed.addFields({ name: 'Premium Until', value: `<t:${Math.floor(new Date(endAt).getTime() / 1000)}:F>`, inline: false });
			}
			if (response.premium_source) {
				embed.addFields({ name: 'Source', value: response.premium_source, inline: true });
			}
			if (response.premium_note) {
				embed.addFields({ name: 'Note', value: response.premium_note, inline: false });
			}
			if (response.message) {
				embed.addFields({ name: 'Message', value: response.message, inline: false });
			}

			await interaction.editReply({ embeds: [embed] });
			await this.logPremiumAction(interaction.client, action, email, durationSeconds ?? null, response, interaction.user);
		} catch (error) {
			const embed = new EmbedBuilder()
				.setTitle('API Error')
				.setDescription(`Failed to process premium action: ${error instanceof Error ? error.message : String(error)}`)
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.editReply({ embeds: [embed] });
		}
	}

	private actionLabel(action: string): string {
		switch (action) {
			case 'add':
				return 'Add';
			case 'clear':
				return 'Clear';
			case 'get':
				return 'Get';
			default:
				return action;
		}
	}

	private async callPremiumAPI(
		endpoint: string,
		adminKey: string,
		action: string,
		email: string,
		durationSeconds?: number,
		source?: string,
		note?: string
	): Promise<PremiumResponse> {
		const actionEndpoints: Record<string, string> = {
			add: '/admin/users/premium/set',
			clear: '/admin/users/premium/clear',
			get: '/admin/users/premium/get'
		};

		const apiPath = actionEndpoints[action];
		if (!apiPath) {
			throw new Error(`Invalid action: ${action}`);
		}

		const body: Record<string, unknown> = { admin_key: adminKey, email };

		if (action === 'add' && durationSeconds != null && durationSeconds > 0) {
			const now = new Date();
			const end = new Date(now.getTime() + durationSeconds * 1000);
			body.premium_start_at = now.toISOString();
			body.premium_end_at = end.toISOString();
			if (source) body.premium_source = source;
			if (note) body.premium_note = note;
		}

		const response = await fetch(`${endpoint}${apiPath}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		let data: PremiumResponse = { status: 'error' };
		try {
			data = await response.json() as PremiumResponse;
		} catch {
			// no-op; use fallback payload
		}

		if (!response.ok || data.status !== 'success') {
			const retryAfter = response.headers.get('Retry-After');
			const message = data.message || data.error?.message || `${response.status} ${response.statusText}`;
			if (response.status === 429 && retryAfter) {
				throw new Error(`${message} (retry after ${retryAfter}s)`);
			}
			throw new Error(message);
		}

		return data;
	}

	private async logPremiumAction(
		client: any,
		action: string,
		email: string,
		durationSeconds: number | null,
		response: PremiumResponse,
		executor: User
	): Promise<void> {
		try {
			const logChannelId = '1439558418930208850';
			const channel = client.channels.cache.get(logChannelId);
			if (!channel) {
				console.error(`[Eclipse] Log channel ${logChannelId} not found`);
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle('Lumine Eclipse Updated')
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp()
				.setFooter({ text: `${executor.tag} (${executor.id})` })
				.addFields(
					{ name: 'Action', value: this.actionLabel(action), inline: true },
					{ name: 'Premium', value: response.premium_active ? 'Enabled' : 'Disabled', inline: true },
					{ name: 'Email', value: email, inline: true }
				);

			if (durationSeconds != null && action === 'add') {
				embed.addFields({ name: 'Duration (s)', value: durationSeconds.toLocaleString(), inline: true });
			}
			const endAt = response.premium_end_at ?? null;
			if (endAt) {
				embed.addFields({ name: 'Premium Until', value: endAt, inline: false });
			}

			await channel.send({ embeds: [embed] });
		} catch (error) {
			console.error('[Eclipse] Error logging premium action:', error);
		}
	}
}

export = EclipsePremium;
