import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import fs from 'fs';
import axios from 'axios';

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'triomjaijuma-hue';

/**
 * Save credentials to session/creds.json.
 * Supports two SESSION_ID formats:
 *   1. Base64-encoded JSON  — paste the string shown on /session page
 *   2. GitHub Gist ID       — JAM-MD/JAM-MD_<gistId>  (legacy)
 */
async function SaveCreds(txt) {
    const sessionDir = path.join(process.cwd(), 'session');
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    const credsPath = path.join(sessionDir, 'creds.json');

    // Strip any JAM-MD prefix
    const stripped = txt
        .replace('JAM-MD/JAM-MD_', '')
        .replace('JAM-MD_', '')
        .trim();

    // ── Format 1: base64-encoded credentials ──────────────────────────────
    try {
        const decoded = Buffer.from(stripped, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        // Must look like a real creds object
        if (parsed && (parsed.noiseKey || parsed.signedIdentityKey || parsed.registrationId)) {
            fs.writeFileSync(credsPath, JSON.stringify(parsed, null, 2));
            console.log('✅ Session loaded from base64 credentials');
            return;
        }
    } catch { /* not base64 JSON — fall through to Gist */ }

    // ── Format 2: GitHub Gist ID ───────────────────────────────────────────
    const gistUrl = `https://gist.githubusercontent.com/${GITHUB_USERNAME}/${stripped}/raw/creds.json`;
    try {
        const response = await axios.get(gistUrl);
        const data = typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data);
        fs.writeFileSync(credsPath, data);
        console.log('✅ Session loaded from GitHub Gist');
    } catch (error) {
        console.error('❌ Error downloading session from Gist:', error.message);
        if (error.response) {
            console.error('❌ Status:', error.response.status);
        }
        throw error;
    }
}

export default SaveCreds;
