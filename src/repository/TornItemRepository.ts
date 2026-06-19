import { supabase } from './supabase';

export type CachedTornItem = {
    id: number;
    name: string;
    type?: string;
    marketValue?: number;
    syncedAt: number;
};

export const TornItemRepository = {
    async getAll(): Promise<CachedTornItem[]> {
        const { data, error } = await supabase
            .from('torn_item_cache')
            .select('item_id,name,type,market_value,last_synced_at')
            .order('name');
        if (error) {
            console.warn('Torn item database cache lookup failed:', error.message);
            return [];
        }
        return (data || []).map((row: any) => ({
            id: Number(row.item_id),
            name: String(row.name),
            type: row.type || undefined,
            marketValue: row.market_value ? Number(row.market_value) : undefined,
            syncedAt: new Date(row.last_synced_at).getTime(),
        }));
    },

    async replace(items: Array<{ id: number; name: string; type?: string; marketValue?: number }>): Promise<void> {
        const syncedAt = new Date().toISOString();
        const rows = items.map(item => ({
            item_id: item.id,
            name: item.name,
            type: item.type || null,
            market_value: item.marketValue || null,
            last_synced_at: syncedAt,
        }));

        for (let offset = 0; offset < rows.length; offset += 500) {
            const { error } = await supabase
                .from('torn_item_cache')
                .upsert(rows.slice(offset, offset + 500), { onConflict: 'item_id' });
            if (error) {
                console.warn('Torn item database cache update failed:', error.message);
                return;
            }
        }
    },
};
