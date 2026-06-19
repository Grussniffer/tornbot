import { ENV } from '../config/environment';

export type GiveawaySettings = { enabled: boolean; discordGuildId: string; allowedChannelIds: string[]; allowedHostRoleIds: string[]; itemCacheHours: number };
export type StoredGiveaway = { id: string; guildId: string; channelId: string; messageId: string; hostId: string; prizeType: 'cash' | 'item'; itemId?: number; itemName?: string; quantity: number; unitMarketValue?: number; winnerCount: number; endsAt: number; ended: boolean; winners: string[]; entrants?: string[] };
const base = () => `${String(ENV.BACKEND_URL || '').replace(/\/$/, '')}/api/v1/bot/factions/${encodeURIComponent(ENV.FACTION)}/giveaways`;
async function request<T>(path = '', init: RequestInit = {}): Promise<T> {
    if (!ENV.BACKEND_URL || !ENV.GIVEAWAY_BOT_TOKEN) throw new Error('BACKEND_URL and GIVEAWAY_BOT_TOKEN are required for giveaways.');
    const response = await fetch(`${base()}${path}`, { ...init, headers: { authorization: `Bearer ${ENV.GIVEAWAY_BOT_TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) } });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Giveaway backend failed (${response.status}).`);
    return payload as T;
}
export const GiveawayBackendRepository = {
    async getSettings(): Promise<GiveawaySettings> { return (await request<{ settings: GiveawaySettings }>('/settings')).settings; },
    async getActive(): Promise<Array<StoredGiveaway & { entrants: string[] }>> {
        const result = await request<{ giveaways: any[] }>('/active');
        return result.giveaways.map(row => ({ ...row, messageId: row.messageId || '', ended: row.status !== 'active', entrants: row.entrants || [] }));
    },
    async create(g: StoredGiveaway, hostTag: string): Promise<void> {
        await request('', { method: 'POST', body: JSON.stringify({ id: g.id, guildId: g.guildId, channelId: g.channelId, messageId: g.messageId, hostId: g.hostId, hostTag, prizeType: g.prizeType, itemId: g.itemId, itemName: g.itemName, quantity: g.quantity, unitMarketValue: g.unitMarketValue, winnerCount: g.winnerCount, endsAt: g.endsAt }) });
    },
    async enter(id: string, userId: string, userTag: string): Promise<void> { await request(`/${encodeURIComponent(id)}/entries`, { method: 'POST', body: JSON.stringify({ userId, userTag }) }); },
    async finish(id: string, action: 'end' | 'reroll'): Promise<string[]> {
        const result = await request<{ giveaway: { winners?: string[] } }>(`/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
        return result.giveaway.winners || [];
    },
};
