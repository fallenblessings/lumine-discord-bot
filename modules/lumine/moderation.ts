import Base = require('../../core/module/base');
import {
    Attachment,
    Client,
    EmbedBuilder,
    GuildMember,
    GuildTextBasedChannel,
    Message,
    PartialMessage,
    PermissionsBitField
} from 'discord.js';
import * as dotenv from 'dotenv';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import {
    computeTimeoutDurationFromScore,
    formatTimeoutDuration,
    selectMaxScorePerUser
} from '../../core/common/moderation_utils';

dotenv.config();

type ModerationMessage = {
    messageId: string;
    channelId: string;
    userId: string;
    timestamp: number;
    content: string;
    jumpLink?: string;
};

type ModelResponseItem = {
    message_id: string;
    user_id: string;
    score: number;
    category: string;
    rationale: string;
    confidence: number;
};

type ModerationConfig = {
    moderatedGuildId: string;
    moderationChannelId: string;
    configChannelId: string;
    supportCategoryId: string;
    protectedRoles: string[];
    allowedDomains: string[];
    allowedConfigExtensions: string[];
    model: string;
    openAiApiKey: string;
    batchIntervalMs: number;
    messageTtlMs: number;
    recentlyPunishedTtlMs: number;
};

type ModerationAuditRecord = {
    userId: string;
    score: number;
    durationMs: number;
    timestamp: number;
    messageIds: string[];
};

type PolicyViolation = {
    summary: string;
    details: string[];
    blockedDomains: string[];
};

const CATEGORY_LABELS: Record<string, string> = {
    safe: 'safe',
    harassment: 'harassment',
    hate_or_slur: 'hate/offensive language',
    bypass_or_evasion: 'bypass/obfuscation',
    nsfw: 'NSFW',
    spam: 'spam',
    illegal_activity: 'illegal activity',
    other: 'other'
};

const MAX_SCORE = 10080;
const MIN_TIMEOUT_SCORE = 60;
const IMMEDIATE_TIMEOUT_SCORE = 1440;
const LINK_TIMEOUT_MS = 60 * 1000;
const ENFORCEABLE_CATEGORIES = new Set(['hate_or_slur', 'bypass_or_evasion']);
const DEFAULT_PROTECTED_ROLE_IDS = [
    '1426864375817572442',
    '1459377100745212193',
    '1477923424545538088',
    '1445863263085531290',
    '1432764258323665078'
];
const DEFAULT_ALLOWED_DOMAIN_INPUTS = [
    'https://lumineproxy.org',
    'https://luminemc.org',
    'https://www.youtube.com/',
    'https://drive.google.com',
];
const DEFAULT_CONFIG_FILE_EXTENSIONS = [
    '.json',
    '.jsonc',
    '.cfg',
    '.conf',
    '.ini',
    '.toml',
    '.yaml',
    '.yml',
    '.properties'
];
const IMAGE_FILE_EXTENSIONS = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.tiff',
    '.svg'
];
const URL_CANDIDATE_REGEX = /(?:https?:\/\/|www\.)[^\s<]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<]+/gi;
const IMMEDIATE_SLUR_REGEX = /n+(?:i+g{2,}e+r+|e+g{2,}e+r+|i+g{2,}a+)/i;
const IMMEDIATE_SLUR_CHAR_GROUPS: Array<{ replacement: string; chars: string[] }> = [
    {
        replacement: 'n',
        chars: [
            'n', '|', '\\', '🇳', 'ո', 'ռ', 'ń', 'ņ', 'ŋ', 'ñ', 'ɴ', 'ɳ', 'η', 'п', 'ᴎ', 'ᚾ', 'ꞃ',
            'Ｎ', '𝐧', '𝑛', '𝒏', '𝓃', '𝓷', '𝔫', '𝕟', '𝖓', '𝗻', '𝘯', '𝙣', '𝚗', 'ℕ',
            'Ⓝ', '⒩', '🄽', '🅝', '🅽', '𝕹'
        ]
    },
    {
        replacement: 'i',
        chars: [
            'i', '1', '!', '|', 'l', '🇮', 'ℹ️', 'ı', 'ɩ', 'ɪ', 'ӏ', 'Ꭵ', 'ꙇ', 'ꭵ', 'ǀ', 'Ι', 'І', 'Ӏ',
            '׀', 'ו', 'ן', '١', '۱', 'ا', 'Ⲓ', 'ⵏ', 'ꓲ', '𐊊', '𐌉', '𐌠', '𖼨', 'ﺍ', 'ﺎ', '￨',
            'í', 'ì', 'î', 'ï', 'ĩ', 'ī', 'į', 'ι', 'і', 'ᴉ', 'Ｉ', 'İ', 'ℑ', 'ℐ',
            '𝐢', '𝑖', '𝒊', '𝓲', '𝔦', '𝕚', '𝖎', '𝗶', '𝘪', '𝙞', '𝚒', '𝙄',
            'ⓘ', 'Ⓘ', '🄸', '🅘', '🅸', '𝕴'
        ]
    },
    {
        replacement: 'g',
        chars: [
            'g', '9', '🇬', 'ƍ', 'ɡ', 'ᶃ', 'ɢ', 'ɠ', 'ց', 'ԍ', 'ġ', 'ĝ', 'ğ', 'ģ', 'Ｇ',
            '𝐠', '𝑔', '𝒈', '𝓰', '𝔤', '𝕘', '𝖌', '𝗴', '𝘨', '𝙜', '𝚐', '𝙂',
            'ⓖ', 'Ⓖ', '🄶', '🅖', '🅶', '🆖', '𝕲'
        ]
    },
    {
        replacement: 'e',
        chars: [
            'e', '3', '£', '🇪', 'е', 'ҽ', 'ꬲ', 'ė', 'ê', 'ë', 'ē', 'ę', 'ě', 'ȩ', 'ɇ', 'ε', 'є', '℮', 'Ꭼ', 'Ｅ',
            '𝐞', '𝑒', '𝒆', '𝓮', '𝔢', '𝕖', '𝖊', '𝗲', '𝘦', '𝙚', '𝚎', '𝙀',
            'ⓔ', 'Ⓔ', '🄴', '🅔', '🅴', '𝕰'
        ]
    },
    {
        replacement: 'a',
        chars: [
            'a', '4', '@', '🇦', 'а', 'ɑ', 'á', 'à', 'â', 'ä', 'ã', 'å', 'ā', 'ă', 'ą', 'ǎ', 'ȧ', 'ɐ', 'α', 'Ꭺ', 'ᴀ', 'ꭺ', 'ꓮ', 'Ａ',
            '𝐚', '𝑎', '𝒂', '𝓪', '𝔞', '𝕒', '𝖆', '𝗮', '𝘢', '𝙖', '𝚊', '𝘼',
            'ⓐ', 'Ⓐ', '🄰', '🅐', '🅰️', '🅰', '𝕬'
        ]
    },
    {
        replacement: 'r',
        chars: [
            'r', '🇷', '®️', 'г', 'ᴦ', 'ⲅ', 'ꭇ', 'ꭈ', 'ꮁ', 'ř', 'ŕ', 'ŗ', 'ɍ', 'ɾ', 'ʀ', 'ʁ', 'я', 'Ｒ',
            '𝐫', '𝑟', '𝒓', '𝓻', '𝔯', '𝕣', '𝖗', '𝗿', '𝘳', '𝙧', '𝚛', '𝙍',
            'ⓡ', 'Ⓡ', '🅡', '🅁', '𝕽'
        ]
    }
];
const IMMEDIATE_SLUR_CHAR_MAP: ReadonlyMap<string, string> = new Map(
    IMMEDIATE_SLUR_CHAR_GROUPS.flatMap(({ replacement, chars }) =>
        chars.map(char => [char, replacement])
    )
);
const BLOCK_ART_CHAR_REGEX = /[\u2500-\u257F\u2580-\u259F]/u;
const BLOCK_ART_GLYPH_MAP: ReadonlyMap<string, string> = new Map([
    ['█▄░█|█░▀█', 'n'],
    ['█|█', 'i'],
    ['█▀▀|█▄█', 'g'],
    ['█▀▀|██▄', 'e'],
    ['█▀█|█▀▄', 'r'],
    ['█▀|▄█', 'r'],
    ['█▀█|█▄█', 'a']
]);

const SYSTEM_PROMPT = `You are a safety evaluator for Discord messages. Evaluate each message independently. Return ONLY a JSON object with an "items" array aligned to the input array. Each item must include: message_id, user_id, score, category, rationale, confidence.

Scoring:
- score is an integer between 0 and 10080 (minutes).
- 0 means safe/allowed, joking, or ambiguous.
- Only score above 0 for clear slurs, hateful language, or deliberate slur obfuscation.
- Allow casual swearing or sarcastic banter when it is not a slur or hateful.
- 60-240 for a single clear slur, 240-1440 for repeated slurs, 1440-10080 for extreme or escalating hate.
- Bypass/obfuscation attempts of slurs should still be positive even if the exact word is unclear.

Categories must be one of: "safe", "harassment", "hate_or_slur", "bypass_or_evasion", "nsfw", "spam", "illegal_activity", "other".

Do NOT output the message content anywhere except in rationale if needed. Keep rationale short and prefer summarizing without quoting. Return only the JSON object.`;

const EXAMPLE_INPUT = [
    {
        message_id: '111',
        user_id: '222',
        content: 'I h@te you, go away.',
        timestamp: 1710000000000,
        channel_id: '333'
    },
    {
        message_id: '112',
        user_id: '223',
        content: 'Anyone got a cracked copy of that game?',
        timestamp: 1710000005000,
        channel_id: '334'
    }
];

const EXAMPLE_OUTPUT = {
    items: [
        {
            message_id: '111',
            user_id: '222',
            score: 180,
            category: 'hate_or_slur',
            rationale: 'Uses a slur with obfuscation.',
            confidence: 0.62
        },
        {
            message_id: '112',
            user_id: '223',
            score: 0,
            category: 'safe',
            rationale: 'No slur or hateful language; allowed discussion.',
            confidence: 0.55
        }
    ]
};

class LumineModeration extends Base {
    client: Client | null;
    messageCache: Map<string, ModerationMessage>;
    messageTimers: Map<string, NodeJS.Timeout>;
    auditLog: ModerationAuditRecord[];
    recentlyPunished: Map<string, number>;
    isRunningBatch: boolean;
    intervalId: NodeJS.Timeout | null;
    config: ModerationConfig;

    constructor() {
        super('lumine_moderation', 'Batch moderation for Lumine guild.');
        this.client = null;
        this.messageCache = new Map<string, ModerationMessage>();
        this.messageTimers = new Map<string, NodeJS.Timeout>();
        this.auditLog = [];
        this.recentlyPunished = new Map<string, number>();
        this.isRunningBatch = false;
        this.intervalId = null;
        this.config = this.loadConfig();
        this.initializeEventHandlers();
    }

    loadConfig(): ModerationConfig {
        const moderatedGuildId = process.env.MODERATED_GUILD_ID || '1424798387664064687';
        const moderationChannelId = process.env.MODERATION_CHANNEL_ID || '1467927567653671045';
        const configChannelId = process.env.CONFIG_CHANNEL_ID || '1459028998402080859';
        const supportCategoryId = process.env.SUPPORT_CATEGORY_ID || '1437543135323619480';
        const protectedRoles = this.parseListEnv(process.env.PROTECTED_ROLES, DEFAULT_PROTECTED_ROLE_IDS);
        const allowedDomains = this.normalizeAllowedDomains(
            this.parseListEnv(process.env.ALLOWED_LINK_DOMAINS, DEFAULT_ALLOWED_DOMAIN_INPUTS)
        );
        const allowedConfigExtensions = this.normalizeFileExtensions(
            this.parseListEnv(process.env.CONFIG_FILE_EXTENSIONS, DEFAULT_CONFIG_FILE_EXTENSIONS)
        );
        const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
        const openAiApiKey = process.env.OPENAI_API_KEY || '';
        const batchIntervalMs = Number(process.env.MODERATION_BATCH_INTERVAL_MS || 60 * 1000);
        const messageTtlMs = Number(process.env.MODERATION_MESSAGE_TTL_MS || 5 * 60 * 1000);
        const recentlyPunishedTtlMs = Number(process.env.MODERATION_RECENTLY_PUNISHED_TTL_MS || 30 * 60 * 1000);

        return {
            moderatedGuildId,
            moderationChannelId,
            configChannelId,
            supportCategoryId,
            protectedRoles,
            allowedDomains,
            allowedConfigExtensions,
            model,
            openAiApiKey,
            batchIntervalMs,
            messageTtlMs,
            recentlyPunishedTtlMs
        };
    }

    initializeEventHandlers(): void {
        this.registerEventHandler('clientReady', async () => {
            this.startScheduler();
        });

        this.registerEventHandler('messageCreate', async (message: Message) => {
            await this.handleIncomingMessage(message);
        });

        this.registerEventHandler('messageUpdate', async (
            _oldMessage: Message | PartialMessage,
            updatedMessage: Message | PartialMessage
        ) => {
            await this.handleIncomingMessage(updatedMessage);
        });

        this.registerEventHandler('messageDelete', async (message: Message | PartialMessage) => {
            this.evictCachedMessage(message.id);
        });
    }

    startScheduler(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.intervalId = setInterval(() => {
            if (this.isRunningBatch) {
                return;
            }
            void this.runBatchEvaluation();
        }, this.config.batchIntervalMs);
    }

    async handleIncomingMessage(rawMessage: Message | PartialMessage): Promise<void> {
        const message = await this.resolveMessage(rawMessage);
        if (!message) return;
        if (!this.client) {
            this.client = message.client;
        }
        if (message.author?.bot) return;
        if (message.webhookId) return;
        if (message.system) return;
        if (!message.guild || message.guild.id !== this.config.moderatedGuildId) return;
        if (!message.channel || !message.channel.isTextBased()) return;

        this.evictCachedMessage(message.id);

        const member = await this.resolveMember(message);
        if (member && this.isProtectedMember(member)) {
            return;
        }

        const policyViolation = this.getPolicyViolation(message);
        if (policyViolation) {
            await this.handlePolicyViolation(message, policyViolation);
            return;
        }

        if (!message.content || message.content.trim().length === 0) return;
        const sanitizedContent = this.sanitizeMessageContent(message.content);
        if (!sanitizedContent || sanitizedContent.trim().length === 0) return;
        if (this.isCheatDiscussion(sanitizedContent)) return;
        if (this.matchesBlockArtSlur(message.content) || this.matchesImmediateSlur(sanitizedContent)) {
            await this.handleImmediateSlur(message);
            return;
        }

        const cached: ModerationMessage = {
            messageId: message.id,
            channelId: message.channel.id,
            userId: message.author.id,
            timestamp: message.createdTimestamp,
            content: sanitizedContent,
            jumpLink: message.url
        };

        this.cacheMessage(cached);
    }

    async resolveMessage(rawMessage: Message | PartialMessage): Promise<Message | null> {
        if (!rawMessage.partial) {
            return rawMessage;
        }
        try {
            return await rawMessage.fetch();
        } catch {
            return null;
        }
    }

    async resolveMember(message: Message): Promise<GuildMember | null> {
        return message.member ?? await this.fetchMember(message.author.id);
    }

    cacheMessage(message: ModerationMessage): void {
        this.messageCache.set(message.messageId, message);
        const existingTimer = this.messageTimers.get(message.messageId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(() => {
            this.messageCache.delete(message.messageId);
            this.messageTimers.delete(message.messageId);
        }, this.config.messageTtlMs);
        this.messageTimers.set(message.messageId, timer);
    }

    evictCachedMessage(messageId: string): void {
        this.messageCache.delete(messageId);
        const timer = this.messageTimers.get(messageId);
        if (timer) {
            clearTimeout(timer);
            this.messageTimers.delete(messageId);
        }
    }

    getPolicyViolation(message: Message): PolicyViolation | null {
        const details: string[] = [];
        const blockedDomains = this.extractBlockedDomains(message.content);
        if (blockedDomains.length > 0) {
            details.push(
                `Blocked domain${blockedDomains.length === 1 ? '' : 's'}: ${blockedDomains.join(', ')}`
            );
        }

        const attachmentViolation = this.describeAttachmentViolation(message);
        if (attachmentViolation) {
            details.push(attachmentViolation);
        }

        if (details.length === 0) {
            return null;
        }

        return {
            summary: 'Blocked by Lumine safety policy.',
            details,
            blockedDomains
        };
    }

    describeAttachmentViolation(message: Message): string | null {
        if (message.attachments.size === 0) {
            return null;
        }

        const attachments = Array.from(message.attachments.values());
        if (this.isConfigChannel(message.channel.id)) {
            const disallowed = attachments
                .filter(attachment => !this.isAllowedConfigAttachment(attachment))
                .map(attachment => this.getAttachmentDisplayName(attachment));
            if (disallowed.length === 0) {
                return null;
            }
            return `Only config files are allowed in <#${this.config.configChannelId}>. Removed: ${disallowed.join(', ')}`;
        }

        if (this.isSupportTicketChannel(message.channel)) {
            const disallowed = attachments
                .filter(attachment => !this.isAllowedTicketAttachment(attachment))
                .map(attachment => this.getAttachmentDisplayName(attachment));
            if (disallowed.length === 0) {
                return null;
            }
            return `Only image attachments are allowed in support tickets. Removed: ${disallowed.join(', ')}`;
        }

        const names = attachments.map(attachment => this.getAttachmentDisplayName(attachment));
        return `Attachments from untrusted users are only allowed in support tickets (images) or the config channel (config files). Removed: ${names.join(', ')}`;
    }

    isConfigChannel(channelId: string): boolean {
        return channelId === this.config.configChannelId;
    }

    isSupportTicketChannel(channel: Message['channel']): boolean {
        if ('parentId' in channel && channel.parentId === this.config.supportCategoryId) {
            return true;
        }
        if (channel.isThread()) {
            return channel.parent?.parentId === this.config.supportCategoryId;
        }
        return false;
    }

    isAllowedTicketAttachment(attachment: Attachment): boolean {
        const contentType = attachment.contentType?.toLowerCase() ?? '';
        if (contentType.startsWith('image/')) {
            return true;
        }
        const extension = this.getAttachmentExtension(attachment.name);
        return IMAGE_FILE_EXTENSIONS.includes(extension);
    }

    isAllowedConfigAttachment(attachment: Attachment): boolean {
        const extension = this.getAttachmentExtension(attachment.name);
        return extension.length > 0 && this.config.allowedConfigExtensions.includes(extension);
    }

    getAttachmentDisplayName(attachment: Attachment): string {
        return attachment.name ?? attachment.id;
    }

    getAttachmentExtension(fileName: string | null): string {
        if (!fileName || !fileName.includes('.')) {
            return '';
        }
        return `.${fileName.split('.').pop()!.toLowerCase()}`;
    }

    extractBlockedDomains(content: string): string[] {
        if (!content || content.trim().length === 0) {
            return [];
        }

        const blocked = new Set<string>();
        const matches = content.match(URL_CANDIDATE_REGEX) ?? [];
        for (const match of matches) {
            const hostname = this.extractHostname(match);
            if (!hostname) {
                continue;
            }
            if (!this.isAllowedDomain(hostname)) {
                blocked.add(hostname);
            }
        }

        return Array.from(blocked.values());
    }

    extractHostname(candidate: string): string | null {
        const trimmedCandidate = candidate
            .trim()
            .replace(/^[<(]+/g, '')
            .replace(/[>),.!?]+$/g, '');
        if (!trimmedCandidate) {
            return null;
        }

        try {
            const url = new URL(
                trimmedCandidate.includes('://') ? trimmedCandidate : `https://${trimmedCandidate}`
            );
            return this.normalizeHostname(url.hostname);
        } catch {
            return null;
        }
    }

    isAllowedDomain(hostname: string): boolean {
        const normalizedHostname = this.normalizeHostname(hostname);
        return this.config.allowedDomains.some(allowedDomain => (
            normalizedHostname === allowedDomain || normalizedHostname.endsWith(`.${allowedDomain}`)
        ));
    }

    normalizeHostname(hostname: string): string {
        return hostname
            .toLowerCase()
            .replace(/\.+$/g, '')
            .replace(/^www\./, '');
    }

    async handlePolicyViolation(message: Message, violation: PolicyViolation): Promise<void> {
        const moderationMessage = this.buildModerationMessage(
            message,
            this.buildPolicySummary(message)
        );
        await this.deletePublicMessage(moderationMessage);

        const moderationDetails = [...violation.details];
        if (violation.blockedDomains.length > 0) {
            const timeoutDurationLabel = formatTimeoutDuration(LINK_TIMEOUT_MS);
            const member = await this.resolveMember(message);

            if (!member) {
                moderationDetails.push('Link timeout skipped: user not found in guild.');
                await this.sendPublicPolicyWarning(
                    message.channel.id,
                    message.author.id,
                    'No links are allowed here.'
                );
            } else if (!this.botCanTimeout(member)) {
                moderationDetails.push('Link timeout failed: missing permissions or hierarchy.');
                await this.sendPublicPolicyWarning(
                    message.channel.id,
                    message.author.id,
                    'No links are allowed here.'
                );
            } else {
                await this.applyTimeoutWithBackoff(
                    member,
                    LINK_TIMEOUT_MS,
                    'Blocked non-approved link from untrusted user.'
                );
                moderationDetails.push(`Timed out for ${timeoutDurationLabel} for blocked links.`);
                await this.sendPublicPolicyWarning(
                    message.channel.id,
                    message.author.id,
                    `No links are allowed here. You were timed out for ${timeoutDurationLabel}.`
                );
            }
        }

        await this.sendPolicyModerationEmbed(moderationMessage, violation.summary, moderationDetails);
    }

    buildModerationMessage(message: Message, content: string): ModerationMessage {
        return {
            messageId: message.id,
            channelId: message.channel.id,
            userId: message.author.id,
            timestamp: message.createdTimestamp,
            content,
            jumpLink: message.url
        };
    }

    buildPolicySummary(message: Message): string {
        const parts: string[] = [];
        const trimmedContent = message.content?.trim();
        if (trimmedContent) {
            parts.push(this.truncateText(trimmedContent, 1800));
        }
        if (message.attachments.size > 0) {
            const attachmentSummary = Array.from(message.attachments.values())
                .map(attachment => this.getAttachmentDisplayName(attachment))
                .join(', ');
            parts.push(`Attachments: ${attachmentSummary}`);
        }
        return this.truncateText(parts.join('\n\n') || '[attachments only]', 3500);
    }

    truncateText(content: string, maxLength: number): string {
        if (content.length <= maxLength) {
            return content;
        }
        return `${content.slice(0, Math.max(0, maxLength - 3))}...`;
    }

    parseListEnv(rawValue: string | undefined, fallback: string[]): string[] {
        if (!rawValue || rawValue.trim().length === 0) {
            return [...fallback];
        }
        return rawValue
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    }

    normalizeAllowedDomains(values: string[]): string[] {
        const normalized = values
            .map(value => this.extractHostname(value))
            .filter((value): value is string => Boolean(value));
        return Array.from(new Set(normalized));
    }

    normalizeFileExtensions(values: string[]): string[] {
        const normalized = values
            .map(value => value.trim().toLowerCase())
            .filter(Boolean)
            .map(value => value.startsWith('.') ? value : `.${value}`);
        return Array.from(new Set(normalized));
    }

    isCheatDiscussion(content: string): boolean {
        const normalized = content.toLowerCase();
        return /(hack|hacking|hacks|exploit|exploiting|cheat|cheats|cheater|cheating|mod menu|modmenu|client|injected client)/i.test(normalized);
    }

    sanitizeMessageContent(content: string): string {
        return content
            .normalize('NFKC')
            .replace(/[\u200B-\u200F\u200D\u2060-\u206F\uFE0E\uFE0F\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    matchesImmediateSlur(content: string): boolean {
        let normalized = '';
        for (const char of content.normalize('NFKD')) {
            normalized += IMMEDIATE_SLUR_CHAR_MAP.get(char) ?? char;
        }
        normalized = normalized
            .replace(/\p{Mark}+/gu, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
        return IMMEDIATE_SLUR_REGEX.test(normalized);
    }

    matchesBlockArtSlur(content: string): boolean {
        if (!BLOCK_ART_CHAR_REGEX.test(content)) {
            return false;
        }
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length - 1; i += 1) {
            const topLine = lines[i];
            const bottomLine = lines[i + 1];
            if (!BLOCK_ART_CHAR_REGEX.test(topLine) || !BLOCK_ART_CHAR_REGEX.test(bottomLine)) {
                continue;
            }
            const topTokens = topLine.trim().split(/\s+/).filter(Boolean);
            const bottomTokens = bottomLine.trim().split(/\s+/).filter(Boolean);
            if (topTokens.length === 0 || topTokens.length !== bottomTokens.length) {
                continue;
            }
            let normalized = '';
            for (let j = 0; j < topTokens.length; j += 1) {
                const key = `${topTokens[j]}|${bottomTokens[j]}`;
                const mapped = BLOCK_ART_GLYPH_MAP.get(key);
                if (mapped) {
                    normalized += mapped;
                }
            }
            if (IMMEDIATE_SLUR_REGEX.test(normalized)) {
                return true;
            }
        }
        return false;
    }

    async handleImmediateSlur(message: Message): Promise<void> {
        this.evictCachedMessage(message.id);
        const member = await this.resolveMember(message);
        if (member && this.isProtectedMember(member)) {
            return;
        }

        const moderationMessage = this.buildModerationMessage(message, message.content || '[no text]');

        const result: ModelResponseItem = {
            message_id: message.id,
            user_id: message.author.id,
            score: IMMEDIATE_TIMEOUT_SCORE,
            category: 'hate_or_slur',
            rationale: 'Matched immediate slur regex.',
            confidence: 1
        };

        const now = Date.now();
        let note = 'Timeout skipped.';

        await this.deletePublicMessage(moderationMessage);

        const recentPunishedAt = this.recentlyPunished.get(message.author.id);
        if (recentPunishedAt && now - recentPunishedAt < this.config.recentlyPunishedTtlMs) {
            note = 'Skipped timeout: recently punished.';
            await this.sendModerationEmbed(result, moderationMessage, note);
            return;
        }

        if (!member) {
            note = 'Skipped timeout: user not found in guild.';
            await this.sendModerationEmbed(result, moderationMessage, note);
            return;
        }

        if (this.isProtectedMember(member)) {
            note = 'Skipped timeout: protected role or moderation immunity.';
            await this.sendModerationEmbed(result, moderationMessage, note);
            return;
        }

        if (!this.botCanTimeout(member)) {
            note = 'Failed to timeout: missing permissions or hierarchy.';
            await this.sendModerationEmbed(result, moderationMessage, note);
            return;
        }

        const timeoutDurationMs = computeTimeoutDurationFromScore(IMMEDIATE_TIMEOUT_SCORE);
        const timeoutDurationLabel = formatTimeoutDuration(timeoutDurationMs);
        const categoryLabel = CATEGORY_LABELS[result.category] || result.category;

        await this.applyTimeoutWithBackoff(member, timeoutDurationMs);
        await this.sendPublicTimeoutNotice(message.channel.id, message.author.id, timeoutDurationLabel, categoryLabel);
        this.recentlyPunished.set(message.author.id, now);
        this.auditLog.push({
            userId: message.author.id,
            score: IMMEDIATE_TIMEOUT_SCORE,
            durationMs: timeoutDurationMs,
            timestamp: now,
            messageIds: [message.id]
        });
        note = `Timeout applied: ${timeoutDurationLabel}.`;

        await this.sendModerationEmbed(result, moderationMessage, note);
    }

    async runBatchEvaluation(): Promise<void> {
        if (this.isRunningBatch) return;
        if (!this.client) return;

        this.isRunningBatch = true;
        try {
            const messages = Array.from(this.messageCache.values());
            if (messages.length === 0) return;

            const apiKey = this.config.openAiApiKey;
            if (!apiKey) {
                await this.logErrorToModerationChannel('OpenAI API key missing. Skipping moderation batch.');
                return;
            }

            const modelResponses = await this.fetchModerationScores(messages);
            if (!modelResponses) {
                return;
            }

            await this.processModelResults(messages, modelResponses);
            for (const message of messages) {
                this.messageCache.delete(message.messageId);
                const timer = this.messageTimers.get(message.messageId);
                if (timer) {
                    clearTimeout(timer);
                    this.messageTimers.delete(message.messageId);
                }
            }
        } catch (error) {
            console.error('[LumineModeration] Batch error:', error);
        } finally {
            this.isRunningBatch = false;
        }
    }

    buildModelPayload(messages: ModerationMessage[]): string {
        return JSON.stringify(
            messages.map(message => ({
                message_id: message.messageId,
                user_id: message.userId,
                content: message.content,
                timestamp: message.timestamp,
                channel_id: message.channelId
            }))
        );
    }

    async fetchModerationScores(messages: ModerationMessage[]): Promise<ModelResponseItem[] | null> {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.config.openAiApiKey}`
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: [
                        {
                            role: 'system',
                            content: SYSTEM_PROMPT
                        },
                        {
                            role: 'user',
                            content: this.buildModelPayload(messages)
                        }
                    ],
                    temperature: 0,
                    max_tokens: 1200,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[LumineModeration] OpenAI API error:', response.status, errorText);
                await this.logErrorToModerationChannel(
                    `OpenAI request failed (${response.status}). Skipping moderation batch.`,
                    errorText
                );
                return null;
            }

            const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
            const content = data.choices?.[0]?.message?.content?.trim();
            if (!content) {
                console.error('[LumineModeration] Empty response from OpenAI.');
                await this.logErrorToModerationChannel('OpenAI returned an empty response. Skipping moderation batch.');
                return null;
            }
            const parsed = this.parseModerationResponse(content);
            if (!parsed) {
                await this.logErrorToModerationChannel(
                    'OpenAI response could not be parsed as a valid moderation payload. Skipping moderation batch.',
                    content
                );
                return null;
            }
            return parsed;
        } catch (error) {
            console.error('[LumineModeration] Error fetching moderation scores:', error);
            await this.logErrorToModerationChannel('Error contacting OpenAI. Skipping moderation batch.');
            return null;
        }
    }

    parseModerationResponse(content: string): ModelResponseItem[] | null {
        const sanitized = content
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();
        const candidates = [sanitized];
        const objectMatch = sanitized.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            candidates.push(objectMatch[0]);
        }
        const arrayMatch = sanitized.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            candidates.push(arrayMatch[0]);
        }

        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate) as unknown;
                if (Array.isArray(parsed)) {
                    return parsed as ModelResponseItem[];
                }
                if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)) {
                    return (parsed as { items: ModelResponseItem[] }).items;
                }
            } catch (error) {
                console.error('[LumineModeration] Error parsing OpenAI response:', error);
            }
        }
        const recoveredItems = this.extractItemsFromText(sanitized);
        return recoveredItems.length > 0 ? recoveredItems : null;
    }

    extractItemsFromText(content: string): ModelResponseItem[] {
        const objectMatches = content.match(/\{[^{}]*\}/g) ?? [];
        const items: ModelResponseItem[] = [];

        for (const match of objectMatches) {
            try {
                const parsed = JSON.parse(match) as Partial<ModelResponseItem>;
                if (!parsed.message_id || !parsed.user_id) {
                    continue;
                }
                items.push({
                    message_id: String(parsed.message_id),
                    user_id: String(parsed.user_id),
                    score: Number(parsed.score ?? 0),
                    category: String(parsed.category ?? 'other'),
                    rationale: String(parsed.rationale ?? ''),
                    confidence: Number(parsed.confidence ?? 0)
                });
            } catch (error) {
                console.error('[LumineModeration] Error parsing OpenAI response fragment:', error);
            }
        }

        return items;
    }

    async processModelResults(
        messages: ModerationMessage[],
        results: ModelResponseItem[]
    ): Promise<void> {
        const messageById = new Map(messages.map(message => [message.messageId, message]));
        const normalizedResults = results.map(result => ({
            ...result,
            score: Math.max(0, Math.min(MAX_SCORE, Math.trunc(result.score)))
        }));
        const flagged = normalizedResults.filter(result => (
            result.score >= MIN_TIMEOUT_SCORE && ENFORCEABLE_CATEGORIES.has(result.category)
        ));

        if (flagged.length === 0) {
            return;
        }

        const maxPerUser = selectMaxScorePerUser(flagged.map(result => ({
            ...result,
            userId: result.user_id
        })));

        const now = Date.now();
        const actionNotes = new Map<string, string>();
        const suppressedUserIds = new Set<string>();
        const timeoutActions: Array<{ userId: string; result: ModelResponseItem; message: ModerationMessage; member: GuildMember }> = [];

        for (const [userId, result] of maxPerUser.entries()) {
            const message = messageById.get(result.message_id);
            if (!message) continue;

            const member = await this.fetchMember(userId);
            if (member && this.isProtectedMember(member)) {
                suppressedUserIds.add(userId);
                continue;
            }

            const recentPunishedAt = this.recentlyPunished.get(userId);
            if (recentPunishedAt && now - recentPunishedAt < this.config.recentlyPunishedTtlMs) {
                actionNotes.set(userId, 'Skipped timeout: recently punished.');
                continue;
            }

            if (!member) {
                actionNotes.set(userId, 'Skipped timeout: user not found in guild.');
                continue;
            }

            if (!this.botCanTimeout(member)) {
                actionNotes.set(userId, 'Failed to timeout: missing permissions or hierarchy.');
                continue;
            }

            timeoutActions.push({ userId, result, message, member });
        }

        for (const result of flagged) {
            if (suppressedUserIds.has(result.user_id)) {
                continue;
            }
            const message = messageById.get(result.message_id);
            if (!message) continue;
            await this.deletePublicMessage(message);
        }

        for (const action of timeoutActions) {
            const timeoutDurationMs = computeTimeoutDurationFromScore(action.result.score);
            const timeoutDurationLabel = formatTimeoutDuration(timeoutDurationMs);
            const categoryLabel = CATEGORY_LABELS[action.result.category] || action.result.category;

            await this.applyTimeoutWithBackoff(action.member, timeoutDurationMs);
            await this.sendPublicTimeoutNotice(action.message.channelId, action.userId, timeoutDurationLabel, categoryLabel);
            this.recentlyPunished.set(action.userId, now);
            actionNotes.set(action.userId, `Timeout applied: ${timeoutDurationLabel}.`);
            this.auditLog.push({
                userId: action.userId,
                score: action.result.score,
                durationMs: timeoutDurationMs,
                timestamp: now,
                messageIds: flagged.filter(item => item.user_id === action.userId).map(item => item.message_id)
            });
        }

        for (const result of flagged) {
            if (suppressedUserIds.has(result.user_id)) {
                continue;
            }
            const message = messageById.get(result.message_id);
            if (!message) continue;
            const maxResult = maxPerUser.get(result.user_id);
            if (!maxResult) continue;
            const note = result.message_id === maxResult.message_id
                ? actionNotes.get(result.user_id)
                : 'No timeout: lower score than the highest message this batch.';
            await this.sendModerationEmbed(result, message, note);
        }
    }

    async fetchMember(userId: string): Promise<GuildMember | null> {
        if (!this.client) return null;
        const guild = await this.client.guilds.fetch(this.config.moderatedGuildId).catch(() => null);
        if (!guild) return null;
        const member = await guild.members.fetch(userId).catch(() => null);
        return member ?? null;
    }

    isProtectedMember(member: GuildMember): boolean {
        const hasProtectedRole = member.roles.cache.some(role => this.config.protectedRoles.includes(role.id));
        const hasModPermissions = member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
            || member.permissions.has(PermissionsBitField.Flags.Administrator);
        return hasProtectedRole || hasModPermissions;
    }

    botCanTimeout(member: GuildMember): boolean {
        if (!member.guild.members.me) return false;
        const botMember = member.guild.members.me;
        const hasPermission = botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers);
        const canModerate = botMember.roles.highest.position > member.roles.highest.position;
        return hasPermission && canModerate;
    }

    async applyTimeoutWithBackoff(
        member: GuildMember,
        durationMs: number,
        reason: string = 'Automated moderation from Lumine batch evaluator.'
    ): Promise<void> {
        const existingTimeoutMs = member.communicationDisabledUntilTimestamp
            ? Math.max(0, member.communicationDisabledUntilTimestamp - Date.now())
            : 0;
        const timeoutDurationMs = Math.min(
            Math.max(durationMs, existingTimeoutMs),
            28 * 24 * 60 * 60 * 1000
        );
        const backoffMs = 1250;
        await member.timeout(timeoutDurationMs, reason);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
    }

    async sendPublicTimeoutNotice(
        channelId: string,
        userId: string,
        durationLabel: string,
        category: string
    ): Promise<void> {
        if (!this.client) return;
        const channel = await this.client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
        const textChannel = channel as GuildTextBasedChannel;
        await textChannel.send({
            content: `<@${userId}> was timed out for ${durationLabel} due to ${category}.`
        });
    }

    async sendPublicPolicyWarning(
        channelId: string,
        userId: string,
        warning: string
    ): Promise<void> {
        if (!this.client) return;
        const channel = await this.client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
        const textChannel = channel as GuildTextBasedChannel;
        await textChannel.send({
            content: `<@${userId}> ${warning}`
        });
    }

    async sendPolicyModerationEmbed(
        message: ModerationMessage,
        summary: string,
        details: string[]
    ): Promise<void> {
        if (!this.client) return;
        const channel = await this.client.channels.fetch(this.config.moderationChannelId).catch(() => null);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
        const textChannel = channel as GuildTextBasedChannel;

        const embed = new EmbedBuilder()
            .setTitle('Safety Policy Action')
            .setColor(EMBED_COLOR_ERROR)
            .setDescription(this.truncateText(message.content, 3500))
            .addFields(
                { name: 'User', value: `<@${message.userId}> (${message.userId})`, inline: true },
                { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
                {
                    name: 'Jump Link',
                    value: message.jumpLink ? `[Open message](${message.jumpLink})` : 'Unavailable',
                    inline: true
                },
                {
                    name: 'Policy',
                    value: this.truncateText([summary, ...details].join('\n'), 1024),
                    inline: false
                }
            )
            .setFooter({ text: 'Applied immediately to untrusted users.' })
            .setTimestamp(new Date(message.timestamp));

        await textChannel.send({ embeds: [embed] });
    }

    async sendModerationEmbed(
        result: ModelResponseItem,
        message: ModerationMessage,
        overrideNote?: string
    ): Promise<void> {
        if (!this.client) return;
        const channel = await this.client.channels.fetch(this.config.moderationChannelId).catch(() => null);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
        const textChannel = channel as GuildTextBasedChannel;

        const categoryLabel = CATEGORY_LABELS[result.category] || result.category;
        const timeoutDurationMs = result.score >= MIN_TIMEOUT_SCORE && ENFORCEABLE_CATEGORIES.has(result.category)
            ? computeTimeoutDurationFromScore(result.score)
            : 0;
        const timeoutDurationLabel = timeoutDurationMs > 0 ? formatTimeoutDuration(timeoutDurationMs) : 'None';
        const embed = new EmbedBuilder()
            .setTitle('Moderation Batch Result')
            .setColor(EMBED_COLOR_PRIMARY)
            .addFields(
                { name: 'User', value: `<@${result.user_id}> (${result.user_id})`, inline: true },
                { name: 'Timeout Duration', value: timeoutDurationLabel, inline: true },
                { name: 'Category', value: categoryLabel, inline: true },
                { name: 'Rationale', value: result.rationale || 'No rationale provided.', inline: false },
                { name: 'Channel', value: `<#${message.channelId}>`, inline: true }
            )
            .setDescription(message.content)
            .setFooter({ text: overrideNote || 'Automated moderation evaluation.' });

        await textChannel.send({ embeds: [embed] });
    }

    async deletePublicMessage(message: ModerationMessage): Promise<void> {
        if (!this.client) return;
        const channel = await this.client.channels.fetch(message.channelId).catch(() => null);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
        const textChannel = channel as GuildTextBasedChannel;
        const fetchedMessage = await textChannel.messages.fetch(message.messageId).catch(() => null);
        if (!fetchedMessage) return;
        await fetchedMessage.delete().catch(() => {});
    }

    async logErrorToModerationChannel(message: string, rawResponse?: string): Promise<void> {
        if (!this.client) return;
        const channel = await this.client.channels.fetch(this.config.moderationChannelId).catch(() => null);
        if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
        const textChannel = channel as GuildTextBasedChannel;
        const formattedResponse = rawResponse
            ? rawResponse.slice(0, 900)
            : undefined;
        const embed = new EmbedBuilder()
            .setTitle('Moderation Batch Error')
            .setDescription(message)
            .setColor(0xe74c3c)
            .setTimestamp();
        if (formattedResponse) {
            embed.addFields({
                name: 'Raw Response (truncated)',
                value: `\`\`\`\n${formattedResponse}\n\`\`\``
            });
        }
        await textChannel.send({ embeds: [embed] });
    }

    async cleanup(): Promise<void> {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        for (const timer of this.messageTimers.values()) {
            clearTimeout(timer);
        }
        this.messageTimers.clear();
        this.messageCache.clear();
    }
}

export = LumineModeration;
