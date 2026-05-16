import fs from 'fs';
import path from 'path';
import https from 'https';
import { dataFile } from '../lib/paths.js';
import store from '../lib/lightweight_store.js';
import config from '../config.js';

const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);
const DATA_FILE = dataFile('dailydata.json');

// ── Shared socket reference (set by the bot on connect) ──────────────────────
let _sock = null;
export function setDailyDataSocket(sock) { _sock = sock; }

// ── Persistence ───────────────────────────────────────────────────────────────
async function loadSettings() {
    try {
        if (HAS_DB) return await store.getSetting('global', 'dailydata') || {};
        if (!fs.existsSync(DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch { return {}; }
}
async function saveSettings(data) {
    if (HAS_DB) return store.saveSetting('global', 'dailydata', data);
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Fetch helpers (same as ugtrends) ─────────────────────────────────────────
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36' },
            timeout: 10000
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}
function stripTags(s) {
    return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
function parseRss(xml, limit = 3) {
    const items = [];
    for (const item of (xml.match(/<item[\s\S]*?<\/item>/gi) || [])) {
        const title = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const link  = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ||
                      item.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/i);
        if (title && link) {
            items.push({ title: stripTags(title[1]), link: link[1].trim() });
        }
        if (items.length >= limit) break;
    }
    return items;
}

async function fetchLatestTips() {
    const results = { airtel: [], mtn: [] };
    try {
        const xml = await fetchUrl('https://www.techjaja.com/?s=airtel+mtn+uganda+free+internet&feed=rss2');
        const all = parseRss(xml, 6);
        results.airtel = all.filter(a => /airtel/i.test(a.title)).slice(0, 2);
        results.mtn    = all.filter(a => /mtn/i.test(a.title)).slice(0, 2);
        if (results.airtel.length + results.mtn.length === 0) {
            results.airtel = all.slice(0, 2);
            results.mtn    = all.slice(2, 4);
        }
    } catch { /* fallback to static tips */ }
    return results;
}

function todaysTips() {
    const day = new Date().toLocaleDateString('en-UG', { timeZone: config.timeZone || 'Africa/Kampala', weekday: 'long' });
    const isWeekend = ['Saturday', 'Sunday'].includes(day);
    return [
        isWeekend
            ? '🎉 Weekend special: Airtel often activates *weekend data bonus* — dial *185*3# to check'
            : '📅 Weekday tip: Airtel midnight data (12am–5am) is usually active — browse during this window',
        '✈️ Dial *174*7# for any active Airtel daily free MB offer',
        '🟡 Dial *165*2# to check your MTN personal offers',
        '💡 Always test `.airtel` command — your Cloudflare Worker gives unlimited data when bug host matches',
        '🔔 Follow @AirtelUG & @MTNUganda on X/Twitter for flash data promos'
    ];
}

// ── Build and send the daily message ─────────────────────────────────────────
async function sendDailyUpdate(targetJid) {
    if (!_sock) return;
    const now = new Date().toLocaleDateString('en-UG', {
        timeZone: config.timeZone || 'Africa/Kampala',
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    let msg = `🌅 *Good morning! Daily Uganda Data Tips*\n📅 ${now}\n\n`;

    // Fetch latest articles
    const tips = await fetchLatestTips();

    if (tips.airtel.length > 0) {
        msg += '✈️ *Airtel Uganda — Latest*\n';
        tips.airtel.forEach(a => { msg += `🔹 ${a.title}\n🔗 ${a.link}\n`; });
        msg += '\n';
    }
    if (tips.mtn.length > 0) {
        msg += '🟡 *MTN Uganda — Latest*\n';
        tips.mtn.forEach(a => { msg += `🔹 ${a.title}\n🔗 ${a.link}\n`; });
        msg += '\n';
    }

    msg += `📌 *Today\'s Tips*\n` + todaysTips().map(t => `• ${t}`).join('\n');
    msg += '\n\n_Use `.ugtrends` for more | `.airtel` for free internet configs_';

    try {
        await _sock.sendMessage(targetJid, { text: msg });
    } catch (e) {
        console.error('[dailydata] send error:', e.message);
    }
}

// ── Scheduler — checks every minute ──────────────────────────────────────────
let _lastSentDate = '';

async function schedulerTick() {
    const settings = await loadSettings();
    if (!settings.enabled || !settings.time || !settings.target) return;

    const now = new Date();
    const kampala = new Date(now.toLocaleString('en-US', { timeZone: config.timeZone || 'Africa/Kampala' }));
    const hh = String(kampala.getHours()).padStart(2, '0');
    const mm = String(kampala.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    const today = kampala.toDateString();

    if (currentTime === settings.time && _lastSentDate !== today) {
        _lastSentDate = today;
        await sendDailyUpdate(settings.target);
    }
}

// Start ticking every 60 seconds
setInterval(schedulerTick, 60 * 1000);

// ── Command handler ───────────────────────────────────────────────────────────
export default {
    command: 'dailydata',
    aliases: ['ddaily', 'datareminder'],
    category: 'owner',
    description: 'Get daily Airtel/MTN Uganda data tips sent automatically every morning',
    usage: '.dailydata <on|off|time HH:MM|target|status>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        // Keep socket reference fresh
        _sock = sock;

        const chatId = context.chatId || message.key.remoteJid;
        const settings = await loadSettings();
        const sub = (args[0] || '').toLowerCase();

        // ── STATUS ─────────────────────────────────────────────────────────
        if (!sub || sub === 'status') {
            return sock.sendMessage(chatId, {
                text: [
                    '📊 *Daily Data Tips — Status*',
                    '',
                    `🔘 Enabled: ${settings.enabled ? '✅ YES' : '❌ NO'}`,
                    `⏰ Time: ${settings.time || 'not set (default 08:00)'}`,
                    `📩 Target: ${settings.target ? settings.target.split('@')[0] : 'not set (defaults to your number)'}`,
                    '',
                    '*Commands:*',
                    '• `.dailydata on` — enable',
                    '• `.dailydata off` — disable',
                    '• `.dailydata time 07:30` — set send time (24h, Kampala time)',
                    '• `.dailydata target` — send to this chat',
                    '• `.dailydata send` — send now (test)',
                    '• `.dailydata status` — this message'
                ].join('\n')
            }, { quoted: message });
        }

        // ── ON ─────────────────────────────────────────────────────────────
        if (sub === 'on') {
            if (!settings.time) settings.time = '08:00';
            if (!settings.target) {
                const ownerNum = (config.ownerNumber || '').replace(/[^0-9]/g, '');
                settings.target = ownerNum ? `${ownerNum}@s.whatsapp.net` : chatId;
            }
            settings.enabled = true;
            await saveSettings(settings);
            return sock.sendMessage(chatId, {
                text: `✅ *Daily Data Tips enabled!*\n⏰ Every day at *${settings.time}* (Kampala time)\n📩 Sending to: ${settings.target.split('@')[0]}\n\nUse \`.dailydata time HH:MM\` to change the time.`
            }, { quoted: message });
        }

        // ── OFF ────────────────────────────────────────────────────────────
        if (sub === 'off') {
            settings.enabled = false;
            await saveSettings(settings);
            return sock.sendMessage(chatId, {
                text: '❌ Daily Data Tips disabled.'
            }, { quoted: message });
        }

        // ── TIME ───────────────────────────────────────────────────────────
        if (sub === 'time') {
            const timeInput = args[1] || '';
            const match = timeInput.match(/^(\d{1,2}):(\d{2})$/);
            if (!match) {
                return sock.sendMessage(chatId, {
                    text: '❌ Invalid time format.\nUse 24h format: `.dailydata time 07:30`'
                }, { quoted: message });
            }
            const hh = String(parseInt(match[1])).padStart(2, '0');
            const mm = String(parseInt(match[2])).padStart(2, '0');
            if (parseInt(hh) > 23 || parseInt(mm) > 59) {
                return sock.sendMessage(chatId, { text: '❌ Invalid time. Hours 0-23, minutes 0-59.' }, { quoted: message });
            }
            settings.time = `${hh}:${mm}`;
            await saveSettings(settings);
            return sock.sendMessage(chatId, {
                text: `⏰ Daily data tips will now be sent at *${settings.time}* Kampala time.`
            }, { quoted: message });
        }

        // ── TARGET ─────────────────────────────────────────────────────────
        if (sub === 'target') {
            settings.target = chatId;
            await saveSettings(settings);
            return sock.sendMessage(chatId, {
                text: `📩 Daily tips will now be sent to *this chat*.\nChat ID: ${chatId}`
            }, { quoted: message });
        }

        // ── SEND NOW (test) ────────────────────────────────────────────────
        if (sub === 'send') {
            const target = settings.target || chatId;
            await sock.sendMessage(chatId, { text: '⏳ Fetching and sending daily tips now...' }, { quoted: message });
            await sendDailyUpdate(target);
            if (target !== chatId) {
                await sock.sendMessage(chatId, { text: `✅ Sent to ${target.split('@')[0]}` });
            }
            return;
        }

        return sock.sendMessage(chatId, {
            text: '❓ Unknown option. Use `.dailydata status` to see all commands.'
        }, { quoted: message });
    }
};
