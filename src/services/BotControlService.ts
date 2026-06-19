import fs from 'fs';
import path from 'path';

export type BotPauseState = {
    paused: boolean;
    reason?: string;
    pausedBy?: string;
    pausedAt?: string;
};

export class BotControlService {
    private static stateFile = process.env.BOT_STATE_FILE || path.join(process.cwd(), 'bot-state.json');
    private static pauseState: BotPauseState = BotControlService.loadState();

    static pause(pausedBy: string, reason?: string): BotPauseState {
        this.pauseState = {
            paused: true,
            pausedBy,
            reason: reason?.trim() || undefined,
            pausedAt: new Date().toISOString(),
        };

        console.log(
            `Bot alerts paused by ${pausedBy}${this.pauseState.reason ? `: ${this.pauseState.reason}` : ""}`
        );
        this.saveState();

        return this.getState();
    }

    static resume(resumedBy: string): BotPauseState {
        if (this.pauseState.paused) {
            console.log(`Bot alerts resumed by ${resumedBy}`);
        }

        this.pauseState = {
            paused: false,
        };
        this.saveState();

        return this.getState();
    }

    static isPaused(): boolean {
        return this.pauseState.paused;
    }

    static getState(): BotPauseState {
        return { ...this.pauseState };
    }

    private static loadState(): BotPauseState {
        try {
            if (!fs.existsSync(this.stateFile)) return { paused: false };
            const raw = fs.readFileSync(this.stateFile, 'utf8');
            const parsed = JSON.parse(raw) as BotPauseState;
            return {
                paused: !!parsed.paused,
                reason: parsed.reason,
                pausedBy: parsed.pausedBy,
                pausedAt: parsed.pausedAt,
            };
        } catch (error: any) {
            console.error(`Failed to load bot pause state: ${error?.message || error}`);
            return { paused: false };
        }
    }

    private static saveState(): void {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.pauseState, null, 2));
        } catch (error: any) {
            console.error(`Failed to save bot pause state: ${error?.message || error}`);
        }
    }
}
