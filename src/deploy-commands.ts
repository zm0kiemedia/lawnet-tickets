import { REST, Routes } from 'discord.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    }
}

const rest = new REST().setToken(process.env.BOT_TOKEN!);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        let data: any;
        if (process.env.GUILD_ID) {
            // Guild-specific commands (faster for development)
            data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID),
                { body: commands },
            );
            console.log(`✓ Successfully registered ${data.length} guild commands.`);
        } else {
            // Global commands (takes up to 1 hour to propagate)
            data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID!),
                { body: commands },
            );
            console.log(`✓ Successfully registered ${data.length} global commands.`);
        }
    } catch (error) {
        console.error(error);
    }
})();
