const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { guildId } = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chance')
        .setDescription('Change the chance of winning.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addNumberOption(option =>
            option.setName('chance')
                .setDescription('New chance in 1/1000 or 1/10000 format. Example: 1000 means 1/1000.')
                .setRequired(true)
        ),
    async execute(interaction) {

        if (interaction.guild.id !== guildId) {
            return interaction.reply({
                content: 'This command can only be used in the designated guild.',
                ephemeral: true
            });
        }

        const newChance = interaction.options.getNumber('chance'); // Get the new chance from the command input

        if (newChance <= 0) {
            return interaction.reply({ content: 'The chance must be greater than 0.', ephemeral: true });
        }

        try {
            // Access the MongoDB database and the roleChances collection
            const database = interaction.client.mongoDBClient.db('discord');
            const roleChancesCollection = database.collection('roleChances');

            // Update the chance in the database for the specific role
            const result = await roleChancesCollection.updateOne(
                { roleId: '1316390100514635776' }, // Find the document with the specific roleId
                { $set: { chance: newChance } }, // Set the new chance value
                { upsert: true } // Create the document if it doesn't exist
            );

            if (result.modifiedCount === 0 && result.upsertedCount === 0) {
                return interaction.reply({ content: 'No changes were made to the database.', ephemeral: true });
            }

            // Reload roles to win with the latest chances
            await interaction.client.loadRolesToWin();  // Call loadRolesToWin() from the client object

            // Reply to the user with the updated chance
            await interaction.reply(`The chance of winning has been updated to 1/${newChance}.`);
        } catch (error) {
            console.error('Error updating chance in database:', error);
            await interaction.reply({ content: 'An error occurred while updating the chance.', ephemeral: true });
        }
    },
};
