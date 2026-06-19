import { TerritoryWar } from "../types";

export class TornApi {
    private static readonly BASE_URL = 'https://api.torn.com/torn/';

    static async getActiveTerritoryWars(key: string): Promise<Record<string, TerritoryWar> | null> {
        try {
            const cacheBuster = Date.now();
            const url = `${this.BASE_URL}?selections=territorywars&key=${key}&timestamp=${cacheBuster}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                console.error(`Torn API Error (${data.error.code}): ${data.error.error}`);
                return null;
            }

            return data.territorywars;
        } catch (error) {
            console.error('Error fetching territory wars:', error);
            return null;
        }
    }
}
