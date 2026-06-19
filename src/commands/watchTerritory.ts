import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types';
import { TerritoryRepository } from '../repository/TerritoryRepository';

export const watchTerritory: Command = {
    data: new SlashCommandBuilder()
        .setName('watch-territory')
        .setDescription('Watch a specific territory for wars')
        .addStringOption(option =>
            option.setName('territory_id')
                .setDescription('The ID of the territory to watch')
                .setRequired(true)) as SlashCommandBuilder,
    execute: async (interaction: ChatInputCommandInteraction) => {
        const territoryId = interaction.options.getString('territory_id', true).toUpperCase();
        const userId = interaction.user.id;
        const channelId = interaction.channelId;

        await interaction.deferReply();

        try {
            await TerritoryRepository.addWatch(userId, territoryId, channelId);
            await interaction.editReply(`✅ You are now watching territory **${territoryId}**. You will be alerted in this channel when its war status changes.`);
        } catch (error: any) {
            console.error(error);
            await interaction.editReply(`❌ Failed to add watch: ${error.message || 'Unknown error'}`);
        }
    }
};
