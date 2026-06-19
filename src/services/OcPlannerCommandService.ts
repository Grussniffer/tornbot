import { ENV } from '../config/environment';

type BotCommandVisibility = 'private' | 'public';

type BotCommandPayload = {
    content?: string;
    error?: string;
    ephemeral?: boolean;
    visibility?: BotCommandVisibility;
};

export class OcPlannerCommandService {
    static async getNextFree(visibility: BotCommandVisibility): Promise<BotCommandPayload> {
        const baseUrl = this.getBackendUrl();
        return this.requestJson(
            `${baseUrl}/api/oc-planner/next-free?visibility=${visibility}`,
            { method: 'GET' }
        );
    }

    private static getBackendUrl() {
        if (!ENV.BACKEND_URL) {
            throw new Error('BACKEND_URL is not configured in the bot .env.');
        }

        return ENV.BACKEND_URL.replace(/\/$/, '');
    }

    private static async requestJson(url: string, init: RequestInit): Promise<BotCommandPayload> {
        const response = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(30000),
        });
        const payload = await response.json().catch(() => ({})) as BotCommandPayload;

        if (!response.ok) {
            throw new Error(payload.error || `Backend returned ${response.status}.`);
        }

        return payload;
    }
}
