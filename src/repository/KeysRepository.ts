import { Database } from './supabase';

export class KeysRepository {
    private static cache: { keys: string[], timestamp: number } | null = null;
    private static readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes

    static async getKeys(): Promise<string[]> {
        const now = Date.now();

        if (this.cache && (now - this.cache.timestamp < this.CACHE_TTL)) {
            return this.cache.keys;
        }

        console.log('Fetching API keys from DB');
        const keys = await Database.getApiKeys();

        if (keys.length === 0) {
            console.warn('No API keys found in database!');
        }

        this.cache = {
            keys,
            timestamp: now
        };

        return keys;
    }
}
