const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	ComponentType,
	PermissionsBitField
} = require('discord.js');

// Moderation offenses pulled from your guide
const offenses = {
	"misuse": {
		name: "Misuse of channels",
		explanation: "Using the wrong channels for discussions, spamming off-topic content",
		punishments: [
			"1st: Verbal Warning",
			"2nd: Warning (Dyno /warn)",
			"3rd: 1 Hour Timeout",
			"4th: 3 Hour Timeout (+1h per repeat)"
		]
	},
	"slurs": {
		name: "Racial Slurs",
		explanation: "Derogatory terms/slurs targeting race, ethnicity or nationality",
		punishments: [
			"1st: Discord Ban (Appeal allowed)"
		]
	},
	"language": {
		name: "Inappropriate Language & Swearing",
		explanation: "Swearing allowed to a certain threshold. Staff discretion required.",
		punishments: [
			"1st: Verbal Warning",
			"2nd: Warning (Dyno)",
			"3rd: 1 Hour Timeout",
			"4th: 3 Hour Timeout (+1h per repeat)"
		]
	},
	"nsfw_light": {
		name: "NSFW Content (Light)",
		explanation: "Sharing inappropriate but not extreme sexual & graphic content.",
		punishments: [
			"1st: 1 Day Timeout",
			"2nd: 7 Day Timeout",
			"3rd: Discord Ban (Appeal allowed)"
		]
	},
	"nsfw_heavy": {
		name: "NSFW Content (Heavy)",
		explanation: "Sharing highly explicit, pornographic or disturbing NSFW content.",
		punishments: [
			"1st: Discord Ban (Appeal allowed)"
		]
	},
	"harassment": {
		name: "Harassment & Bullying",
		explanation: "Personal attacks, targeted insults, sustained negative behavior",
		punishments: [
			"1st: Warning (Dyno)",
			"2nd: 1d Timeout",
			"3rd: 7d Timeout",
			"4th: Permanent Ban (Appeal allowed)"
		]
	},
	"spam": {
		name: "Spamming / Flooding / Spam Pinging",
		explanation: "Mass messages or excessive pings",
		punishments: [
			"1st: Warning (Dyno /warn)",
			"2nd: 1 Hour Timeout",
			"3rd: 1 Day Timeout",
			"4th: 7 Day Timeout",
			"5th: Permanent Ban (Appeal allowed)"
		]
	},
	"advertising": {
		name: "Advertising",
		explanation: "Posting links or promotions (servers, socials, YouTube, etc.)",
		punishments: [
			"1st: 1 Day Timeout",
			"2nd: 7d Timeout",
			"3rd: Permanent Ban"
		]
	},
	"dm_advertising": {
		name: "DM Advertising",
		explanation: "Sending unsolicited advertisements through DMs",
		punishments: [
			"1st: 7d Ban",
			"2nd: 14d Ban",
			"3rd: Permanent Ban (Appeal allowed)"
		]
	},
	"tos": {
		name: "Terms of Service",
		explanation: "Breaking Discord’s ToS or Community Guidelines",
		punishments: [
			"1st: Permanent Ban (No Appeal)"
		]
	},
	"underage": {
		name: "Incorrect Age",
		explanation: "Users under 13 (or required age in their country)",
		punishments: [
			"1st: Permanent Ban (Appeal when they reach correct age)"
		]
	},
	"bots": {
		name: "Bots & Hijacked Accounts",
		explanation: "Compromised accounts or using automation/bots to disrupt",
		punishments: [
			"1st: Kick",
			"2nd: 14d Ban",
			"3rd: Permanent Ban"
		]
	},
	"cheating": {
		name: "Game Cheating",
		explanation: "Cheating inside the Roblox game",
		punishments: [
			"1st: Permanent Game Ban (log hours)"
		]
	},
	"bug_abuse": {
		name: "Bug Abusing",
		explanation: "Exploiting or abusing bugs inside the Roblox game",
		punishments: [
			"1st: 14 Day Game Ban"
		]
	}
};

module.exports = {
	data: new SlashCommandBuilder()
		.setName('guide')
		.setDescription('Show the moderation guide'),
	async execute(interaction) {
		// ✅ Permission check: require Kick OR Timeout permission
		if (
			!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers) &&
			!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
		) {
			return interaction.reply({
				content: "❌ You don’t have permission to use this command.",
				ephemeral: true
			});
		}

		// Main embed
		const embed = new EmbedBuilder()
			.setTitle("⚖️ ADV Games Moderation Guide")
			.setDescription("Select an offense from the dropdown to view details.")
			.setColor(0x2b2d31)
			.setFooter({ text: "Updated 28 Aug 2025" });

		// Dropdown menu
		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId('guideSelect')
			.setPlaceholder('Choose an offense...')
			.addOptions(
				Object.entries(offenses).map(([id, data]) => ({
					label: data.name,
					value: id
				}))
			);

		const row = new ActionRowBuilder().addComponents(selectMenu);

		// Send initial response
		const message = await interaction.reply({
			embeds: [embed],
			components: [row],
			ephemeral: true
		});

		// Collector for menu interactions
		const collector = message.createMessageComponentCollector({
			componentType: ComponentType.StringSelect,
			time: 60_000 // 1 minute
		});

		collector.on('collect', async i => {
			if (i.customId === 'guideSelect') {
				const offense = offenses[i.values[0]];
				if (!offense) return;

				const offenseEmbed = new EmbedBuilder()
					.setTitle(`📘 ${offense.name}`)
					.setDescription(offense.explanation)
					.addFields([{ name: "Punishments", value: offense.punishments.join("\n") }])
					.setColor(0x5865f2);

				await i.update({ embeds: [offenseEmbed], components: [row] });
			}
		});
	},
};
