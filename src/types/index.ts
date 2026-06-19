import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export interface Command {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
    ownerOnly?: boolean;
}

export interface Location {
    current: string;
    destination?: string;
    initiated?: number;
    alerted?: boolean
}

export interface Stats {
    str: string;
    def: string;
    spd: string;
    dex: string;
}

export interface WarMember {
    id?: number;
    member_id: number;
    member_name: string;
    faction_id: string;
    stats?: Stats;
    destination?: string;
    location: Location;
    level: number;
    bsp?: number;
    strength?: number;
    defence?: number;
    dexterity?: number;
    speed?: number;
    discord_id?: string
    alerted: boolean
}

export enum Locations {
    torn = "Torn",
    china = "China",
    japan = "Japan",
    hawaii = "Hawaii",
    mexico = "Mexico",
    canada = "Canada",
    cayman_islands = "Cayman Islands",
    argentina = "Argentina",
    england = "United Kingdom",
    switzerland = "Switzerland",
    dubai = "UAE",
    south_africa = "South Africa",
}

export type Chased = {
    enemy: WarMember
    threatenedAllies: WarMember[]
}

export type OcBotAlertSettings = {
    enabled: boolean;
    channelId?: string;
    needMoreRoleId?: string;
    soonFreeHours: number;
    needMoreCooldownHours: number;
    updatedAt?: string;
    updatedBy?: string;
    persisted?: boolean;
}

export type ChaseBotAlertSettings = {
    enabled: boolean;
    channelId?: string;
    updatedAt?: string;
    updatedBy?: string;
    persisted?: boolean;
}

export type OcPlannerSlotCandidate = {
    memberId: number;
    memberName: string;
    cpr: number;
    available: 'now' | 'soon';
    currentCrimeId?: number;
    currentCrimeName?: string;
    availableAt?: number;
    plannedElsewhere?: boolean;
    plannedCrimeId?: number;
    plannedCrimeName?: string;
    plannedRole?: string;
}

export type OcPlannerSlotRecommendation = {
    crimeId: number;
    crimeName: string;
    position: string;
    role: string;
    status: string;
    recommended?: OcPlannerSlotCandidate;
    soonRecommended?: OcPlannerSlotCandidate;
    plannedStartAt?: number;
    plannedEndAt?: number;
    planningState: 'filled' | 'next' | 'queued' | 'open';
}

export type OcPlannerCrime = {
    id: number;
    name: string;
    status: string;
    difficulty?: number;
    openSlots: number;
    totalSlots: number;
    recommendedSuccessChance?: number;
    slots: OcPlannerSlotRecommendation[];
}

export type OcPlannerUnassignedMember = {
    memberId: number;
    memberName: string;
    available: 'now' | 'soon';
    currentCrimeId?: number;
    currentCrimeName?: string;
    availableAt?: number;
    bestCpr?: number;
    bestCprCrimeName?: string;
    bestCprRoleName?: string;
    bestCprDifficulty?: number;
}

export type OcPlannerRun = {
    id?: number;
    factionId: string;
    generatedAt: string;
    generatedBy?: string;
    summary?: {
        unassignedMembers?: number;
        missingCprMembers?: number;
        [key: string]: unknown;
    };
    crimes: OcPlannerCrime[];
    unassignedMembers?: OcPlannerUnassignedMember[];
    missingCprMembers?: Array<{ memberId: number; memberName: string }>;
    warnings?: string[];
}

export interface TerritoryWatch {
    id: number;
    user_id: string;
    territory_id: string;
    channel_id: string;
    created_at: string;
}

export interface TerritoryWar {
    territory_war_id: number;
    assaulting_faction: number;
    defending_faction: number;
    score: number;
    required_score: number;
    started: number;
    ends: number;
    assaulters: any[];
    defenders: any[];
}

export interface TerritoryWarState {
    territory_id: string;
    is_at_war: boolean;
    assaulting_faction?: number;
    defending_faction?: number;
    start_time?: number;
    updated_at?: string;
}
