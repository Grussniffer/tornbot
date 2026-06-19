import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { Command } from '../types';
import { OcPlannerCommandService } from '../services/OcPlannerCommandService';

type BotCommandVisibility = 'private' | 'public';

const getVisibility = (interaction: ChatInputCommandInteraction): BotCommandVisibility =>
    interaction.options.getBoolean('public') ? 'public' : 'private';

const trimDiscordMessage = (content: string) =>
    content.length > 1900 ? `${content.slice(0, 1890)}...` : content;

const deferReply = (interaction: ChatInputCommandInteraction, visibility: BotCommandVisibility) =>
    visibility === 'public'
        ? interaction.deferReply()
        : interaction.deferReply({ flags: MessageFlags.Ephemeral });

async function sendBackendResult(
    interaction: ChatInputCommandInteraction,
    action: () => Promise<{ content?: string; error?: string }>
) {
    try {
        const payload = await action();
        await interaction.editReply(trimDiscordMessage(payload.content || payload.error || 'Done.'));
    } catch (error: any) {
        console.error(error);
        await interaction.editReply(error?.message || 'OC planner command failed.');
    }
}

export const ocNextFree: Command = {
    data: new SlashCommandBuilder()
        .setName('oc-next-free')
        .setDescription('Show OC members free now or soon')
        .setDMPermission(false)
        .addBooleanOption(option =>
            option
                .setName('public')
                .setDescription('Post the result in the channel')
                .setRequired(false)) as SlashCommandBuilder,

    execute: async (interaction: ChatInputCommandInteraction) => {
        const visibility = getVisibility(interaction);
        await deferReply(interaction, visibility);
        await sendBackendResult(interaction, () => OcPlannerCommandService.getNextFree(visibility));
    },
};
