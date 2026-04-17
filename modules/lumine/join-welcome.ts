import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    GuildMember,
    GuildTextBasedChannel
} from 'discord.js';
import Base = require('../../core/module/base');
const { EMBED_COLOR_PRIMARY } = require('../../core/common/theme');

const LUMINE_GUILD_ID = '1424798387664064687';
const WELCOME_CHANNEL_ID = '1426860019269238784';
const ABOUT_CHANNEL_ID = '1426860107077259294';
const AD_BOT_CHANNEL_ID = '1481381288077299963';
const SIGNUP_URL = 'https://lumineproxy.org/signup';
const SETUP_TUTORIAL_URL = 'https://www.youtube.com/watch?v=tSkXmg8Xw9U';
const SEND_DELAY_MS = 5_000;

class LumineJoinWelcome extends Base {
    constructor() {
        super('lumine_join_welcome', 'Sends a compact welcome message when members join the Lumine Discord.');
        this.registerEventHandler('guildMemberAdd', this.handleGuildMemberAdd.bind(this));
    }

    private async handleGuildMemberAdd(member: GuildMember): Promise<void> {
        if (member.guild.id !== LUMINE_GUILD_ID || member.user.bot) {
            return;
        }

        await this.delay(SEND_DELAY_MS);

        const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(error => {
            console.error('[LumineJoinWelcome] Failed to fetch welcome channel:', error);
            return null;
        });

        if (!channel || !channel.isTextBased()) {
            console.error('[LumineJoinWelcome] Welcome channel is missing or not text based.');
            return;
        }

        await (channel as GuildTextBasedChannel).send({
            content: `Welcome <@${member.id}>!`,
            embeds: [this.buildWelcomeEmbed()],
            components: [this.buildWelcomeButtons()],
            allowedMentions: {
                users: [member.id]
            }
        }).catch(error => {
            console.error('[LumineJoinWelcome] Failed to send welcome message:', error);
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }

    private buildWelcomeEmbed(): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle('Lumine Quick Start')
            .setDescription('Everything you need to get going is right here.')
            .addFields(
                {
                    name: 'What is Lumine?',
                    value: `<#${ABOUT_CHANNEL_ID}>`,
                    inline: true
                },
                {
                    name: 'Supported Devices',
                    value: 'Console, iOS, Android, and PC',
                    inline: true
                },
                {
                    name: 'Removing Ad Bots?',
                    value: `<#${AD_BOT_CHANNEL_ID}>`,
                    inline: true
                }
            )
            .setColor(EMBED_COLOR_PRIMARY);
    }

    private buildWelcomeButtons(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('Sign Up')
                .setStyle(ButtonStyle.Link)
                .setURL(SIGNUP_URL),
            new ButtonBuilder()
                .setLabel('Setup Tutorial')
                .setStyle(ButtonStyle.Link)
                .setURL(SETUP_TUTORIAL_URL)
        );
    }
}

export = LumineJoinWelcome;
