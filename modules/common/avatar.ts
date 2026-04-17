import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, User } from 'discord.js';
const { EMBED_COLOR_PRIMARY } = require('../../core/common/theme');

class Avatar extends Base {
	constructor() {
		super('common_avatar', 'Get a user avatar image');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('avatar')
				.setDescription('Show the avatar of a user')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2])
				.addUserOption((opt) =>
					opt
						.setName('user')
						.setDescription('Target user (defaults to you)')
						.setRequired(false)
				),
			execute: this.executeAvatar.bind(this)
		});
	}

	private buildAvatarEmbed(user: User, url: string): EmbedBuilder {
		return new EmbedBuilder()
			.setTitle(`${user.username}'s Avatar`)
			.setColor(EMBED_COLOR_PRIMARY)
			.setImage(url)
			.setTimestamp()
			.setFooter({ text: `Requested for ${user.tag}` });
	}

	async executeAvatar(interaction: ChatInputCommandInteraction): Promise<void> {
		const target = interaction.options.getUser('user') ?? interaction.user;
		const url = target.displayAvatarURL({ size: 1024, extension: 'png' });
		const embed = this.buildAvatarEmbed(target, url);
		await interaction.reply({ embeds: [embed] });
	}
}

export = Avatar;

