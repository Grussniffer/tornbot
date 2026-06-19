import { ENV } from '../config/environment';
export type TornItem = { id: number; name: string; type?: string; marketValue?: number };
const cache = new Map<string, { expiresAt: number; items: TornItem[] }>();
async function search(query: string): Promise<TornItem[]> {
    const key = query.trim().toLowerCase(), cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.items;
    if (!ENV.BACKEND_URL || !ENV.GIVEAWAY_BOT_TOKEN) throw new Error('Giveaway backend is not configured.');
    const url = `${ENV.BACKEND_URL.replace(/\/$/, '')}/api/v1/bot/factions/${encodeURIComponent(ENV.FACTION)}/giveaways/items?search=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { authorization: `Bearer ${ENV.GIVEAWAY_BOT_TOKEN}` } });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Item lookup failed (${response.status}).`);
    const items = Array.isArray(payload.items) ? payload.items : [];
    cache.set(key, { items, expiresAt: Date.now() + 5 * 60_000 });
    return items;
}
export const BackendTornItemService = {
    search,
    async resolve(input: string) { const needle = input.trim().toLowerCase(); return (await search(input)).find(item => String(item.id) === needle || item.name.toLowerCase() === needle); },
};
