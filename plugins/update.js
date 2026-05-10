import config from '../config.js';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Shell execution — uses Bun.$ on bun (child_process.exec hangs on wispbyte)
// ---------------------------------------------------------------------------
async function run(cmd) {
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
        exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
            resolve((stdout || '').toString());
        });
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function hasGitRepo() {
    const gitDir = path.join(process.cwd(), '.git');
    if (!fs.existsSync(gitDir)) return false;
    try { await run('git --version'); return true; }
    catch { return false; }
}

function isBun() {
    return typeof globalThis.Bun !== 'undefined';
}

function getPlatformName() {
    if (isBun()) return 'Wispbyte/Bun';
    if (fs.existsSync('/.dockerenv')) return 'Pterodactyl/Docker';
    return process.platform;
}

function getInstallCmd() {
    return isBun() ? 'bun install' : 'npm install --no-audit --no-fund';
}

// ---------------------------------------------------------------------------
// Download — uses bun's native fetch on bun, axios on Node
// ---------------------------------------------------------------------------
async function downloadFile(url, dest) {
    if (isBun()) {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'JAM-MD-Updater/1.0', 'Accept': '*/*' },
            redirect: 'follow',
        });
        if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(dest, Buffer.from(arrayBuffer));
        return;
    }
    const axios = (await import('axios')).default;
    const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 60000,
        maxRedirects: 10,
        headers: { 'User-Agent': 'JAM-MD-Updater/1.0', 'Accept': '*/*' }
    });
    await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        response.data.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', (err) => { try { file.close(() => {}); } catch {} fs.unlink(dest, () => reject(err)); });
        response.data.on('error', reject);
    });
}

// ---------------------------------------------------------------------------
// ZIP extraction
// ---------------------------------------------------------------------------
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
    throw new Error('No unzip tool found (unzip/7z/busybox). Please install unzip on your server.');
}

// ---------------------------------------------------------------------------
// File copy (preserving ignored paths)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Update strategies
// ---------------------------------------------------------------------------
async function updateViaGit() {
    const oldRev = String(await run('git rev-parse HEAD').catch(() => 'unknown')).trim();
    await run('git fetch --all --prune');
    const newRev = String(await run('git rev-parse origin/main')).trim();
    const alreadyUpToDate = oldRev === newRev;
    const commits = alreadyUpToDate ? '' : await run(`git log --pretty=format:"%h %s (%an)" ${oldRev}..${newRev}`).catch(() => '');
    const files = alreadyUpToDate ? '' : await run(`git diff --name-status ${oldRev} ${newRev}`).catch(() => '');
    await run(`git reset --hard ${newRev}`);
    await run('git clean -fd --exclude=session --exclude=data --exclude=temp');
    return { oldRev, newRev, alreadyUpToDate, commits, files };
}

async function updateViaZip(zipOverride) {
    const AUTO_ZIP_URL = 'https://github.com/jumatjai-create/jam-md/archive/refs/heads/main.zip';
    const zipUrl = (zipOverride || config.updateZipUrl || process.env.UPDATE_URL || AUTO_ZIP_URL).trim();
    const tmpDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'update.zip');
    await downloadFile(zipUrl, zipPath);
    const extractTo = path.join(tmpDir, 'update_extract');
    if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
    await extractZip(zipPath, extractTo);
    const [root] = fs.readdirSync(extractTo).map(n => path.join(extractTo, n));
    const srcRoot = fs.existsSync(root) && fs.lstatSync(root).isDirectory() ? root : extractTo;
    const ignore = ['node_modules', '.git', 'session', 'data', 'tmp', 'temp', 'baileys_store.json'];
    const copied = [];
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

async function restartProcess() {
    if (isBun()) {
        // Wispbyte: exit code 1 triggers crash detection and auto-restart.
        // exit(0) is treated as a normal stop — wispbyte will NOT restart it.
        setTimeout(() => process.exit(1), 2500);
        return;
    }
    const script = process.argv[1] || 'index.js';
    const nodeExe = process.execPath;
    const cmd = `nohup ${nodeExe} "${script}" </dev/null >>/proc/1/fd/1 2>&1 &`;
    await new Promise(resolve => {
        import('child_process').then(({ exec }) => {
            exec(cmd, { shell: '/bin/sh', env: process.env }, resolve);
        });
    });
    setTimeout(() => process.exit(0), 2000);
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------
export default {
    command: 'update',
    aliases: ['upgrade', 'restart'],
    category: 'owner',
    description: 'Update JAM-MD from GitHub and auto-restart (session preserved)',
    usage: '.update [zip_url]',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        try {
            await sock.sendMessage(chatId, {
                text: '🔄 *JAM-MD Update*\n\nChecking for updates… please wait.'
            }, { quoted: message });

            let summary = '';
            let copiedFiles;

            if (await hasGitRepo()) {
                const { oldRev, newRev, alreadyUpToDate, commits, files } = await updateViaGit();
                if (alreadyUpToDate) {
                    summary = `✅ *Already up to date!*\nCurrent revision: \`${newRev.substring(0, 7)}\``;
                } else {
                    summary = `✅ *Updated via git!*\n\n📌 Old: \`${oldRev.substring(0, 7)}\`\n📌 New: \`${newRev.substring(0, 7)}\`\n`;
                    if (commits) {
                        const lines = String(commits).split('\n').slice(0, 5);
                        summary += `\n📝 *Changes:*\n${lines.map(c => `• ${c}`).join('\n')}`;
                    }
                    if (files) {
                        const fl = String(files).split('\n');
                        summary += `\n\n📁 *Files:* ${fl.length} changed`;
                    }
                }
                await run(getInstallCmd()).catch(() => {});
            } else {
                const zipOverride = args[0] || null;
                ({ copiedFiles } = await updateViaZip(zipOverride));
                summary = `✅ *Updated from ZIP!*\n\n📁 Files updated: ${copiedFiles.length}`;
                if (copiedFiles.length > 0) {
                    const shown = copiedFiles.slice(0, 8);
                    summary += `\n${shown.map(f => `• ${f}`).join('\n')}`;
                    if (copiedFiles.length > 8) summary += `\n... and ${copiedFiles.length - 8} more`;
                }
                await run(getInstallCmd()).catch(() => {});
            }

            summary += `\n\n🔖 Version: ${config.version || 'unknown'}`;

            try {
                const dataDir = path.join(process.cwd(), 'data');
                if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
                fs.writeFileSync(
                    path.join(dataDir, 'last_update.json'),
                    JSON.stringify({
                        timestamp: new Date().toISOString(),
                        version: config.version || 'unknown',
                        filesUpdated: Array.isArray(copiedFiles) ? copiedFiles.length : '?',
                        platform: getPlatformName(),
                        stayedOnline: true,
                    }, null, 2)
                );
            } catch {}

            await sock.sendMessage(chatId, {
                text: `${summary}\n\n♻️ *Restarting JAM-MD…*\n\n_Your session is preserved — no new pairing code needed._\n_Bot will be back online in a few seconds._`
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
