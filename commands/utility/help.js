const {
	SlashCommandBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	PermissionsBitField
} = require('discord.js');

const userCooldowns = new Map();
const guildCooldowns = new Map();

const roleIds = [
	'1179913137093365770',
	'1204805166109302944',
	'1402119468808802485'
];  

module.exports = {
	data: new SlashCommandBuilder()
		.setName('staff')
		.setDescription('Request a moderator\'s help'),
	async execute(interaction) {
		const userId = interaction.user.id;
		const guildId = interaction.guild.id;
		const now = Date.now();

		if (userCooldowns.has(userId)) {
			const expiration = userCooldowns.get(userId);
			if (now < expiration) {
				const remaining = Math.ceil((expiration - now) / 1000);
				return interaction.reply({
					content: `⏳ You must wait **${remaining}s** before using this command again.`,
					ephemeral: true
				});
			}
		}

		if (guildCooldowns.has(guildId)) {
			const expiration = guildCooldowns.get(guildId);
			if (now < expiration) {
				const remaining = Math.ceil((expiration - now) / 1000);
				return interaction.reply({
					content: `🚨 This command is on cooldown for the entire server. Try again in **${remaining}s**.`,
					ephemeral: true
				});
			}
		}

		const modal = new ModalBuilder()
			.setCustomId('staffHelpModal')
			.setTitle('Request Staff Help');

		const reasonInput = new TextInputBuilder()
			.setCustomId('reason')
			.setLabel('Why do you need help?')
			.setStyle(TextInputStyle.Paragraph)
			.setPlaceholder('Describe the situation for the moderators...')
			.setRequired(true);

		const row = new ActionRowBuilder().addComponents(reasonInput);
		modal.addComponents(row);

		await interaction.showModal(modal);
	},


    async handleModal(interaction) {
        if (interaction.customId !== 'staffHelpModal') return;

        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const now = Date.now();

        const cooldownTime = 30 * 1000;
        const secondaryCooldownTime = 60 * 1000;
        userCooldowns.set(userId, now + secondaryCooldownTime);
        guildCooldowns.set(guildId, now + cooldownTime);

        const reason = interaction.fields.getTextInputValue('reason');

        const roleMentions = roleIds
            .map(id => interaction.guild.roles.cache.get(id))
            .filter(role => role) 
            .map(role => role.toString())
            .join(' ');

        await interaction.reply({
            content: `📢 ${interaction.user} is requesting help!\n**Reason:** ${reason}\n${roleMentions}`
        });
    }
};
