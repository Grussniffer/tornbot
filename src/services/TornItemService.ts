import { KeysRepository } from '../repository/KeysRepository';
import { TornItemRepository } from '../repository/TornItemRepository';

export type TornItem = {
    id: number;
    name: string;
    type?: string;
    marketValue?: number;
};

type CatalogCache = { items: TornItem[]; expiresAt: number };
let cache: CatalogCache | undefined;
const CACHE_TTL = 6 * 60 * 60 * 1000;

function normalize(raw: any, fallbackId?: string): TornItem | null {
    const id = Number(raw?.id ?? raw?.ID ?? fallbackId);
    const name = String(raw?.name ?? raw?.Name ?? '').trim();
    if (!Number.isInteger(id) || !name) return null;
    const marketValue = Number(raw?.market_value ?? raw?.marketValue ?? raw?.value?.market_price ?? 0);
    return {
        id,
        name,
        type: raw?.type ? String(raw.type) : undefined,
        marketValue: marketValue > 0 ? marketValue : undefined,
    };
}

export const TornItemService = {
    async getCatalog(): Promise<TornItem[]> {
        if (cache && cache.expiresAt > Date.now()) return cache.items;

        const databaseItems = await TornItemRepository.getAll();
        const newestSync = Math.max(0, ...databaseItems.map(item => item.syncedAt));
        const staleItems: TornItem[] = databaseItems.map(({ syncedAt: _syncedAt, ...item }) => item);
        if (staleItems.length && newestSync + CACHE_TTL > Date.now()) {
            cache = { items: staleItems, expiresAt: newestSync + CACHE_TTL };
            return staleItems;
        }

        const [key] = await KeysRepository.getKeys();
        if (!key) {
            if (staleItems.length) return staleItems;
            throw new Error('No Torn API key is configured for item lookup.');
        }

        try {
            const response = await fetch(`https://api.torn.com/v2/torn/items?key=${encodeURIComponent(key)}`);
            const payload: any = await response.json();
            if (!response.ok || payload?.error) {
                throw new Error(payload?.error?.error || `Torn item lookup failed (${response.status}).`);
            }

            const source = payload?.items ?? payload;
            const items = Array.isArray(source)
                ? source.map(item => normalize(item)).filter((item): item is TornItem => Boolean(item))
                : Object.entries(source || {}).map(([id, item]) => normalize(item, id)).filter((item): item is TornItem => Boolean(item));
            if (!items.length) throw new Error('Torn returned an empty item catalog.');
            items.sort((a, b) => a.name.localeCompare(b.name));
            cache = { items, expiresAt: Date.now() + CACHE_TTL };
            await TornItemRepository.replace(items);
            return items;
        } catch (error) {
            if (staleItems.length) {
                console.warn('Using stale Torn item cache after refresh failed:', error);
                cache = { items: staleItems, expiresAt: Date.now() + 5 * 60 * 1000 };
                return staleItems;
            }
            throw error;
        }
    },

    async search(query: string, limit = 25): Promise<TornItem[]> {
        const needle = query.trim().toLowerCase();
        const items = await this.getCatalog();
        return items
            .filter(item => !needle || item.name.toLowerCase().includes(needle) || String(item.id) === needle)
            .sort((a, b) => {
                const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
                const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
                return aStarts - bStarts || a.name.localeCompare(b.name);
            })
            .slice(0, limit);
    },

    async resolve(input: string): Promise<TornItem | undefined> {
        const needle = input.trim().toLowerCase();
        const items = await this.getCatalog();
        return items.find(item => String(item.id) === needle || item.name.toLowerCase() === needle);
    },
};
