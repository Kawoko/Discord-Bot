const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

let lastUsedTimestamp = 0; // Store the timestamp of the last time the command was used globally
const globalCooldown = 60000; // Global cooldown in milliseconds (1 minute)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tester')
        .setDescription('Check the current chance of winning for a role.'),

    async execute(interaction) {
        const currentTime = Date.now();

        // Check if the global cooldown has expired
        if (currentTime - lastUsedTimestamp < globalCooldown) {
            const remainingTime = globalCooldown - (currentTime - lastUsedTimestamp);
            const secondsLeft = Math.ceil(remainingTime / 1000);
            return interaction.reply({
                content: `The command is on cooldown. Please wait ${secondsLeft} seconds before using it again.`,
                ephemeral: true, // Reply visible only to the user
            });
        }

        // Update the timestamp for global cooldown
        lastUsedTimestamp = currentTime;

        try {
            // Access the MongoDB database and the roleChances collection
            const database = interaction.client.mongoDBClient.db('discord');
            const roleChancesCollection = database.collection('roleChances');

            // Fetch the current chance value for the roleId
            const roleData = await roleChancesCollection.findOne({ roleId: '1316390100514635776' });

            if (!roleData) {
                return interaction.reply({ content: 'No chance data found for this role.', ephemeral: true });
            }

            const currentChance = roleData.chance;
            await interaction.reply({
                content: `The current chance of winning for the role is 1/${currentChance}.`,
                ephemeral: false, // Reply will be visible only to the user
            });
        } catch (error) {
            console.error('Error fetching chance from database:', error);
            await interaction.reply({ content: 'An error occurred while fetching the chance.', ephemeral: true });
        }
    },
};
