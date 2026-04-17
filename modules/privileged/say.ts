import Base = require('../../core/module/base');
import {
	ChannelType,
	ChatInputCommandInteraction,
	EmbedBuilder,
	GuildTextBasedChannel,
	SlashCommandBuilder
} from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

class Say extends Base {
	constructor() {
		super('privileged_say', 'Post a message in a channel');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('say')
				.setDescription('Post a message in a selected channel')
				.setIntegrationTypes([0])
				.setContexts([0])
				.addChannelOption(option =>
					option
						.setName('channel')
						.setDescription('Channel where the message should be posted')
						.setRequired(true)
						.addChannelTypes(
							ChannelType.GuildText,
							ChannelType.GuildAnnouncement,
							ChannelType.PublicThread,
							ChannelType.PrivateThread,
							ChannelType.AnnouncementThread
						))
				.addStringOption(option =>
					option
						.setName('text')
						.setDescription('Message to send')
						.setRequired(true)
						.setMaxLength(2000)),
			execute: this.executeSay.bind(this)
		});
	}

	private getPrivilegedUsers(): string[] {
		const rawPrivilegedUsers = process.env.PRIVILEGED_USERS || '';
		return rawPrivilegedUsers
			.split(',')
			.map(value => value.trim())
			.filter(value => value.length > 0);
	}

	private sanitizeContent(content: string): string {
		return content
			.replace(/@everyone/g, '')
			.replace(/@here/g, '');
	}

	private isGuildTextChannel(channel: unknown): channel is GuildTextBasedChannel {
		if (!channel || typeof channel !== 'object') {
			return false;
		}

		const candidate = channel as {
			isTextBased?: () => boolean;
			isDMBased?: () => boolean;
			send?: unknown;
		};

		return (
			typeof candidate.isTextBased === 'function' &&
			candidate.isTextBased() &&
			typeof candidate.isDMBased === 'function' &&
			!candidate.isDMBased() &&
			typeof candidate.send === 'function'
		);
	}

	async executeSay(interaction: ChatInputCommandInteraction): Promise<void> {
		const privilegedUsers = this.getPrivilegedUsers();
		if (privilegedUsers.length === 0) {
			const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('PRIVILEGED_USERS is not configured for this command.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		if (!privilegedUsers.includes(interaction.user.id)) {
			const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('You are not authorized to use this command.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		const channel = interaction.options.getChannel('channel', true);
		if (!this.isGuildTextChannel(channel)) {
			const embed = new EmbedBuilder()
				.setTitle('Invalid Channel')
				.setDescription('Please choose a guild text channel where I can send messages.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		const rawText = interaction.options.getString('text', true);
		const sanitizedText = this.sanitizeContent(rawText).trim();
		if (!sanitizedText) {
			const embed = new EmbedBuilder()
				.setTitle('Nothing To Send')
				.setDescription('The message was empty after removing `@everyone` and `@here`.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		try {
			await channel.send({ content: sanitizedText });

			const embed = new EmbedBuilder()
				.setTitle('Message Sent')
				.setDescription(`Posted your message in <#${channel.id}>.`)
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
		} catch (error) {
			const embed = new EmbedBuilder()
				.setTitle('Send Failed')
				.setDescription(`I could not send that message: ${error instanceof Error ? error.message : String(error)}`)
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
		}
	}
}

export = Say;
