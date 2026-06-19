import { Database } from './supabase';
import { TerritoryWatch } from '../types';

export class TerritoryRepository {
    private static cache: { watches: TerritoryWatch[], timestamp: number } | null = null;
    private static readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes

    static async getWatches(): Promise<TerritoryWatch[]> {
        const now = Date.now();

        if (this.cache && (now - this.cache.timestamp < this.CACHE_TTL)) {
            return this.cache.watches;
        }

        console.log('Fetching territory watches from DB');
        const watches = await Database.getTerritoryWatches();
        this.cache = {
            watches,
            timestamp: now
        };

        return watches;
    }

    static async addWatch(userId: string, territoryId: string, channelId: string): Promise<void> {
        await Database.addTerritoryWatch(userId, territoryId, channelId);
        // Invalidate cache to force refresh on next fetch
        this.cache = null;
    }

    static async removeWatch(userId: string, territoryId: string): Promise<void> {
        await Database.removeTerritoryWatch(userId, territoryId);
        // Invalidate cache
        this.cache = null;
    }
}
