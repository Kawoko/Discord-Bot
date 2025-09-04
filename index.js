require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Collection,
  Events,
} = require('discord.js');

const token = process.env.TOKEN;
const fs = require('node:fs');
const path = require('node:path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// -------- Dyno IDs per source guild --------
const DYNO_BY_GUILD = new Map([
  ['1177552024724848730', '1224087535639068672'], // guild A -> Dyno ID
  ['1143532840567459840', '1264101019285983273'], // guild B -> Dyno ID
]);

// -------- Routes (source -> destination) --------
const ROUTES = [
  {
    sourceGuildId:  '1177552024724848730',
    sourceChannelId:'1224086801959092234',
    targetGuildId:  '1413174842936528926',
    targetChannelId:'1413185642623664252',
  },
  {
    sourceGuildId:  '1143532840567459840',
    sourceChannelId:'1264100711365476483',
    targetGuildId:  '1413174842936528926',
    targetChannelId:'1413198987992764517',
  },
];

// lookup maps / caches
const routeBySource = new Map(ROUTES.map(r => [`${r.sourceGuildId}:${r.sourceChannelId}`, r]));
const targetCache = new Map(); // `${targetGuildId}:${targetChannelId}` -> channel

// ---------- command loader ----------
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
if (fs.existsSync(foldersPath)) {
  for (const folder of fs.readdirSync(foldersPath)) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
      const cmd = require(path.join(commandsPath, file));
      if ('data' in cmd && 'execute' in cmd) client.commands.set(cmd.data.name, cmd);
      else console.log(`[WARNING] ${file} missing "data" or "execute"`);
    }
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot is ready as ${client.user.tag}`);
  // warm destination channels (best effort)
  for (const r of ROUTES) {
    const key = `${r.targetGuildId}:${r.targetChannelId}`;
    try {
      const guild = await client.guilds.fetch(r.targetGuildId);
      const chan  = await guild.channels.fetch(r.targetChannelId);
      if (chan?.isTextBased()) targetCache.set(key, chan);
    } catch {}
  }
});

// ---------- Appeals forwarder ----------
// ... keep your existing requires, client init, DYNO_BY_GUILD, ROUTES, loaders, etc.

// ---------- Appeals forwarder (with thread + reactions) ----------
client.on('messageCreate', async (message) => {
  if (!message.guildId || !message.embeds?.length) return;

  // route must match this guild+channel
  const route = routeBySource.get(`${message.guildId}:${message.channelId}`);
  if (!route) return;

  // author must match the Dyno ID for this guild
  const expectedDynoId = DYNO_BY_GUILD.get(message.guildId);
  if (!expectedDynoId || message.author?.id !== expectedDynoId) return;

  // resolve destination
  const destKey = `${route.targetGuildId}:${route.targetChannelId}`;
  let target = targetCache.get(destKey);
  try {
    if (!target) {
      const g = await client.guilds.fetch(route.targetGuildId);
      const c = await g.channels.fetch(route.targetChannelId);
      if (!c?.isTextBased()) return;
      target = c;
      targetCache.set(destKey, c);
    }

    // clone embeds 1:1
    const embeds = message.embeds.map(e => {
      try { return EmbedBuilder.from(e); }
      catch { return new EmbedBuilder(e?.data ?? e?.toJSON?.() ?? {}); }
    });

    // original message link
    const jumpLink = message.url;

    // --- send the forwarded message ---
    const sent = await target.send({
      content: `**Message Link:** ${jumpLink}`,
      embeds,
    });

    // --- start a discussion thread on the forwarded message ---
    // Try to build a nice thread name from the first embed title, fallback generic
    const firstTitle = embeds[0]?.data?.title || embeds[0]?.title || 'Appeal';
    const threadName = `${firstTitle}`.slice(0, 90); // Discord limit is 100; keep a safety margin

    try {
      await sent.startThread({
        name: threadName || 'Appeal Discussion',
        autoArchiveDuration: 1440, // 24h (valid: 60, 1440, 4320, 10080)
        reason: 'Appeal discussion thread',
      });
    } catch (e) {
      console.warn('⚠️ Could not start thread (missing perms or channel type):', e?.message || e);
    }

    // --- add voting reactions to the forwarded message ---
    // requires Add Reactions permission in the target channel
    try {
      await sent.react('✅');
      await sent.react('❌');
    } catch (e) {
      console.warn('⚠️ Could not add reactions (missing perms?):', e?.message || e);
    }

  } catch (err) {
    console.error('❌ Forward failed:', err);
  }
});

// ---------- interactions (unchanged) ----------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId === 'staffHelpModal') {
      const staffCommand = interaction.client.commands.get('staff');
      if (staffCommand?.handleModal) await staffCommand.handleModal(interaction);
    }
  } catch (error) {
    console.error(error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', flags: 64 });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 });
      }
    } catch {}
  }
});

client.login(token);

process.on('SIGINT', () => {
  console.log('Shutting down...');
  client.destroy();
  process.exit(0);
});
