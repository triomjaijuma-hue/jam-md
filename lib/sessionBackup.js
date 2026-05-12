import fs from 'fs';
import path from 'path';
import axios from 'axios';

const CREDS_PATH = path.join(process.cwd(), 'session', 'creds.json');

export function getSessionBase64() {
    if (!fs.existsSync(CREDS_PATH)) throw new Error('No session found. Pair the bot first.');
    const content = fs.readFileSync(CREDS_PATH, 'utf8');
    JSON.parse(content); // validates JSON
    return Buffer.from(content).toString('base64');
}

/**
 * Auto-backup the current session/creds.json to a GitHub Gist.
 *
 * Required env vars:
 *   GITHUB_TOKEN — Personal Access Token with the "gist" scope
 *   GIST_ID      — The ID of an existing secret Gist to update
 *                  (create one manually, put any placeholder in creds.json)
 *
 * Why this matters on Railway:
 *   Railway containers have ephemeral filesystems. Every restart wipes /app/session.
 *   Without this backup, the bot loads the original SESSION_ID (old keys) on every
 *   restart, but WhatsApp has already rotated the keys → messages can't be decrypted
 *   → "Waiting for this message. This may take a while." appears for every response.
 *
 *   With this backup active:
 *   1. Startup  → loads SESSION_ID (base64 or Gist ID) as before
 *   2. Running  → creds.update fires → saves locally + updates Gist
 *   3. Restart  → Gist has the latest keys → bot loads them via SESSION_ID pointing
 *                 at the Gist ID, or you update SESSION_ID to the new base64 once.
 *
 * Setup steps:
 *   1. Go to https://gist.github.com → New gist → filename: creds.json → content: {}
 *      → Create secret gist
 *   2. Copy the Gist ID from the URL (e.g. abc123def456...)
 *   3. Go to https://github.com/settings/tokens → generate token with "gist" scope
 *   4. Set on Railway:
 *        GITHUB_TOKEN=ghp_your_token_here
 *        GIST_ID=abc123def456...
 */
export async function autoBackupSession() {
    const token = process.env.GITHUB_TOKEN;
    const gistId = process.env.GIST_ID;

    if (!token || !gistId) {
        // Silently skip — user hasn't configured Gist backup yet
        return;
    }

    if (!fs.existsSync(CREDS_PATH)) {
        return;
    }

    let content;
    try {
        content = fs.readFileSync(CREDS_PATH, 'utf8');
        JSON.parse(content); // only backup valid JSON
    } catch {
        return;
    }

    try {
        await axios.patch(
            `https://api.github.com/gists/${gistId}`,
            {
                files: {
                    'creds.json': { content }
                }
            },
            {
                headers: {
                    Authorization: `token ${token}`,
                    Accept: 'application/vnd.github.v3+json'
                },
                timeout: 10000
            }
        );
        console.log('✅ Session backed up to GitHub Gist');
    } catch (err) {
        // Non-fatal — log but don't crash the bot
        console.error('⚠️  Session backup to Gist failed:', err?.response?.data?.message || err.message);
    }
}
