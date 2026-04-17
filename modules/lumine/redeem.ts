import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

interface StarDustResponse {
	status: string;
	message?: string;
	star_dust?: number;
}

class LumineRedeem extends Base {
	private readonly GUILD_ID = '1424798387664064687';
	private readonly REQUIRED_ROLE_ID = '1427774002012749836';
	private readonly REDEEM_AMOUNT = 150;
	private readonly redeemJsonPath: string;
	private readonly usedUserIds: Set<string>;

	constructor() {
		super('lumine_redeem', 'One-time Lumine stardust redeem command');
		this.redeemJsonPath = path.join(process.cwd(), 'assets', 'lumine-redeem.json');
		this.usedUserIds = new Set<string>();
		this.initializeCommands();
	}

	async initialize(): Promise<void> {
		await this.loadRedeemData();
	}

	private async loadRedeemData(): Promise<void> {
		try {
			if (fs.existsSync(this.redeemJsonPath)) {
				const data = fs.readFileSync(this.redeemJsonPath, 'utf8');
				const userIds = JSON.parse(data);
				if (Array.isArray(userIds)) {
					for (const userId of userIds) {
						if (typeof userId === 'string') {
							this.usedUserIds.add(userId);
						}
					}
				}
			} else {
				fs.mkdirSync(path.dirname(this.redeemJsonPath), { recursive: true });
				fs.writeFileSync(this.redeemJsonPath, JSON.stringify([], null, 2));
			}
		} catch (error) {
			console.error('[LumineRedeem] Error loading redeem data:', error);
		}
	}

	private async saveRedeemData(): Promise<void> {
		try {
			fs.writeFileSync(this.redeemJsonPath, JSON.stringify(Array.from(this.usedUserIds), null, 2));
		} catch (error) {
			console.error('[LumineRedeem] Error saving redeem data:', error);
		}
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('lumine_redeem')
				.setDescription('Redeem 150 stardust once for your Lumine account email')
				.setIntegrationTypes([0])
				.setContexts([0])
				.addStringOption(option =>
					option
						.setName('email')
						.setDescription('Your Lumine account email address')
						.setRequired(true)),
			execute: this.executeRedeem.bind(this)
		});
	}

	private async executeRedeem(interaction: ChatInputCommandInteraction): Promise<void> {
		if (!interaction.guild || interaction.guild.id !== this.GUILD_ID) {
			const embed = new EmbedBuilder()
				.setTitle('Invalid Guild')
				.setDescription('This command can only be used in the Lumine Discord server.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
		if (!member || !(member instanceof GuildMember) || !member.roles.cache.has(this.REQUIRED_ROLE_ID)) {
			const embed = new EmbedBuilder()
				.setTitle('Missing Required Role')
				.setDescription('You need the required role to use this command.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		if (this.usedUserIds.has(interaction.user.id)) {
			const embed = new EmbedBuilder()
				.setTitle('Already Redeemed')
				.setDescription('You have already redeemed your 150 stardust reward. This command can only be used once per user.')
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

		const email = interaction.options.getString('email', true).toLowerCase().trim();
		await interaction.deferReply({ flags: 64 });

		try {
			const result = await this.callStarDustAddAPI(API_ENDPOINT, API_ADMIN_KEY, email, this.REDEEM_AMOUNT);

			if (result.status !== 'success') {
				const message = result.message || 'An unknown error occurred.';
				const notFound = this.isEmailMissingError(message);
				const embed = new EmbedBuilder()
					.setTitle(notFound ? 'Email Not Found' : 'Redeem Failed')
					.setDescription(
						notFound
							? 'That email was not found. Please try again with your Lumine account email.'
							: message
					)
					.setColor(EMBED_COLOR_ERROR)
					.setTimestamp();
				await interaction.editReply({ embeds: [embed] });
				return;
			}

			this.usedUserIds.add(interaction.user.id);
			await this.saveRedeemData();

			const embed = new EmbedBuilder()
				.setTitle('Redeem Successful')
				.setDescription('150 stardust has been added to your account.')
				.addFields(
					{ name: 'Email', value: email, inline: true },
					{ name: 'Amount', value: this.REDEEM_AMOUNT.toLocaleString(), inline: true },
					{ name: 'Current Balance', value: `${result.star_dust?.toLocaleString() ?? 0} Star Dust`, inline: true }
				)
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp();
			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			const embed = new EmbedBuilder()
				.setTitle('API Error')
				.setDescription(error instanceof Error ? error.message : String(error))
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.editReply({ embeds: [embed] });
		}
	}

	private isEmailMissingError(message: string): boolean {
		const lowerMessage = message.toLowerCase();
		return lowerMessage.includes('not exist') || lowerMessage.includes('not found') || lowerMessage.includes('does not exist');
	}

	private async callStarDustAddAPI(endpoint: string, adminKey: string, email: string, amount: number): Promise<StarDustResponse> {
		const fullEndpoint = `${endpoint}/admin/users/stardust/add`;
		const response = await fetch(fullEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				admin_key: adminKey,
				email,
				amount
			})
		});

		let data: StarDustResponse;
		try {
			data = await response.json() as StarDustResponse;
		} catch {
			throw new Error(`API request failed: ${response.status} ${response.statusText}`);
		}

		if (!response.ok && data.status !== 'success') {
			return data;
		}

		return data;
	}
}

export = LumineRedeem;
