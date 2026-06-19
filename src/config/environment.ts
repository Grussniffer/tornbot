import { config } from 'dotenv';

config();

export const ENV = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
    CLIENT_ID: process.env.CLIENT_ID!,
    GUILD_ID: process.env.GUILD_ID,
    OWNER_ID: process.env.OWNER_ID!,
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    ALERT_CHANNEL_ID: process.env.ALERT_CHANNEL_ID!,
    BACKEND_URL: process.env.BACKEND_URL,
    GIVEAWAY_BOT_TOKEN: process.env.GIVEAWAY_BOT_TOKEN,
    FACTION: process.env.FACTION || process.env.ALLIED_FACTION_ID || process.env.ALLIED_FACTION || '',
    ALERT_INTERVAL_MS: Number(process.env.ALERT_INTERVAL_MS || 15000),
    OC_ALERT_INTERVAL_MS: Number(process.env.OC_ALERT_INTERVAL_MS || 5 * 60 * 1000),
} as const;

// Validate required environment variables
const requiredEnvVars = [
    'DISCORD_TOKEN',
    'CLIENT_ID',
    'OWNER_ID',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'ALERT_CHANNEL_ID'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}

if (!ENV.FACTION) {
    throw new Error('Missing required environment variable: FACTION or ALLIED_FACTION_ID');
}
