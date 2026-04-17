import Base = require('../../core/module/base');
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChatInputCommandInteraction,
	EmbedBuilder,
	Interaction,
	ModalBuilder,
	ModalSubmitInteraction,
	SlashCommandBuilder,
	TextBasedChannel,
	TextInputBuilder,
	TextInputStyle
} from 'discord.js';
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

type WritableTextChannel = TextBasedChannel & {
	send: (options: {
		embeds?: EmbedBuilder[];
		components?: ActionRowBuilder<ButtonBuilder>[];
	}) => Promise<unknown>;
};

const OPT_OUT_BUTTON_ID = 'advertising_opt_out_button';
const OPT_OUT_MODAL_ID = 'advertising_opt_out_modal';
const OPT_OUT_USERNAME_FIELD_ID = 'username';

class AdvertisingEmbed extends Base {
	constructor() {
		super('lumine_advertising_embed', 'Post advertising opt-out embed');
		this.initializeCommands();
		this.registerEventHandler('interactionCreate', this.handleInteractionCreate.bind(this));
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('advertising_embed')
				.setDescription('Post an advertising opt-out embed to a channel')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2])
				.addStringOption(option =>
					option
						.setName('channel_id')
						.setDescription('Channel ID where the advertising opt-out embed should be posted')
						.setRequired(true)),
			execute: this.executeAdvertisingEmbed.bind(this)
		});
	}

	private getAllowedUsers(): string[] {
		const rawAllowedUsers = process.env.PRIVILEGED_USERS || '';
		return rawAllowedUsers
			.split(',')
			.map(value => value.trim())
			.filter(value => value.length > 0);
	}

	private isWritableTextChannel(channel: unknown): channel is WritableTextChannel {
		if (!channel || typeof channel !== 'object') {
			return false;
		}

		const candidate = channel as {
			isTextBased?: () => boolean;
			send?: unknown;
		};

		return (
			typeof candidate.isTextBased === 'function' &&
			candidate.isTextBased() &&
			typeof candidate.send === 'function'
		);
	}

	async executeAdvertisingEmbed(interaction: ChatInputCommandInteraction): Promise<void> {
		const allowedUsers = this.getAllowedUsers();
		if (allowedUsers.length === 0) {
			const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('ALLOWED_USERS is not configured for this command.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		if (!allowedUsers.includes(interaction.user.id)) {
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

		const channelId = interaction.options.getString('channel_id', true).trim();
		if (!/^\d{16,22}$/.test(channelId)) {
			const embed = new EmbedBuilder()
				.setTitle('Invalid Channel ID')
				.setDescription('Please provide a valid channel ID.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
		if (!this.isWritableTextChannel(channel)) {
			const embed = new EmbedBuilder()
				.setTitle('Channel Not Found')
				.setDescription('That channel ID is invalid or I cannot send messages there.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		const embed = new EmbedBuilder()
			.setTitle('Lumine Bot Advertising Opt-Out')
			.setDescription(
				'Lumine Bot is an automated account that joins different Minecraft worlds to share updates about Lumine.\n\n' +
				'If you would rather not receive these advertising messages, you can opt out here in just a few seconds.\n\n' +
				'**How to opt out:**\n' +
				'1. Click **Opt Out of Advertising** below.\n' +
				'2. Enter only your Minecraft username.\n' +
				'3. Submit the form to confirm your opt-out.\n\n' +
				'Please enter your exact username only (no email, no @, no extra text).\n' +
				'Example: `Steve`'
			)
			.setColor(EMBED_COLOR_PRIMARY)
			.setTimestamp();

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(OPT_OUT_BUTTON_ID)
				.setLabel('Opt Out of Advertising')
				.setStyle(ButtonStyle.Danger)
		);

		await channel.send({ embeds: [embed], components: [row] });

		const successEmbed = new EmbedBuilder()
			.setTitle('Advertising Embed Sent')
			.setDescription(`Posted in <#${channelId}>.`)
			.setColor(EMBED_COLOR_PRIMARY)
			.setTimestamp();
		await interaction.reply({ embeds: [successEmbed], flags: 64 });
	}

	private async handleInteractionCreate(interaction: Interaction): Promise<void> {
		if (interaction.isButton()) {
			await this.handleOptOutButton(interaction);
			return;
		}

		if (interaction.isModalSubmit()) {
			await this.handleOptOutModal(interaction);
		}
	}

	private async handleOptOutButton(interaction: ButtonInteraction): Promise<void> {
		if (interaction.customId !== OPT_OUT_BUTTON_ID) {
			return;
		}

		const modal = new ModalBuilder()
			.setCustomId(OPT_OUT_MODAL_ID)
			.setTitle('Opt Out of Advertising');

		const usernameInput = new TextInputBuilder()
			.setCustomId(OPT_OUT_USERNAME_FIELD_ID)
			.setLabel('Username')
			.setPlaceholder('Steve')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMinLength(1)
			.setMaxLength(32);

		const row = new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput);
		modal.addComponents(row);

		await interaction.showModal(modal);
	}

	private async handleOptOutModal(interaction: ModalSubmitInteraction): Promise<void> {
		if (interaction.customId !== OPT_OUT_MODAL_ID) {
			return;
		}

		const rawUsername = interaction.fields.getTextInputValue(OPT_OUT_USERNAME_FIELD_ID).trim();
		if (!rawUsername) {
			await interaction.reply({
				content: 'Please enter your username.',
				flags: 64
			});
			return;
		}

		if (!/^[A-Za-z0-9_]{1,32}$/.test(rawUsername)) {
			await interaction.reply({
				content: 'Please enter only your username (letters, numbers, underscores). Example: Steve',
				flags: 64
			});
			return;
		}

		const username = rawUsername.toLowerCase();
		const apiAdminKey = process.env.API_ADMIN_KEY;
		const apiEndpoint = process.env.API_ENDPOINT;
		if (!apiAdminKey || !apiEndpoint) {
			await interaction.reply({
				content: 'API configuration is missing. Please contact staff.',
				flags: 64
			});
			return;
		}

		await interaction.deferReply({ flags: 64 });

		try {
			await this.addToAdvertisementBlacklist(apiEndpoint, apiAdminKey, username);
			const embed = new EmbedBuilder()
				.setTitle('Advertising Removed')
				.setDescription('You have been removed from the advertising list.')
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp();
			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const embed = new EmbedBuilder()
				.setTitle('Could Not Update Advertising')
				.setDescription(`Failed to remove you from advertising: ${message}`)
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.editReply({ embeds: [embed] });
		}
	}

	private async addToAdvertisementBlacklist(
		endpoint: string,
		adminKey: string,
		username: string
	): Promise<AdvertisementBlacklistResponse> {
		const response = await fetch(`${endpoint}/advertisement/blacklist`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				admin_key: adminKey,
				value: username
			})
		});

		let data: AdvertisementBlacklistResponse = { status: 'error' };
		try {
			data = await response.json() as AdvertisementBlacklistResponse;
		} catch {
			// Keep fallback payload when response is not valid JSON.
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
}

export = AdvertisingEmbed;
