import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

class Shutdown extends Base {
	constructor() {
		super('privileged_shutdown', 'Shutdown, Reboot, Restart, Stop command');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('shutdown')
				.setDescription('Shutdown, Reboot, Restart, Stop command')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2]),
			execute: this.executeShutdown.bind(this)
		});
	}

	isPrivileged(userId: string): boolean {
		const list = process.env.PRIVILEGED_USERS ? process.env.PRIVILEGED_USERS.split(',').map(s => s.trim()).filter(Boolean) : [];
		return list.includes(userId);
	}

	async executeShutdown(interaction: ChatInputCommandInteraction): Promise<void> {
		if (!this.isPrivileged(interaction.user.id)) {
            const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('You are not permitted to use this command.')
                .setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		try {
			const embed = new EmbedBuilder()
				.setTitle('Shutdown')
				.setDescription('Bot is shutting down...')
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
		} catch {}
		
		try { interaction.client.destroy(); } catch {}
		setTimeout(() => process.exit(0), 300);
	}
}

export = Shutdown;

