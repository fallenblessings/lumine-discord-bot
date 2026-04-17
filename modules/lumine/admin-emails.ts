import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, User } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

interface AdminEmailResponse {
	status: string;
	message?: string;
	emails?: string[];
	error?: {
		code?: string;
		message?: string;
		details?: unknown;
	};
}

class AdminEmails extends Base {
	constructor() {
		super('lumine_admin_emails', 'Manage Lumine admin email list');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('lumine_admin')
				.setDescription('Manage admin emails used by Lumine admin tooling')
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
						.setName('email')
						.setDescription('Email required for add/remove actions')
						.setRequired(false)),
			execute: this.executeAdminEmails.bind(this)
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

	async executeAdminEmails(interaction: ChatInputCommandInteraction): Promise<void> {
		const privilegedUsers = this.getPrivilegedUsers();
		if (privilegedUsers.length === 0) {
			const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('Privileged users are not configured for this command.')
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
		const rawEmail = interaction.options.getString('email');
		const normalizedEmail = rawEmail ? rawEmail.toLowerCase().trim() : '';

		if ((action === 'add' || action === 'remove') && !normalizedEmail) {
			const embed = new EmbedBuilder()
				.setTitle('Missing Email')
				.setDescription('Email is required for add/remove actions.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		if (action === 'get' && normalizedEmail) {
			const embed = new EmbedBuilder()
				.setTitle('Invalid Input')
				.setDescription('Email should only be provided for add/remove actions.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		await interaction.deferReply({ flags: 64 });

		try {
			const result = await this.callAdminEmailsAPI(
				API_ENDPOINT,
				API_ADMIN_KEY,
				action,
				normalizedEmail
			);

			const emails = result.emails ?? [];
			const embed = new EmbedBuilder()
				.setTitle('Admin Email Update')
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp()
				.addFields(
					{ name: 'Action', value: this.toActionLabel(action), inline: true },
					{ name: 'Total Emails', value: `${emails.length}`, inline: true }
				);

			if (normalizedEmail) {
				embed.addFields({ name: 'Email', value: normalizedEmail, inline: true });
			}

			if (result.message) {
				embed.addFields({ name: 'Message', value: result.message, inline: false });
			}

			if (emails.length > 0) {
				const preview = emails.slice(0, 25);
				const emailList = preview.map((email, index) => `${index + 1}. ${email}`).join('\n');
				const hasMore = emails.length > preview.length ? `\n... and ${emails.length - preview.length} more` : '';
				embed.addFields({
					name: 'Admin Emails',
					value: `${emailList}${hasMore}`,
					inline: false
				});
			} else {
				embed.addFields({
					name: 'Admin Emails',
					value: 'No admin emails are currently configured.',
					inline: false
				});
			}

			await interaction.editReply({ embeds: [embed] });
			await this.logAdminEmailAction(
				interaction.client,
				action,
				normalizedEmail || null,
				emails,
				interaction.user
			);
		} catch (error) {
			const embed = new EmbedBuilder()
				.setTitle('API Error')
				.setDescription(`Failed to process admin emails: ${error instanceof Error ? error.message : String(error)}`)
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
				return 'Get List';
			default:
				return action;
		}
	}

	private async callAdminEmailsAPI(
		endpoint: string,
		adminKey: string,
		action: string,
		email: string
	): Promise<AdminEmailResponse> {
		const actionEndpoints: Record<string, string> = {
			add: '/admin/emails/add',
			remove: '/admin/emails/remove',
			get: '/admin/emails/get'
		};

		const apiPath = actionEndpoints[action];
		if (!apiPath) {
			throw new Error(`Invalid action: ${action}`);
		}

		const fullEndpoint = `${endpoint}${apiPath}`;
		const body: Record<string, unknown> = {
			admin_key: adminKey
		};
		if (action !== 'get') {
			body.email = email;
		}

		const response = await fetch(fullEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		let data: AdminEmailResponse = { status: 'error' };
		try {
			data = await response.json() as AdminEmailResponse;
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

	private async logAdminEmailAction(
		client: any,
		action: string,
		email: string | null,
		emails: string[],
		executor: User
	): Promise<void> {
		try {
			const logChannelId = '1439558418930208850';
			const channel = client.channels.cache.get(logChannelId);

			if (!channel) {
				console.error(`[AdminEmails] Log channel ${logChannelId} not found`);
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle('Admin Emails Updated')
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp()
				.addFields(
					{ name: 'Action', value: this.toActionLabel(action), inline: true },
					{ name: 'Total Emails', value: `${emails.length}`, inline: true }
				)
				.setFooter({ text: `${executor.tag} (${executor.id})` });

			if (email) {
				embed.addFields({ name: 'Email', value: email, inline: true });
			}

			await channel.send({ embeds: [embed] });
		} catch (error) {
			console.error('[AdminEmails] Error logging admin email action:', error);
		}
	}
}

export = AdminEmails;
