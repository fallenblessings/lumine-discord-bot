#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { Client, EmbedBuilder, REST, Routes, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

interface Command {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

interface ModuleInstance {
    name: string;
    description: string;
    commands: Command[];
    getCommands(): Command[];
    getCommandHandlers(): Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>>;
    getEventHandlers(): Record<string, ((...args: any[]) => void | Promise<void>)[]>;
    initialize?(): Promise<void>;
    cleanup?(): Promise<void>;
}

interface LoadedModules {
    commands: SlashCommandBuilder[];
    commandHandlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>>;
    eventHandlers: Record<string, ((...args: any[]) => void | Promise<void>)[]>;
    modules: ModuleInstance[];
}

async function loadModules(modulesPath: string = path.join(__dirname, '../../modules')): Promise<LoadedModules> {
    const commands: SlashCommandBuilder[] = [];
    const commandHandlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> = {};
    const eventHandlers: Record<string, ((...args: any[]) => void | Promise<void>)[]> = {};
    const modules: ModuleInstance[] = [];
    
    if (!path.isAbsolute(modulesPath)) {
        modulesPath = path.resolve(process.cwd(), modulesPath);
    }
    
    if (!fs.existsSync(modulesPath)) {
        console.log('Modules directory not found, creating it...');
        fs.mkdirSync(modulesPath, { recursive: true });
        return { commands, commandHandlers, eventHandlers, modules };
    }
    
    const moduleFiles: string[] = [];
    // Detect if running compiled code - if modulesPath contains 'dist', only load .js files
    const isCompiled = modulesPath.includes('dist');
    const fileExtensions = isCompiled ? ['.js'] : ['.js', '.ts'];
    
    function findModuleFiles(dir: string): void {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                findModuleFiles(fullPath);
            } else if (fileExtensions.some(ext => item.endsWith(ext))) {
                moduleFiles.push(fullPath);
            }
        }
    }
    
    findModuleFiles(modulesPath);
    
    for (const filePath of moduleFiles) {
        try {
            // Clear require cache to allow hot reloading during development
            delete require.cache[require.resolve(filePath)];
            const ModuleClass = require(filePath);
            
            if (typeof ModuleClass === 'function' || (typeof ModuleClass === 'object' && ModuleClass.default && typeof ModuleClass.default === 'function')) {
                const ModuleConstructor = typeof ModuleClass === 'function' ? ModuleClass : ModuleClass.default;
                const moduleInstance = new ModuleConstructor() as ModuleInstance;
                
                if (typeof moduleInstance.initialize === 'function') {
                    await moduleInstance.initialize();
                }
                
                const moduleCommands = moduleInstance.getCommands();
                const moduleCommandHandlers = moduleInstance.getCommandHandlers();
                const moduleEventHandlers = moduleInstance.getEventHandlers();
                
                commands.push(...moduleCommands.map(cmd => cmd.data));
                Object.assign(commandHandlers, moduleCommandHandlers);
                
                for (const [event, handlers] of Object.entries(moduleEventHandlers)) {
                    if (!eventHandlers[event]) {
                        eventHandlers[event] = [];
                    }
                    eventHandlers[event].push(...handlers);
                }
                
                modules.push(moduleInstance);
                
                console.log(`Loaded module: ${moduleInstance.name} with ${moduleCommands.length} commands and ${Object.keys(moduleEventHandlers).length} event types`);
            } else {
                console.log(`Warning: Module at ${filePath} does not export a class.`);
            }
        } catch (error) {
            console.error(`Error loading module ${filePath}:`, error);
        }
    }
    
    return { commands, commandHandlers, eventHandlers, modules };
}

function setupListeners(client: Client, modulesPath: string): void {
    let commands: SlashCommandBuilder[] | undefined;
    let commandHandlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> | undefined;
    let eventHandlers: Record<string, ((...args: any[]) => void | Promise<void>)[]> | undefined;
    let loadedModules: ModuleInstance[] = [];

    const cleanupModules = async (): Promise<void> => {
        for (const module of loadedModules) {
            if (typeof module.cleanup === 'function') {
                try {
                    await module.cleanup();
                } catch (error) {
                    console.error(`[ModuleManager] Error cleaning up module ${module.name}:`, error);
                }
            }
        }
    };

    client.once('shardDisconnect', async () => {
        await cleanupModules();
    });
    
    client.once('clientReady', async () => {
        const loaded = await loadModules(modulesPath);
        commands = loaded.commands;
        commandHandlers = loaded.commandHandlers;
        eventHandlers = loaded.eventHandlers;
        loadedModules = loaded.modules;
        
        console.log(`Loaded ${loaded.modules.length} modules with ${commands.length} total commands.`);
        
        for (const [event, handlers] of Object.entries(eventHandlers)) {
            if (event === 'clientReady') {
                // Modules are loaded inside clientReady, so replay clientReady handlers immediately.
                for (const handler of handlers) {
                    try {
                        await Promise.resolve(handler.call(client, client));
                    } catch (error) {
                        console.error('[ModuleManager] Error executing clientReady handler:', error);
                    }
                }
                console.log(`Executed ${handlers.length} handler(s) for event: clientReady`);
                continue;
            }

            for (const handler of handlers) {
                client.on(event, (...args: any[]) => {
                    Promise.resolve(handler(...args)).catch(error => {
                        console.error(`[ModuleManager] Error in ${event} handler:`, error);
                    });
                });
            }
            console.log(`Registered ${handlers.length} handler(s) for event: ${event}`);
        }
        
        await registerCommands(client, commands);
    });
    
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        
        const commandName = interaction.commandName;
        
        if (commandHandlers && commandHandlers[commandName]) {
            try {
                await commandHandlers[commandName](interaction);
            } catch (error) {
                console.error(`Error executing slash command ${commandName}:`, error);
                if (!interaction.replied && !interaction.deferred) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('Error')
                        .setDescription('An error occurred while executing the command.')
                        .setColor(0xff0000)
                        .setTimestamp();
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 }).catch(() => {});
                }
            }
        } else {
            const unknownEmbed = new EmbedBuilder()
                .setTitle('Unknown Command')
                .setDescription(`Command \`/${commandName}\` not found.`)
                .setColor(0xff0000)
                .setTimestamp();
            await interaction.reply({ embeds: [unknownEmbed], flags: 64 });
        }
    });
}

async function registerCommands(client: Client, commands: SlashCommandBuilder[]): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN || '');

    try {
        await rest.put(
            Routes.applicationCommands(client.user!.id),
            { body: commands }
        );
        console.log(`Successfully registered ${commands.length} global commands.`);
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

async function listModules(modulesPath: string): Promise<void> {
    console.log('Loading modules...\n');
    
    try {
        const { modules, commands, eventHandlers } = await loadModules(modulesPath);
        
        console.log(`Found ${modules.length} modules with ${commands.length} total commands:\n`);
        
        modules.forEach((module, index) => {
            const moduleEventHandlers = module.getEventHandlers();
            const eventTypeCount = Object.keys(moduleEventHandlers).length;
            
            console.log(`${index + 1}. ${module.name}`);
            console.log(`   Description: ${module.description}`);
            console.log(`   Commands: ${module.commands.length}`);
            console.log(`   Event Handlers: ${eventTypeCount} event types`);
            
            if (module.commands.length > 0) {
                console.log('   Command List:');
                module.commands.forEach(cmd => {
                    console.log(`     - /${cmd.data.name}: ${cmd.data.description}`);
                });
            }
            
            if (eventTypeCount > 0) {
                console.log('   Event Handlers:');
                Object.entries(moduleEventHandlers).forEach(([event, handlers]) => {
                    console.log(`     - ${event}: ${handlers.length} handler(s)`);
                });
            }
            console.log('');
        });
        
        console.log('Module loading completed successfully!');
        
    } catch (error) {
        console.error('Error loading modules:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    const command = process.argv[2];
    const modulesPath = process.argv[3] || path.join(__dirname, '../../modules');

    if (command === 'list') {
        listModules(modulesPath);
    } else {
        console.error('Unknown command');
        process.exit(1);
    }
}

export { loadModules, setupListeners, registerCommands };

