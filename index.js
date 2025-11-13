require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Collection,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const token = process.env.TOKEN;
const fs = require('node:fs');
const path = require('node:path');

const rewardsCmd = require('./commands/utility/rewards.js');
const Rewards = require('./rewards');

const express = require('express');
const app = express();

const EXP_STORE_PATH = path.join(__dirname, 'role-expiries.json');
const activeExpiryTimers = new Map();

const STAFF_ROLE_ID = 1143536083565559930;
const TICKETS_CATEGORY_ID = 1438502242293645413; 

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const DYNO_BY_GUILD = new Map([
  ['1177552024724848730', '1224087535639068672'], // guild A -> Dyno ID
  ['1143532840567459840', '1264101019285983273'], // guild B -> Dyno ID
]);

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

// ---- message monitor config ----
const MONITOR_GUILD_ID = '1143532840567459840';
const MONITOR_CHANNEL_IDS = new Set([
  '1437864773827170495',
  '1437864738381103194',
  '1425839807136796823',
  '1381955334339428372',
  '1429178579505250388',
  '1421165587484377161',
  '1393658454316417185',
  '1369919058597773323',
  '1369919676338929664',
]);

const ROLE_BY_OUTCOME = new Map([
  ['2x',  '1438197891134128249'],
  ['3x',  '1438198028979666955'],
  ['4x',  '1438198058251714660'],
  ['5x',  '1438198078526984304'],
  ['10x', '1438198106402328680'],
]);

const MONITOR_ECHO = null; 
// ---- message monitor end

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

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function formatPct(p) { return `${(p * 100).toFixed(2)}%`; }

function getRoleForResult(result) {
  return ROLE_BY_OUTCOME.get(result.type) || null;
}

function loadExpiryStore() {
  try { return JSON.parse(fs.readFileSync(EXP_STORE_PATH, 'utf8')); }
  catch { return []; }
}
function saveExpiryStore(arr) {
  fs.writeFileSync(EXP_STORE_PATH, JSON.stringify(arr, null, 2));
}
function addExpiryRecord(rec) {
  const all = loadExpiryStore();
  // de-dup by (guildId,userId,roleId)
  const key = `${rec.guildId}:${rec.userId}:${rec.roleId}`;
  const existingIdx = all.findIndex(r => `${r.guildId}:${r.userId}:${r.roleId}` === key);
  if (existingIdx >= 0) all[existingIdx] = rec; else all.push(rec);
  saveExpiryStore(all);
}
function removeExpiryRecord(guildId, userId, roleId) {
  const all = loadExpiryStore().filter(r => !(r.guildId === guildId && r.userId === userId && r.roleId === roleId));
  saveExpiryStore(all);
}

function scheduleRemovalTimer(client, guildId, userId, roleId, expiresAtMs) {
  const key = `${guildId}:${userId}:${roleId}`;
  // clear previous timer if any
  const prev = activeExpiryTimers.get(key);
  if (prev) clearTimeout(prev);

  const delay = Math.max(0, expiresAtMs - Date.now());
  const t = setTimeout(async () => {
    activeExpiryTimers.delete(key);
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      // only remove if role still present
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, 'Reward duration expired (persisted)');
      }
    } catch (e) {
      console.warn('Scheduled removal failed:', e?.message || e);
    } finally {
      removeExpiryRecord(guildId, userId, roleId);
    }
  }, delay);

  activeExpiryTimers.set(key, t);
}

async function grantTimedRolePersist(client, guildId, userId, roleId, hours) {
  if (!roleId) return;
  const expiresAtMs = Date.now() + hours * 60 * 60 * 1000;

  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);

    await member.roles.add(roleId, `Reward win for ${hours}h`);
    console.log(`Added role ${roleId} to ${userId} for ${hours}h`);

    addExpiryRecord({ guildId, userId, roleId, expiresAt: expiresAtMs });
    scheduleRemovalTimer(client, guildId, userId, roleId, expiresAtMs);
  } catch (e) {
    console.warn('grantTimedRolePersist failed:', e?.message || e);
  }
}

async function reconcileRoleExpiries(client) {
  const all = loadExpiryStore();
  if (!all.length) return;

  for (const rec of all) {
    const { guildId, userId, roleId, expiresAt } = rec;
    if (!guildId || !userId || !roleId || !expiresAt) continue;

    if (Date.now() >= expiresAt) {
      // expired while bot was offline -> remove now
      try {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId, 'Expired while bot was offline');
        }
      } catch (e) {
        console.warn('Offline cleanup failed:', e?.message || e);
      } finally {
        removeExpiryRecord(guildId, userId, roleId);
      }
    } else {
      // not expired -> re-schedule
      scheduleRemovalTimer(client, guildId, userId, roleId, expiresAt);
    }
  }
}

function computeResolvedChance(result, store) {
  const p = store.baseProbabilities;
  if (['2x','3x','4x','5x'].includes(result.type)) {
    return Number(p[result.type]) || 0;
  }
  if (result.type === '10x') {
    const s = store.specialSplit;
    const sum = Number(s['10x']) + Number(s['GAMEPASS']) + Number(s['P2W']);
    return (Number(p['SPECIAL']) || 0) * (Number(s['10x']) / sum);
  }
  if (result.type === 'GAMEPASS' || result.type === 'P2W') {
    const s = store.specialSplit;
    const b = store.bonusTierWeights;
    const sumS = Number(s['10x']) + Number(s['GAMEPASS']) + Number(s['P2W']);
    const sumB = Number(b.I) + Number(b.II) + Number(b.III);
    return (Number(p['SPECIAL']) || 0) * (Number(s[result.type]) / sumS) * (Number(b[result.tier]) / sumB);
  }
  return 0;
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

  // ⬇️ Add this
  await reconcileRoleExpiries(client);
});

// Per-message reward roll (robust)
// Per-message reward roll (robust)
client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guildId || message.webhookId || message.author?.bot) return;
    if (message.guildId !== MONITOR_GUILD_ID) return;
    if (!MONITOR_CHANNEL_IDS.has(message.channelId)) return;

    const result = Rewards.rollOnce(message);
    if (!result) return; // most messages: no hit

    const store = Rewards.loadStore();
    const durationHours = randInt(1, 24);

    const embed = await buildWinEmbed(client, message, result, store, durationHours);

    // -------------------------
    // 1) Send to the log channel
    // -------------------------
    const logChannelId = "1438214792866299944";
    const logChannel = await client.channels.fetch(logChannelId).catch(() => null);

    if (logChannel?.isTextBased()) {
      await logChannel.send({
        content: `<@${message.author.id}>`,
        embeds: [embed],
        allowedMentions: {
          users: [message.author.id],
          roles: [],
          parse: []
        }
      });
    }

if (result.type === "P2W" || result.type === "GAMEPASS") {
  const guild = message.guild;
  if (!guild) return;

  const baseName = result.type === "P2W" ? "p2w" : "gamepass";

  const userSlug = message.author.username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10) || "user";

  const baseChannelName = `winner-${baseName}-${userSlug}`;

  // Make sure we can see all channels in cache
  await guild.channels.fetch();

  // Find existing winner channels for this user & reward type
  const existing = guild.channels.cache.filter(ch =>
    ch.type === ChannelType.GuildText &&
    ch.parentId === (TICKETS_CATEGORY_ID || ch.parentId) && // same category (if set)
    ch.name.startsWith(baseChannelName)
  );

  // If none -> use base name; if some -> add numeric suffix
  let channelName = baseChannelName;
  if (existing.size > 0) {
    // Find highest numeric suffix used so far
    let maxN = 1;
    for (const ch of existing.values()) {
      const m = ch.name.match(/^.+-(\d+)$/);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= maxN) maxN = n + 1;
      } else {
        // the plain base name exists -> next is 2
        if (maxN === 1) maxN = 2;
      }
    }
    if (maxN > 1) channelName = `${baseChannelName}-${maxN}`;
  }

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: TICKETS_CATEGORY_ID || undefined,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: message.author.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      ...(STAFF_ROLE_ID
        ? [{
            id: STAFF_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels
            ]
          }]
        : [])
    ]
  });

  await ticketChannel.send(
    `Please wait for Staff Member to reply to your ticket <@${message.author.id}>`
  );
};

async function buildWinEmbed(client, message, result, store, durationHours) {
  const chance = computeResolvedChance(result, store);
  let rewardLine = '';

  if (['2x','3x','4x','5x','10x'].includes(result.type)) {
    rewardLine = `**${result.type} XP** multiplier`;
  } else if (result.type === 'P2W') {
    const ranges = { I: [10,15], II: [15,25], III: [25,50] };
    const [lo, hi] = ranges[result.tier];
    const amount = randInt(lo, hi);
    rewardLine = `**P2W currency**: **${amount}** (Tier **${result.tier}**)`;
    result.amount = amount;
  } else if (result.type === 'GAMEPASS') {
    const textByTier = {
      I: '1 gamepass up to **100 R$**',
      II: '1 gamepass up to **250 R$**',
      III: '**Gamepass by choice**'
    };
    rewardLine = `**Gamepass**: ${textByTier[result.tier]} (Tier **${result.tier}**)`;
  }

  // Build fields; only include "Duration" for multiplier/10x results
  const fields = [
    { name: 'Winner', value: `<@${message.author.id}>`, inline: true },
    { name: 'Outcome', value: rewardLine, inline: false },
    { name: 'Current win chance', value: formatPct(chance), inline: true },
    { name: 'Message', value: `[Jump to message](${message.url})`, inline: false },
  ];

  if (['2x','3x','4x','5x','10x'].includes(result.type)) {
    fields.splice(2, 0, { name: 'Duration', value: `${durationHours}h`, inline: true });
  }

  return new EmbedBuilder()
    .setTitle('🎉 Someone has won!')
    .setDescription('Congrats! Here are the details of your reward.')
    .setColor(0x4ade80)
    .addFields(fields)
    .setTimestamp();
}

client.on('messageCreate', async (message) => {
  if (!message.guildId || !message.embeds?.length) return;

  const route = routeBySource.get(`${message.guildId}:${message.channelId}`);
  if (!route) return;

  const expectedDynoId = DYNO_BY_GUILD.get(message.guildId);
  if (!expectedDynoId || message.author?.id !== expectedDynoId) return;

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

    const embeds = message.embeds.map(e => {
      try { return EmbedBuilder.from(e); }
      catch { return new EmbedBuilder(e?.data ?? e?.toJSON?.() ?? {}); }
    });

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

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    // your staffHelpModal
    if (interaction.isModalSubmit() && interaction.customId === 'staffHelpModal') {
      const staffCommand = interaction.client.commands.get('staff');
      if (staffCommand?.handleModal) await staffCommand.handleModal(interaction);
      return;
    }

    // Rewards: select → modal (central handler variant)
    if (interaction.isStringSelectMenu() && interaction.customId === rewardsCmd.SELECT_ID) {
      const selected = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`${rewardsCmd.MODAL_ID}:${selected}`)
        .setTitle('Edit reward chance / weight');

      const input = new TextInputBuilder()
        .setCustomId(rewardsCmd.INPUT_ID)
        .setLabel(`New numeric value for ${selected}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 0.02 or 1/50 or 60')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith(rewardsCmd.MODAL_ID)) {
      const selected = interaction.customId.slice(rewardsCmd.MODAL_ID.length + 1);
      const raw = interaction.fields.getTextInputValue(rewardsCmd.INPUT_ID).trim();

      let value;
      if (/^\d+\s*\/\s*\d+$/.test(raw)) {
        const [a, b] = raw.split('/').map(Number);
        value = a / b;
      } else {
        value = Number(raw);
      }

      if (!Number.isFinite(value) || value <= 0) {
        return interaction.reply({
          content: 'Please provide a positive number (like `0.02` or `1/50`).',
          flags: MessageFlags.Ephemeral,
        });
      }

      const store = Rewards.loadStore();
      const [group, key] = selected.split(':');

      if (group === 'base') {
        store.baseProbabilities = store.baseProbabilities || {};
        store.baseProbabilities[key] = value;
      } else if (group === 'split') {
        store.specialSplit[key] = value;
      } else if (group === 'bonus') {
        store.bonusTierWeights[key] = value;
      } else {
        return interaction.reply({ content: 'Unknown field selected.', flags: MessageFlags.Ephemeral });
      }

      Rewards.saveStore(store);

      return interaction.reply({
        content: `✅ Updated **${selected}** to \`${value}\`. (Probabilities are used as-is; split/bonus are normalized.)`,
        flags: MessageFlags.Ephemeral,
      });
    }

  } catch (error) {
    console.error(error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
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

app.get('/', (req, res) => res.send('Bot is alive!'));

app.listen(process.env.PORT || 3000, () => {
    console.log('Web server running...');
});