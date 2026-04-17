import { Client, GatewayIntentBits, Options, Partials } from 'discord.js';
import { setupListeners } from './core/module/manager';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
    ],
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 200,
        GuildMemberManager: 300,
        PresenceManager: 0,
        ThreadManager: 50
    }),
    sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: {
            interval: 300,
            lifetime: 1800
        },
        users: {
            interval: 600,
            filter: () => (user) => !user.bot
        }
    }
});

const isCompiled = __dirname.includes('dist');
const modulesPath = isCompiled 
    ? path.join(process.cwd(), 'dist', 'modules')
    : path.join(process.cwd(), 'modules');
setupListeners(client, modulesPath);

client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('warning', warning => {
    console.warn('Process warning:', warning);
});

process.on('SIGINT', () => {
    console.log('\nShutting down bot...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down bot...');
    client.destroy();
    process.exit(0);
});

const token = process.env.TOKEN;
if (!token) {
    console.error('Error: TOKEN is not set in environment variables');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});

