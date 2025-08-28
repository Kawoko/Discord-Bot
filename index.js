const { MongoClient, ServerApiVersion } = require('mongodb');
const { Client, GatewayIntentBits, EmbedBuilder, Collection, Events } = require('discord.js');
const { clientId, guildId } = require('./config.json');
const token = process.env.TOKEN;
const { send } = require('process');
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

//Init all commands and stuff
client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);

		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const channelIDs = [
    '1320430199489302598',
];

client.once('ready', async () => {
    console.log('Bot is ready!');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const { guild, member, channelId } = message;
    if (!guild || !member) return console.log('Guild or Member not found');

    if (!channelIDs.includes(channelId)) return;
    const channel = client.channels.cache.get(channelIDs);
    
    console.log(message.content);
});

client.on(Events.InteractionCreate, async interaction => {
	try {
		// --- Handle Slash Commands ---
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			await command.execute(interaction);
		}

		// --- Handle Modal Submissions ---
		if (interaction.isModalSubmit()) {
			// You can route this to the relevant command
			if (interaction.customId === 'staffHelpModal') {
				const staffCommand = interaction.client.commands.get('staff');
				if (staffCommand && staffCommand.handleModal) {
					await staffCommand.handleModal(interaction);
				}
			}
		}
	} catch (error) {
		console.error(error);

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: 'There was an error while executing this command!',
				ephemeral: true
			});
		} else {
			await interaction.reply({
				content: 'There was an error while executing this command!',
				ephemeral: true
			});
		}
	}
});


client.login(token);

process.on('SIGINT', async () => {
    console.log('Shutting down...');
    process.exit(0);
});
