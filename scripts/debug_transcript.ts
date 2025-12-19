
import db from '../src/database/db';
import { Client, GatewayIntentBits } from 'discord.js';
import { generateTranscript } from '../src/utils/ticketManager';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '/var/www/lawnet-tickets/.env' });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
    ],
});

async function run() {
    // Ticket ID hardcoded for debugging (found in previous step)
    const ticketId = 44;
    console.log(`Debugging transcript for Ticket ${ticketId}`);

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as any;
    if (!ticket) {
        console.error('Ticket not found in DB');
        process.exit(1);
    }
    console.log('Ticket found:', ticket);

    if (!process.env.BOT_TOKEN) {
        console.error('No BOT_TOKEN found in .env');
        process.exit(1);
    }

    console.log('Logging in...');
    await client.login(process.env.BOT_TOKEN);
    console.log('Bot logged in as', client.user?.tag);

    const channel = await client.channels.fetch(ticket.channel_id);
    if (!channel || !channel.isThread()) {
        console.error('Channel not found or not a thread');
        process.exit(1);
    }
    console.log('Channel found:', channel.id);

    console.log('--- Calling generateTranscript ---');
    const { htmlContent, textContent } = await generateTranscript(channel, ticket);

    console.log('--- Result ---');
    console.log('HTML Length:', htmlContent.length);

    fs.writeFileSync('debug_transcript.html', htmlContent);
    console.log('Saved to debug_transcript.html');

    client.destroy();
    process.exit(0);
}

run().catch(error => {
    console.error('Script Error:', error);
    process.exit(1);
});
