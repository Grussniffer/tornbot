import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../../types';
import { BotControlService } from '../../services/BotControlService';

export const pause: Command = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pauses chase alerts without shutting down the bot (Owner only)'),

    ownerOnly: true,

    async execute(interaction: ChatInputCommandInteraction) {
        BotControlService.pause(interaction.user.id);

        await interaction.reply({
            content: 'Chase alerts paused. OC planner alerts will keep running.',
            ephemeral: true,
        });
    }
};
