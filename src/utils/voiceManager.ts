import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    VoiceConnection
} from '@discordjs/voice';
import { Client, VoiceBasedChannel } from 'discord.js';
import path from 'path';
import fs from 'fs';

const VOICE_CHANNEL_ID = '1451058192586113097';
const AUDIO_FILE = path.join(__dirname, '../../audio/lawnet_support.wav');

let currentConnection: VoiceConnection | null = null;

export async function startVoiceAnnouncement(client: Client) {
    try {
        // Check if audio file exists
        if (!fs.existsSync(AUDIO_FILE)) {
            console.error('❌ Audio file not found:', AUDIO_FILE);
            return;
        }

        // Fetch voice channel
        const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
        if (!channel || !channel.isVoiceBased()) {
            console.error('❌ Voice channel not found or invalid:', VOICE_CHANNEL_ID);
            return;
        }

        const voiceChannel = channel as VoiceBasedChannel;

        console.log(`🎙️ Joining voice channel: ${voiceChannel.name}`);

        // Join voice channel
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator as any,
        });

        currentConnection = connection;

        // Wait for connection to be ready
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
            console.log('✅ Voice connection established');
        } catch (error) {
            console.error('❌ Failed to establish voice connection:', error);
            connection.destroy();
            return;
        }

        // Create audio player
        const player = createAudioPlayer();

        // Play initial audio
        const resource = createAudioResource(AUDIO_FILE);
        player.play(resource);
        connection.subscribe(player);

        console.log('🔊 Playing announcement...');

        // Loop audio when it finishes
        player.on(AudioPlayerStatus.Idle, () => {
            console.log('🔁 Looping announcement...');
            const newResource = createAudioResource(AUDIO_FILE);
            player.play(newResource);
        });

        // Handle player errors
        player.on('error', (error) => {
            console.error('❌ Audio player error:', error);
        });

        // Handle connection state changes
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            console.warn('⚠️ Voice connection disconnected, attempting to reconnect...');
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
                // Connection recovered
            } catch (error) {
                // Connection could not be recovered, destroy and retry
                connection.destroy();
                console.log('🔄 Reconnecting in 5 seconds...');
                setTimeout(() => startVoiceAnnouncement(client), 5000);
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log('💀 Voice connection destroyed');
            player.stop();
        });

    } catch (error) {
        console.error('❌ Error in voice announcement:', error);
    }
}

export function stopVoiceAnnouncement() {
    if (currentConnection) {
        currentConnection.destroy();
        currentConnection = null;
        console.log('🛑 Voice announcement stopped');
    }
}
