import Base = require('../../core/module/base');
import { SlashCommandBuilder, ChatInputCommandInteraction, User } from 'discord.js';

class RandomReaction extends Base {
	private static readonly MAX_REACTION_USERS_PAGE = 100;

	constructor() {
		super('common_random_reaction', 'Pick random users from a message reaction list');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('random_reaction')
				.setDescription('Pick random users who reacted to a message')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2])
				.addStringOption(option =>
					option
						.setName('message_id')
						.setDescription('Message ID to pull reactions from')
						.setRequired(true)
				)
				.addIntegerOption(option =>
					option
						.setName('count')
						.setDescription('Number of winners to pick')
						.setRequired(true)
						.setMinValue(1)
				),
			execute: this.executeRandomReaction.bind(this)
		});
	}

	private pickRandomUsers(users: User[], count: number): User[] {
		const pool = [...users];
		const selected: User[] = [];
		for (let i = 0; i < count; i += 1) {
			const index = Math.floor(Math.random() * pool.length);
			selected.push(pool.splice(index, 1)[0]);
		}
		return selected;
	}

	private async fetchAllUsersForReaction(reaction: any): Promise<User[]> {
		const allUsers: User[] = [];
		let lastId: string | undefined;
		while (true) {
			const users = await reaction.users.fetch({
				limit: RandomReaction.MAX_REACTION_USERS_PAGE,
				after: lastId
			});
			if (users.size === 0) {
				break;
			}
			allUsers.push(...users.values());
			lastId = users.last()!.id;
			if (users.size < RandomReaction.MAX_REACTION_USERS_PAGE) {
				break;
			}
		}
		return allUsers;
	}

	async executeRandomReaction(interaction: ChatInputCommandInteraction): Promise<void> {
		const messageId = interaction.options.getString('message_id', true);
		const count = interaction.options.getInteger('count', true);

		if (!interaction.channel || !interaction.channel.isTextBased()) {
			await interaction.reply({ content: 'This command can only be used in a text channel.', flags: 64 });
			return;
		}

		await interaction.deferReply({ flags: 64 });

		const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
		if (!message) {
			await interaction.editReply('I could not access that message. Check the ID and channel permissions.');
			return;
		}

		if (message.reactions.cache.size === 0) {
			await interaction.editReply('That message has no reactions to choose from.');
			return;
		}

		const userMap = new Map<string, User>();
		for (const reaction of message.reactions.cache.values()) {
			const users = await this.fetchAllUsersForReaction(reaction);
			users.forEach(user => {
				if (!user.bot) {
					userMap.set(user.id, user);
				}
			});
		}

		const uniqueUsers = Array.from(userMap.values());
		if (uniqueUsers.length < count) {
			await interaction.editReply(
				`Only ${uniqueUsers.length} eligible user(s) reacted. You requested ${count}.`
			);
			return;
		}

		const winners = this.pickRandomUsers(uniqueUsers, count);
		const mentions = winners.map(user => `<@${user.id}>`).join('\n');
		await interaction.editReply(
			`Picked ${count} winner(s) from ${uniqueUsers.length} reactions on ${message.url}:\n${mentions}`
		);
	}
}

export = RandomReaction;
