import fs from 'fs';
import path from 'path';
import { Client, TextChannel } from 'discord.js';
import { ENV } from '../config/environment';
import { Database } from '../repository/supabase';
import {
    OcBotAlertSettings,
    OcPlannerRun,
    OcPlannerSlotRecommendation,
    OcPlannerUnassignedMember,
    WarMember,
} from '../types';

type OcPlannerAlertPayload = {
    settings: OcBotAlertSettings;
    planner?: OcPlannerRun | null;
};

type SoonFreeRecommendation = {
    memberId: number;
    memberName: string;
    discordId?: string;
    cpr: number;
    available: 'now' | 'soon';
    currentCrimeName?: string;
    availableAt?: number;
    crimeId: number;
    crimeName: string;
    role: string;
    slotPosition?: string;
    plannedStartAt?: number;
    plannedEndAt?: number;
};

type OcAlertState = {
    needMoreFingerprint?: string;
    lastNeedMoreAlertAt?: string;
    sentSoonKeys: string[];
};

const defaultSettings: OcBotAlertSettings = {
    enabled: true,
    channelId: '',
    needMoreRoleId: '',
    soonFreeHours: 6,
    needMoreCooldownHours: 6,
};

export class OcPlannerAlertService {
    private static isChecking = false;
    private static stateFile = path.join(process.cwd(), 'oc-alert-state.json');
    private static state: OcAlertState = OcPlannerAlertService.loadState();

    static async checkAndSendAlerts(client: Client): Promise<void> {
        if (this.isChecking) {
            console.log('OC planner alert check already running, skipping overlap');
            return;
        }

        this.isChecking = true;
        try {
            const payload = await this.loadPlannerPayload();
            const settings = this.normalizeSettings(payload.settings);

            if (!settings.enabled) return;
            if (!payload.planner) {
                console.log('No OC planner run available for bot alerts');
                return;
            }

            const members = await Database.getData();
            const discordByMember = this.buildDiscordMap(members || []);
            const messages = [
                ...this.buildNeedMoreMessages(payload.planner, settings),
                ...this.buildSoonFreeMessages(payload.planner, settings, discordByMember),
            ];

            if (!messages.length) return;
            await this.sendMessages(client, settings.channelId || ENV.ALERT_CHANNEL_ID, messages);
            this.saveState();
        } catch (error) {
            console.error('Error in OC planner alert check:', error);
        } finally {
            this.isChecking = false;
        }
    }

    private static async loadPlannerPayload(): Promise<OcPlannerAlertPayload> {
        if (ENV.BACKEND_URL) {
            try {
                const baseUrl = ENV.BACKEND_URL.replace(/\/$/, '');
                const response = await fetch(`${baseUrl}/api/oc-planner/bot-alerts`, {
                    signal: AbortSignal.timeout(10000),
                });
                if (response.ok) {
                    const payload = await response.json() as OcPlannerAlertPayload;
                    return {
                        settings: payload.settings || defaultSettings,
                        planner: payload.planner || undefined,
                    };
                }
                console.error(`Backend OC planner alert endpoint returned ${response.status}`);
            } catch (error: any) {
                console.error(`Backend OC planner alert endpoint failed: ${error?.message || error}`);
            }
        }

        const [settings, planner] = await Promise.all([
            Database.getOcBotAlertSettings(),
            Database.getLatestOcPlannerRun(ENV.FACTION),
        ]);

        return {
            settings: settings || defaultSettings,
            planner,
        };
    }

    private static buildNeedMoreMessages(planner: OcPlannerRun, settings: OcBotAlertSettings): string[] {
        const unassigned = planner.unassignedMembers || [];
        const count = unassigned.length || Number(planner.summary?.unassignedMembers || 0);
        if (count <= 0) return [];

        const fingerprint = this.getNeedMoreFingerprint(unassigned, count);
        const cooldownMs = Math.max(1, settings.needMoreCooldownHours || 6) * 60 * 60 * 1000;
        const lastAlertAt = this.state.lastNeedMoreAlertAt
            ? Date.parse(this.state.lastNeedMoreAlertAt)
            : 0;
        const stillCoolingDown =
            this.state.needMoreFingerprint === fingerprint &&
            Date.now() - lastAlertAt < cooldownMs;
        if (stillCoolingDown) return [];

        this.state.needMoreFingerprint = fingerprint;
        this.state.lastNeedMoreAlertAt = new Date().toISOString();

        const roleMention = settings.needMoreRoleId ? `<@&${settings.needMoreRoleId}> ` : '';
        const names = unassigned
            .slice(0, 10)
            .map((member) => this.formatUnassignedMember(member))
            .join(', ');
        const suffix = unassigned.length > 10 ? `, +${unassigned.length - 10} more` : '';
        const detail = names ? ` Members: ${names}${suffix}.` : '';

        return [
            `${roleMention}OC planner needs more OC capacity: **${count}** member${count === 1 ? '' : 's'} do not have a recommended OC.${detail}`,
        ];
    }

    private static buildSoonFreeMessages(
        planner: OcPlannerRun,
        settings: OcBotAlertSettings,
        discordByMember: Map<number, string>
    ): string[] {
        const recommendations = this.getSoonFreeRecommendations(planner, settings, discordByMember);
        const newRecommendations = recommendations.filter((recommendation) => {
            const key = this.getSoonFreeKey(recommendation);
            if (this.state.sentSoonKeys.includes(key)) return false;
            this.state.sentSoonKeys.push(key);
            return true;
        });

        if (!newRecommendations.length) return [];
        this.state.sentSoonKeys = this.state.sentSoonKeys.slice(-500);

        return this.chunkLines(newRecommendations.map((recommendation) => {
            const mention = recommendation.discordId
                ? `<@${recommendation.discordId}>`
                : `**${recommendation.memberName}**`;
            const freeText = recommendation.availableAt
                ? `<t:${recommendation.availableAt}:R>`
                : 'now';
            const startText = recommendation.plannedStartAt
                ? ` Plan starts <t:${recommendation.plannedStartAt}:R>.`
                : '';
            const currentText = recommendation.currentCrimeName
                ? ` from **${recommendation.currentCrimeName}**`
                : '';
            const link = `https://www.torn.com/factions.php?step=your&type=12#/tab=crimes&crimeId=${recommendation.crimeId}`;
            const roleText = recommendation.slotPosition || recommendation.role;

            return `${mention} free${currentText} ${freeText}: join **${recommendation.crimeName}** as **${roleText}** (${Math.round(recommendation.cpr)}% CPR). ${link}${startText}`;
        }));
    }

    private static getSoonFreeRecommendations(
        planner: OcPlannerRun,
        settings: OcBotAlertSettings,
        discordByMember: Map<number, string>
    ): SoonFreeRecommendation[] {
        const now = Math.floor(Date.now() / 1000);
        const windowEnd = now + Math.max(1, settings.soonFreeHours || 6) * 60 * 60;
        const byMember = new Map<number, SoonFreeRecommendation>();

        for (const crime of planner.crimes || []) {
            for (const slot of crime.slots || []) {
                const candidate = this.getSlotRecommendedCandidate(slot);
                if (!candidate) continue;
                if (
                    candidate.available === 'soon' &&
                    candidate.availableAt &&
                    (candidate.availableAt < now - 10 * 60 || candidate.availableAt > windowEnd)
                ) continue;
                if (candidate.available === 'soon' && !candidate.availableAt) continue;

                const recommendation: SoonFreeRecommendation = {
                    memberId: candidate.memberId,
                    memberName: candidate.memberName,
                    discordId: discordByMember.get(candidate.memberId),
                    cpr: candidate.cpr,
                    available: candidate.available,
                    currentCrimeName: candidate.currentCrimeName,
                    availableAt: candidate.availableAt,
                    crimeId: slot.crimeId || crime.id,
                    crimeName: slot.crimeName || crime.name,
                    role: slot.role || slot.position,
                    slotPosition: slot.position,
                    plannedStartAt: slot.plannedStartAt,
                    plannedEndAt: slot.plannedEndAt,
                };

                const existing = byMember.get(recommendation.memberId);
                if (!existing || this.compareSoonRecommendation(recommendation, existing) < 0) {
                    byMember.set(recommendation.memberId, recommendation);
                }
            }
        }

        return [...byMember.values()]
            .sort((a, b) =>
                (a.available === 'now' ? 0 : 1) - (b.available === 'now' ? 0 : 1) ||
                (a.availableAt || 0) - (b.availableAt || 0) ||
                (a.plannedStartAt || 0) - (b.plannedStartAt || 0) ||
                a.memberName.localeCompare(b.memberName)
            );
    }

    private static getSlotRecommendedCandidate(slot: OcPlannerSlotRecommendation) {
        const recommended = slot.recommended;
        if (recommended?.available === 'now' || recommended?.available === 'soon') return recommended;
        const soonRecommended = slot.soonRecommended;
        if (soonRecommended?.available === 'soon') return soonRecommended;
        return undefined;
    }

    private static compareSoonRecommendation(a: SoonFreeRecommendation, b: SoonFreeRecommendation) {
        return (
            (a.available === 'now' ? 0 : 1) - (b.available === 'now' ? 0 : 1) ||
            (a.availableAt || 0) - (b.availableAt || 0) ||
            (a.plannedStartAt || 0) - (b.plannedStartAt || 0) ||
            b.cpr - a.cpr
        );
    }

    private static async sendMessages(client: Client, channelId: string, messages: string[]): Promise<void> {
        if (!channelId) throw new Error('No OC planner alert channel configured');
        const channel = await client.channels.fetch(channelId) as TextChannel | null;
        if (!channel?.send) throw new Error('OC planner alert channel not found');

        for (const message of messages) {
            await channel.send(message);
        }
        console.log(`Sent ${messages.length} OC planner alert message(s)`);
    }

    private static chunkLines(lines: string[]): string[] {
        const chunks: string[] = [];
        const header = '**OC planner recommendations**\n';
        let current = header;

        for (const line of lines) {
            const next = `${current}${current.endsWith('\n') ? '' : '\n'}${line}`;
            if (next.length > 1800 && current.trim()) {
                chunks.push(current.trim());
                current = `${header}${line}`;
            } else {
                current = next;
            }
        }

        if (current.trim() !== header.trim()) {
            chunks.push(current.trim());
        }

        return chunks;
    }

    private static buildDiscordMap(members: WarMember[]) {
        const result = new Map<number, string>();
        for (const member of members) {
            const discordId = String(member.discord_id || '').replace(/[<@!>]/g, '').trim();
            if (member.member_id && discordId) result.set(Number(member.member_id), discordId);
        }
        return result;
    }

    private static normalizeSettings(settings?: OcBotAlertSettings): OcBotAlertSettings {
        return {
            ...defaultSettings,
            ...(settings || {}),
            channelId: String(settings?.channelId || '').replace(/[<#>]/g, '').trim(),
            needMoreRoleId: String(settings?.needMoreRoleId || '').replace(/[<@&>]/g, '').trim(),
            soonFreeHours: Number(settings?.soonFreeHours || defaultSettings.soonFreeHours),
            needMoreCooldownHours: Number(settings?.needMoreCooldownHours || defaultSettings.needMoreCooldownHours),
        };
    }

    private static getNeedMoreFingerprint(unassigned: OcPlannerUnassignedMember[], count: number) {
        const ids = unassigned
            .map((member) => member.memberId)
            .filter(Boolean)
            .sort((a, b) => a - b);
        return ids.length ? ids.join(':') : `count:${count}`;
    }

    private static formatUnassignedMember(member: OcPlannerUnassignedMember) {
        const matchParts = [
            member.bestCprDifficulty ? `D${Math.round(member.bestCprDifficulty)}` : '',
            member.bestCprCrimeName,
            member.bestCprRoleName,
        ].filter(Boolean);
        const cpr = member.bestCpr && matchParts.length
            ? ` ${Math.round(member.bestCpr)}% in ${matchParts.join(' / ')}`
            : member.bestCpr
                ? ` ${Math.round(member.bestCpr)}% best CPR`
                : '';
        const availability = member.available === 'soon' && member.availableAt
            ? ` free <t:${member.availableAt}:R>`
            : '';
        return `${member.memberName}${cpr}${availability}`;
    }

    private static getSoonFreeKey(recommendation: SoonFreeRecommendation) {
        return [
            recommendation.memberId,
            recommendation.availableAt,
            recommendation.crimeId,
            recommendation.role,
            recommendation.slotPosition,
        ].join(':');
    }

    private static loadState(): OcAlertState {
        try {
            if (!fs.existsSync(this.stateFile)) return { sentSoonKeys: [] };
            const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
            return {
                needMoreFingerprint: parsed.needMoreFingerprint,
                lastNeedMoreAlertAt: parsed.lastNeedMoreAlertAt,
                sentSoonKeys: Array.isArray(parsed.sentSoonKeys) ? parsed.sentSoonKeys : [],
            };
        } catch (error: any) {
            console.error(`Failed to load OC alert state: ${error?.message || error}`);
            return { sentSoonKeys: [] };
        }
    }

    private static saveState(): void {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
        } catch (error: any) {
            console.error(`Failed to save OC alert state: ${error?.message || error}`);
        }
    }
}
