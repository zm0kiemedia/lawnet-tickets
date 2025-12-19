import {
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
    TextChannel
} from 'discord.js';
import {
    ActionRowBuilder,
    PrimaryButtonBuilder,
    ChatInputCommandBuilder,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder
} from '@discordjs/builders';

module.exports = {
    data: new ChatInputCommandBuilder()
        .setName('send-panel')
        .setDescription('Sendet das Ticket-Panel in einen Kanal')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOptions((option: any) =>
            option.setName('channel')
                .setDescription('Kanal, in den das Panel gesendet werden soll')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),
    async execute(interaction: any) {
        const channel = interaction.options.getChannel('channel') as TextChannel;

        // --- COMPONENTS V2 REFACTOR ---

        const titleText = new TextDisplayBuilder()
            .setContent('🎫 LawNet Support');

        const bodyText = new TextDisplayBuilder()
            .setContent('**Hilfe benötigt?**\nKlicke auf den Button unten, um unser Support-Team zu kontaktieren.\nEs wird ein privates Ticket für dich erstellt.');

        const openButton = new PrimaryButtonBuilder()
            .setCustomId('open_ticket')
            .setLabel('Ticket öffnen')
            .setEmoji({ name: '📩' });

        const section = new SectionBuilder()
            .addTextDisplayComponents(titleText, bodyText)
            .setPrimaryButtonAccessory(openButton);

        const container = new ContainerBuilder()
            .setAccentColor(0xF59E0B)
            .addSectionComponents(section);

        // Send using V2
        await channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });

        await interaction.reply({
            content: `Ticket-Panel wurde in ${channel} gesendet!`,
            flags: MessageFlags.Ephemeral
        });
    },
};
