import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, User } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as dotenv from 'dotenv';

dotenv.config();

class Keygen extends Base {
    constructor() {
        super('lumine_genkey', 'Key generation commands for Lumine Proxy');
        this.initializeCommands();
    }

    initializeCommands(): void {
        this.registerCommand({
            data: new SlashCommandBuilder()
                .setName('lumine_genkey')
                .setDescription('Generate a key with specified duration')
                .setIntegrationTypes([0, 1])
                .setContexts([0, 1, 2])
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('Key duration')
                        .setRequired(true)
                        .addChoices(
                            { name: '15 Minutes', value: '15min' },
                            { name: '30 Minutes', value: '30min' },
                            { name: 'Hour', value: 'hour' },
                            { name: 'Day', value: 'day' },
                            { name: 'Week', value: 'week' },
                            { name: 'Month', value: 'month' },
                            { name: 'Year', value: 'year' },
                            { name: 'Permanent', value: 'permanent' }
                        ))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to generate the key for')
                        .setRequired(true)),
            
            execute: this.executeGenkey.bind(this)
        });
        this.registerCommand({
            data: new SlashCommandBuilder()
                .setName('lumine_genkey_custom')
                .setDescription('Generate a key with custom duration in seconds')
                .setIntegrationTypes([0, 1])
                .setContexts([0, 1, 2])
                .addIntegerOption(option =>
                    option.setName('seconds')
                        .setDescription('Duration in seconds (minimum 1)')
                        .setRequired(true)
                        .setMinValue(1))
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to generate the key for')
                        .setRequired(true)),
            
            execute: this.executeGenkeycustom.bind(this)
        });

		// (moved delkey and api_status into separate modules)
    }

    async executeGenkey(interaction: ChatInputCommandInteraction): Promise<void> {
        const duration = interaction.options.getString('duration');
        const targetUser = interaction.options.getUser('user');
        
        const LUMINE_USERS = process.env.LUMINE_USERS ? process.env.LUMINE_USERS.split(',') : [];
        
        if (LUMINE_USERS.length > 0 && !LUMINE_USERS.includes(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('Access Denied')
                .setDescription('You are not authorized to use this bot.')
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
        
        let keyDuration: string | undefined;
        let keyValue: string | undefined;
        
        try {
            switch (duration) {
                case '15min':
                    keyDuration = '15 minutes';
                    keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, 900);
                    break;
                case '30min':
                    keyDuration = '30 minutes';
                    keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, 1800);
                    break;
                case 'hour':
                    keyDuration = '1 hour';
                    keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, 3600);
                    break;
                case 'day':
                    keyDuration = '1 day';
                    keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, 86400);
                    break;
                case 'week':
                    keyDuration = '1 week';
                    keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, 604800);
                    break;
                case 'month':
                    keyDuration = '1 month';
                    keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, 2592000);
                    break;
                case 'year':
                    keyDuration = '1 year';
                    keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, 31536000);
                    break;
                case 'permanent':
                    keyDuration = 'permanent';
                    keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, 31536000 * 100);
                    break;
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('API Error')
                .setDescription(`**Error:** ${error instanceof Error ? error.message : String(error)}`)
                .setColor(EMBED_COLOR_ERROR)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }
        
        if (!keyValue) {
            const embed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to generate key via API')
                .setColor(0xff0000)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Generated Key')
            .setDescription(`**Auth Key:** \`${keyValue}\``)
            .setColor(EMBED_COLOR_PRIMARY)
            .addFields({
                name: 'How to Get Started',
                value: `1. Go to https://lumineproxy.org and click **Get Started**.
2. **Register** with your email and a password, and the provided auth key.
4. In the portal, **enter the Auth Key**, then **add your Microsoft account**.
5. **Select a Bedrock server** you want to play on.
6. Use the **IP and Port shown on screen** to join from your device, then enter the provided code.
7. You can use /.help in-game to view all of the commands.`
            })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
        // Log auth key creation
        await this.logAuthKeyCreation(interaction.client, keyValue, interaction.user, targetUser!, keyDuration!);
    }

    async executeGenkeycustom(interaction: ChatInputCommandInteraction): Promise<void> {
        const seconds = interaction.options.getInteger('seconds');
        const targetUser = interaction.options.getUser('user');
        
        const LUMINE_USERS = process.env.LUMINE_USERS ? process.env.LUMINE_USERS.split(',') : [];
        
        if (LUMINE_USERS.length > 0 && !LUMINE_USERS.includes(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('Access Denied')
                .setDescription('You are not authorized to use this bot.')
                .setColor(0xff0000)
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
                .setColor(0xff0000)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }
        
        let keyDuration: string;
        let keyValue: string | undefined;
        
        try {
            keyDuration = `${seconds} seconds`;
            keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, seconds!);
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('API Error')
                .setDescription(`**Error:** ${error instanceof Error ? error.message : String(error)}`)
                .setColor(0xff0000)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }
        
        if (!keyValue) {
            const embed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription('Failed to generate key via API')
                .setColor(0xff0000)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Generated Key')
            .setDescription(`**Auth Key:** \`${keyValue}\``)
            .setColor(0x9966CC)
            .addFields({
                name: 'How to Get Started',
                value: `1. Go to https://lumineproxy.org and click **Get Started**.
2. **Register** with your email and a password, and the provided auth key.
4. In the portal, **enter the Auth Key**, then **add your Microsoft account**.
5. **Select a Bedrock server** you want to play on.
6. Use the **IP and Port shown on screen** to join from your device, then enter the provided code.
7. You can use /.help in-game to view all of the commands.`
            })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        
        // Log auth key creation
        await this.logAuthKeyCreation(interaction.client, keyValue, interaction.user, targetUser!, keyDuration);
    }

    async logAuthKeyCreation(client: any, authKey: string, creator: User, targetUser: User, duration: string): Promise<void> {
        try {
            const logChannelId = '1439558418930208850';
            const channel = client.channels.cache.get(logChannelId);
            
            if (!channel) {
                console.error(`[Keygen] Log channel ${logChannelId} not found`);
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('Auth Key Created')
                .addFields(
                    { name: 'Auth Key', value: `\`${authKey}\``, inline: false },
                    { name: 'Duration', value: duration, inline: false },
                    { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: false }
                )
                .setFooter({ text: `${creator.tag} (${creator.id})` })
                .setColor(EMBED_COLOR_PRIMARY)
                .setTimestamp();
            
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('[Keygen] Error logging auth key creation:', error);
        }
    }

    async generateKeyViaAPI(endpoint: string, adminKey: string, duration: number): Promise<string> {
        try {
            const fullEndpoint = `${endpoint}/auth/generate`;
            
            const expiresAt = duration === -1 ? 0 : Math.floor(Date.now() / 1000) + duration;
            
            const response = await fetch(fullEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    admin_key: adminKey,
                    expires_at: expiresAt
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            
            const data = await response.json() as { auth_key: string };
            return data.auth_key;
        } catch (error) {
            throw error;
        }
    }
}

export = Keygen;

