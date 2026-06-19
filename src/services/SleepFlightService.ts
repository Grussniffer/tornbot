import { ENV } from '../config/environment';
import { Database } from '../repository/supabase';
import { WarMember } from '../types';

type FlightTimes = {
    economy: number;
    airstrip: number;
    wltBenefit: number;
    business: number;
};

export type SleepFlightSuggestion = {
    location: string;
    times: FlightTimes;
    allies: number;
    strongEnemies: number;
    strongEnemyNames: string[];
};

type TrackerSnapshot = {
    factions: Record<string, WarMember[]>;
    source: 'backend' | 'supabase';
    backendError?: string;
};

type SuggestionInput = {
    discordUserId: string;
};

export type SleepFlightResult = {
    suggestions: SleepFlightSuggestion[];
    source: TrackerSnapshot['source'];
    backendError?: string;
    alliedFactionId?: string;
    enemyFactionId: string;
    userBattleStats?: number;
    userMemberName?: string;
    enemyCount: number;
    allyCount: number;
    availableFactionIds: string[];
};

const oneHour = 60 * 60 * 1000;

const flightData: Record<string, FlightTimes> = {
    Mexico: {
        economy: 1560000,
        airstrip: 1080000,
        wltBenefit: 780000,
        business: 480000,
    },
    'Cayman Islands': {
        economy: 2100000,
        airstrip: 1500000,
        wltBenefit: 1080000,
        business: 660000,
    },
    Canada: {
        economy: 2460000,
        airstrip: 1740000,
        wltBenefit: 1200000,
        business: 720000,
    },
    Hawaii: {
        economy: 8040000,
        airstrip: 5640000,
        wltBenefit: 4020000,
        business: 2400000,
    },
    'United Kingdom': {
        economy: 9540000,
        airstrip: 6660000,
        wltBenefit: 4800000,
        business: 2880000,
    },
    Argentina: {
        economy: 10020000,
        airstrip: 7020000,
        wltBenefit: 4980000,
        business: 3000000,
    },
    Switzerland: {
        economy: 10500000,
        airstrip: 7380000,
        wltBenefit: 5280000,
        business: 3180000,
    },
    Japan: {
        economy: 13500000,
        airstrip: 9480000,
        wltBenefit: 6780000,
        business: 4080000,
    },
    China: {
        economy: 14520000,
        airstrip: 10140000,
        wltBenefit: 7260000,
        business: 4320000,
    },
    UAE: {
        economy: 16260000,
        airstrip: 11400000,
        wltBenefit: 8100000,
        business: 4860000,
    },
    'South Africa': {
        economy: 17820000,
        airstrip: 12480000,
        wltBenefit: 8940000,
        business: 5340000,
    },
};

const flightLocations = Object.keys(flightData);

export class SleepFlightService {
    static async getSuggestions(input: SuggestionInput): Promise<SleepFlightResult> {
        const snapshot = await this.getTrackerSnapshot();
        const availableFactionIds = Object.keys(snapshot.factions).sort();
        const alliedFactionId = this.normalizeFactionId(ENV.FACTION);
        let enemyFactionId = this.resolveEnemyFactionId(
            snapshot.factions,
            alliedFactionId
        );

        if (!enemyFactionId && ENV.BACKEND_URL) {
            const enemyFaction = await this.fetchBackendSide(ENV.BACKEND_URL, 'enemy').catch((error: any) => {
                console.warn(`Sleep flight backend enemy lookup failed: ${error?.message || error}`);
                return undefined;
            });

            if (enemyFaction?.factionId && enemyFaction.members.length) {
                snapshot.factions[enemyFaction.factionId] = enemyFaction.members;
                enemyFactionId = enemyFaction.factionId;
            }
        }

        if (!alliedFactionId) {
            throw new Error('Missing FACTION in .env. Set FACTION to your friendly faction ID.');
        }

        if (!enemyFactionId) {
            throw new Error(
                `Could not infer enemy faction from war tracker data. Available factions: ${availableFactionIds.join(', ') || 'none'}.`
            );
        }

        const enemies = snapshot.factions[enemyFactionId] || [];
        const allies = snapshot.factions[alliedFactionId] || [];
        const userMember = allies.find(
            (member) => this.normalizeDiscordId(member.discord_id) === input.discordUserId
        );
        const userBattleStats = this.toOptionalNumber(userMember?.bsp);
        const suggestions = this.rankSuggestions(
            enemies,
            allies,
            userBattleStats
        );

        return {
            suggestions,
            source: snapshot.source,
            backendError: snapshot.backendError,
            alliedFactionId,
            enemyFactionId,
            userBattleStats,
            userMemberName: userMember?.member_name,
            enemyCount: enemies.length,
            allyCount: allies.length,
            availableFactionIds,
        };
    }

    static formatDuration(milliseconds: number) {
        const totalMinutes = Math.round(milliseconds / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (!hours) return `${minutes}m`;
        if (!minutes) return `${hours}h`;
        return `${hours}h ${minutes}m`;
    }

    private static rankSuggestions(
        enemies: WarMember[],
        allies: WarMember[],
        totalBattleStats?: number
    ): SleepFlightSuggestion[] {
        const suggestions = flightLocations
            .flatMap((location) => {
                const times = flightData[location];
                if (!times || times.airstrip < oneHour) return [];

                const alliesAtLocation = allies.filter((member) =>
                    this.isRelevantLocation(member, location)
                ).length;
                const strongerEnemies = enemies.filter(
                    (member) =>
                        this.isRelevantLocation(member, location) &&
                        this.isStrongerEnemy(member, totalBattleStats)
                );

                return [
                    {
                        location,
                        times,
                        allies: alliesAtLocation,
                        strongEnemies: strongerEnemies.length,
                        strongEnemyNames: strongerEnemies
                            .slice(0, 4)
                            .map((member) => member.member_name),
                    },
                ];
            })
            .sort((a, b) => {
                if (a.strongEnemies !== b.strongEnemies) {
                    return a.strongEnemies - b.strongEnemies;
                }
                if (a.allies !== b.allies) return a.allies - b.allies;
                return b.times.airstrip - a.times.airstrip;
            });

        const safe = suggestions.filter((suggestion) => suggestion.strongEnemies === 0);
        return (safe.length ? safe : suggestions).slice(0, 3);
    }

    private static async getTrackerSnapshot(): Promise<TrackerSnapshot> {
        if (ENV.BACKEND_URL) {
            try {
                return {
                    factions: await this.fetchBackendSnapshot(ENV.BACKEND_URL),
                    source: 'backend',
                };
            } catch (error: any) {
                const backendError = error?.message || 'Backend request failed';
                console.warn(`Sleep flight backend lookup failed: ${backendError}`);
                return {
                    factions: await this.fetchSupabaseSnapshot(),
                    source: 'supabase',
                    backendError,
                };
            }
        }

        return {
            factions: await this.fetchSupabaseSnapshot(),
            source: 'supabase',
        };
    }

    private static async fetchBackendSnapshot(backendUrl: string) {
        const baseUrl = backendUrl.replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/api/war-tracker`);

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const payload = await response.json() as {
            factions?: Record<string, WarMember[]>;
            factionId?: string;
            members?: WarMember[];
        };

        if (payload.factions) {
            const factions = this.normalizeFactions(payload.factions);
            if (Object.keys(factions).length) return factions;
        }
        if (payload.factionId && payload.members) {
            return this.normalizeFactions({ [payload.factionId]: payload.members });
        }

        throw new Error('Backend war tracker snapshot was empty');
    }

    private static async fetchBackendSide(backendUrl: string, side: 'allied' | 'enemy') {
        const baseUrl = backendUrl.replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/api/war-tracker?side=${side}`);

        if (!response.ok) {
            throw new Error(`Backend ${side} lookup returned ${response.status}`);
        }

        const payload = await response.json() as {
            factionId?: string;
            members?: WarMember[];
        };
        const factionId = this.normalizeFactionId(payload.factionId);

        if (!factionId || !payload.members?.length) return undefined;

        return {
            factionId,
            members: payload.members,
        };
    }

    private static async fetchSupabaseSnapshot() {
        const members = await Database.getData();
        return this.groupByFaction(members);
    }

    private static groupByFaction(members: WarMember[]) {
        return members.reduce<Record<string, WarMember[]>>((result, member) => {
            const factionId = this.normalizeFactionId(member.faction_id);
            if (!factionId) return result;
            result[factionId] ||= [];
            result[factionId].push(member);
            return result;
        }, {});
    }

    private static normalizeFactions(factions: Record<string, WarMember[]>) {
        return Object.entries(factions).reduce<Record<string, WarMember[]>>(
            (result, [factionId, members]) => {
                const normalizedFactionId = this.normalizeFactionId(factionId);
                if (!normalizedFactionId) return result;
                result[normalizedFactionId] = members || [];
                return result;
            },
            {}
        );
    }

    private static resolveEnemyFactionId(
        factions: Record<string, WarMember[]>,
        alliedFactionId?: string
    ) {
        const candidates = Object.keys(factions).filter(
            (factionId) => factionId !== alliedFactionId
        );

        if (candidates.length === 1) return candidates[0];
        if (candidates.length > 1) {
            return candidates.sort(
                (a, b) => (factions[b]?.length || 0) - (factions[a]?.length || 0)
            )[0];
        }
        return undefined;
    }

    private static isRelevantLocation(member: WarMember, location: string) {
        return this.memberTargetLocation(member) === location;
    }

    private static memberTargetLocation(member: WarMember) {
        return member.location?.destination || member.location?.current;
    }

    private static isStrongerEnemy(member: WarMember, totalBattleStats?: number) {
        if (!totalBattleStats || !member.bsp) return false;
        return Number(member.bsp) > totalBattleStats;
    }

    private static normalizeFactionId(factionId?: string | number) {
        return factionId ? String(factionId).trim() : '';
    }

    private static normalizeDiscordId(discordId?: string | number) {
        return discordId ? String(discordId).trim() : '';
    }

    private static toOptionalNumber(value: unknown): number | undefined {
        if (value === undefined || value === null || value === '') return undefined;
        const numberValue = Number(value);
        return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
    }
}
