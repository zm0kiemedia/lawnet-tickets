import { Events, MessageFlags, TextInputStyle } from 'discord.js';
import { ModalBuilder, TextInputBuilder, ActionRowBuilder } from '@discordjs/builders';
import type { Interaction, Client } from 'discord.js';

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction) {
        console.log(`[EVENT] Interaction received: type=${interaction.type}, id=${interaction.id}, user=${interaction.user?.tag || 'unknown'}`);
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const command = (interaction.client as Client & { commands: any }).commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Ein Fehler ist aufgetreten!', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: 'Ein Fehler ist aufgetreten!', flags: MessageFlags.Ephemeral });
                }
            }
        }
        // Handle button interactions
        else if (interaction.isButton()) {
            const { handleCloseTicket } = require('../utils/ticketManager');

            if (interaction.customId === 'open_ticket') {
                console.log(`[DEBUG] 'open_ticket' button clicked by ${interaction.user.tag}`);
                // Show Modal instead of creating directly
                const productInput = new TextInputBuilder({
                    custom_id: 'product',
                    label: 'Produkt / Bereich',
                    style: TextInputStyle.Short,
                    placeholder: 'z.B. Minecraft Server, Website',
                    required: true
                });

                const topicInput = new TextInputBuilder({
                    custom_id: 'topic',
                    label: 'Betreff',
                    style: TextInputStyle.Short,
                    placeholder: 'Kurze Zusammenfassung',
                    required: true
                });

                const descriptionInput = new TextInputBuilder({
                    custom_id: 'description',
                    label: 'Beschreibung',
                    style: TextInputStyle.Paragraph,
                    placeholder: 'Beschreibe dein Anliegen...',
                    required: true
                });

                const firstActionRow = new ActionRowBuilder().addComponents(productInput);
                const secondActionRow = new ActionRowBuilder().addComponents(topicInput);
                const thirdActionRow = new ActionRowBuilder().addComponents(descriptionInput);

                const modal = new ModalBuilder()
                    .setTitle('Ticket erstellen')
                    .setCustomId('ticket_modal');

                // Use addComponents if it exists, otherwise fall back to spliceComponents
                if (typeof (modal as any).addComponents === 'function') {
                    (modal as any).addComponents(firstActionRow, secondActionRow, thirdActionRow);
                } else {
                    (modal as any).spliceComponents(0, 0, firstActionRow, secondActionRow, thirdActionRow);
                }

                console.log(`[DEBUG] Attempting to show modal to ${interaction.user.tag}`);
                await (interaction as any).showModal(modal);

            } else if (interaction.customId === 'close_ticket') {
                console.log(`[DEBUG] 'close_ticket' button clicked by ${interaction.user.tag}`);
                const { handleCloseTicket } = require('../utils/ticketManager');
                try {
                    await handleCloseTicket(interaction);
                } catch (err) {
                    console.error('[ERROR] handleCloseTicket failed:', err);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.followUp({ content: 'Fehler beim Schließen des Tickets.', flags: MessageFlags.Ephemeral });
                    }
                }
            } else {
                console.log(`[DEBUG] Unknown button: ${interaction.customId}`);
                await interaction.reply({ content: `Aktion unbekannt: ${interaction.customId}`, flags: MessageFlags.Ephemeral });
            }
        }
        // Handle modal submissions
        else if (interaction.isModalSubmit()) {
            console.log(`[DEBUG] Modal submitted: ${interaction.customId}`);

            if (interaction.customId === 'ticket_modal') {
                const { handleOpenTicket } = require('../utils/ticketManager');

                const i = interaction as any;
                let product = '';
                let topic = '';
                let description = '';

                try {
                    if (i.fields && typeof i.fields.getTextInputValue === 'function') {
                        try {
                            product = i.fields.getTextInputValue('product') || '';
                            topic = i.fields.getTextInputValue('topic') || '';
                            description = i.fields.getTextInputValue('description') || '';
                        } catch (fieldErr) { }
                    }

                    if (!product && i.components) {
                        const components = i.components;

                        // Path 1: hoistedComponents
                        if (components.hoistedComponents && Array.isArray(components.hoistedComponents)) {
                            for (const pair of components.hoistedComponents) {
                                if (Array.isArray(pair) && pair.length >= 2) {
                                    const [key, comp] = pair;
                                    if (key === 'product') product = comp.value;
                                    if (key === 'topic') topic = comp.value;
                                    if (key === 'description') description = comp.value;
                                }
                            }
                        }

                        // Path 2: data
                        if (!product && components.data && Array.isArray(components.data)) {
                            for (const row of components.data) {
                                if (row.components && Array.isArray(row.components)) {
                                    for (const comp of row.components) {
                                        if (comp.customId === 'product') product = comp.value;
                                        if (comp.customId === 'topic') topic = comp.value;
                                        if (comp.customId === 'description') description = comp.value;
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('[ERROR] Failed to extract modal fields:', e);
                }

                await handleOpenTicket(interaction, topic, product, description);
            }
            else if (interaction.customId === 'feedbackModal') {
                // Legacy / Example
            }
        }
    },
};
