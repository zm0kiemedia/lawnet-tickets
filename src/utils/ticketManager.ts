import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, TextChannel, ThreadChannel, Interaction, ModalSubmitInteraction, Message, ComponentType } from 'discord.js';
import { PrimaryButtonBuilder, SectionBuilder, TextDisplayBuilder, ContainerBuilder } from '@discordjs/builders';
import { downloadAttachment } from './attachmentHandler';
import db from '../database/db';
import { isMaintenanceMode } from './botUtils';
import { getIO } from './websocket';

// Helper to safely emit events
const safeEmit = (event: string, data: any) => {
    try {
        const io = getIO();
        io.emit(event, data);
    } catch (e) {
        // Socket might not be initialized yet (e.g. during startup tests)
        // console.warn('Socket not initialized, skipping emit');
    }
};

export const handleOpenTicket = async (interaction: ModalSubmitInteraction, topic: string, product: string, details: string) => {
    // Defer the reply immediately to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (isMaintenanceMode()) {
        return interaction.editReply({
            content: '❌ **Wartungsmodus Aktiv**\nEntschuldigung, die Erstellung neuer Tickets ist zur Zeit deaktiviert. Bitte versuche es später erneut.'
        });
    }

    // Check if user already has an open ticket
    const openTicket = db.prepare("SELECT * FROM tickets WHERE user_id = ? AND status = 'open'").get(interaction.user.id) as any;
    if (openTicket) {
        return interaction.editReply({
            content: `Du hast bereits ein offenes Ticket: <#${openTicket.channel_id}>!`
        });
    }

    const channel = interaction.channel as TextChannel;
    if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.editReply({
            content: 'Tickets können nur in Textkanälen erstellt werden.'
        });
    }

    try {
        const thread = await channel.threads.create({
            name: `ticket-${interaction.user.username}`,
            autoArchiveDuration: 60,
            type: ChannelType.PrivateThread,
            reason: `Ticket erstellt von ${interaction.user.tag}`
        });

        await thread.members.add(interaction.user.id);

        console.log('[DEBUG] Inserting ticket:', { thread_id: thread.id, user_id: interaction.user.id, topic, product, details, parent: channel.id });
        const info = db.prepare("INSERT INTO tickets (channel_id, user_id, status, topic, product, issue_details, parent_channel_id) VALUES (?, ?, 'open', ?, ?, ?, ?)")
            .run(thread.id, interaction.user.id, topic, product, details, channel.id);
        console.log('[DEBUG] Ticket inserted successfully');

        // Notify Dashboard
        safeEmit('update_tickets', { action: 'created', ticketId: info.lastInsertRowid });

        try {
            const titleText = new TextDisplayBuilder()
                .setContent(`🎫 Ticket #${thread.name}`);

            const bodyText = new TextDisplayBuilder()
                .setContent(`Hallo <@${interaction.user.id}>! Ein Teammitglied wird sich in Kürze um dein Anliegen kümmern.\n\n` +
                    `\`\`\`text\n` +
                    `Bereich:      ${product || '-'}\n` +
                    `Thema:        ${topic || '-'}\n` +
                    `Beschreibung: ${details || '-'}\n` +
                    `\`\`\`\n` +
                    `*Erstellt am ${new Date().toLocaleString('de-DE')}*`);

            const closeButton = new PrimaryButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Ticket schließen')
                .setEmoji({ name: '🔒' });

            const mainSection = new SectionBuilder()
                .addTextDisplayComponents(titleText, bodyText)
                .setPrimaryButtonAccessory(closeButton);

            const container = new ContainerBuilder()
                .setAccentColor(0xF59E0B)
                .addSectionComponents(mainSection);

            await thread.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2 as any
            });
        } catch (v2Error) {
            console.error('[ERROR] Failed to send Components V2 welcome message:', v2Error);
            await thread.send(`**Support Ticket gestartet**\n\n**Produkt:** ${product || '-'}\n**Betreff:** ${topic || '-'}\n**Beschreibung:** ${details || '-'}\n\n*(V2 Layout fehlgeschlagen)*`);
        }

        await interaction.editReply({
            content: `Dein Ticket wurde erstellt: <#${thread.id}>`
        });

    } catch (error) {
        console.error('Error creating ticket thread:', error);
        await interaction.editReply({
            content: 'Fehler beim Erstellen des Tickets. Bitte einen Administrator kontaktieren.'
        });
    }
};

const ARCHIVE_CHANNEL_ID = '1451080302024851466';

export const handleCloseTicket = async (interaction: any) => {
    if (!interaction.channel.isThread()) {
        return interaction.reply({
            content: 'Dieser Befehl kann nur in Tickets genutzt werden!',
            flags: MessageFlags.Ephemeral
        });
    }

    const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(interaction.channel.id) as any;
    if (!ticket) return interaction.reply({
        content: 'Ticket nicht in der Datenbank gefunden.',
        flags: MessageFlags.Ephemeral
    });

    await interaction.reply({ content: 'Ticket wird in 5 Sekunden geschlossen...' });

    try {
        // Generate Transcript
        const output = await generateTranscript(interaction.channel, ticket);
        const { htmlContent, transcriptData, textContent } = output;

        // Notify Dashboard
        safeEmit('update_tickets', { action: 'closed', ticketId: ticket.id });

        // Update Stats
        db.prepare("INSERT OR REPLACE INTO transcripts (ticket_id, html_content, json_content, text_content) VALUES (?, ?, ?, ?)").run(ticket.id, htmlContent, JSON.stringify(transcriptData), textContent);

        // Send DM to User
        try {
            const user = await interaction.client.users.fetch(ticket.user_id);
            if (user) {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('Ticket Geschlossen')
                    .setDescription(`Dein Ticket **#${ticket.id}** wurde geschlossen.\nDu kannst das Transkript hier einsehen:`)
                    .addFields({ name: 'Link', value: `[Transkript öffnen](https://ticket.zm0kie.de/tickets/${ticket.id})` })
                    .setColor(0xF59E0B)
                    .setFooter({ text: 'LawNet Tickets', icon_url: interaction.client.user?.displayAvatarURL() })
                    .setTimestamp();

                await user.send({ embeds: [dmEmbed] });
            }
        } catch (dmError) {
            console.log(`[WARN] Could not send DM to user ${ticket.user_id} (DMs blocked?)`);
        }

        try {
            const archiveChannel = await interaction.client.channels.fetch(ARCHIVE_CHANNEL_ID);
            if (archiveChannel && archiveChannel.isTextBased()) {
                const fields = [
                    { name: 'User', value: `<@${ticket.user_id}>`, inline: true },
                    { name: 'Produkt', value: ticket.product || '-', inline: true },
                    { name: 'Thema', value: ticket.topic || '-', inline: true },
                    { name: 'Dashboard Link', value: `[Transkript ansehen](https://ticket.zm0kie.de/tickets/${ticket.id})` }
                ];

                await (archiveChannel as any).send({
                    embeds: [{
                        title: `🔒 Ticket Archiviert: #${ticket.id}`,
                        color: 0x2f3136,
                        fields: fields,
                        timestamp: new Date().toISOString()
                    }]
                });
            }
        } catch (archiveErr) {
            console.error('Failed to send archive message:', archiveErr);
        }
    } catch (error) {
        console.error('Error saving transcript:', error);
    }

    db.prepare("UPDATE tickets SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?").run(ticket.id);

    setTimeout(async () => {
        try {
            await (interaction.channel as ThreadChannel).members.remove(ticket.user_id);
            await interaction.channel.edit({
                locked: true,
                archived: true,
                reason: 'Ticket geschlossen und archiviert'
            });
            console.log(`Thread ${interaction.channel.id} locked and archived`);
        } catch (err) {
            console.error('Failed to lock/archive thread:', err);
        }
    }, 5000);
};

export const reopenTicket = async (client: any, ticketId: string, adminUser: any) => {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as any;
    if (!ticket) throw new Error('Ticket nicht gefunden');

    const parentChannel = await client.channels.fetch(ticket.parent_channel_id) as TextChannel;
    if (!parentChannel) throw new Error('Ursprünglicher Kanal nicht gefunden');

    const user = await client.users.fetch(ticket.user_id);
    let thread: ThreadChannel | null = null;

    try {
        thread = await client.channels.fetch(ticket.channel_id);
        if (thread) {
            await thread.edit({
                archived: false,
                locked: false,
                reason: `Ticket re-opened by Admin ${adminUser.username}`
            });
            await thread.members.add(user.id);
        }
    } catch (e) {
        thread = await parentChannel.threads.create({
            name: `reopened-${user.username}`,
            autoArchiveDuration: 60,
            type: ChannelType.PrivateThread,
            reason: `Ticket re-opened by Admin ${adminUser.username} (Fallback)`
        });
        await thread.members.add(user.id);
        db.prepare("UPDATE tickets SET channel_id = ? WHERE id = ?").run(thread.id, ticket.id);
    }

    if (!thread) throw new Error('Fehler beim Wiedereröffnen des Threads');

    db.prepare("UPDATE tickets SET status = 'open' WHERE id = ?").run(ticket.id);

    try {
        const titleText = new TextDisplayBuilder().setContent(`🎫 **Ticket Wiedereröffnet**`);
        const bodyText = new TextDisplayBuilder().setContent(`Hallo <@${user.id}>! Dein Ticket wurde von <@${adminUser.id}> erneut geöffnet.\n\n` +
            `Das Team steht dir wieder zur Verfügung. Bitte schildere dein Anliegen, falls es neue Entwicklungen gibt.\n` +
            `*Historie: [Web Dashboard](https://ticket.zm0kie.de/tickets/${ticket.id})*`);
        const closeButton = new PrimaryButtonBuilder().setCustomId('close_ticket').setLabel('Ticket schließen').setEmoji({ name: '🔒' });
        const mainSection = new SectionBuilder().addTextDisplayComponents(titleText, bodyText).setPrimaryButtonAccessory(closeButton);
        const container = new ContainerBuilder().setAccentColor(0xFBBF24).addSectionComponents(mainSection);

        await thread.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2 as any
        });
    } catch (v2Error) {
        await thread.send(`🎫 **Ticket Wiedereröffnet**\nDieses Ticket wurde von <@${adminUser.id}> wiedereröffnet.`);
    }

    return thread.id;
};

export const sendAssignmentNotification = async (threadId: string, supporterId: string) => {
    console.log('[DEBUG] sendAssignmentNotification called with:', { threadId, supporterId });
    const { client } = await import('../index');
    const thread = await client.channels.fetch(threadId);

    console.log('[DEBUG] Thread fetched:', thread?.id, thread?.isThread());
    if (!thread || !thread.isThread()) {
        throw new Error('Thread not found');
    }

    try {
        const titleText = new TextDisplayBuilder()
            .setContent('🎯 Ticket übernommen!');

        const bodyText = new TextDisplayBuilder()
            .setContent(`<@${supporterId}> hat dieses Ticket übernommen und wird sich um dein Anliegen kümmern.\n\n*${new Date().toLocaleString('de-DE')}*`);

        const mainSection = new SectionBuilder()
            .addTextDisplayComponents(titleText, bodyText);

        const container = new ContainerBuilder()
            .setAccentColor(0xF59E0B)
            .addSectionComponents(mainSection);

        await thread.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2 as any
        });
        console.log('[DEBUG] V2 assignment message sent successfully!');
    } catch (v2Error) {
        console.error('[ERROR] Failed to send V2 assignment message:', v2Error);
        await thread.send(`🎯 **Ticket übernommen!**\n<@${supporterId}> hat dieses Ticket übernommen und wird sich um dein Anliegen kümmern.`);
    }
};

import * as fs from 'fs';
import * as path from 'path';

export const generateTranscript = async (channel: any, ticket: any) => {
    const transcriptData: any[] = [];
    let htmlContent = '<html><head><style>body { font-family: sans-serif; padding: 20px; } .msg { margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px; } .author { font-weight: bold; color: #5865F2; } .timestamp { color: #999; font-size: 0.8em; } .content { margin-top: 5px; } .rating { font-size: 1.2em; font-weight: bold; color: #eab308; margin-bottom: 5px; } .comment { font-style: italic; color: #555; margin-bottom: 20px; }</style></head><body><h1>Transkript für ' + ticket.channel_id + '</h1>';
    let textContent = '';

    // Standard console logging instead of file logging
    const log = (msg: string) => console.log(`[TRANSCRIPT] ${msg}`);

    try {
        log(`START generateTranscript for channel ${channel.id}`);
        // Removed limit: 100 to maybe fetch more if needed? No, 100 is fine for now.
        const messages = await channel.messages.fetch({ limit: 100 });
        const sortedMessages = Array.from(messages.values()).reverse();
        log(`Fetched ${sortedMessages.length} messages`);

        // Pre-fetch guild members for mention resolution
        const allUserIds = new Set<string>();
        const mentionRegex = /<@!?(\d+)>/g;

        sortedMessages.forEach((msg: any) => {
            if (msg.content) {
                let match;
                while ((match = mentionRegex.exec(msg.content)) !== null) {
                    allUserIds.add(match[1]);
                }
            }
            if (msg.embeds) {
                msg.embeds.forEach((e: any) => {
                    if (e.description) {
                        let match;
                        while ((match = mentionRegex.exec(e.description)) !== null) allUserIds.add(match[1]);
                    }
                    if (e.fields) {
                        e.fields.forEach((f: any) => {
                            let match;
                            while ((match = mentionRegex.exec(f.value)) !== null) allUserIds.add(match[1]);
                        });
                    }
                });
            }
        });

        // Resolve users efficiently
        const userMap = new Map<string, string>();
        if (channel.guild) {
            for (const userId of allUserIds) {
                try {
                    const member = await channel.guild.members.fetch(userId).catch(() => null);
                    if (member) userMap.set(userId, member.displayName || member.user.username);
                    else {
                        // Fallback: Check if it's the ticket creator or bot
                        if (userId === ticket.user_id) {
                            // We might not have the user object here easily if fetch failed, but we can try
                        }
                    }
                } catch (e) { }
            }
        }

        const formatText = (text: string) => {
            if (!text) return '';
            return text.replace(mentionRegex, (match, id) => {
                return userMap.has(id) ? `@${userMap.get(id)}` : match;
            });
        };

        for (const msg of sortedMessages as any[]) {
            // LOGGING EVERY MESSAGE TYPE
            // console.log(`[DEBUG-TRANSCRIPT] Processing Msg ID: ${msg.id}, Type: ${msg.type}, Author: ${msg.author.tag}, ContentLen: ${msg.content?.length}`);

            // REMOVED FILTER: if (msg.type !== 0 && ... ) continue;

            const time = msg.createdAt.toLocaleString('de-DE');
            let content = formatText(msg.content || '');
            const author = msg.author.username; // Changed tag to username for cleaner look
            const avatar = msg.author.displayAvatarURL({ forceStatic: true, extension: 'png' });

            let htmlBody = content ? content.replace(/\n/g, '<br>') : '';

            // V2 Component Logic - ALWAYS CHECK
            let v2Container: any = null;
            if (msg.components && msg.components.length > 0) {
                // Component Debugging
                if (msg.components.some((c: any) => c.components && c.components.length > 0)) {
                    log('Message with Components: ' + JSON.stringify(msg.toJSON(), null, 2));
                }

                const container = msg.components.find((c: any) => c.type === 17 || c.data?.type === 17);
                if (container) {
                    v2Container = typeof container.toJSON === 'function' ? container.toJSON() : (container.data || container);

                    const extractText = (comps: any[]): string => {
                        let t = '';
                        for (const c of comps) {
                            if (c.components) t += extractText(c.components);
                            if (c.content) t += c.content + '\n';
                            if (c.label) t += `\n[Button: ${c.label}]`;
                            if (c.accessory && c.accessory.label) t += `\n[Button: ${c.accessory.label}]`;
                        }
                        return t;
                    };
                    const extracted = extractText(v2Container.components || []);
                    if (extracted && !content.trim()) content = extracted; // Use if main content is empty/whitespace

                    const extractHtml = (comps: any[]): string => {
                        let h = '';
                        for (const c of comps) {
                            if (c.components) {
                                h += `<div style="border: 1px solid #e0e0e0; background: #fff; padding: 10px; border-radius: 5px; margin-top: 5px;">${extractHtml(c.components)}</div>`;
                            }
                            if (c.content) {
                                h += `<div style="color: #2e3338; margin-bottom: 5px;">${formatText(c.content.replace(/\n/g, '<br>'))}</div>`;
                            }
                            if (c.label) {
                                h += `<span style="display: inline-block; background: #5865F2; color: white; padding: 4px 8px; border-radius: 3px; font-size: 0.75rem; margin-right: 5px; margin-top: 5px;">${c.label}</span>`;
                            }
                            if (c.accessory && c.accessory.label) {
                                h += `<span style="display: inline-block; background: #4f545c; color: white; padding: 4px 8px; border-radius: 3px; font-size: 0.75rem; margin-right: 5px; margin-top: 5px;">${c.accessory.label}</span>`;
                            }
                        }
                        return h;
                    };
                    const v2Html = extractHtml(v2Container.components || []);
                    if (v2Html) {
                        htmlBody += v2Html; // Append to body
                    }
                }
            }

            const attachments: any[] = [];
            if (msg.attachments.size > 0) {
                for (const att of msg.attachments.values()) {
                    const localUrl = await downloadAttachment(att.url, ticket.id.toString(), att.name);
                    attachments.push({
                        name: att.name,
                        url: att.url,
                        local_url: localUrl,
                        contentType: att.contentType
                    });
                }
            }

            // Process Embeds Safely (Convert to JSON to allow modification)
            let processedEmbeds: any[] = [];
            if (msg.embeds && msg.embeds.length > 0) {
                processedEmbeds = msg.embeds.map((e: any) => typeof e.toJSON === 'function' ? e.toJSON() : e);

                processedEmbeds.forEach((embed: any) => {
                    if (embed.description) embed.description = formatText(embed.description);
                    if (embed.fields) {
                        embed.fields.forEach((f: any) => {
                            f.value = formatText(f.value);
                        });
                    }
                });
                log('Processed Embeds: ' + JSON.stringify(processedEmbeds, null, 2));
            }

            transcriptData.push({
                id: msg.id,
                author: {
                    username: msg.author.username,
                    discriminator: msg.author.discriminator,
                    avatar: avatar,
                    bot: msg.author.bot
                },
                content: content,
                v2_container: v2Container,
                embeds: processedEmbeds, // Use processed embeds with names
                timestamp: msg.createdTimestamp,
                attachments: attachments
            });

            htmlContent += `<div class="msg">
                <div class="author">${author} <span class="timestamp">${time}</span></div>
                <div class="content">${htmlBody}</div>`;

            // Render Embeds
            if (processedEmbeds.length > 0) {
                processedEmbeds.forEach((embed: any) => {
                    const colorHex = embed.color ? '#' + embed.color.toString(16).padStart(6, '0') : '#2f3136';

                    htmlContent += `<div class="embed" style="border-left: 4px solid ${colorHex}; background: #f9f9f9; padding: 10px; margin-top: 5px; border-radius: 4px;">`;
                    if (embed.title) htmlContent += `<div style="font-weight: bold; margin-bottom: 5px;">${embed.title}</div>`;
                    if (embed.description) htmlContent += `<div style="margin-bottom: 5px;">${embed.description.replace(/\n/g, '<br>')}</div>`;

                    if (embed.fields && embed.fields.length > 0) {
                        embed.fields.forEach((field: any) => {
                            htmlContent += `<div style="margin-top: 5px;"><span style="font-weight: bold;">${field.name}:</span> ${field.value.replace(/\n/g, '<br>')}</div>`;
                        });
                    }
                    if (embed.footer && embed.footer.text) {
                        htmlContent += `<div style="font-size: 0.8em; color: #999; margin-top: 5px;">${embed.footer.text}</div>`;
                    }
                    htmlContent += `</div>`;

                    // Add to text content
                    textContent += `    [EMBED] ${embed.title || 'No Title'}\n`;
                    if (embed.description)
                        textContent += `    ${embed.description}\n`;
                    if (embed.fields) {
                        embed.fields.forEach((f: any) => {
                            textContent += `    - ${f.name}: ${f.value}\n`;
                        });
                    }
                    textContent += `\n`;
                });
            }

            if (attachments.length > 0) {
                htmlContent += '<div><strong>Anhänge:</strong><br>';
                attachments.forEach((att: any) => {
                    htmlContent += `<a href="${att.url}" target="_blank">${att.name}</a><br>`;
                });
                htmlContent += '</div>';
            }
            htmlContent += '</div>';
            textContent += `[${time}] ${author}: ${content}\n`;
        }
        htmlContent += '</body></html>';

        // Debug Dump (Disabled for production cleanup)
        // try { fs.writeFileSync(...) } catch (e) {}

        return { htmlContent, transcriptData, textContent };
    } catch (error) {
        console.error('Error generating transcript:', error);
        return { htmlContent: 'Error generating transcript', transcriptData: [], textContent: 'Error' };
    }
};
