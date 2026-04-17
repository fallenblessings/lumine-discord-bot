import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, ColorResolvable } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

type LookupUser = {
	id: string;
	email: string;
	email_verified?: boolean;
	has_password?: boolean;
	auth_providers?: string[];
	last_login_at?: string | null;
	star_dust?: number;
	used_daily_stardust?: number;
	free_stardust?: number;
	daily_stardust_resets_at?: string;
	premium_active?: boolean;
	premium_start_at?: string | null;
	premium_end_at?: string | null;
	premium_source?: string;
	premium_note?: string;
	delete_requested_at?: string | null;
	deleted_at?: string | null;
	purge_after?: string | null;
	created_at?: string;
	updated_at?: string;
};

type LookupIP = {
	ip: string;
	count?: number;
	first_seen?: string;
	last_seen?: string;
	sources?: string[];
};

type LookupAudit = {
	total_events?: number;
	unique_ip_count?: number;
	unique_ips?: LookupIP[];
};

type LookupResponse = {
	status?: string;
	message?: string;
	user?: LookupUser;
	audit?: LookupAudit;
};

class LumineLookup extends Base {
	private static readonly LOOKUP_TIME_ZONE = 'America/New_York';

	constructor() {
		super('lumine_lookup', 'Lookup a Lumine user by email or user ID');
		this.initializeCommands();
	}

	initializeCommands(): void {
		this.registerCommand({
			data: new SlashCommandBuilder()
				.setName('lumine_lookup')
				.setDescription('Lookup a Lumine user by email or user ID')
				.setIntegrationTypes([0, 1])
				.setContexts([0, 1, 2])
				.addStringOption(o =>
					o.setName('email')
						.setDescription('Email to look up')
						.setRequired(false))
				.addStringOption(o =>
					o.setName('user_id')
						.setDescription('Lumine user ID to look up')
						.setRequired(false)),
			execute: this.executeLookup.bind(this)
		});
	}

	formatTimestamp(value?: string | null): string {
		if (!value) return 'Never';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', {
			timeZone: LumineLookup.LOOKUP_TIME_ZONE,
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			second: '2-digit',
			hour12: true,
			timeZoneName: 'short',
		}).format(parsed);
	}

	formatShortTimestamp(value?: string | null): string {
		if (!value) return 'unknown';
		return this.formatTimestamp(value);
	}

	formatBoolean(value: boolean | undefined, truthy: string, falsy: string): string {
		return value ? truthy : falsy;
	}

	formatPremium(user: LookupUser): string {
		if (!user.premium_active) {
			return 'Inactive';
		}

		const parts = ['Active'];
		if (user.premium_start_at) {
			parts.push(`start ${this.formatShortTimestamp(user.premium_start_at)}`);
		}
		if (user.premium_end_at) {
			parts.push(`end ${this.formatShortTimestamp(user.premium_end_at)}`);
		}
		if (user.premium_source) {
			parts.push(`source ${user.premium_source}`);
		}
		if (user.premium_note) {
			parts.push(`note ${this.truncate(user.premium_note, 120)}`);
		}
		return parts.join(' | ');
	}

	formatAccountState(user: LookupUser): string {
		const parts: string[] = [];
		if (user.deleted_at) {
			parts.push(`Deleted ${this.formatShortTimestamp(user.deleted_at)}`);
		} else {
			parts.push('Active');
		}
		if (user.delete_requested_at) {
			parts.push(`Delete requested ${this.formatShortTimestamp(user.delete_requested_at)}`);
		}
		if (user.purge_after) {
			parts.push(`Purge after ${this.formatShortTimestamp(user.purge_after)}`);
		}
		return parts.join(' | ');
	}

	formatProviders(providers?: string[]): string {
		if (!providers || providers.length === 0) return 'None';
		return providers.join(', ');
	}

	truncate(value: string, maxLength: number): string {
		if (value.length <= maxLength) return value;
		return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
	}

	buildIPHistoryValue(audit: LookupAudit, maxLength = 1000): string {
		const uniqueIPs = audit.unique_ips ?? [];
		if (uniqueIPs.length === 0) {
			return 'No recorded IPs';
		}

		const lines = uniqueIPs.map((entry) => {
			const sources = entry.sources && entry.sources.length > 0 ? ` | ${entry.sources.join(', ')}` : '';
			const count = typeof entry.count === 'number' ? `${entry.count}x` : '?x';
			return `${entry.ip} | ${count} | last ${this.formatShortTimestamp(entry.last_seen)}${sources}`;
		});

		let value = '';
		let shownCount = 0;
		for (const line of lines) {
			const nextValue = value ? `${value}\n${line}` : line;
			if (nextValue.length > maxLength) {
				break;
			}
			value = nextValue;
			shownCount++;
		}

		if (!value) {
			return this.truncate(lines[0], maxLength);
		}

		const omittedCount = uniqueIPs.length - shownCount;
		if (omittedCount <= 0) {
			return value;
		}

		const notice = `\n...and ${omittedCount} more IPs not shown`;
		if ((value.length + notice.length) <= maxLength) {
			return `${value}${notice}`;
		}
		return value;
	}

	buildSummaryEmbed(user: LookupUser, audit: LookupAudit, criteriaLabel: string, criteriaValue: string): EmbedBuilder {
		const embed = new EmbedBuilder()
			.setTitle('Lumine Lookup')
			.setColor(EMBED_COLOR_PRIMARY as ColorResolvable)
			.setTimestamp()
			.addFields(
				{ name: 'Lookup', value: `${criteriaLabel}: ${criteriaValue}`, inline: false },
				{ name: 'Email', value: user.email || 'Unknown', inline: true },
				{ name: 'User ID', value: user.id || 'Unknown', inline: true },
				{ name: 'Providers', value: this.formatProviders(user.auth_providers), inline: true },
				{
					name: 'Account Flags',
					value: [
						this.formatBoolean(user.email_verified, 'Email verified', 'Email unverified'),
						this.formatBoolean(user.has_password, 'Password set', 'No password'),
					].join(' | '),
					inline: false,
				},
				{ name: 'Last Login', value: this.formatTimestamp(user.last_login_at), inline: true },
				{
					name: 'Stardust',
					value: `Balance ${user.star_dust ?? 0} | Used today ${user.used_daily_stardust ?? 0} | Free left ${user.free_stardust ?? 0}`,
					inline: true,
				},
				{ name: 'Premium', value: this.formatPremium(user), inline: false },
				{ name: 'Account State', value: this.formatAccountState(user), inline: false },
				{
					name: 'Created / Updated',
					value: `Created ${this.formatTimestamp(user.created_at)}\nUpdated ${this.formatTimestamp(user.updated_at)}`,
					inline: false,
				},
				{
					name: 'Sign-in Audit',
					value: `${audit.total_events ?? 0} auth events | ${audit.unique_ip_count ?? 0} unique IPs`,
					inline: false,
				},
				{
					name: 'IP History',
					value: this.buildIPHistoryValue(audit),
					inline: false,
				},
			);

		return embed;
	}

	async logLookup(
		client: any,
		criteriaLabel: string,
		criteriaValue: string,
		user: LookupUser | undefined,
		creator: any,
	): Promise<void> {
		try {
			const logChannelId = '1439558418930208850';
			const channel = client.channels.cache.get(logChannelId);

			if (!channel) {
				console.error(`[LumineLookup] Log channel ${logChannelId} not found`);
				return;
			}

			const embed = new EmbedBuilder()
				.setTitle('Lumine Lookup')
				.setColor(EMBED_COLOR_PRIMARY as ColorResolvable)
				.addFields(
					{ name: 'Lookup', value: `${criteriaLabel}: ${criteriaValue}`, inline: false },
					{ name: 'Result', value: user ? `${user.email} (${user.id})` : 'No matching user found', inline: false },
				)
				.setFooter({ text: `${creator.tag} (${creator.id})` })
				.setTimestamp();

			await channel.send({ embeds: [embed] });
		} catch (error) {
			console.error('[LumineLookup] Error logging lookup:', error);
		}
	}

	async executeLookup(interaction: ChatInputCommandInteraction): Promise<void> {
		const LUMINE_USERS = process.env.LUMINE_USERS ? process.env.LUMINE_USERS.split(',') : [];
		if (LUMINE_USERS.length > 0 && !LUMINE_USERS.includes(interaction.user.id)) {
			const embed = new EmbedBuilder()
				.setTitle('Access Denied')
				.setDescription('You are not authorized to use this command.')
				.setColor(EMBED_COLOR_ERROR as ColorResolvable)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		const API_ADMIN_KEY = process.env.API_ADMIN_KEY;
		const API_ENDPOINT = process.env.API_ENDPOINT;
		const email = interaction.options.getString('email');
		const userID = interaction.options.getString('user_id');

		const provided = [email ? 'email' : null, userID ? 'user_id' : null].filter(Boolean) as string[];
		if (provided.length !== 1) {
			const embed = new EmbedBuilder()
				.setTitle('Invalid Input')
				.setDescription('Provide exactly one of email or user_id.')
				.setColor(EMBED_COLOR_ERROR as ColorResolvable)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		if (!API_ADMIN_KEY || !API_ENDPOINT) {
			const embed = new EmbedBuilder()
				.setTitle('Error')
				.setDescription('API configuration missing. Please check environment variables.')
				.setColor(EMBED_COLOR_ERROR as ColorResolvable)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
			return;
		}

		try {
			const body: Record<string, string> = { admin_key: API_ADMIN_KEY };
			if (email) body.email = email;
			if (userID) body.user_id = userID;

			const res = await fetch(`${API_ENDPOINT}/admin/users/lookup`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const payload = await res.json().catch(() => ({})) as LookupResponse;
			if (!res.ok) {
				const message = payload.message || `${res.status} ${res.statusText}`;
				throw new Error(message);
			}

			if (!payload.user) {
				throw new Error('Lookup succeeded but no user data was returned.');
			}

			const user = payload.user;
			const audit = payload.audit ?? {};
			const criteriaLabel = email ? 'Email' : 'User ID';
			const criteriaValue = email || userID || 'unknown';

			await interaction.reply({ embeds: [this.buildSummaryEmbed(user, audit, criteriaLabel, criteriaValue)] });
			await this.logLookup(interaction.client, criteriaLabel, criteriaValue, user, interaction.user);
		} catch (error) {
			const embed = new EmbedBuilder()
				.setTitle('API Error')
				.setDescription(`Lookup failed: ${error instanceof Error ? error.message : String(error)}`)
				.setColor(EMBED_COLOR_ERROR as ColorResolvable)
				.setTimestamp();
			await interaction.reply({ embeds: [embed], flags: 64 });
		}
	}
}

export = LumineLookup;
