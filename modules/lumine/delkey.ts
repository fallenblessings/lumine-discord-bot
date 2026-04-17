import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

class DelKey extends Base {
	constructor() {
		super('lumine_delkey', 'Delete Lumine auth keys');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('lumine_delkey')
				.setDescription('Delete an existing Lumine auth key')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2])
				.addStringOption(o =>
					o.setName('auth_key')
						.setDescription('Auth key to delete')
						.setRequired(true)),
			execute: this.executeDelKey.bind(this)
		});
	}

	async executeDelKey(interaction: ChatInputCommandInteraction): Promise<void> {
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

		const API_ADMIN_KEY = process.env.API_ADMIN_KEY;
		const API_ENDPOINT = process.env.API_ENDPOINT;
		const authKey = interaction.options.getString('auth_key');

		if (!API_ADMIN_KEY || !API_ENDPOINT) {
			const embed = new EmbedBuilder()
				.setTitle('Error')
				.setDescription('API configuration missing. Please check environment variables.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		try {
			const success = await this.deleteKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, authKey!);
			const embed = new EmbedBuilder()
				.setTitle(success ? 'Key Deleted' : 'Delete Failed')
				.setDescription(success ? `Auth key \`${authKey}\` deleted.` : 'Failed to delete key')
				.setColor(success ? EMBED_COLOR_PRIMARY : EMBED_COLOR_ERROR)
				.setTimestamp();

			if (success) {
				await interaction.reply({ embeds: [embed] });
			} else {
				await interaction.reply({ embeds: [embed], flags: 64 });
			}
			
			// Log auth key deletion
			if (success) {
				await this.logAuthKeyDeletion(interaction.client, authKey!, interaction.user);
			}
		} catch (error) {
			const embed = new EmbedBuilder()
				.setTitle('API Error')
				.setDescription(`Failed to delete key: ${error instanceof Error ? error.message : String(error)}`)
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
		}
	}

	async logAuthKeyDeletion(client: any, authKey: string, creator: any): Promise<void> {
		try {
			const logChannelId = '1439558418930208850';
			const channel = client.channels.cache.get(logChannelId);
			
			if (!channel) {
				console.error(`[DelKey] Log channel ${logChannelId} not found`);
				return;
			}
			
			const embed = new EmbedBuilder()
				.setTitle('Auth Key Deleted')
				.addFields(
					{ name: 'Auth Key', value: `\`${authKey}\``, inline: false }
				)
				.setFooter({ text: `${creator.tag} (${creator.id})` })
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp();
			
			await channel.send({ embeds: [embed] });
		} catch (error) {
			console.error('[DelKey] Error logging auth key deletion:', error);
		}
	}

	async deleteKeyViaAPI(endpoint: string, adminKey: string, authKey: string): Promise<boolean> {
		const fullEndpoint = `${endpoint}/auth/delete`;
		const response = await fetch(fullEndpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ admin_key: adminKey, auth_key: authKey })
		});
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
		}
		const data = await response.json().catch(() => ({})) as { status?: string };
		return data.status === 'success' || response.status === 200;
	}
}

export = DelKey;

