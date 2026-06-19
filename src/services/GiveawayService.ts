import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    Client,
    EmbedBuilder,
    GuildTextBasedChannel,
} from 'discord.js';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { GiveawayBackendRepository } from '../repository/GiveawayBackendRepository';

export type GiveawayPrize =
    | { type: 'cash'; amount: number }
    | { type: 'item'; itemId: number; itemName: string; quantity: number; marketValue?: number };

type Giveaway = {
    id: string;
    guildId: string;
    channelId: string;
    messageId: string;
    hostId: string;
    prize: GiveawayPrize;
    winnerCount: number;
    endsAt: number;
    entrants: string[];
    ended: boolean;
    winners: string[];
};

const STORE_PATH = join(process.cwd(), 'data', 'giveaways.json');
const timers = new Map<string, NodeJS.Timeout>();
let giveaways = new Map<string, Giveaway>();
let discordClient: Client | undefined;

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);

function prizeText(prize: GiveawayPrize): string {
    return prize.type === 'cash'
        ? `$${formatNumber(prize.amount)} Torn cash`
        : `${formatNumber(prize.quantity)}x ${prize.itemName}`;
}

function giveawayEmbed(giveaway: Giveaway): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(giveaway.ended ? 0x747f8d : 0xf1c40f)
        .setTitle(giveaway.ended ? 'Giveaway ended' : 'Torn giveaway')
        .setDescription(`**Prize per winner:** ${prizeText(giveaway.prize)}`)
        .addFields(
            { name: 'Winners', value: String(giveaway.winnerCount), inline: true },
            { name: 'Entries', value: String(giveaway.entrants.length), inline: true },
            { name: 'Hosted by', value: `<@${giveaway.hostId}>`, inline: true },
        )
        .setFooter({ text: `Giveaway ID: ${giveaway.id}` });

    if (giveaway.prize.type === 'item' && giveaway.prize.marketValue) {
        embed.addFields({
            name: 'Estimated market value',
            value: `$${formatNumber(giveaway.prize.marketValue * giveaway.prize.quantity)} per winner`,
        });
    }

    if (giveaway.ended) {
        embed.addFields({
            name: 'Selected winner(s)',
            value: giveaway.winners.length
                ? giveaway.winners.map(id => `<@${id}>`).join(', ')
                : 'No valid entries',
        });
    } else {
        embed.addFields({ name: 'Ends', value: `<t:${Math.floor(giveaway.endsAt / 1000)}:R>` });
    }

    return embed;
}

function entryRow(giveaway: Giveaway): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveaway:enter:${giveaway.id}`)
            .setLabel(giveaway.ended ? 'Giveaway ended' : 'Enter giveaway')
            .setEmoji('🎉')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(giveaway.ended),
    );
}

async function save(): Promise<void> {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify([...giveaways.values()], null, 2), 'utf8');
}

function chooseWinners(entrants: string[], count: number): string[] {
    const pool = [...entrants];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
}

async function getChannel(giveaway: Giveaway): Promise<GuildTextBasedChannel | null> {
    if (!discordClient) return null;
    const channel = await discordClient.channels.fetch(giveaway.channelId).catch(() => null);
    return channel?.isTextBased() && !channel.isDMBased() ? channel : null;
}

async function updateMessage(giveaway: Giveaway): Promise<void> {
    const channel = await getChannel(giveaway);
    if (!channel) return;
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    await message?.edit({ embeds: [giveawayEmbed(giveaway)], components: [entryRow(giveaway)] });
}

function schedule(giveaway: Giveaway): void {
    const previous = timers.get(giveaway.id);
    if (previous) clearTimeout(previous);
    if (giveaway.ended) return;

    const remaining = giveaway.endsAt - Date.now();
    if (remaining <= 0) {
        void GiveawayService.end(giveaway.id);
        return;
    }

    const delay = Math.min(remaining, 2_147_000_000);
    timers.set(giveaway.id, setTimeout(() => {
        if (giveaway.endsAt > Date.now()) schedule(giveaway);
        else void GiveawayService.end(giveaway.id);
    }, delay));
}

export const GiveawayService = {
    async initialize(client: Client): Promise<void> {
        discordClient = client;
        try {
            const stored = JSON.parse(await readFile(STORE_PATH, 'utf8')) as Giveaway[];
            giveaways = new Map(stored.map(giveaway => [giveaway.id, giveaway]));
        } catch (error: any) {
            if (error?.code !== 'ENOENT') console.error('Failed to load giveaways:', error);
        }
        const databaseGiveaways = await GiveawayBackendRepository.getActive();
        for (const stored of databaseGiveaways) {
            giveaways.set(stored.id, {
                id: stored.id,
                guildId: stored.guildId,
                channelId: stored.channelId,
                messageId: stored.messageId,
                hostId: stored.hostId,
                prize: stored.prizeType === 'cash'
                    ? { type: 'cash', amount: stored.quantity }
                    : {
                        type: 'item',
                        itemId: stored.itemId!,
                        itemName: stored.itemName!,
                        quantity: stored.quantity,
                        marketValue: stored.unitMarketValue,
                    },
                winnerCount: stored.winnerCount,
                endsAt: stored.endsAt,
                entrants: stored.entrants,
                ended: false,
                winners: [],
            });
        }
        await save();
        for (const giveaway of giveaways.values()) schedule(giveaway);
    },

    async create(options: {
        channel: GuildTextBasedChannel;
        guildId: string;
        hostId: string;
        hostTag: string;
        prize: GiveawayPrize;
        winnerCount: number;
        durationMs: number;
    }): Promise<Giveaway> {
        const giveaway: Giveaway = {
            id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            guildId: options.guildId,
            channelId: options.channel.id,
            messageId: '',
            hostId: options.hostId,
            prize: options.prize,
            winnerCount: options.winnerCount,
            endsAt: Date.now() + options.durationMs,
            entrants: [],
            ended: false,
            winners: [],
        };

        const message = await options.channel.send({
            embeds: [giveawayEmbed(giveaway)],
            components: [entryRow(giveaway)],
        });
        giveaway.messageId = message.id;
        giveaways.set(giveaway.id, giveaway);
        await save();
        await GiveawayBackendRepository.create({
            id: giveaway.id,
            guildId: giveaway.guildId,
            channelId: giveaway.channelId,
            messageId: giveaway.messageId,
            hostId: giveaway.hostId,
            prizeType: giveaway.prize.type,
            itemId: giveaway.prize.type === 'item' ? giveaway.prize.itemId : undefined,
            itemName: giveaway.prize.type === 'item' ? giveaway.prize.itemName : undefined,
            quantity: giveaway.prize.type === 'cash' ? giveaway.prize.amount : giveaway.prize.quantity,
            unitMarketValue: giveaway.prize.type === 'item' ? giveaway.prize.marketValue : undefined,
            winnerCount: giveaway.winnerCount,
            endsAt: giveaway.endsAt,
            ended: false,
            winners: [],
        }, options.hostTag);
        schedule(giveaway);
        return giveaway;
    },

    async handleButton(interaction: ButtonInteraction): Promise<boolean> {
        if (!interaction.customId.startsWith('giveaway:enter:')) return false;
        const id = interaction.customId.slice('giveaway:enter:'.length);
        const giveaway = giveaways.get(id);

        if (!giveaway || giveaway.ended || giveaway.endsAt <= Date.now()) {
            await interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
            if (giveaway && !giveaway.ended) await this.end(id);
            return true;
        }
        if (interaction.user.bot) {
            await interaction.reply({ content: 'Bots cannot enter giveaways.', ephemeral: true });
            return true;
        }
        if (giveaway.entrants.includes(interaction.user.id)) {
            await interaction.reply({ content: 'You are already entered.', ephemeral: true });
            return true;
        }

        giveaway.entrants.push(interaction.user.id);
        await save();
        await GiveawayBackendRepository.enter(giveaway.id, interaction.user.id, interaction.user.tag);
        await interaction.reply({ content: `You entered the giveaway for **${prizeText(giveaway.prize)}**.`, ephemeral: true });
        await updateMessage(giveaway);
        return true;
    },

    async end(id: string): Promise<Giveaway | null> {
        const giveaway = giveaways.get(id);
        if (!giveaway || giveaway.ended) return giveaway || null;

        giveaway.ended = true;
        giveaway.winners = await GiveawayBackendRepository.finish(giveaway.id, 'end');
        const timer = timers.get(id);
        if (timer) clearTimeout(timer);
        timers.delete(id);
        await save();
        await updateMessage(giveaway);

        const channel = await getChannel(giveaway);
        if (channel) {
            const result = giveaway.winners.length
                ? `🎉 ${giveaway.winners.map(winner => `<@${winner}>`).join(', ')} won **${prizeText(giveaway.prize)}**!`
                : `The giveaway for **${prizeText(giveaway.prize)}** ended without any entries.`;
            await channel.send({ content: result, allowedMentions: { users: giveaway.winners } });
        }
        return giveaway;
    },

    async reroll(id: string): Promise<string[] | null> {
        const giveaway = giveaways.get(id);
        if (!giveaway || !giveaway.ended) return null;
        giveaway.winners = await GiveawayBackendRepository.finish(giveaway.id, 'reroll');
        await save();
        await updateMessage(giveaway);
        return giveaway.winners;
    },

    get(id: string): Giveaway | undefined {
        return giveaways.get(id);
    },
};
