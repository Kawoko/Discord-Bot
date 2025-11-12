require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildIds = process.env.GUILD_IDS?.split(',').map(s => s.trim()).filter(Boolean) || [process.env.GUILD_ID];

if (!token) throw new Error('Missing TOKEN in .env');
if (!clientId) throw new Error('Missing CLIENT_ID in .env');
if (!guildIds.length || !guildIds[0]) throw new Error('Missing GUILD_IDS or GUILD_ID in .env');

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
for (const folder of fs.readdirSync(foldersPath)) {
  const commandsPath = path.join(foldersPath, folder);
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    } else {
      console.log(`[WARNING] ${filePath} is missing "data" or "execute".`);
    }
  }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    for (const gid of guildIds) {
      console.log(`⏳ Refreshing ${commands.length} guild commands for ${gid}...`);
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, gid),
        { body: commands },
      );
      console.log(`✅ Deployed ${data.length} commands to guild ${gid}`);
    }
    console.log('✨ All guilds updated.');
  } catch (error) {
    console.error('Deploy failed:', error);
  }
})();
