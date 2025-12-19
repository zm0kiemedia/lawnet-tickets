import { Events } from 'discord.js';
import type { Client } from 'discord.js';
import { updatePresence } from '../utils/botUtils';
import { startVoiceAnnouncement } from '../utils/voiceManager';

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client: Client) {
        console.log(`✓ Bot is ready! Logged in as ${client.user?.tag}`);
        console.log(`✓ Serving ${client.guilds.cache.size} guild(s)`);
        updatePresence(client);
        startVoiceAnnouncement(client);
    },
};
