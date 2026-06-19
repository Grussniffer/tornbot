import { supabase } from './supabase';

export type GiveawaySettings = {
    enabled: boolean;
    allowedChannelIds: string[];
    allowedHostRoleIds: string[];
};

export type StoredGiveaway = {
    id: string;
    guildId: string;
    channelId: string;
    messageId: string;
    hostId: string;
    prizeType: 'cash' | 'item';
    itemId?: number;
    itemName?: string;
    quantity: number;
    unitMarketValue?: number;
    winnerCount: number;
    endsAt: number;
    ended: boolean;
    winners: string[];
};

const warn = (operation: string, error: any) =>
    console.warn(`Giveaway database ${operation} failed; continuing with local storage:`, error?.message || error);

const settingsCache = new Map<string, { value: GiveawaySettings; expiresAt: number }>();

export const GiveawayRepository = {
    async getActive(): Promise<Array<StoredGiveaway & { entrants: string[] }>> {
        const { data, error } = await supabase
            .from('giveaways')
            .select('*, giveaway_entries(discord_user_id)')
            .eq('status', 'active');
        if (error) {
            warn('active giveaway lookup', error);
            return [];
        }
        return (data || []).map((row: any) => ({
            id: String(row.id),
            guildId: String(row.guild_id),
            channelId: String(row.channel_id),
            messageId: String(row.message_id),
            hostId: String(row.host_discord_id),
            prizeType: row.prize_type,
            itemId: row.item_id ? Number(row.item_id) : undefined,
            itemName: row.item_name || undefined,
            quantity: Number(row.quantity),
            unitMarketValue: row.unit_market_value ? Number(row.unit_market_value) : undefined,
            winnerCount: Number(row.winner_count),
            endsAt: new Date(row.ends_at).getTime(),
            ended: false,
            winners: [],
            entrants: (row.giveaway_entries || []).map((entry: any) => String(entry.discord_user_id)),
        }));
    },

    async getSettings(guildId: string): Promise<GiveawaySettings> {
        const cached = settingsCache.get(guildId);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        const { data, error } = await supabase.from('bot_settings').select('value').eq('key', `giveaways:${guildId}`).maybeSingle();
        if (error) {
            warn('settings lookup', error);
            return { enabled: true, allowedChannelIds: [], allowedHostRoleIds: [] };
        }
        const value: any = data?.value || {};
        const settings = {
            enabled: value.enabled !== false,
            allowedChannelIds: Array.isArray(value.allowedChannelIds) ? value.allowedChannelIds.map(String) : [],
            allowedHostRoleIds: Array.isArray(value.allowedHostRoleIds) ? value.allowedHostRoleIds.map(String) : [],
        };
        settingsCache.set(guildId, { value: settings, expiresAt: Date.now() + 60_000 });
        return settings;
    },

    async recordCreated(giveaway: StoredGiveaway, hostTag: string): Promise<void> {
        const { error: giveawayError } = await supabase.from('giveaways').upsert({
            id: giveaway.id, guild_id: giveaway.guildId, channel_id: giveaway.channelId,
            message_id: giveaway.messageId, host_discord_id: giveaway.hostId, host_tag: hostTag,
            prize_type: giveaway.prizeType, item_id: giveaway.itemId || null,
            item_name: giveaway.itemName || null, quantity: giveaway.quantity,
            unit_market_value: giveaway.unitMarketValue || null, winner_count: giveaway.winnerCount,
            ends_at: new Date(giveaway.endsAt).toISOString(), status: 'active', winners: [],
        });
        if (giveawayError) warn('giveaway insert', giveawayError);

        const { error: hostError } = await supabase.rpc('record_giveaway_host', {
            p_guild_id: giveaway.guildId,
            p_discord_id: giveaway.hostId,
            p_discord_tag: hostTag,
        });
        if (hostError) warn('host update', hostError);
    },

    async recordEntry(giveawayId: string, userId: string, userTag: string): Promise<void> {
        const { error } = await supabase.from('giveaway_entries').upsert(
            { giveaway_id: giveawayId, discord_user_id: userId, discord_tag: userTag },
            { onConflict: 'giveaway_id,discord_user_id', ignoreDuplicates: true },
        );
        if (error) warn('entry insert', error);
    },

    async recordEnded(giveawayId: string, winners: string[]): Promise<void> {
        const { error } = await supabase.from('giveaways').update({
            status: 'ended', ended_at: new Date().toISOString(), winners,
        }).eq('id', giveawayId);
        if (error) warn('end update', error);
    },
};
