import { ActivityType, PresenceUpdateStatus, Client } from 'discord.js';
import db from '../database/db';

export function getSetting(key: string) {
    const row = db.prepare('SELECT value FROM bot_settings WHERE key = ?').get(key) as any;
    return row ? row.value : null;
}

export function isMaintenanceMode() {
    return getSetting('maintenance') === 'true';
}

export function updatePresence(client: Client) {
    try {
        const status = getSetting('bot_status') || 'online';
        const activity = getSetting('bot_activity') || 'LAWNET Tickets 🎫';
        const typeStr = getSetting('bot_activity_type') || 'PLAYING';

        const typeMap: any = {
            'PLAYING': ActivityType.Playing,
            'WATCHING': ActivityType.Watching,
            'LISTENING': ActivityType.Listening,
            'COMPETING': ActivityType.Competing
        };

        client.user?.setPresence({
            status: status as any,
            activities: [{ name: activity, type: typeMap[typeStr] }]
        });
        console.log(`Presence updated: ${status} - ${activity} (${typeStr})`);
    } catch (e) {
        console.error('Failed to update presence:', e);
    }
}
