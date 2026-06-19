import { Client, TextChannel } from 'discord.js';
import { KeysRepository } from '../repository/KeysRepository';
import { TerritoryRepository } from '../repository/TerritoryRepository';
import { TornApi } from '../utils/tornApi';
import { TerritoryWar, TerritoryWatch } from '../types';
import { Database } from '../repository/supabase';


export class TerritoryWarService {
    private static isRunning = false;
    private static currentKeyIndex = 0;

    static async start(client: Client) {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('Starting Territory War Service...');

        // Run immediately then interval
        await this.checkWars(client);

        setInterval(async () => {
            await this.checkWars(client);
        }, 1000); // Check every second as requested
    }

    private static async checkWars(client: Client) {
        try {
            const watches = await TerritoryRepository.getWatches();
            if (watches.length === 0) return;

            const keys = await KeysRepository.getKeys();
            if (keys.length === 0) {
                console.warn('No API keys available for territory watch.');
                return;
            }

            // Rotate keys
            const key = keys[this.currentKeyIndex % keys.length];
            this.currentKeyIndex++;

            const activeWars = await TornApi.getActiveTerritoryWars(key);
            if (!activeWars) return; // API error or failure

            // Group watches by territory to avoid duplicate API checks (already handled by fetch activeWars once)
            // But we need to group for alerting multiple users
            const watchesByTerritory = new Map<string, typeof watches>();
            for (const watch of watches) {
                const list = watchesByTerritory.get(watch.territory_id) || [];
                list.push(watch);
                watchesByTerritory.set(watch.territory_id, list);
            }

            // Check each watched territory
            for (const [territoryId, territoryWatches] of watchesByTerritory) {
                // Territory ID is the KEY in activeWars object, not a property
                const war = activeWars[territoryId];
                const currentState = await Database.getWarState(territoryId);

                const getFactionLink = (id: number) => `[${id}](https://www.torn.com/factions.php?step=profile&ID=${id})`;
                const getTerritoryLink = (id: string) => `[${id}](https://www.torn.com/city.php#terrName=${id})`;

                // CASE 1: War Started
                if (war && (!currentState || !currentState.is_at_war)) {
                    const message = `⚔️ **Territory War Started!**\nTerritory: ${getTerritoryLink(territoryId)}\nAssaulting: ${getFactionLink(war.assaulting_faction)}\nDefending: ${getFactionLink(war.defending_faction)}\nStarted: <t:${war.started}:R>`;
                    await this.notifyUsers(client, territoryWatches, message);

                    await Database.updateWarState(territoryId, {
                        is_at_war: true,
                        assaulting_faction: war.assaulting_faction,
                        defending_faction: war.defending_faction,
                        start_time: war.started
                    });
                }
                // CASE 2: War Ended
                else if (!war && currentState && currentState.is_at_war) {
                    const message = `🏁 **Territory War Ended!**\nTerritory: ${getTerritoryLink(territoryId)}\nWar has concluded.`;
                    await this.notifyUsers(client, territoryWatches, message);

                    await Database.updateWarState(territoryId, {
                        is_at_war: false
                    });
                }
                // CASE 3: Status changed? (Unlikely for territory wars effectively, but good to check if factions change?)
                // Simplified for now: just checks presence in active wars list.
            }

        } catch (error) {
            console.error('Error in TerritoryWarService:', error);
        }
    }

    private static async notifyUsers(client: Client, watches: TerritoryWatch[], message: string) {
        // Group by channel to avoid spamming same channel? 
        // User request: "tag the user... if 2 users are watching... tag both users"
        // If they are in the same channel, we can combine. If different channels, send separate.

        const watchesByChannel = new Map<string, string[]>();
        for (const watch of watches) {
            const users = watchesByChannel.get(watch.channel_id) || [];
            users.push(watch.user_id);
            watchesByChannel.set(watch.channel_id, users);
        }

        for (const [channelId, userIds] of watchesByChannel) {
            try {
                const channel = await client.channels.fetch(channelId) as TextChannel;
                if (!channel) continue;

                const mentions = userIds.map(uid => `<@${uid}>`).join(' ');
                await channel.send(`${mentions}\n${message}`);
            } catch (error) {
                console.error(`Failed to send alert to channel ${channelId}:`, error);
            }
        }
    }
}
