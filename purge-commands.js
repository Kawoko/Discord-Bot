require('dotenv').config();
const { REST, Routes } = require('discord.js');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) throw new Error('Missing TOKEN or CLIENT_ID');

(async () => {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    const before = await rest.get(Routes.applicationCommands(clientId));
    console.log('Global before:', before.map(c => c.name));
    await rest.put(Routes.applicationCommands(clientId), { body: [] }); // ← wipes ALL global slash cmds
    const after = await rest.get(Routes.applicationCommands(clientId));
    console.log('Global after:', after.map(c => c.name));
    console.log('✅ Purged global commands');
  } catch (e) {
    console.error('Purge failed:', e);
  }
})();
