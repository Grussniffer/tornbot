import { Client, TextChannel } from 'discord.js';
import { ENV } from '../config/environment';
import { Database } from '../repository/supabase';
import { ChaseService } from './ChaseService';
import { WarMember } from '../types';
import { BotControlService } from './BotControlService';

export class AlertService {
    private static isChecking = false;
    private static pendingAlertKeys = new Set<string>();
    private static sentAlertKeys = new Set<string>();

    static async checkAndSendAlerts(client: Client): Promise<void> {
        if (BotControlService.isPaused()) {
            console.log('Chase alerts paused by slash command, skipping alert check');
            return;
        }

        if (this.isChecking) {
            console.log('Alert check already running, skipping overlap');
            return;
        }

        this.isChecking = true;
        let alertKeysToRelease: string[] = [];

        try {
            const settings = await Database.getChaseBotAlertSettings();
            if (settings?.enabled === false) {
                console.log('Chase alerts disabled from admin settings, skipping alert check');
                return;
            }

            const data: WarMember[] | undefined = await Database.getData();

            if (!data) {
                console.log('No data received from database');
                return;
            }

            const allies = ChaseService.getAllies(data);
            const enemies = ChaseService.getEnemies(data);
            const dangers = ChaseService.getConflicts(allies, enemies);
            const pendingDangers = this.filterPendingDangers(dangers);

            if (pendingDangers.length === 0) {
                console.log('No dangers detected');
                return;
            }

            const alertKeys = this.getDangerAlertKeys(pendingDangers);
            alertKeysToRelease = alertKeys;
            const messages = this.formatAlertMessages(pendingDangers);
            await this.sendAlerts(client, messages, settings?.channelId || ENV.ALERT_CHANNEL_ID);
            alertKeys.forEach(key => this.sentAlertKeys.add(key));
            await this.markMembersAsAlerted(pendingDangers);

        } catch (error) {
            console.error('Error in checkAndSendAlerts:', error);
        } finally {
            alertKeysToRelease.forEach(key => this.pendingAlertKeys.delete(key));
            this.isChecking = false;
        }
    }

    private static filterPendingDangers(dangers: ReturnType<typeof ChaseService.getConflicts>) {
        return dangers
            .map(danger => ({
                ...danger,
                threatenedAllies: danger.threatenedAllies.filter(ally => {
                    const key = this.getAlertKey(danger.enemy, ally);
                    if (this.pendingAlertKeys.has(key) || this.sentAlertKeys.has(key)) return false;
                    this.pendingAlertKeys.add(key);
                    return true;
                })
            }))
            .filter(danger => danger.threatenedAllies.length > 0);
    }

    private static formatAlertMessages(dangers: ReturnType<typeof ChaseService.getConflicts>): string[] {
        return dangers.flatMap(danger => {
            return danger.threatenedAllies.map(ally => {
                const initiatedTimestamp = Math.floor((danger.enemy.location.initiated || Date.now()) / 1000);
                const enemyBsp = this.formatBsp(danger.enemy.bsp);
                const destination = danger.enemy.location.destination || ally.location.current || ally.location.destination;
                const allyMention = ally.discord_id
                    ? `<@${ally.discord_id}>`
                    : `[${ally.member_name}](https://www.torn.com/profiles.php?XID=${ally.member_id})`;

                return `${allyMention} is getting chased by [${danger.enemy.member_name}](https://www.torn.com/profiles.php?XID=${danger.enemy.member_id}) to **${destination}**. Enemy BSP: **${enemyBsp}**. Flight started: <t:${initiatedTimestamp}:T>`;
            });
        });
    }

    private static async sendAlerts(client: Client, messages: string[], channelId: string): Promise<void> {
        if (messages.length === 0) return;

        const channel = await client.channels.fetch(channelId) as TextChannel;

        if (!channel) {
            throw new Error('Alert channel not found');
        }

        for (const message of messages) {
            await channel.send(message);
        }

        console.log(`Sent ${messages.length} alert message(s)`);
    }

    private static async markMembersAsAlerted(dangers: ReturnType<typeof ChaseService.getConflicts>): Promise<void> {
        try {
            const updatePromises = dangers.flatMap(danger =>
                danger.threatenedAllies.map(member =>
                    Database.markMemberAsAlerted(member)
                )
            );

            await Promise.all(updatePromises);
            console.log('Marked members as alerted in database');
        } catch (error) {
            console.error('Error marking members as alerted:', error);
        }
    }

    private static getAlertKey(enemy: WarMember, ally: WarMember) {
        return [
            ally.faction_id,
            ally.member_id,
            enemy.member_id,
            enemy.location.destination || '',
            enemy.location.initiated || '',
        ].join(':');
    }

    private static getDangerAlertKeys(dangers: ReturnType<typeof ChaseService.getConflicts>) {
        return dangers.flatMap(danger =>
            danger.threatenedAllies.map(ally => this.getAlertKey(danger.enemy, ally))
        );
    }

    private static formatBsp(value?: number) {
        if (!value) return 'unknown';
        return new Intl.NumberFormat('en-US', {
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(value);
    }
}
