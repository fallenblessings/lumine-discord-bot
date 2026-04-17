import { Message } from 'discord.js';
import Base = require('../../core/module/base');

const GUILD_ID = '1424798387664064687';
const PROTECTED_AUTHOR_IDS = [
    '652270268915515419',
    '550780528001810459'
];
const TRUSTED_ROLE_IDS = [
    '1426864375817572442',
    '1459377100745212193',
    '1477923424545538088',
    '1445863263085531290',
    '1432764258323665078'
];
const ALLOWED_ROLE_IDS = [
    '1427031286945546392',
    '1427049193654063208',
    '1426864375817572442',
    '1429396420263153758',
    ...TRUSTED_ROLE_IDS
];
const ALLOW_REPLY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const TIMEOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_TEXT = 'Do not mention this user.';

class AntiMention extends Base {
    constructor() {
        super('lumine_anti_mention', 'Prevents replying to protected user without roles');
        this.initializeEventHandlers();
    }

    initializeEventHandlers(): void {
        this.registerEventHandler('messageCreate', async (message: Message) => {
            try {
                if (message.author.bot) return;
                if (!message.guild || message.guild.id !== GUILD_ID) return;
                if (!message.reference?.messageId) return;

                const referencedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                if (!referencedMessage) return;
                if (!PROTECTED_AUTHOR_IDS.includes(referencedMessage.author.id)) return;

                const now = Date.now();
                const isWithinAllowWindow = now - referencedMessage.createdTimestamp <= ALLOW_REPLY_WINDOW_MS;
                if (isWithinAllowWindow) return;

                const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
                if (!member) return;

                const isAllowed = ALLOWED_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
                if (isAllowed) return;

                if (message.channel.isTextBased()) {
                    await message.reply({
                        content: WARNING_TEXT,
                        allowedMentions: { repliedUser: false }
                    }).catch(error => {
                        console.error('[AntiMention] Failed to send warning:', error);
                    });
                }

                await message.delete().catch(error => {
                    console.error('[AntiMention] Failed to delete message:', error);
                });

                await member.timeout(TIMEOUT_DURATION_MS, 'Anti-mention: replied to protected user without required role').catch(error => {
                    console.error('[AntiMention] Failed to timeout member:', error);
                });
            } catch (error) {
                console.error('[AntiMention] Error handling messageCreate:', error);
            }
        });
    }
}

export = AntiMention;
