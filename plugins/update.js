import config from '../config.js';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Shell execution
// ---------------------------------------------------------------------------
async function run(cmd, opts = {}) {
    if (typeof globalThis.Bun !== 'undefined') {
        try {
            const { $ } = await import('bun');
            const result = await $`sh -c ${cmd}`.quiet().nothrow();
            if (result.exitCode !== 0) {
                const errText = result.stderr.toString().trim() || result.stdout.toString().trim();
                throw new Error(errText || `Command exited with code ${result.exitCode}`);
            }
            return result.stdout.toString();
        } catch (e) {
            if (e.message) throw e;
            throw new Error(String(e));
        }
    }
    const { exec } = await import('child_process');
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true, ...opts }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
            resolve((stdout || '').toString());
        });
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isBun() {
    return typeof globalThis.Bun !== 'undefined';
}

function getPlatformName() {
    if (isBun()) return 'Wispbyte/Bun';
    if (fs.existsSync('/.dockerenv')) return 'Pterodactyl/Docker';
    return process.platform;
}

// CPU-friendly npm install: prefer offline cache, skip audits, use low priority
function getInstallCmd() {
    if (isBun()) return 'bun install';
    // nice -n 10 lowers process priority so install doesn't spike CPU
    return 'nice -n 10 npm install --prefer-offline --no-audit --no-fund --loglevel=error 2>/dev/null || npm install --no-audit --no-fund --loglevel=error';
}

async function hasGitRepo() {
    const gitDir = path.join(process.cwd(), '.git');
    if (!fs.existsSync(gitDir)) return false;
    try { await run('git --version'); return true; }
    catch { return false; }
}

// Small async sleep — used to yield CPU between heavy operations
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------
const OWNER  = 'jumatjai-create';
const REPO   = 'jam-md';
const BRANCH = 'main';
const GH_API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

// Files/directories that must never be overwritten during an update
const PROTECTED = new Set([
    'session', 'data', 'temp', 'tmp', 'node_modules', '.git',
    'baileys_store.json', '.env',
]);

function isProtected(filePath) {
    const parts = filePath.split('/');
    return parts.some(p => PROTECTED.has(p));
}

async function ghFetch(url) {
    const headers = { 'User-Agent': 'JAM-MD-Updater/1.0', 'Accept': 'application/vnd.github.v3+json' };
    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    try {
        const res = await fetch(url, { headers, signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText} — ${url}`);
        return res.json();
    } finally {
        clearTimeout(tid);
    }
}

async function ghFetchRaw(filePath) {
    const url = `${RAW_URL}/${filePath}`;
    const headers = { 'User-Agent': 'JAM-MD-Updater/1.0' };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);
    try {
        const res = await fetch(url, { headers, signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) throw new Error(`Raw download ${res.status}: ${filePath}`);
        return Buffer.from(await res.arrayBuffer());
    } finally {
        clearTimeout(tid);
    }
}

// ---------------------------------------------------------------------------
// Config value preservation
// ---------------------------------------------------------------------------
function readCurrentConfigValues() {
    try {
        return {
            ownerNumber  : config?.ownerNumber   ? String(config.ownerNumber)   : null,
            botOwner     : config?.botOwner       ? String(config.botOwner)      : null,
            botName      : config?.botName        ? String(config.botName)       : null,
            sessionId    : config?.sessionId      ? String(config.sessionId)     : null,
            pairingNumber: config?.pairingNumber  ? String(config.pairingNumber) : null,
            // AI provider settings — preserved so keys survive every update
            aiProvider   : config?.aiProvider     ? String(config.aiProvider)    : null,
            groqApiKey   : config?.groqApiKey     ? String(config.groqApiKey)    : null,
            geminiApiKey : config?.geminiApiKey   ? String(config.geminiApiKey)  : null,
            openaiApiKey : config?.openaiApiKey   ? String(config.openaiApiKey)  : null,
        };
    } catch {
        return null;
    }
}

function patchConfigAfterUpdate(savedValues) {
    if (!savedValues) return;
    try {
        const cfgPath = path.join(process.cwd(), 'config.js');
        if (!fs.existsSync(cfgPath)) return;
        let text = fs.readFileSync(cfgPath, 'utf8');

        const patch = (key, envKey, val) => {
            if (!val) return;
            // handles:  key: 'value'   AND   key: process.env.X || 'value'
            text = text
                .replace(
                    new RegExp(`(${key}:\\s*process\\.env\\.\\w+\\s*\\|\\|\\s*)['"][^'"]*['"]`),
                    `$1'${val}'`
                )
                .replace(
                    new RegExp(`(${key}:\\s*)['"][^'"]*['"]`),
                    `$1'${val}'`
                );
        };

        patch('ownerNumber',   'OWNER_NUMBER',   savedValues.ownerNumber);
        patch('botOwner',      'BOT_OWNER',      savedValues.botOwner);
        patch('botName',       'BOT_NAME',       savedValues.botName);
        patch('sessionId',     'SESSION_ID',     savedValues.sessionId);
        patch('pairingNumber', 'PAIRING_NUMBER', savedValues.pairingNumber);
        // Restore AI provider settings so keys survive every update
        patch('aiProvider',   'AI_PROVIDER',    savedValues.aiProvider);
        patch('groqApiKey',   'GROQ_API_KEY',   savedValues.groqApiKey);
        patch('geminiApiKey', 'GEMINI_API_KEY', savedValues.geminiApiKey);
        patch('openaiApiKey', 'OPENAI_API_KEY', savedValues.openaiApiKey);

        fs.writeFileSync(cfgPath, text);
    } catch (e) {
        console.error('[update] Config patch failed:', e.message);
    }
}

// ---------------------------------------------------------------------------
// Strategy 1 — GitHub API incremental update (BEST: low CPU, fast, precise)
// Downloads ONLY the files that actually changed between commits.
// No ZIP download, no extraction, no unzip tool needed.
// ---------------------------------------------------------------------------
async function updateViaGithubApi(progressCb) {
    const savedValues = readCurrentConfigValues();

    // Get latest commit SHA
    const latest = await ghFetch(`${GH_API}/commits/${BRANCH}`);
    const newSha = latest.sha;
    const newMsg = latest.commit?.message?.split('\n')[0] || '';

    // Read last known SHA from disk
    const statePath = path.join(process.cwd(), 'data', 'last_update.json');
    let oldSha = null;
    try {
        const prev = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        oldSha = prev.sha || null;
    } catch {}

    if (oldSha === newSha) {
        return { type: 'api', alreadyUpToDate: true, newSha, oldSha, files: [], message: newMsg };
    }

    // Get list of changed files
    let changedFiles = [];
    if (oldSha) {
        try {
            const compare = await ghFetch(`${GH_API}/compare/${oldSha}...${newSha}`);
            changedFiles = (compare.files || [])
                .filter(f => f.status !== 'removed' && !isProtected(f.filename))
                .map(f => f.filename);
        } catch {
            // compare failed — fall back to full file tree
        }
    }

    // If no old SHA or compare failed, get ALL files via tree
    if (!oldSha || changedFiles.length === 0) {
        progressCb?.('Fetching full file list from GitHub…');
        const tree = await ghFetch(`${GH_API}/git/trees/${newSha}?recursive=1`);
        changedFiles = (tree.tree || [])
            .filter(f => f.type === 'blob' && !isProtected(f.path))
            .map(f => f.path);
    }

    progressCb?.(`Downloading ${changedFiles.length} file(s)…`);

    // Download changed files one by one with small delays to keep CPU low
    const downloaded = [];
    const failed = [];
    for (let i = 0; i < changedFiles.length; i++) {
        const filePath = changedFiles[i];
        try {
            const buf = await ghFetchRaw(filePath);
            const dest = path.join(process.cwd(), filePath);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, buf);
            downloaded.push(filePath);
        } catch (e) {
            failed.push(`${filePath} (${e.message})`);
        }
        // Yield CPU every 10 files — prevents CPU spike on Pterodactyl
        if (i > 0 && i % 10 === 0) {
            await sleep(200);
        }
    }

    // Restore config values that may have been overwritten
    patchConfigAfterUpdate(savedValues);

    // Save new SHA for next update
    try {
        fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive: true });
        fs.writeFileSync(statePath, JSON.stringify({
            sha: newSha,
            message: newMsg,
            timestamp: new Date().toISOString(),
            filesUpdated: downloaded.length,
            platform: getPlatformName(),
        }, null, 2));
    } catch {}

    return { type: 'api', alreadyUpToDate: false, newSha, oldSha, files: downloaded, failed, message: newMsg };
}

// ---------------------------------------------------------------------------
// Strategy 2 — Git pull (if .git repo exists)
// ---------------------------------------------------------------------------
async function updateViaGit() {
    const savedValues = readCurrentConfigValues();
    const oldRev = String(await run('git rev-parse HEAD').catch(() => 'unknown')).trim();
    await run('git fetch --all --prune');
    const newRev = String(await run('git rev-parse origin/main')).trim();
    const alreadyUpToDate = oldRev === newRev;
    const commits = alreadyUpToDate ? '' : await run(`git log --pretty=format:"%h %s" ${oldRev}..${newRev}`).catch(() => '');
    const files   = alreadyUpToDate ? '' : await run(`git diff --name-status ${oldRev} ${newRev}`).catch(() => '');
    await run(`git reset --hard ${newRev}`);
    await run('git clean -fd --exclude=session --exclude=data --exclude=temp --exclude=node_modules');
    if (!alreadyUpToDate) patchConfigAfterUpdate(savedValues);
    return { type: 'git', oldRev, newRev, alreadyUpToDate, commits, files };
}

// ---------------------------------------------------------------------------
// Strategy 3 — ZIP download (last resort, requires no git or API)
// ---------------------------------------------------------------------------
async function downloadFile(url, dest) {
    if (isBun()) {
        let finalUrl = url;
        try {
            const probe = await fetch(url, {
                method: 'GET',
                headers: { 'User-Agent': 'JAM-MD-Updater/1.0' },
                redirect: 'manual',
            });
            if (probe.status >= 300 && probe.status < 400) {
                finalUrl = probe.headers.get('location') || url;
            } else if (probe.ok) {
                fs.writeFileSync(dest, Buffer.from(await probe.arrayBuffer()));
                return;
            }
        } catch {}
        const response = await fetch(finalUrl, {
            headers: { 'User-Agent': 'JAM-MD-Updater/1.0' },
            redirect: 'follow',
        });
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
        return;
    }
    const axios = (await import('axios')).default;
    const response = await axios.get(url, {
        responseType: 'stream', timeout: 90000, maxRedirects: 10,
        headers: { 'User-Agent': 'JAM-MD-Updater/1.0' }
    });
    await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        response.data.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', (err) => { try { file.close(() => {}); } catch {} fs.unlink(dest, () => reject(err)); });
        response.data.on('error', reject);
    });
}

async function extractZipNode(zipPath, outDir) {
    const data = fs.readFileSync(zipPath);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let eocdOffset = -1;
    for (let i = data.length - 22; i >= 0; i--) {
        if (data[i] === 0x50 && data[i+1] === 0x4b && data[i+2] === 0x05 && data[i+3] === 0x06) {
            eocdOffset = i; break;
        }
    }
    if (eocdOffset === -1) throw new Error('Invalid ZIP: EOCD not found');
    const cdOffset  = view.getUint32(eocdOffset + 16, true);
    const cdEntries = view.getUint16(eocdOffset + 8,  true);
    let pos = cdOffset;
    const { inflateRawSync } = await import('zlib');
    for (let i = 0; i < cdEntries; i++) {
        if (view.getUint32(pos, true) !== 0x02014b50)
            throw new Error('Invalid ZIP: central directory signature mismatch');
        const compMethod  = view.getUint16(pos + 10, true);
        const compSize    = view.getUint32(pos + 20, true);
        const uncompSize  = view.getUint32(pos + 24, true);
        const fnLen       = view.getUint16(pos + 28, true);
        const extraLen    = view.getUint16(pos + 30, true);
        const commentLen  = view.getUint16(pos + 32, true);
        const localOffset = view.getUint32(pos + 42, true);
        const filename    = data.slice(pos + 46, pos + 46 + fnLen).toString('utf8');
        pos += 46 + fnLen + extraLen + commentLen;
        if (filename.endsWith('/') || isProtected(filename)) continue;
        // Use local header's OWN fnLen/extraLen for correct data offset
        const lfhFnLen    = view.getUint16(localOffset + 26, true);
        const lfhExtraLen = view.getUint16(localOffset + 28, true);
        const dataOffset  = localOffset + 30 + lfhFnLen + lfhExtraLen;
        const outPath = path.join(outDir, filename);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        if (compMethod === 0) {
            fs.writeFileSync(outPath, data.slice(dataOffset, dataOffset + uncompSize));
        } else if (compMethod === 8) {
            fs.writeFileSync(outPath, inflateRawSync(data.slice(dataOffset, dataOffset + compSize)));
        } else {
            throw new Error(`Unsupported ZIP compression method: ${compMethod}`);
        }
        if (i > 0 && i % 20 === 0) await sleep(50); // yield CPU
    }
}

async function extractZip(zipPath, outDir) {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    if (process.platform === 'win32') {
        await run(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force"`);
        return;
    }
    for (const [check, cmd] of [
        ['command -v unzip', `unzip -o "${zipPath}" -d "${outDir}"`],
        ['command -v 7z',   `7z x -y "${zipPath}" -o"${outDir}"`],
        ['busybox unzip -h',`busybox unzip -o "${zipPath}" -d "${outDir}"`],
    ]) {
        try { await run(check); await run(cmd); return; } catch {}
    }
    // Pure Node.js fallback — always works, no external tools needed
    await extractZipNode(zipPath, outDir);
}

function copyRecursive(src, dest, outList = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
        if (PROTECTED.has(entry)) continue;
        const s = path.join(src, entry);
        const d = path.join(dest, entry);
        if (fs.lstatSync(s).isDirectory()) {
            copyRecursive(s, d, outList);
        } else {
            fs.copyFileSync(s, d);
            outList.push(entry);
        }
    }
}

async function updateViaZip(zipOverride) {
    const savedValues = readCurrentConfigValues();
    const AUTO_ZIP = `https://codeload.github.com/${OWNER}/${REPO}/zip/refs/heads/${BRANCH}`;
    const API_ZIP  = `https://api.github.com/repos/${OWNER}/${REPO}/zipball/${BRANCH}`;
    const zipUrl   = (zipOverride || config.updateZipUrl || process.env.UPDATE_URL || '').trim() || AUTO_ZIP;
    const tmpDir   = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'update.zip');
    try {
        await downloadFile(zipUrl, zipPath);
    } catch (primaryErr) {
        if (zipUrl !== API_ZIP) {
            await downloadFile(API_ZIP, zipPath);
        } else {
            throw primaryErr;
        }
    }
    const extractTo = path.join(tmpDir, 'update_extract');
    if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
    await extractZip(zipPath, extractTo);
    const entries = fs.readdirSync(extractTo).map(n => path.join(extractTo, n));
    const root    = entries[0];
    const srcRoot = root && fs.existsSync(root) && fs.lstatSync(root).isDirectory() ? root : extractTo;
    const copied  = [];
    copyRecursive(srcRoot, process.cwd(), copied);
    patchConfigAfterUpdate(savedValues);
    try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(zipPath,   { force: true }); } catch {}
    return { type: 'zip', copiedFiles: copied };
}

// ---------------------------------------------------------------------------
// Restart — process.exit(1) triggers crash-based auto-restart on every
// platform: Replit, Pterodactyl, Wispbyte/Bun, Railway, Heroku, PM2.
// exit(0) = clean stop → most platforms do NOT restart on clean exit.
// ---------------------------------------------------------------------------
async function restartProcess() {
    setTimeout(() => process.exit(1), 2500);
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------
export default {
    command: 'update',
    aliases: ['upgrade'],
    category: 'owner',
    description: 'Update JAM-MD from GitHub (downloads only changed files) and restart',
    usage: '.update',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;

        await sock.sendMessage(chatId, {
            text: '🔄 *JAM-MD Update*\n\nConnecting to GitHub… please wait.'
        }, { quoted: message });

        let summary = '';
        let strategy = '';

        try {
            // ── Strategy 1: GitHub API incremental (best — CPU friendly, no ZIP) ──
            try {
                const progressMsg = await sock.sendMessage(chatId, {
                    text: '📡 Fetching changes from GitHub API…'
                }, { quoted: message });

                let progressText = '📡 Fetching changes from GitHub API…';
                const progressCb = async (msg) => {
                    progressText = `📡 ${msg}`;
                    try {
                        await sock.sendMessage(chatId, {
                            text: progressText,
                            edit: progressMsg.key
                        });
                    } catch {}
                };

                const result = await updateViaGithubApi(progressCb);
                strategy = 'GitHub API (incremental)';

                if (result.alreadyUpToDate) {
                    summary = `✅ *Already up to date!*\n📌 Commit: \`${result.newSha?.substring(0, 7)}\``;
                    if (result.message) summary += `\n💬 ${result.message}`;
                } else {
                    summary = `✅ *Updated via GitHub API!*\n\n`;
                    if (result.oldSha) summary += `📌 Old: \`${result.oldSha.substring(0, 7)}\`\n`;
                    summary += `📌 New: \`${result.newSha.substring(0, 7)}\``;
                    if (result.message) summary += `\n💬 ${result.message}`;
                    summary += `\n📁 Files updated: *${result.files.length}*`;
                    if (result.files.length > 0) {
                        const shown = result.files.slice(0, 6);
                        summary += `\n${shown.map(f => `  • ${f}`).join('\n')}`;
                        if (result.files.length > 6) summary += `\n  … and ${result.files.length - 6} more`;
                    }
                    if (result.failed?.length > 0) {
                        summary += `\n⚠️ Failed: ${result.failed.length} file(s)`;
                    }
                }

            } catch (apiErr) {
                // ── Strategy 2: git pull (if .git exists) ──
                if (await hasGitRepo()) {
                    strategy = 'git reset --hard';
                    const result = await updateViaGit();
                    if (result.alreadyUpToDate) {
                        summary = `✅ *Already up to date!*\n📌 Revision: \`${result.newRev.substring(0, 7)}\``;
                    } else {
                        summary = `✅ *Updated via git!*\n\n📌 Old: \`${result.oldRev.substring(0, 7)}\`\n📌 New: \`${result.newRev.substring(0, 7)}\``;
                        if (result.commits) {
                            const lines = String(result.commits).split('\n').slice(0, 5);
                            summary += `\n📝 Changes:\n${lines.map(c => `  • ${c}`).join('\n')}`;
                        }
                    }
                } else {
                    // ── Strategy 3: ZIP download (last resort) ──
                    strategy = 'ZIP download';
                    await sock.sendMessage(chatId, {
                        text: `⚠️ GitHub API failed (${apiErr.message?.substring(0, 60)})\n📦 Falling back to ZIP download…`
                    }, { quoted: message });
                    const zipOverride = args[0] || null;
                    const result = await updateViaZip(zipOverride);
                    summary = `✅ *Updated from ZIP!*\n📁 Files updated: ${result.copiedFiles.length}`;
                }
            }

            // Run npm install with low priority to avoid CPU spike
            await sock.sendMessage(chatId, {
                text: '📦 Installing dependencies (low-priority to keep CPU stable)…'
            }, { quoted: message });
            await sleep(500);
            await run(getInstallCmd()).catch(() => {});
            await sleep(500);

            summary += `\n\n🔖 Version: ${config.version || 'unknown'}`;
            summary += `\n🖥️ Platform: ${getPlatformName()}`;
            summary += `\n⚙️ Strategy: ${strategy}`;

            await sock.sendMessage(chatId, {
                text: `${summary}\n\n♻️ *Restarting JAM-MD…*\n_Session preserved — no re-pairing needed._\n_Back online in a few seconds._`
            }, { quoted: message });

            await sleep(2000);
            await restartProcess();

        } catch (err) {
            console.error('[update] Update failed:', err);
            await sock.sendMessage(chatId, {
                text: `❌ *Update failed:*\n${String(err.message || err)}`
            }, { quoted: message });
        }
    }
};
