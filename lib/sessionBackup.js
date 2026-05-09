import fs from 'fs';
import path from 'path';

const CREDS_PATH = path.join(process.cwd(), 'session', 'creds.json');

export function getSessionBase64() {
    if (!fs.existsSync(CREDS_PATH)) throw new Error('No session found. Pair the bot first.');
    const content = fs.readFileSync(CREDS_PATH, 'utf8');
    JSON.parse(content);
    return Buffer.from(content).toString('base64');
}

// Session is stored locally in session/creds.json on Pterodactyl (bot-hosting.net).
// It persists between restarts automatically — no backup to external services needed.
export async function autoBackupSession() {
    // No-op on Pterodactyl: session/creds.json is preserved between restarts by the panel.
}
