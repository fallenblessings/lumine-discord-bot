import Base = require('../../core/module/base');
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
const { EMBED_COLOR_PRIMARY, EMBED_COLOR_ERROR } = require('../../core/common/theme');
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

class Trial extends Base {
    trialJsonPath: string;
    usedUserIds: Set<string>;

    constructor() {
        super('lumine_trial', 'Trial key generation for Lumine Proxy');
        this.trialJsonPath = path.join(process.cwd(), 'assets', 'trial.json');
        this.usedUserIds = new Set<string>();
        this.initializeCommands();
    }

    async initialize(): Promise<void> {
        // Load trial.json on startup
        await this.loadTrialData();
    }

    async loadTrialData(): Promise<void> {
        try {
            if (fs.existsSync(this.trialJsonPath)) {
                const data = fs.readFileSync(this.trialJsonPath, 'utf8');
                const userIds = JSON.parse(data);
                if (Array.isArray(userIds)) {
                    this.usedUserIds = new Set<string>(userIds);
                    console.log(`[Trial] Loaded ${this.usedUserIds.size} used trial user IDs`);
                }
            } else {
                // Create empty array if file doesn't exist
                fs.writeFileSync(this.trialJsonPath, JSON.stringify([], null, 2));
                console.log('[Trial] Created new trial.json file');
            }
        } catch (error) {
            console.error('[Trial] Error loading trial data:', error);
            this.usedUserIds = new Set<string>();
        }
    }

    async saveTrialData(): Promise<void> {
        try {
            const userIds = Array.from(this.usedUserIds);
            fs.writeFileSync(this.trialJsonPath, JSON.stringify(userIds, null, 2));
        } catch (error) {
            console.error('[Trial] Error saving trial data:', error);
        }
    }

    initializeCommands(): void {
        this.registerCommand({
            data: new SlashCommandBuilder()
                .setName('lumine_trial')
                .setDescription('Get a three-hour trial key for Lumine Proxy')
                .setIntegrationTypes([0, 1])
                .setContexts([0, 1, 2]),
            
            execute: this.executeTrial.bind(this)
        });
    }

    async executeTrial(interaction: ChatInputCommandInteraction): Promise<void> {
        const GUILD_ID = '1424798387664064687';
        
        // Check if command is run in the correct guild
        if (!interaction.guild || interaction.guild.id !== GUILD_ID) {
            const embed = new EmbedBuilder()
                .setTitle('Invalid Guild')
                .setDescription('This command can only be used in the Lumine Discord server.')
                .setColor(EMBED_COLOR_ERROR)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }

        // Check if user has already redeemed their trial
        if (this.usedUserIds.has(interaction.user.id)) {
            const embed = new EmbedBuilder()
                .setTitle('Trial Already Redeemed')
                .setDescription('You have already redeemed your trial key. Each user can only use this command once.')
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
        
        let keyValue: string | undefined;
        
        try {
            // Generate 3-hour key (10800 seconds)
            keyValue = await this.generateKeyViaAPI(API_ENDPOINT, API_ADMIN_KEY, 10800);
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
                .setColor(EMBED_COLOR_ERROR)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }
        
        // Add user ID to used set and save to file
        this.usedUserIds.add(interaction.user.id);
        await this.saveTrialData();
        
        const embed = new EmbedBuilder()
            .setTitle('Trial Key Generated')
            .setDescription(`**Auth Key:** \`${keyValue}\`\n\n**Note:** This trial key expires in **three hours** from now.`)
            .setColor(EMBED_COLOR_PRIMARY)
            .addFields({
                name: 'How to Get Started',
                value: `1. Go to https://lumineproxy.org and click **Get Started**.
2. **Register** with your email and a password, and the provided auth key.
3. In the portal, **enter the Auth Key**, then **add your Microsoft account**.
4. **Select a Bedrock server** you want to play on.
5. Use the **IP and Port shown on screen** to join from your device, then enter the provided code.
6. You can use /.help in-game to view all of the commands.`
            })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: 64 });
        
        // Log trial key creation
        await this.logTrialKeyCreation(interaction.client, keyValue, interaction.user);
    }

    async logTrialKeyCreation(client: any, authKey: string, user: any): Promise<void> {
        try {
            const logChannelId = '1439558418930208850';
            const channel = client.channels.cache.get(logChannelId);
            
            if (!channel) {
                console.error(`[Trial] Log channel ${logChannelId} not found`);
                return;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('Trial Key Created')
                .addFields(
                    { name: 'Auth Key', value: `\`${authKey}\``, inline: false },
                    { name: 'Duration', value: 'three hours', inline: false },
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: false }
                )
                .setFooter({ text: 'Trial Key' })
                .setColor(EMBED_COLOR_PRIMARY)
                .setTimestamp();
            
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('[Trial] Error logging trial key creation:', error);
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

export = Trial;

