require('dotenv').config({ path: './dotenv.env' });
console.log('Bot Token:', process.env.BOT_TOKEN);
console.log('Client ID:', process.env.CLIENT_ID);

const { REST, Routes } = require('discord.js');

const commands = [
	{
		name: 'startgame',
		description: 'Start a new game and allow players to join',
	},
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
	try {
		console.log('Started refreshing application (/) commands.');

		await rest.put(
			Routes.applicationCommands(process.env.CLIENT_ID),
			{ body: commands },
		);

		console.log('Successfully reloaded application (/) commands.');
	} 
	catch (error) {
		console.error(error);
    }
})();