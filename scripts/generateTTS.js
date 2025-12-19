const googleTTS = require('google-tts-api');
const https = require('https');
const fs = require('fs');
const path = require('path');

const text = 'Willkommen im LawNet Support Voice Channel. Für Hilfe erstelle bitte ein Ticket im entsprechenden Kanal. Unser Team wird sich schnellstmöglich bei dir melden.';
const outputPath = path.join(__dirname, '../audio/announcement.mp3');

async function generateTTS() {
    try {
        const url = googleTTS.getAudioUrl(text, {
            lang: 'de',
            slow: false,
            host: 'https://translate.google.com',
        });

        console.log('Generating TTS audio...');
        console.log('URL:', url);

        const file = fs.createWriteStream(outputPath);

        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('✅ Audio file generated successfully:', outputPath);
            });
        }).on('error', (err) => {
            fs.unlink(outputPath, () => { });
            console.error('❌ Error downloading audio:', err.message);
        });
    } catch (error) {
        console.error('❌ Error generating TTS:', error);
    }
}

generateTTS();
