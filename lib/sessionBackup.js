import fs from 'fs';
import path from 'path';
import https from 'https';

const CREDS_PATH = path.join(process.cwd(), 'session', 'creds.json');
const GIST_ID_FILE = path.join(process.cwd(), 'data', '.gist_id');

export function getSessionBase64() {
    if (!fs.existsSync(CREDS_PATH)) throw new Error('No session found. Pair the bot first.');
    const content = fs.readFileSync(CREDS_PATH, 'utf8');
    JSON.parse(content); // validate real JSON
    return Buffer.from(content).toString('base64');
}

export async function saveToGist(sessionBase64) {
    const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) return null;
    const credsContent = Buffer.from(sessionBase64, 'base64').toString('utf8');
    // Reuse existing Gist if we saved before (avoids creating duplicates)
    let gistId = null;
    try {
        if (fs.existsSync(GIST_ID_FILE)) gistId = fs.readFileSync(GIST_ID_FILE, 'utf8').trim();
    } catch { }
    const body = JSON.stringify({
        description: 'JAM-MD Session Backup — DO NOT SHARE',
        public: false,
        files: { 'creds.json': { content: credsContent } }
    });
    const method = gistId ? 'PATCH' : 'POST';
    const apiPath = gistId ? `/gists/${gistId}` : '/gists';
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.github.com',
            path: apiPath,
            method,
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json',
                'User-Agent': 'JAM-MD-Backup',
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const j = JSON.parse(d);
                    if (j.id) {
                        try { fs.writeFileSync(GIST_ID_FILE, j.id); } catch { }
                        resolve(j.id);
                    } else {
                        reject(new Error(j.message || 'Gist API error'));
                    }
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Called automatically when bot connects.
 * Silently backs up session to Gist and prints SESSION_ID to logs.
 */
export async function autoBackupSession() {
    if (!fs.existsSync(CREDS_PATH)) return;
    try {
        const sessionBase64 = getSessionBase64();
        const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
        if (token) {
            const gistId = await saveToGist(sessionBase64);
            if (gistId) {
                console.log('╔══════════════════════════════════════════╗');
                console.log('║      ✅  SESSION BACKUP COMPLETE          ║');
                console.log('╠══════════════════════════════════════════╣');
                console.log(`║  SESSION_ID = JAM-MD_${gistId}`);
                console.log('║  Add this to Railway → Variables         ║');
                console.log('║  to survive redeploys without re-pairing ║');
                console.log('╚══════════════════════════════════════════╝');
                return;
            }
        }
        // Fallback: log base64 SESSION_ID if no token
        console.log('╔══════════════════════════════════════════╗');
        console.log('║      📌  YOUR SESSION_ID (copy this)     ║');
        console.log('╠══════════════════════════════════════════╣');
        console.log(sessionBase64);
        console.log('║  Paste as SESSION_ID in Railway Variables ║');
        console.log('╚══════════════════════════════════════════╝');
    } catch (e) {
        console.log('[SessionBackup] Could not backup session:', e.message);
    }
}
