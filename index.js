require('dotenv').config({ path: './dotenv.env' });
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates] });

let gameState = {
	activePlayer: null,
	spectators: []
}

client.once('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

// Interaction event for buttons
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) {
		return;
	}

	if (interaction.customId === 'im_up') {
		const member = interaction.member;
		const voiceChannel = member.voice.channel;
		
		if (!voiceChannel) {
			await interaction.reply({ content: 'You need to be in a voice channel to join the activity!', ephemeral: true });
			return;
		}
		
		// Handle the "I'm up" button click
		if (gameState.activePlayer) {
			await interaction.reply({ content: `Game already in progress with ${gameState.activePlayer}.`, ephemeral: true });
		} 
		else {
			gameState.activePlayer = interaction.user.username;
			gameState.spectators = gameState.spectators.filter(user => user !== interaction.user.username);
			await interaction.reply(`${interaction.user.username} is up! Let the game begin!`);
		}
	}
});

// Command to initialize the game (e.g., /startgame)
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isCommand()) {
		return;
	}

	const { commandName } = interaction;

	if (commandName === 'startgame') {
		gameState.spectators = interaction.guild.members.cache.map(member => member.user.username);
		gameState.activePlayer = null;

		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('im_up')
					.setLabel("I'm up!")
					.setStyle(ButtonStyle.Primary)
			);

		await interaction.reply({ content: 'Game started! Spectators, press "I\'m up!" to start playing.', components: [row] });
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
	const user = newState.member.user.username;

	if (!oldState.channel && newState.channel) {
		if (!gameState.spectators.includes(user) && user !== gameState.activePlayer) {
			gameState.spectators.push(user);
		}
	}

	if (oldState.channel && !newState.channel) {
		gameState.spectators = gameState.spectators.filter(spectator => spectator !== user);
	}
});

client.login(process.env.BOT_TOKEN);