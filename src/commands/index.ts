import { Command } from '../types';
import { ping } from './public/ping';
import { hello } from './public/hello';
import { shutdown } from './owner/shutdown';
import { status } from './owner/status';
import { pause } from './owner/pause';
import { resume } from './owner/resume';
import { sleepFlight } from './sleepFlight';
import { ocNextFree } from './ocPlanner';
import { giveaway } from './giveaway';

export const commands: Command[] = [
    ping,
    hello,
    shutdown,
    status,
    pause,
    resume,
    sleepFlight,
    ocNextFree,
    giveaway,
];

export { ping, hello, shutdown, status, pause, resume, sleepFlight, ocNextFree, giveaway };
