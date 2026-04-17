import { ChatInputCommandInteraction } from 'discord.js';

interface Command {
    // Use a broad type here because Discord's builders can be various subtypes
    data: any;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

type EventHandler = (...args: any[]) => void | Promise<void>;

class Base {
    name: string;
    description: string;
    commands: Command[];
    event_handlers: Record<string, EventHandler[]>;

    constructor(name: string, description: string) {
        this.name = name;
        this.description = description;
        this.commands = [];
        this.event_handlers = {};
    }

    registerCommand(command: Command): void {
        if (!command.data || !command.execute) {
            throw new Error(`Command in module ${this.name} is missing required "data" or "execute" property.`);
        }
        
        this.commands.push(command);
    }

    registerEventHandler(event: string, handler: EventHandler): void {
        if (typeof handler !== 'function') {
            throw new Error(`Event handler in module ${this.name} must be a function.`);
        }
        
        if (!this.event_handlers[event]) {
            this.event_handlers[event] = [];
        }
        
        this.event_handlers[event].push(handler);
    }

    getCommands(): Command[] {
        return this.commands;
    }

    getCommandHandlers(): Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> {
        const handlers: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>> = {};
        for (const command of this.commands) {
            handlers[command.data.name] = command.execute;
        }
        return handlers;
    }

    getEventHandlers(): Record<string, EventHandler[]> {
        return this.event_handlers;
    }

    async initialize(): Promise<void> {}

    async cleanup(): Promise<void> {}
}

export = Base;

