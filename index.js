import 'dotenv/config';
// Bun WebSocket compatibility shim — must run before Baileys is imported
import './lib/bun-ws-polyfill.js';

import fs, { existsSync, mkdirSync, rmSync } from 'fs';
import path, { dirname } from 'path';
import chalk from 'chalk';
import { parsePhoneNumber as PhoneNumber } from 'awesome-phonenumber';
import readline from 'readline';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { smsg } from './lib/myfunc.js';
import { ugaNow } from './lib/ugaTime.js';
import { compileAll } from './lib/compile.js';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, jidDecode, jidNormalizedUser, makeCacheableSignalKeyStore, delay } from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import pino from 'pino';
import config from './config.js';
import store from './lib/lightweight_store.js';
import SaveCreds from './lib/session.js';
import { autoBackupSession } from './lib/sessionBackup.js';
import { server, PORT, setSocket, setPairingCode, startKeepAlive } from './lib/server.js';
import { printLog } from './lib/print.js';
import { writeErrorLog } from './lib/logger.js';
import { getBackoffDelay, recordRestart, startMemoryWatchdog } from './lib/guardian.js';
import { handleMessages, handleGroupParticipantUpdate, handleStatus, handleCall } from './lib/messageHandler.js';
import commandHandler from './lib/commandHandler.js';
store.readFromFile();
setInterval(() => store.writeToFile(), config.storeWriteInterval || 10000);
setInterval(() => {
    if (global.gc) {
        global.gc();
        console.log('🧹 Garbage collection completed');
    }
}, 60000);
// Memory watchdog delegated to guardian (checks every 60s, warns at 600MB, exits at 900MB)
startMemoryWatchdog({ warnMB: 600, exitMB: 900, log: printLog });
const phoneNumber = config.pairingNumber || config.ownerNumber || "256765309986";
const DATA_DEFAULTS = {
    'owner.json': [],
    'banned.json': [],
    'premium.json': [],
    'warnings.json': {},
    'notes.json': {},
    'autoAi.json': {},
    'messageCount.json': { isPublic: true, messageCount: {} },
    'userGroupData.json': { users: [], groups: [], antilink: {}, antibadword: {}, warnings: {}, sudo: [], welcome: {}, goodbye: {}, chatbot: {}, autoReaction: false },
    'autoStatus.json': { enabled: false },
    'autoread.json': { enabled: false },
    'autotyping.json': { enabled: false },
    'pmblocker.json': { enabled: false },
    'anticall.json': { enabled: false },
    'stealthMode.json': { enabled: false },
    'autoBio.json': { enabled: false, customBio: null },
    'autoReaction.json': { enabled: false },
    'antidelete.json': { enabled: false },
    'antilink.json': {},
    'antibadword.json': {},
};
fs.mkdirSync('./data', { recursive: true });
for (const [file, def] of Object.entries(DATA_DEFAULTS)) {
    const fp = `./data/${file}`;
    if (!fs.existsSync(fp))
        fs.writeFileSync(fp, JSON.stringify(def, null, 2));
}
let owner = [];
try {
    owner = JSON.parse(fs.readFileSync('./data/owner.json', 'utf-8'));
}
catch {
    owner = [];
}
global.botname = config.botName || "JAM-MD";
global.themeemoji = "•";
const pairingCode = !process.argv.includes("--qr-code");
const useMobile = process.argv.includes("--mobile");
let rl = null;
let rlClosed = false;
if (process.stdin.isTTY && !config.pairingNumber) {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.on('close', () => { rlClosed = true; });
}
const question = (text) => {
    if (rl && !rlClosed) {
        return new Promise((resolve) => rl.question(text, resolve));
    }
    else {
        return Promise.resolve(config.ownerNumber || phoneNumber);
    }
};
process.on('exit', () => {
    if (rl && !rlClosed)
        rl.close();
});
process.on('SIGINT', () => {
    if (rl && !rlClosed)
        rl.close();
    // On Wispbyte (non-TTY), SIGINT is sent by the platform for container management.
    // Ignore it and stay alive — SIGKILL will force-stop if truly needed.
    // Only exit on SIGINT when running interactively (local dev with a real terminal).
    if (process.stdin.isTTY) {
        process.exit(0);
    } else {
        printLog('warning', '[system] SIGINT received in non-TTY mode — ignoring (Wispbyte management signal)');
    }
});
process.on('SIGTERM', () => {
    // Do NOT exit on SIGTERM — this was causing Wispbyte to restart the bot on any signal.
    // If Wispbyte really needs the process gone it sends SIGKILL (which can't be caught).
    printLog('warning', '[system] SIGTERM received — staying alive (SIGKILL will force stop if needed)');
});
function ensureSessionDirectory() {
    const sessionPath = path.join(__dirname, 'session');
    if (!existsSync(sessionPath)) {
        mkdirSync(sessionPath, { recursive: true });
    }
    return sessionPath;
}
function hasValidSession() {
    try {
        const credsPath = path.join(__dirname, 'session', 'creds.json');
        if (!existsSync(credsPath))
            return false;
        const fileContent = fs.readFileSync(credsPath, 'utf8');
        if (!fileContent || fileContent.trim().length === 0) {
            printLog('warning', 'creds.json exists but is empty');
            return false;
        }
        try {
            const creds = JSON.parse(fileContent);
            if (!creds.noiseKey || !creds.signedIdentityKey || !creds.signedPreKey) {
                printLog('warning', 'creds.json is missing required fields');
                return false;
            }
            if (creds.registered === false) {
                printLog('warning', 'Session not registered. Clearing for fresh pairing...');
                try {
                    rmSync(path.join(__dirname, 'session'), { recursive: true, force: true });
                }
                catch (_e) { }
                return false;
            }
            printLog('success', 'Valid and registered session credentials found');
            return true;
        }
        catch (_parseError) {
            printLog('warning', 'creds.json contains invalid JSON');
            return false;
        }
    }
    catch (error) {
        printLog('error', `Error checking session validity: ${error.message}`);
        return false;
    }
}
async function initializeSession() {
    ensureSessionDirectory();
    const txt = config.sessionId;
    if (!txt) {
        if (hasValidSession()) {
            printLog('success', 'Existing session found. Using saved credentials');
            return true;
        }
        return false;
    }
    if (hasValidSession())
        return true;
    try {
        await SaveCreds(txt);
        await delay(2000);
        if (hasValidSession()) {
            printLog('success', 'Session file verified and valid');
            await delay(1000);
            return true;
        }
        else {
            printLog('error', 'Session file not valid after download');
            return false;
        }
    }
    catch (error) {
        printLog('error', `Error downloading session: ${error.message}`);
        return false;
    }
}

// ─── Bot instance mutex ─────────────────────────────────────────────────────
// CRITICAL: Only ONE startJamBot() may run at a time.
// Without this flag, the watchdog + disconnect handler + uncaughtException
// all call startJamBot() simultaneously → multiple WhatsApp sockets
// competing for the same session → CPU spikes to 60%+ → Wispbyte kills it.
let _botStarting = false;

// ─── Connection health watchdog (guardian-powered) ──────────────────────────
// If the bot has been offline for more than 3 minutes, force a reconnect.
// Uses guardian's exponential backoff so rapid failures don't loop endlessly.
let _lastConnectedTime = Date.now();
let _isWatchdogReconnecting = false;

function markConnected() {
    _lastConnectedTime = Date.now();
    _isWatchdogReconnecting = false;
}

setInterval(() => {
    if (process.uptime() < 90) return;
    const offlineMs = Date.now() - _lastConnectedTime;
    if (offlineMs > 3 * 60 * 1000 && !_isWatchdogReconnecting && !_botStarting) {
        _isWatchdogReconnecting = true;
        printLog('warning', `[watchdog] Offline ${Math.round(offlineMs / 60000)}min — forcing reconnect...`);
        setTimeout(() => {
            startJamBot().then(() => {
                _isWatchdogReconnecting = false;
            }).catch(e => {
                printLog('error', `[watchdog] Reconnect failed: ${e.message}`);
                _isWatchdogReconnecting = false;
                _botStarting = false;
            });
        }, 5000);
    }
}, 30 * 1000);

server.listen(PORT, () => {
    printLog('success', `Server listening on port ${PORT}`);
    // Keep-alive: auto-detects public URL from incoming request Host headers.
    // No env var needed — works on Wispbyte out of the box.
    startKeepAlive();
});

async function startJamBot() {
    // Mutex: reject concurrent calls — only one instance allowed at a time
    if (_botStarting) {
        printLog('warning', '[mutex] startJamBot() skipped — already starting. Ignoring duplicate call.');
        return;
    }
    _botStarting = true;
    try {
        const { version } = await fetchLatestBaileysVersion();
        ensureSessionDirectory();
        await delay(1000);
        const { state, saveCreds } = await useMultiFileAuthState(`./session`);
        const _saveCreds = async () => {
            ensureSessionDirectory();
            await saveCreds();
        };
        const msgRetryCounterCache = new NodeCache();
        const ghostMode = await store.getSetting('global', 'stealthMode');
        const isGhostActive = ghostMode && ghostMode.enabled;
        const JamBot = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Chrome'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: !isGhostActive,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                const jid = jidNormalizedUser(key.remoteJid);
                const msg = await store.loadMessage(jid, key.id);
                return msg?.message || "";
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        });
        JamBot.store = store;
        setSocket(JamBot);
        const originalSendPresenceUpdate = JamBot.sendPresenceUpdate;
        const originalReadMessages = JamBot.readMessages;
        const originalSendReceipt = JamBot.sendReceipt;
        JamBot.sendPresenceUpdate = async function (...args) {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (ghostMode && ghostMode.enabled) {
                printLog('info', '👻 Blocked presence update (stealth mode)');
                return;
            }
            return originalSendPresenceUpdate.apply(this, args);
        };
        JamBot.readMessages = async function (...args) {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (ghostMode && ghostMode.enabled)
                return;
            return originalReadMessages.apply(this, args);
        };
        if (originalSendReceipt) {
            JamBot.sendReceipt = async function (...args) {
                const ghostMode = await store.getSetting('global', 'stealthMode');
                if (ghostMode && ghostMode.enabled)
                    return;
                return originalSendReceipt.apply(this, args);
            };
        }
        const originalQuery = JamBot.query;
        JamBot.query = async function (node, ...args) {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (ghostMode && ghostMode.enabled) {
                if (node && node.tag === 'receipt')
                    return;
                if (node && node.attrs && (node.attrs.type === 'read' || node.attrs.type === 'read-self'))
                    return;
            }
            return originalQuery.apply(this, [node, ...args]);
        };
        JamBot.isGhostMode = async () => {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            return ghostMode && ghostMode.enabled;
        };
        JamBot.ev.on('creds.update', _saveCreds);
        store.bind(JamBot.ev);
        JamBot.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message)
                    return;
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage')
                    ? mek.message.ephemeralMessage.message
                    : mek.message;
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(JamBot, chatUpdate);
                    return;
                }
                if (!JamBot.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us');
                    if (!isGroup)
                        return;
                }
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16)
                    return;
                if (JamBot?.msgRetryCounterCache) {
                    JamBot.msgRetryCounterCache.clear();
                }
                try {
                    await handleMessages(JamBot, chatUpdate);
                }
                catch (err) {
                    printLog('error', `Error in handleMessages: ${err.message}`);
                    if (mek.key && mek.key.remoteJid) {
                        await JamBot.sendMessage(mek.key.remoteJid, {
                            text: '❌ An error occurred while processing your message.'
                        }).catch(console.error);
                    }
                }
            }
            catch (err) {
                printLog('error', `Error in messages.upsert: ${err.message}`);
            }
        });
        JamBot.decodeJid = (jid) => {
            if (!jid)
                return jid;
            if (/:\d+@/gi.test(jid)) {
                const decode = jidDecode(jid) || {};
                return decode.user && decode.server && `${decode.user}@${decode.server}` || jid;
            }
            else
                return jid;
        };
        JamBot.ev.on('contacts.update', (update) => {
            for (const contact of update) {
                const id = JamBot.decodeJid(contact.id);
                if (store && store.contacts)
                    store.contacts[id] = { id, name: contact.notify };
            }
        });
        JamBot.getName = (jid, withoutContact = false) => {
            const id = JamBot.decodeJid(jid);
            withoutContact = JamBot.withoutContact || withoutContact;
            let v;
            if (id.endsWith("@g.us"))
                return new Promise(async (resolve) => {
                    v = store.contacts[id] || {};
                    if (!(v.name || v.subject))
                        v = JamBot.groupMetadata(id) || {};
                    resolve(v.name || v.subject || PhoneNumber(`+${id.replace('@s.whatsapp.net', '')}`).number?.international);
                });
            else
                v = id === '0@s.whatsapp.net' ? {
                    id,
                    name: 'WhatsApp'
                } : id === JamBot.decodeJid(JamBot.user.id) ?
                    JamBot.user :
                    (store.contacts[id] || {});
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber(`+${jid.replace('@s.whatsapp.net', '')}`).number?.international;
        };
        JamBot.public = true;
        JamBot.serializeM = (m) => smsg(JamBot, m, store);
        const isRegistered = state.creds?.registered === true;
        if (pairingCode && !isRegistered) {
            if (useMobile)
                throw new Error('Cannot use pairing code with mobile api');
            let phoneNumberInput;
            if (config.pairingNumber) {
                phoneNumberInput = config.pairingNumber;
            }
            else if (process.env.PAIRING_NUMBER) {
                phoneNumberInput = process.env.PAIRING_NUMBER;
            }
            else if (rl && !rlClosed) {
                phoneNumberInput = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 256765309986 (without + or spaces) : `)));
            }
            else {
                const domain = process.env.APP_URL ||
                    process.env.RAILWAY_PUBLIC_DOMAIN ||
                    process.env.RAILWAY_STATIC_URL ||
                    process.env.RENDER_EXTERNAL_URL ||
                    process.env.WISPBYTE_URL ||
                    `localhost:${PORT}`;
                const pairUrl = domain.startsWith('http') ? `${domain}/pair` : `https://${domain}/pair`;
                printLog('info', `No PAIRING_NUMBER set. Open ${pairUrl} in your browser to pair.`);
                printLog('info', `Or set the PAIRING_NUMBER environment variable and restart.`);
                if (rl && !rlClosed) { rl.close(); rl = null; }
                setTimeout(() => startJamBot(), 30000);
                return;
            }
            phoneNumberInput = phoneNumberInput.replace(/[^0-9]/g, '');
            const pn = PhoneNumber(`+${phoneNumberInput}`);
            if (!pn.valid) {
                printLog('error', `Invalid phone number format: "${phoneNumberInput}". Must be digits only, e.g. 2348012345678`);
                if (rl && !rlClosed)
                    rl.close();
                const domain = process.env.APP_URL ||
                    process.env.RAILWAY_PUBLIC_DOMAIN ||
                    process.env.RAILWAY_STATIC_URL ||
                    process.env.RENDER_EXTERNAL_URL ||
                    process.env.WISPBYTE_URL ||
                    `localhost:${PORT}`;
                const pairUrl = domain.startsWith('http') ? `${domain}/pair` : `https://${domain}/pair`;
                printLog('info', `Falling back to web UI pairing. Open ${pairUrl} in your browser.`);
                setTimeout(() => startJamBot(), 30000);
                return;
            }
            const doPairing = async (num, attempt = 1) => {
                try {
                    let code = await JamBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    setPairingCode(code);
                    const domain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL || `localhost:${PORT}`;
                    const pairUrl = domain.startsWith('http') ? `${domain}/pair` : `https://${domain}/pair`;
                    printLog('info', `╔══════════════════════════════╗`);
                    printLog('info', `║  PAIRING CODE: ${code}  ║`);
                    printLog('info', `╚══════════════════════════════╝`);
                    printLog('info', `Enter this code in WhatsApp → Linked Devices → Link with phone number`);
                    printLog('info', `Or open ${pairUrl} in your browser to see it`);
                    if (rl && !rlClosed) {
                        rl.close();
                        rl = null;
                    }
                }
                catch (error) {
                    if (attempt < 3) {
                        try {
                            rmSync('./session', { recursive: true, force: true });
                        }
                        catch (_e) { }
                        await delay(3000);
                        startJamBot();
                    }
                    else {
                        printLog('error', 'All 3 pairing attempts failed. Please restart manually.');
                    }
                }
            };
            setTimeout(() => doPairing(phoneNumberInput), 3000);
        }
        else if (isRegistered) {
            if (rl && !rlClosed) {
                rl.close();
                rl = null;
            }
        }
        else {
            printLog('warning', 'Waiting for connection to establish...');
            if (rl && !rlClosed) {
                rl.close();
                rl = null;
            }
        }
        JamBot.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s;
            if (qr) {
                if (!pairingCode) {
                    try {
                        console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
                    }
                    catch (_e) {
                        console.log('QR:', qr);
                    }
                }
            }
            if (connection === "open") {
                _botStarting = false; // release mutex — bot is fully up
                markConnected();
                printLog('success', 'Bot connected successfully!');
                setSocket(JamBot);
                autoBackupSession().catch(e => printLog('warning', 'Session backup: ' + e.message));
                try {
                    const setbioModule = await import('./plugins/setbio.js');
                    const startAutoBio = setbioModule.startAutoBio || setbioModule.default?.startAutoBio;
                    if (typeof startAutoBio === 'function')
                        startAutoBio(JamBot);
                }
                catch (e) {
                    printLog('error', `Failed to start auto bio: ${e.message}`);
                }
                const ghostMode = await store.getSetting('global', 'stealthMode');
                if (ghostMode && ghostMode.enabled) {
                    printLog('info', '👻 STEALTH MODE ACTIVE');
                }
                printLog('success', `Connected to => ${JSON.stringify(JamBot.user, null, 2)}`);
                try {
                    const botNumber = `${JamBot.user.id.split(':')[0]}@s.whatsapp.net`;
                    const ghostStatus = (ghostMode && ghostMode.enabled) ? '\n👻 Stealth Mode: ACTIVE' : '';
                    await JamBot.sendMessage(botNumber, {
                        text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${ugaNow()} (EAT)\n✅ Status: Online and Ready!${ghostStatus}\n\n`
                    });
                }
                catch (error) {
                    printLog('error', `Failed to send connection message: ${error.message}`);
                }
                await delay(1999);
                try {
                    owner = JSON.parse(fs.readFileSync('./data/owner.json', 'utf-8'));
                }
                catch (_e) { }
                printLog('info', `[ ${config.botName || 'JAM-MD'} ]`);
                printLog('info', `WA NUMBER  : ${owner[0] || config.ownerNumber || ''}`);
                printLog('success', `Bot Connected Successfully!`);
                printLog('info', `Plugins   : ${commandHandler.commands.size}`);
                printLog('info', `Prefixes   : ${config.prefixes.join(', ')}`);
                printLog('store', `Backend    : ${store.getStats().backend}`);
                console.log();
            }
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;

                // ── Only delete session for a CONFIRMED WhatsApp logout. ────────────────
                // A temporary 401 from a network outage must NOT wipe the session —
                // that would force manual re-pairing every time the user's internet drops.
                // DisconnectReason.loggedOut === 515 in newer Baileys (was 401 in old).
                // We check BOTH to be safe, and also look at the error message.
                const errMsg = lastDisconnect?.error?.message || '';
                const isRealLogout = statusCode === DisconnectReason.loggedOut
                    || errMsg.toLowerCase().includes('logged out')
                    || errMsg.toLowerCase().includes('log out');

                if (isRealLogout) {
                    printLog('warning', '[reconnect] Confirmed logout by WhatsApp — clearing session and restarting pairing...');
                    try { rmSync('./session', { recursive: true, force: true }); } catch {}
                    _botStarting = false; // release mutex before restart
                    await delay(3000);
                    startJamBot();
                    return;
                }

                // Release mutex before reconnecting so the new call is allowed
                _botStarting = false;
                const reconnectDelaySec = Math.min(5 + Math.floor(Math.random() * 10), 15);
                printLog('connection', `[reconnect] Disconnected (code ${statusCode}) — retrying in ${reconnectDelaySec}s...`);
                // Clean up old socket to prevent memory leaks from accumulated listeners
                try { JamBot.ev.removeAllListeners(); } catch {}
                try { JamBot.ws?.close?.(); } catch {}
                await delay(reconnectDelaySec * 1000);
                startJamBot();
            }
        });
        JamBot.ev.on('call', async (calls) => {
            await handleCall(JamBot, calls);
        });
        JamBot.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(JamBot, update);
        });
        JamBot.ev.on('status.update', async (status) => {
            await handleStatus(JamBot, status);
        });
        JamBot.ev.on('messages.reaction', async (reaction) => {
            await handleStatus(JamBot, reaction);
        });
        return JamBot;
    }
    catch (error) {
        printLog('error', `Error in startJamBot: ${error.message}`);
        if (rl && !rlClosed) {
            rl.close();
            rl = null;
        }
        _botStarting = false; // release mutex so retry is allowed
        await delay(5000);
        startJamBot();
    }
}
async function main() {
    await compileAll();
    await commandHandler.loadCommands();
    printLog('info', 'Starting JAM-MD BOT...');
    await initializeSession();
    await delay(3000);
    startJamBot().catch((error) => {
        printLog('error', `Fatal error: ${error.message} — retrying in 10s`);
        if (rl && !rlClosed) { rl.close(); rl = null; }
        setTimeout(() => startJamBot().catch(() => {}), 10000);
    });
}
main();
// Session folder is intentionally NOT cleaned up automatically.
// Baileys manages its own session files — any deletion risks losing the
// WhatsApp connection and forcing a full re-pair. Leave all session files alone.
// Temp folder setup
const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp))
    fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;
// Temp folder cleanup
setInterval(() => {
    fs.readdir(customTemp, (err, files) => {
        if (err)
            return;
        for (const file of files) {
            const filePath = path.join(customTemp, file);
            fs.stat(filePath, (err, stats) => {
                if (!err && Date.now() - stats.mtimeMs > 3 * 60 * 60 * 1000) {
                    fs.unlink(filePath, () => { });
                }
            });
        }
    });
}, 1 * 60 * 60 * 1000);
// Syntax check removed — reading/checking all 280 plugins on every restart
// caused a massive CPU spike that made Wispbyte mark the server as offline.
// Plugin syntax errors surface naturally at runtime when commands are loaded.
// Error handlers — log but keep the process alive; Bun/Wispbyte will restart on fatal exit
process.on('uncaughtException', (err) => {
    // Ignore known harmless Baileys noise
    const msg = err?.message || '';
    if (msg.includes('Cannot read properties of undefined') && msg.includes('message')) return;
    if (msg.includes('write EPIPE') || msg.includes('read ECONNRESET')) return;

    printLog('error', `Uncaught Exception: ${msg}`);
    console.error(err.stack);
    writeErrorLog({ type: 'uncaughtException', error: msg, stack: err.stack, timestamp: new Date().toISOString() });

    // Only restart if not already starting — mutex prevents CPU-spike loops
    if (_botStarting) return;
    const backoff = getBackoffDelay();
    recordRestart();
    printLog('warning', `[guardian] Recovering from crash in ${backoff / 1000}s...`);
    setTimeout(() => startJamBot().catch(() => {}), backoff);
});
process.on('unhandledRejection', (err) => {
    if (!err) return;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    printLog('error', `Unhandled Rejection: ${message}`);
    if (stack) console.error(stack);
    writeErrorLog({
        type: 'unhandledRejection',
        error: message,
        stack,
        timestamp: new Date().toISOString()
    });
});
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        printLog('error', `Address localhost:${PORT} in use`);
        writeErrorLog({
            type: 'serverError',
            error: `Address localhost:${PORT} in use`,
            timestamp: new Date().toISOString()
        });
        server.close();
    }
    else {
        printLog('error', `Server error: ${error.message}`);
        writeErrorLog({
            type: 'serverError',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
});
