import {
    ChannelType,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../types';
import { GiveawayPrize, GiveawayService } from '../services/GiveawayService';
import { BackendTornItemService } from '../services/BackendTornItemService';
import { GiveawayBackendRepository } from '../repository/GiveawayBackendRepository';

function parseDuration(input: string): number | null {
    const match = input.trim().toLowerCase().match(/^(\d+)\s*([mhdw])$/);
    if (!match) return null;
    const amount = Number(match[1]);
    const units: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
    const duration = amount * units[match[2]];
    return duration >= 60_000 && duration <= 2_592_000_000 ? duration : null;
}

export const giveaway: Command = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Run a Torn item or cash giveaway')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand => subcommand
            .setName('start')
            .setDescription('Start a giveaway')
            .addStringOption(option => option.setName('prize_type').setDescription('Type of Torn prize').setRequired(true)
                .addChoices({ name: 'Torn cash', value: 'cash' }, { name: 'Torn item', value: 'item' }))
            .addStringOption(option => option.setName('duration').setDescription('Examples: 30m, 12h, 3d, 1w').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('Cash amount or item quantity').setRequired(true).setMinValue(1))
            .addStringOption(option => option.setName('item').setDescription('Torn item (required for item giveaways)').setAutocomplete(true))
            .addIntegerOption(option => option.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20))
            .addChannelOption(option => option.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(subcommand => subcommand
            .setName('end')
            .setDescription('End a giveaway now')
            .addStringOption(option => option.setName('id').setDescription('Giveaway ID shown in the embed').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('reroll')
            .setDescription('Choose new winner(s) for an ended giveaway')
            .addStringOption(option => option.setName('id').setDescription('Giveaway ID shown in the embed').setRequired(true))) as SlashCommandBuilder,

    execute: async (interaction: ChatInputCommandInteraction) => {
        const action = interaction.options.getSubcommand();

        if (action === 'start') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const duration = parseDuration(interaction.options.getString('duration', true));
            if (!duration) {
                await interaction.editReply('Duration must look like `30m`, `12h`, `3d`, or `1w` (maximum 30 days).');
                return;
            }

            const prizeType = interaction.options.getString('prize_type', true);
            const amount = interaction.options.getInteger('amount', true);
            const itemName = interaction.options.getString('item')?.trim();
            if (prizeType === 'item' && !itemName) {
                await interaction.editReply('Choose a Torn item from the item field.');
                return;
            }
            if (prizeType === 'cash' && amount > 100_000_000_000_000) {
                await interaction.editReply('That cash amount is too large.');
                return;
            }

            const settings = await GiveawayBackendRepository.getSettings();
            if (!settings.enabled) {
                await interaction.editReply('Giveaways are disabled for this server in the admin settings.');
                return;
            }

            const selectedChannelId = interaction.options.getChannel('channel')?.id || interaction.channelId;
            const channel = await interaction.guild!.channels.fetch(selectedChannelId).catch(() => null);
            if (!channel?.isTextBased() || channel.isDMBased()) {
                await interaction.editReply('Please choose a server text channel.');
                return;
            }
            if (settings.allowedChannelIds.length && !settings.allowedChannelIds.includes(channel.id)) {
                await interaction.editReply(`Giveaways are not enabled in <#${channel.id}>. Choose a channel configured in the admin view.`);
                return;
            }
            if (settings.allowedHostRoleIds.length) {
                const member = await interaction.guild!.members.fetch(interaction.user.id);
                if (!settings.allowedHostRoleIds.some(roleId => member.roles.cache.has(roleId))) {
                    await interaction.editReply('You do not have one of the configured giveaway host roles.');
                    return;
                }
            }

            let prize: GiveawayPrize;
            if (prizeType === 'cash') {
                prize = { type: 'cash', amount };
            } else {
                const item = await BackendTornItemService.resolve(itemName!);
                if (!item) {
                    await interaction.editReply('That item was not found in Torn’s item catalog. Select one from autocomplete.');
                    return;
                }
                prize = { type: 'item', itemId: item.id, itemName: item.name, quantity: amount, marketValue: item.marketValue };
            }
            const created = await GiveawayService.create({
                channel,
                guildId: interaction.guildId!,
                hostId: interaction.user.id,
                hostTag: interaction.user.tag,
                prize,
                winnerCount: interaction.options.getInteger('winners') || 1,
                durationMs: duration,
            });
            await interaction.editReply(`Giveaway started in <#${channel.id}>. ID: \`${created.id}\``);
            return;
        }

        const id = interaction.options.getString('id', true);
        const existing = GiveawayService.get(id);
        if (!existing || existing.guildId !== interaction.guildId) {
            await interaction.reply({ content: 'Giveaway not found in this server.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (action === 'end') {
            if (existing.ended) {
                await interaction.reply({ content: 'That giveaway has already ended.', flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await GiveawayService.end(id);
            await interaction.editReply('Giveaway ended and winner(s) selected.');
            return;
        }

        if (!existing.ended) {
            await interaction.reply({ content: 'The giveaway must end before it can be rerolled.', flags: MessageFlags.Ephemeral });
            return;
        }
        const winners = await GiveawayService.reroll(id);
        await interaction.reply({
            content: winners?.length ? `New winner(s): ${winners.map(winner => `<@${winner}>`).join(', ')}` : 'There are no entries to reroll.',
            allowedMentions: { users: winners || [] },
        });
    },

    autocomplete: async interaction => {
        if (interaction.options.getFocused(true).name !== 'item') {
            await interaction.respond([]);
            return;
        }
        const query = String(interaction.options.getFocused());
        const items = await BackendTornItemService.search(query);
        await interaction.respond(items.map(item => ({
            name: `${item.name}${item.marketValue ? ` (~$${new Intl.NumberFormat('en-US').format(item.marketValue)})` : ''}`.slice(0, 100),
            value: String(item.id),
        })));
    },
};
