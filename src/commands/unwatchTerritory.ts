import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types';
import { TerritoryRepository } from '../repository/TerritoryRepository';

export const unwatchTerritory: Command = {
    data: new SlashCommandBuilder()
        .setName('unwatch-territory')
        .setDescription('Stop watching a specific territory')
        .addStringOption(option =>
            option.setName('territory_id')
                .setDescription('The ID of the territory to stop watching')
                .setRequired(true)) as SlashCommandBuilder,
    execute: async (interaction: ChatInputCommandInteraction) => {
        const territoryId = interaction.options.getString('territory_id', true).toUpperCase();
        const userId = interaction.user.id;

        await interaction.deferReply();

        try {
            await TerritoryRepository.removeWatch(userId, territoryId);
            await interaction.editReply(`✅ You are no longer listening for alerts on territory **${territoryId}**.`);
        } catch (error: any) {
            console.error(error);
            await interaction.editReply(`❌ Failed to remove watch: ${error.message || 'Unknown error'}`);
        }
    }
};
