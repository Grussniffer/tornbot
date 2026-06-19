import { createClient } from '@supabase/supabase-js';
import { ENV } from '../config/environment';
import { ChaseBotAlertSettings, OcBotAlertSettings, OcPlannerRun, TerritoryWatch, TerritoryWarState, WarMember } from "../types";

export const supabase = createClient(
    ENV.SUPABASE_URL,
    ENV.SUPABASE_ANON_KEY
);

export class Database {

    static async getData() {
        const { data, error } = await supabase
            .from('war_tracker')
            .select('*')

        if (error) throw error;
        return data as WarMember[];
    }

    static async getOcBotAlertSettings(): Promise<OcBotAlertSettings | undefined> {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('value, updated_at, updated_by')
            .eq('key', 'oc_planner_alerts')
            .maybeSingle();

        if (error) {
            console.error('Error fetching OC bot alert settings:', error.message);
            return undefined;
        }

        if (!data?.value) return undefined;
        return {
            enabled: data.value.enabled !== false,
            channelId: data.value.channelId || '',
            needMoreRoleId: data.value.needMoreRoleId || '',
            soonFreeHours: Number(data.value.soonFreeHours || 6),
            needMoreCooldownHours: Number(data.value.needMoreCooldownHours || 6),
            updatedAt: data.updated_at,
            updatedBy: data.updated_by,
            persisted: true,
        };
    }

    static async getChaseBotAlertSettings(): Promise<ChaseBotAlertSettings | undefined> {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('value, updated_at, updated_by')
            .eq('key', 'chase_alerts')
            .maybeSingle();

        if (error) {
            console.error('Error fetching chase bot alert settings:', error.message);
            return undefined;
        }

        if (!data?.value) return undefined;
        return {
            enabled: data.value.enabled !== false,
            channelId: data.value.channelId || '',
            updatedAt: data.updated_at,
            updatedBy: data.updated_by,
            persisted: true,
        };
    }

    static async getLatestOcPlannerRun(factionId?: string): Promise<OcPlannerRun | undefined> {
        let query = supabase
            .from('oc_planner_runs')
            .select('id, snapshot')
            .order('generated_at', { ascending: false })
            .limit(1);

        if (factionId) {
            query = query.eq('faction_id', factionId);
        }

        const { data, error } = await query.maybeSingle();

        if (error) {
            console.error('Error fetching latest OC planner run:', error.message);
            return undefined;
        }

        if (!data?.snapshot) return undefined;
        return {
            ...(data.snapshot as OcPlannerRun),
            id: Number(data.id || (data.snapshot as OcPlannerRun).id || 0) || undefined,
        };
    }


    static async insertData(id?: number) {
        await supabase
            .from('war_tracker')
            .update({ alerted: true })
            .eq('id', id);

    }

    static async markMemberAsAlerted(member: WarMember): Promise<void> {
        let query = supabase
            .from('war_tracker')
            .update({ alerted: true });

        if (member.id) {
            query = query.eq('id', member.id);
        } else {
            query = query
                .eq('faction_id', member.faction_id)
                .eq('member_id', member.member_id);
        }

        const { error } = await query;
        if (error) throw error;
    }

    static async getApiKeys(): Promise<string[]> {
        const { data, error } = await supabase
            .from('api_keys')
            .select('key');

        if (error) {
            console.error('Error fetching API keys:', error);
            return [];
        }
        return data.map((row: any) => row.key);
    }

    static async getTerritoryWatches(): Promise<TerritoryWatch[]> {
        const { data, error } = await supabase
            .from('territory_watches')
            .select('*');

        if (error) {
            console.error('Error fetching territory watches:', error);
            return [];
        }
        return data as TerritoryWatch[];
    }

    static async addTerritoryWatch(userId: string, territoryId: string, channelId: string): Promise<void> {
        const { error } = await supabase
            .from('territory_watches')
            .insert({
                user_id: userId,
                territory_id: territoryId,
                channel_id: channelId
            });

        if (error) {
            if (error.code === '23505') {
                throw new Error('You are already watching this territory.');
            }
            throw error;
        }
    }

    static async removeTerritoryWatch(userId: string, territoryId: string): Promise<void> {
        const { error } = await supabase
            .from('territory_watches')
            .delete()
            .match({
                user_id: userId,
                territory_id: territoryId
            });

        if (error) throw error;
    }

    static async getWarState(territoryId: string): Promise<TerritoryWarState | null> {
        const { data, error } = await supabase
            .from('territory_war_states')
            .select('*')
            .eq('territory_id', territoryId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            console.error('Error fetching war state:', error);
            return null;
        }
        return data as TerritoryWarState;
    }

    static async updateWarState(territoryId: string, state: Partial<TerritoryWarState>): Promise<void> {
        const { error } = await supabase
            .from('territory_war_states')
            .upsert({
                territory_id: territoryId,
                ...state,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'territory_id'
            });

        if (error) {
            console.error('Error updating war state:', error);
            throw error;
        }
    }


}
