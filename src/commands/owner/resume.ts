import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../../types';
import { BotControlService } from '../../services/BotControlService';

export const resume: Command = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resumes chase alerts (Owner only)'),

    ownerOnly: true,

    async execute(interaction: ChatInputCommandInteraction) {
        BotControlService.resume(interaction.user.id);

        await interaction.reply({
            content: 'Chase alerts resumed.',
            ephemeral: true,
        });
    }
};
