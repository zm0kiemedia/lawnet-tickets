import { MessageFlags, ThreadChannel } from 'discord.js';

export async function sendAssignmentMessage(thread: ThreadChannel, supporterId: string) {
    try {
        await thread.send({
            components: [{
                type: 14, // Container
                accent_color: 0xF59E0B,
                components: [{
                    type: 1, // Section
                    components: [
                        {
                            type: 10, // TextDisplay
                            content: '🎯 Ticket übernommen!'
                        },
                        {
                            type: 10, // TextDisplay
                            content: `<@${supporterId}> hat dieses Ticket übernommen und wird sich um dein Anliegen kümmern.\n\n*${new Date().toLocaleString('de-DE')}*`
                        }
                    ]
                }]
            }],
            flags: MessageFlags.IsComponentsV2
        } as any);

        return true;
    } catch (error) {
        console.error('Failed to send V2 assignment message:', error);
        // Fallback to plain text
        await thread.send(`🎯 **Ticket übernommen!**\n<@${supporterId}> hat dieses Ticket übernommen und wird sich um dein Anliegen kümmern.`);
        return false;
    }
}
