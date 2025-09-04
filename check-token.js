require('dotenv').config();
const { REST, Routes } = require('discord.js');

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const me = await rest.get(Routes.oauth2CurrentApplication());
    console.log('OK ✅', { id: me.id, name: me.name });
  } catch (e) {
    console.error('TOKEN FAILED ❌', e.status, e.code, e.message);
  }
})();
