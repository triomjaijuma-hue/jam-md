import config from '../config.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';

function run(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
            resolve((stdout || '').toString());
        });
    });
}

async function hasGitRepo() {
    const gitDir = path.join(process.cwd(), '.git');
    if (!fs.existsSync(gitDir)) return false;
    try { await run('git --version'); return true; }
    catch { return false; }
}

async function updateViaGit() {
    const oldRev = String(await run('git rev-parse HEAD').catch(() => 'unknown')).trim();
    await run('git fetch --all --prune');
    const newRev = String(await run('git rev-parse origin/main')).trim();
    const alreadyUpToDate = oldRev === newRev;
    const commits = alreadyUpToDate ? '' : await run(`git log --pretty=format:"%h %s (%an)" ${oldRev}..${newRev}`).catch(() => '');
    const files = alreadyUpToDate ? '' : await run(`git diff --name-status ${oldRev} ${newRev}`).catch(() => '');
    // git stash session protection (should already be gitignored, but belt-and-suspenders)
    await run(`git reset --hard ${newRev}`);
    await run('git clean -fd --exclude=session --exclude=data --exclude=temp');
    return { oldRev, newRev, alreadyUpToDate, commits, files };
}

function downloadFile(url, dest, visited = new Set()) {
    return new Promise((resolve, reject) => {
        try {
            if (visited.has(url) || visited.size > 5) return reject(new Error('Too many redirects'));
            visited.add(url);
            const useHttps = url.startsWith('https://');
            const http = require('http');
            const client = useHttps ? https : http;
            const req = client.get(url, {
                headers: { 'User-Agent': 'JAM-MD-Updater/1.0', 'Accept': '*/*' }
            }, (res) => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    const location = res.headers.location;
                    if (!location) return reject(new Error(`HTTP ${res.statusCode} without Location`));
                    res.resume();
                    return downloadFile(new URL(location, url).toString(), dest, visited).then(resolve).catch(reject);
                }
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', (err) => { try { file.close(() => {}); } catch {} fs.unlink(dest, () => reject(err)); });
            });
            req.on('error', (err) => { fs.unlink(dest, () => reject(err)); });
        } catch (e) { reject(e); }
    });
}

async function extractZip(zipPath, outDir) {
    if (process.platform === 'win32') {
        await run(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\/g, '/')}' -Force"`);
        return;
    }
    for (const [check, cmd] of [
        ['command -v unzip', `unzip -o '${zipPath}' -d '${outDir}'`],
        ['command -v 7z', `7z x -y '${zipPath}' -o'${outDir}'`],
        ['busybox unzip -h', `busybox unzip -o '${zipPath}' -d '${outDir}'`]
    ]) {
        try { await run(check); await run(cmd); return; } catch { continue; }
    }
    throw new Error('No unzip tool found (unzip/7z/busybox).');
}

function copyRecursive(src, dest, ignore = [], relative = '', outList = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
        if (ignore.includes(entry)) continue;
        const s = path.join(src, entry);
        const d = path.join(dest, entry);
        if (fs.lstatSync(s).isDirectory()) {
            copyRecursive(s, d, ignore, path.join(relative, entry), outList);
        } else {
            fs.copyFileSync(s, d);
            if (outList) outList.push(path.join(relative, entry).replace(/\\/g, '/'));
        }
    }
}

async function updateViaZip(zipOverride) {
    const zipUrl = (zipOverride || config.updateZipUrl || process.env.UPDATE_URL || '').trim();
    if (!zipUrl) {
        throw new Error(
            'No UPDATE_URL set.\n' +
            'On Railway: go to Variables and set UPDATE_URL to your JAM-MD repo ZIP:\n' +
            'https://github.com/YOUR_USER/jam-md/archive/refs/heads/main.zip'
        );
    }
    const tmpDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'update.zip');
    await downloadFile(zipUrl, zipPath);
    const extractTo = path.join(tmpDir, 'update_extract');
    if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
    await extractZip(zipPath, extractTo);
    const [root] = fs.readdirSync(extractTo).map(n => path.join(extractTo, n));
    const srcRoot = fs.existsSync(root) && fs.lstatSync(root).isDirectory() ? root : extractTo;
    // NEVER overwrite session, data, temp — session preservation is critical!
    const ignore = ['node_modules', '.git', 'session', 'data', 'tmp', 'temp', 'baileys_store.json'];
    const copied = [];
    // Preserve owner & bot settings from current config
    let preservedOwner = null;
    let preservedBotOwner = null;
    try {
        const cur = (await import('../config.js')).default;
        preservedOwner = cur?.ownerNumber ? String(cur.ownerNumber) : null;
        preservedBotOwner = cur?.botOwner ? String(cur.botOwner) : null;
    } catch {}
    copyRecursive(srcRoot, process.cwd(), ignore, '', copied);
    if (preservedOwner) {
        try {
            const cfgPath = path.join(process.cwd(), 'config.js');
            if (fs.existsSync(cfgPath)) {
                let text = fs.readFileSync(cfgPath, 'utf8');
                text = text.replace(/ownerNumber:\s*'[^']*'/, `ownerNumber: '${preservedOwner}'`);
                if (preservedBotOwner)
                    text = text.replace(/botOwner:\s*'[^']*'/, `botOwner: '${preservedBotOwner}'`);
                fs.writeFileSync(cfgPath, text);
            }
        } catch {}
    }
    try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(zipPath, { force: true }); } catch {}
    return { copiedFiles: copied };
}

/**
 * Restart strategy for Railway.app:
 * ─────────────────────────────────
 * Railway runs each service inside a Docker container.
 * When the process exits (any code), Railway's restart policy
 * restarts the SAME container — it does NOT redeploy, so:
 *   ✅ session/ directory is preserved  →  no new pairing code needed
 *   ✅ data/ directory is preserved     →  all settings kept
 *   ✅ Bot comes back online in ~5–10 s
 *
 * IMPORTANT: On Railway, set "Restart Policy" to "Always" in your
 * service settings so the container restarts after exit.
 */
async function restartProcess() {
    const isRailway = !!(
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_SERVICE_ID ||
        process.env.RAILWAY_PROJECT_ID
    );
    const isDocker = isRailway || fs.existsSync('/.dockerenv');

    if (isDocker) {
        // Railway/Docker: exit triggers container restart by Railway.
        // Session and data are on the same container filesystem → preserved.
        setTimeout(() => process.exit(1), 800);
        return;
    }
    // VPS with pm2
    try { await run('pm2 restart all'); return; } catch {}
    // VPS without pm2 — spawn detached child
    try {
        const { spawn } = await import('child_process');
        const child = spawn(process.execPath, process.argv.slice(1), {
            detached: true, stdio: 'ignore', cwd: process.cwd(), env: process.env
        });
        child.unref();
        setTimeout(() => process.exit(0), 1500);
        return;
    } catch {}
    setTimeout(() => process.exit(0), 500);
}

export default {
    command: 'update',
    aliases: ['upgrade', 'restart'],
    category: 'owner',
    description: 'Update JAM-MD from your repo and auto-restart (session preserved)',
    usage: '.update [zip_url]',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        try {
            await sock.sendMessage(chatId, {
                text: '🔄 *JAM-MD Update*\n\nChecking for updates… please wait.'
            }, { quoted: message });

            let summary = '';

            if (await hasGitRepo()) {
                const { oldRev, newRev, alreadyUpToDate, commits, files } = await updateViaGit();
                if (alreadyUpToDate) {
                    summary = `✅ *Already up to date!*\nCurrent revision: \`${newRev.substring(0, 7)}\``;
                } else {
                    summary = `✅ *Updated successfully!*\n\n📌 Old: \`${oldRev.substring(0, 7)}\`\n📌 New: \`${newRev.substring(0, 7)}\`\n`;
                    if (commits) {
                        const lines = String(commits).split('\n').slice(0, 5);
                        summary += `\n📝 *Changes:*\n${lines.map(c => `• ${c}`).join('\n')}`;
                    }
                    if (files) {
                        const fl = String(files).split('\n');
                        summary += `\n\n📁 *Files:* ${fl.length} changed`;
                    }
                }
                await run('npm install --no-audit --no-fund').catch(() => {});
            } else {
                const zipOverride = args[0] || null;
                const { copiedFiles } = await updateViaZip(zipOverride);
                summary = `✅ *Updated from ZIP!*\n\n📁 Files updated: ${copiedFiles.length}`;
                if (copiedFiles.length > 0) {
                    const shown = copiedFiles.slice(0, 8);
                    summary += `\n${shown.map(f => `• ${f}`).join('\n')}`;
                    if (copiedFiles.length > 8) summary += `\n... and ${copiedFiles.length - 8} more`;
                }
                await run('npm install --no-audit --no-fund').catch(() => {});
            }

            summary += `\n\n🔖 Version: ${config.version || 'unknown'}`;

            await sock.sendMessage(chatId, {
                text: `${summary}\n\n♻️ *Restarting JAM-MD…*\n\n` +
                    `_Your session is preserved — no new pairing code needed._\n` +
                    `_Bot will be back online in a few seconds._`
            }, { quoted: message });

            await new Promise(r => setTimeout(r, 2000));
            await restartProcess();

        } catch (err) {
            console.error('Update failed:', err);
            await sock.sendMessage(chatId, {
                text: `❌ *Update failed:*\n${String(err.message || err)}`
            }, { quoted: message });
        }
    }
};
