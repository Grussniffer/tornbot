import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { Command } from '../types';
import { SleepFlightService } from '../services/SleepFlightService';

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);

export const sleepFlight: Command = {
    data: new SlashCommandBuilder()
        .setName('sleep-flight')
        .setDescription('Suggest safe long-flight sleep destinations from war tracker data')
        .setDMPermission(false)
        .addBooleanOption(option =>
            option
                .setName('public')
                .setDescription('Post the result in the channel')
                .setRequired(false)) as SlashCommandBuilder,

    execute: async (interaction: ChatInputCommandInteraction) => {
        const postPublicly = interaction.options.getBoolean('public') || false;

        await interaction.deferReply(postPublicly ? {} : { flags: MessageFlags.Ephemeral });

        try {
            const result = await SleepFlightService.getSuggestions({
                discordUserId: interaction.user.id,
            });

            if (!result.suggestions.length) {
                await interaction.editReply(
                    'No long-flight suggestions yet. I could not find enough war tracker location data.'
                );
                return;
            }

            const header = [
                '**Sleep flight suggestions**',
                `Enemy faction: **${result.enemyFactionId}** (${result.enemyCount} members)`,
                result.alliedFactionId
                    ? `Allied faction: **${result.alliedFactionId}** (${result.allyCount} members)`
                    : 'Allied faction: not set',
                result.userBattleStats
                    ? `BSP baseline: **${formatNumber(result.userBattleStats)}**${result.userMemberName ? ` (${result.userMemberName})` : ''}`
                    : 'BSP baseline: not found for your Discord ID, so stronger-enemy risk is approximate',
                `Data source: ${result.source}${result.backendError ? ` (backend fallback: ${result.backendError})` : ''}`,
            ];

            const lines = result.suggestions.map((suggestion, index) => {
                const risk = suggestion.strongEnemies
                    ? `${suggestion.strongEnemies} stronger enemy`
                    : 'no stronger enemies';
                const avoid = suggestion.strongEnemyNames.length
                    ? ` Avoid: ${suggestion.strongEnemyNames.join(', ')}.`
                    : '';

                return `${index + 1}. **${suggestion.location}** - ${SleepFlightService.formatDuration(suggestion.times.airstrip)} airstrip, ${SleepFlightService.formatDuration(suggestion.times.economy)} standard, ${risk}, ${suggestion.allies} allies.${avoid}`;
            });

            await interaction.editReply([...header, '', ...lines].join('\n'));
        } catch (error: any) {
            console.error(error);
            await interaction.editReply(error.message || 'Failed to calculate sleep-flight suggestions.');
        }
    },
};
