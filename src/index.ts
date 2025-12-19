import { Client, Collection, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Extend Client type to include commands collection
declare module 'discord.js' {
    export interface Client {
        commands: Collection<string, any>;
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
    ],
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        // v15 fix: ChatInputCommandBuilder might not expose .name directly
        const cmdName = command.data.name || (command.data.toJSON && command.data.toJSON().name);

        if (cmdName) {
            client.commands.set(cmdName, command);
            console.log(`✓ Loaded command: ${cmdName}`);
        } else {
            console.log(`⚠ Warning: ${file} has valid structure but could not determine command name.`);
        }
    } else {
        console.log(`⚠ Warning: ${file} is missing required "data" or "execute" property`);
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args: any[]) => event.execute(...args));
    } else {
        client.on(event.name, (...args: any[]) => event.execute(...args));
    }
    console.log(`✓ Loaded event: ${event.name}`);
}

import { startDashboard } from './dashboard/server';

// Start Dashboard
startDashboard();

// Login
export { client };
client.login(process.env.BOT_TOKEN);
