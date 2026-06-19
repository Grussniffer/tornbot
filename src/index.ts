import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { ENV } from './config/environment';
import { commands } from './commands';
import { handleAutocomplete, handleSlashCommand } from './handlers/commandHandler';
import { handleMessage } from './handlers/messageHandler';
import { AlertService } from "./services/AlertService";
import { OcPlannerAlertService } from './services/OcPlannerAlertService';
import { GiveawayService } from './services/GiveawayService';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Register slash commands
async function deployCommands(readyClient: Client<true>) {
    try {
        const commandPayload = commands.map(command => command.data.toJSON());
        const guildIds = ENV.GUILD_ID
            ? [ENV.GUILD_ID]
            : readyClient.guilds.cache.map(guild => guild.id);
        const scope = guildIds.length
            ? `guild(s) ${guildIds.join(', ')}`
            : 'global';
        console.log(`Started refreshing ${scope} application (/) commands: ${commands.map(command => command.data.name).join(', ')}`);

        const rest = new REST().setToken(ENV.DISCORD_TOKEN);

        if (guildIds.length) {
            await rest.put(Routes.applicationCommands(ENV.CLIENT_ID), { body: [] });
            console.log('Cleared global application (/) commands.');

            for (const guildId of guildIds) {
                await rest.put(
                    Routes.applicationGuildCommands(ENV.CLIENT_ID, guildId),
                    { body: commandPayload },
                );
                console.log(`Reloaded guild ${guildId} application (/) commands.`);
            }

            console.log(`Successfully reloaded ${scope} application (/) commands.`);
            return;
        }

        await rest.put(Routes.applicationCommands(ENV.CLIENT_ID), { body: commandPayload });

        console.log(`Successfully reloaded ${scope} application (/) commands.`);
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
}

// Bot ready event
client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    await GiveawayService.initialize(client);
    await deployCommands(readyClient);

    await AlertService.checkAndSendAlerts(client);
    await OcPlannerAlertService.checkAndSendAlerts(client);
    setInterval(async () => {
        await AlertService.checkAndSendAlerts(client);
    }, ENV.ALERT_INTERVAL_MS)
    setInterval(async () => {
        await OcPlannerAlertService.checkAndSendAlerts(client);
    }, ENV.OC_ALERT_INTERVAL_MS)
});

// Handle interactions
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
    } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
    } else if (interaction.isButton()) {
        await GiveawayService.handleButton(interaction);
    }
});

// Handle messages
client.on(Events.MessageCreate, handleMessage);

// Login
client.login(ENV.DISCORD_TOKEN);
