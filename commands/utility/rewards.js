// commands/utility/rewards.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionsBitField,
  MessageFlags,
} = require('discord.js');

const Rewards = require('../../rewards');

const EDITABLE = [
  { value: 'base:2x',       label: 'Base probability: 2x' },
  { value: 'base:3x',       label: 'Base probability: 3x' },
  { value: 'base:4x',       label: 'Base probability: 4x' },
  { value: 'base:5x',       label: 'Base probability: 5x' },
  { value: 'base:SPECIAL',  label: 'Base probability: SPECIAL (10x/Gamepass/P2W)' },
  { value: 'split:10x',     label: 'SPECIAL split: 10x weight' },
  { value: 'split:GAMEPASS',label: 'SPECIAL split: Gamepass weight' },
  { value: 'split:P2W',     label: 'SPECIAL split: P2W weight' },
  { value: 'bonus:I',       label: 'Bonus tier I weight (Gamepass/P2W)' },
  { value: 'bonus:II',      label: 'Bonus tier II weight (Gamepass/P2W)' },
  { value: 'bonus:III',     label: 'Bonus tier III weight (Gamepass/P2W)' },
];

const SELECT_ID = 'rewardsSelect';
const MODAL_ID  = 'rewardsEdit';
const INPUT_ID  = 'rewardsInput';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rewards')
    .setDescription('View or edit reward chances')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ You must be **Administrator** to use this.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const store = Rewards.loadStore();
    const p = store.baseProbabilities || store.baseWeights || {};

    const embed = new EmbedBuilder()
      .setTitle('🎲 Rewards configuration')
      .setDescription([
        '**Per-message probabilities** (0–1; `1/50` = `0.02`):',
        `• 2x: \`${p['2x']}\``,
        `• 3x: \`${p['3x']}\``,
        `• 4x: \`${p['4x']}\``,
        `• 5x: \`${p['5x']}\``,
        `• SPECIAL: \`${p['SPECIAL']}\``,
        '',
        '**SPECIAL split weights**:',
        `• 10x / GAMEPASS / P2W: \`${store.specialSplit['10x']}\` / \`${store.specialSplit['GAMEPASS']}\` / \`${store.specialSplit['P2W']}\``,
        '',
        '**Bonus tier weights**:',
        `• I / II / III: \`${store.bonusTierWeights.I}\` / \`${store.bonusTierWeights.II}\` / \`${store.bonusTierWeights.III}\``,
        '',
        'Pick a field to edit:',
      ].join('\n'))
      .setColor(0x2b2d31);

    const select = new StringSelectMenuBuilder()
      .setCustomId(SELECT_ID)
      .setPlaceholder('Select a chance/weight to edit…')
      .addOptions(EDITABLE.map(({ value, label }) => ({ value, label })));

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },

  // IDs used by your central InteractionCreate handler
  SELECT_ID,
  MODAL_ID,
  INPUT_ID,
};
