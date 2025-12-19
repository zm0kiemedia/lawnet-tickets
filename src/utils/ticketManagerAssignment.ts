import { ThreadChannel } from 'discord.js';

export const sendTicketAssignmentMessage = async (thread: ThreadChannel, supporterId: string) => {
    await thread.send({
        content: `🎯 **Ticket übernommen!**\n\n<@${supporterId}> hat dieses Ticket übernommen und wird sich um dein Anliegen kümmern.\n\n*${new Date().toLocaleString('de-DE')}*`
    });
};
