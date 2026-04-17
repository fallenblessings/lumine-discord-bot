import Base = require('../../core/module/base');
import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

interface EarningsCategoryResponse {
	key: string;
	label: string;
	amount_cents: number;
	amount_formatted: string;
	detail?: string;
	included_in_total: boolean;
}

interface EarningsPeriodResponse {
	key: string;
	label: string;
	start: string;
	end: string;
}

interface EarningsDataResponse {
	generated_at: string;
	currency: string;
	period: EarningsPeriodResponse;
	categories: EarningsCategoryResponse[];
	total_cents: number;
	total_formatted: string;
	warnings?: string[];
}

interface EarningsApiResponse {
	status: string;
	message?: string;
	data?: EarningsDataResponse;
}

class LumineEarnings extends Base {
	private readonly mountainTimeZone = 'America/Denver';

	constructor() {
		super('lumine_earnings', 'Display Lumine earnings across providers');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('lumine_earnings')
				.setDescription('View Lumine earnings from the local admin API')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2])
				.addStringOption(option =>
					option
						.setName('period')
						.setDescription('Time window to summarize')
						.setRequired(false)
						.addChoices(
							{ name: 'Today', value: 'today' },
							{ name: 'Yesterday', value: 'yesterday' },
							{ name: 'Week', value: 'week' },
							{ name: 'Last Week', value: 'last_week' },
							{ name: 'Month', value: 'month' },
							{ name: 'Year', value: 'year' },
							{ name: 'All', value: 'all' }
						))
				.addStringOption(option =>
					option
						.setName('full_view')
						.setDescription('Show the expanded earnings breakdown')
						.setRequired(false)
						.addChoices(
							{ name: 'Off', value: 'off' },
							{ name: 'On', value: 'on' }
						)),
			execute: this.executeEarnings.bind(this)
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

	private resolveLocalAPIEndpoint(): string {
		const rawEndpoint = (process.env.API_ENDPOINT || '').trim();
		if (!rawEndpoint) {
			throw new Error('API_ENDPOINT is missing.');
		}

		let parsed: URL;
		try {
			parsed = new URL(rawEndpoint);
		} catch (error) {
			throw new Error(`API_ENDPOINT is invalid: ${error instanceof Error ? error.message : String(error)}`);
		}

		const hostname = parsed.hostname.toLowerCase();
		const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
		if (!allowedHosts.has(hostname)) {
			throw new Error('API_ENDPOINT must point to localhost or loopback for /lumine_earnings.');
		}

		return rawEndpoint.replace(/\/+$/, '');
	}

	private formatUSDCents(amountCents: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amountCents / 100);
	}

	private formatMountainDateTime(value: string): string {
		return new Intl.DateTimeFormat('en-US', {
			timeZone: this.mountainTimeZone,
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			timeZoneName: 'short'
		}).format(new Date(value));
	}

	private getCategoryByKey(data: EarningsDataResponse, key: string): EarningsCategoryResponse | null {
		return data.categories.find(category => category.key === key) ?? null;
	}

	private summarizeEarnings(data: EarningsDataResponse): {
		advertisement: string;
		offerWall: string;
		stripe: string;
		offerWallCompletes: EarningsCategoryResponse | null;
		offerWallOuts: EarningsCategoryResponse | null;
		advertisementCategory: EarningsCategoryResponse | null;
		stripeCategory: EarningsCategoryResponse | null;
	} {
		const advertisementCategory = this.getCategoryByKey(data, 'ad_monetization');
		const offerWallCompletes = this.getCategoryByKey(data, 'offer_wall_completes');
		const offerWallOuts = this.getCategoryByKey(data, 'offer_wall_outs');
		const stripeCategory = this.getCategoryByKey(data, 'stripe_net');

		const advertisementCents = advertisementCategory?.amount_cents ?? 0;
		const offerWallCents = (offerWallCompletes?.amount_cents ?? 0) + (offerWallOuts?.amount_cents ?? 0);
		const stripeCents = stripeCategory?.amount_cents ?? 0;

		return {
			advertisement: this.formatUSDCents(advertisementCents),
			offerWall: this.formatUSDCents(offerWallCents),
			stripe: this.formatUSDCents(stripeCents),
			offerWallCompletes,
			offerWallOuts,
			advertisementCategory,
			stripeCategory
		};
	}

	private buildCompactEmbed(data: EarningsDataResponse): EmbedBuilder {
		const summary = this.summarizeEarnings(data);

		const embed = new EmbedBuilder()
			.setTitle(`Lumine Earnings | ${data.period.label}`)
			.setDescription(
				[
					`Advertisement: ${summary.advertisement}`,
					`Offer Wall: ${summary.offerWall}`,
					`Stripe: ${summary.stripe}`,
					'',
					`Total Earnings: ${data.total_formatted}`
				].join('\n')
				)
				.setColor(EMBED_COLOR_PRIMARY)
				.setTimestamp(new Date(data.generated_at));

		return embed;
	}

	private buildFullEmbed(data: EarningsDataResponse): EmbedBuilder {
		const summary = this.summarizeEarnings(data);
		const overviewLines = [
			`Advertisement: ${summary.advertisement}`,
			`Offer Wall: ${summary.offerWall}`,
			`Stripe: ${summary.stripe}`,
			'',
			`Total Earnings: ${data.total_formatted}`
		];

		const embed = new EmbedBuilder()
			.setTitle(`Lumine Earnings | ${data.period.label}`)
			.setDescription(
				[
					`Window (Mountain Time): ${this.formatMountainDateTime(data.period.start)} to ${this.formatMountainDateTime(data.period.end)}`
				].join('\n')
			)
			.setColor(EMBED_COLOR_PRIMARY)
			.setTimestamp(new Date(data.generated_at))
			.addFields({
				name: 'Overview',
				value: overviewLines.join('\n'),
				inline: false
			});

		if (summary.advertisementCategory) {
			embed.addFields({
				name: 'Advertisement',
				value: summary.advertisementCategory.detail
					? `${summary.advertisementCategory.amount_formatted}\n${summary.advertisementCategory.detail}`
					: summary.advertisementCategory.amount_formatted,
				inline: true
			});
		}

		if (summary.offerWallCompletes || summary.offerWallOuts) {
			const offerWallLines: string[] = [];
			if (summary.offerWallCompletes) {
				offerWallLines.push(`Completes: ${summary.offerWallCompletes.amount_formatted}`);
				if (summary.offerWallCompletes.detail) {
					offerWallLines.push(summary.offerWallCompletes.detail);
				}
			}
			if (summary.offerWallOuts) {
				if (offerWallLines.length > 0) {
					offerWallLines.push('');
				}
				offerWallLines.push(`Outs: ${summary.offerWallOuts.amount_formatted}`);
				if (summary.offerWallOuts.detail) {
					offerWallLines.push(summary.offerWallOuts.detail);
				}
			}

			embed.addFields({
				name: 'Offer Wall Breakdown',
				value: offerWallLines.join('\n').slice(0, 1024),
				inline: true
			});
		}

		if (summary.stripeCategory) {
			embed.addFields({
				name: 'Stripe',
				value: summary.stripeCategory.detail
					? `${summary.stripeCategory.amount_formatted}\n${summary.stripeCategory.detail}`
					: summary.stripeCategory.amount_formatted,
				inline: false
			});
		}

		if (data.warnings && data.warnings.length > 0) {
			embed.addFields({
				name: 'Warnings',
				value: data.warnings.join('\n').slice(0, 1024),
				inline: false
			});
		}

		return embed;
	}

	async executeEarnings(interaction: ChatInputCommandInteraction): Promise<void> {
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

		const apiAdminKey = (process.env.API_ADMIN_KEY || '').trim();
		if (!apiAdminKey) {
			const embed = new EmbedBuilder()
				.setTitle('Error')
				.setDescription('API_ADMIN_KEY is missing.')
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		let apiEndpoint: string;
		try {
			apiEndpoint = this.resolveLocalAPIEndpoint();
		} catch (error) {
			const embed = new EmbedBuilder()
				.setTitle('Error')
				.setDescription(error instanceof Error ? error.message : String(error))
				.setColor(EMBED_COLOR_ERROR)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		const period = interaction.options.getString('period') ?? 'today';
		const fullView = interaction.options.getString('full_view') === 'on';
		await interaction.deferReply({ flags: 64 });

		try {
			const result = await this.fetchEarnings(apiEndpoint, apiAdminKey, period);
			const data = result.data;
			if (!data) {
				throw new Error('API response did not include earnings data.');
			}

			const embed = fullView
				? this.buildFullEmbed(data)
				: this.buildCompactEmbed(data);

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

	private async fetchEarnings(endpoint: string, adminKey: string, period: string): Promise<EarningsApiResponse> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 30000);

		try {
			const response = await fetch(`${endpoint}/admin/earnings`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Admin-Key': adminKey
				},
				body: JSON.stringify({
					admin_key: adminKey,
					period
				}),
				signal: controller.signal
			});

			let data: EarningsApiResponse = { status: 'error' };
			try {
				data = await response.json() as EarningsApiResponse;
			} catch {
				// Leave the fallback payload in place.
			}

			if (!response.ok || data.status !== 'success') {
				const retryAfter = response.headers.get('Retry-After');
				const message = data.message || `${response.status} ${response.statusText}`;
				if (response.status === 429 && retryAfter) {
					throw new Error(`${message} (retry after ${retryAfter}s)`);
				}
				throw new Error(message);
			}

			return data;
		} finally {
			clearTimeout(timeout);
		}
	}
}

export = LumineEarnings;
