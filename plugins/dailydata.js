import fs from 'fs';
import path from 'path';
import https from 'https';
import { dataFile } from '../lib/paths.js';
import store from '../lib/lightweight_store.js';
import config from '../config.js';

const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);
const DATA_FILE = dataFile('dailydata.json');

// ── Persistence ───────────────────────────────────────────────────────────────
async function loadSettings() {
    try {
        if (HAS_DB) return (await store.getSetting('global', 'dailydata')) || {};
        if (!fs.existsSync(DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch { return {}; }
}
async function saveSettings(data) {
    try {
        if (HAS_DB) return store.saveSetting('global', 'dailydata', data);
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch {}
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        try {
            const req = https.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12)' },
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
        } catch (e) { reject(e); }
    });
}
function stripTags(s) {
    return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
function parseRss(xml, limit = 3) {
    const items = [];
    for (const item of (xml.match(/<item[\s\S]*?<\/item>/gi) || [])) {
        const t = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const l = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ||
                  item.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/i);
        if (t && l) items.push({ title: stripTags(t[1]), link: l[1].trim() });
        if (items.length >= limit) break;
    }
    return items;
}
async function fetchLatestTips() {
    const out = { airtel: [], mtn: [] };
    try {
        const xml = await fetchUrl('https://www.techjaja.com/?s=airtel+mtn+uganda+free+internet&feed=rss2');
        const all = parseRss(xml, 6);
        out.airtel = all.filter(a => /airtel/i.test(a.title)).slice(0, 2);
        out.mtn    = all.filter(a => /mtn/i.test(a.title)).slice(0, 2);
        if (!out.airtel.length && !out.mtn.length) { out.airtel = all.slice(0, 2); out.mtn = all.slice(2, 4); }
    } catch {}
    return out;
}
function todaysTips() {
    const day = new Date().toLocaleDateString('en-UG', { timeZone: config.timeZone || 'Africa/Kampala', weekday: 'long' });
    const weekend = ['Saturday', 'Sunday'].includes(day);
    return [
        weekend ? '🎉 Weekend: Airtel often activates weekend data bonus — dial *185*3#' : '📅 Weekday: Airtel midnight data (12am–5am) is usually active',
        '✈️ Dial *174*7# for any active Airtel daily free MB offer',
        '🟡 Dial *165*2# to check your MTN personal offers',
        '💡 Run .airtel on your bot for free internet configs',
        '🔔 Follow @AirtelUG & @MTNUganda on X for flash promos'
    ];
}

// ── Send daily update ─────────────────────────────────────────────────────────
async function sendDailyUpdate(sock, targetJid) {
    if (!sock) return;
    try {
        const now = new Date().toLocaleDateString('en-UG', {
            timeZone: config.timeZone || 'Africa/Kampala',
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        let msg = `🌅 *Good morning! Daily Uganda Data Tips*\n📅 ${now}\n\n`;
        const tips = await fetchLatestTips();
        if (tips.airtel.length) { msg += '✈️ *Airtel Uganda — Latest*\n'; tips.airtel.forEach(a => { msg += `🔹 ${a.title}\n🔗 ${a.link}\n`; }); msg += '\n'; }
        if (tips.mtn.length)    { msg += '🟡 *MTN Uganda — Latest*\n';    tips.mtn.forEach(a   => { msg += `🔹 ${a.title}\n🔗 ${a.link}\n`; }); msg += '\n'; }
        msg += `📌 *Today's Tips*\n` + todaysTips().map(t => `• ${t}`).join('\n');
        msg += '\n\n_Use .ugtrends for more | .airtel for free internet configs_';
        await sock.sendMessage(targetJid, { text: msg });
    } catch (e) {
        console.error('[dailydata] send error:', e.message);
    }
}

// ── Scheduler — started ONLY when owner enables it (no module-level side effects) ──
let _schedulerTimer = null;
let _lastSentDate = '';

function startScheduler(sock) {
    if (_schedulerTimer) return; // already running
    _schedulerTimer = setInterval(async () => {
        try {
            const settings = await loadSettings();
            if (!settings.enabled || !settings.time || !settings.target) return;
            const now = new Date();
            const kampala = new Date(now.toLocaleString('en-US', { timeZone: config.timeZone || 'Africa/Kampala' }));
            const currentTime = `${String(kampala.getHours()).padStart(2,'0')}:${String(kampala.getMinutes()).padStart(2,'0')}`;
            const today = kampala.toDateString();
            if (currentTime === settings.time && _lastSentDate !== today) {
                _lastSentDate = today;
                await sendDailyUpdate(sock, settings.target);
            }
        } catch {}
    }, 60 * 1000);
}

// ── Command handler ───────────────────────────────────────────────────────────
export default {
    command: 'dailydata',
    aliases: ['ddaily', 'datareminder'],
    category: 'owner',
    description: 'Auto-send daily Airtel/MTN Uganda data tips every morning',
    usage: '.dailydata <on|off|time HH:MM|target|send|status>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const settings = await loadSettings();
        const sub = (args[0] || '').toLowerCase();

        if (!sub || sub === 'status') {
            return sock.sendMessage(chatId, {
                text: [
                    '📊 *Daily Data Tips — Status*',
                    '',
                    `🔘 Enabled: ${settings.enabled ? '✅ YES' : '❌ NO'}`,
                    `⏰ Time: ${settings.time || 'not set (default 08:00)'}`,
                    `📩 Target: ${settings.target ? settings.target.split('@')[0] : 'not set'}`,
                    '',
                    '*Commands:*',
                    '• `.dailydata on` — enable',
                    '• `.dailydata off` — disable',
                    '• `.dailydata time 07:30` — set time (24h, Kampala)',
                    '• `.dailydata target` — set this chat as destination',
                    '• `.dailydata send` — send now (test)',
                    '• `.dailydata status` — this message'
                ].join('\n')
            }, { quoted: message });
        }

        if (sub === 'on') {
            if (!settings.time) settings.time = '08:00';
            if (!settings.target) {
                const ownerNum = (config.ownerNumber || '').replace(/[^0-9]/g, '');
                settings.target = ownerNum ? `${ownerNum}@s.whatsapp.net` : chatId;
            }
            settings.enabled = true;
            await saveSettings(settings);
            startScheduler(sock); // safe — only starts once
            return sock.sendMessage(chatId, {
                text: `✅ *Daily Data Tips enabled!*\n⏰ Every day at *${settings.time}* (Kampala)\n📩 To: ${settings.target.split('@')[0]}\n\nUse .dailydata time HH:MM to change time.`
            }, { quoted: message });
        }

        if (sub === 'off') {
            settings.enabled = false;
            await saveSettings(settings);
            return sock.sendMessage(chatId, { text: '❌ Daily Data Tips disabled.' }, { quoted: message });
        }

        if (sub === 'time') {
            const m = (args[1] || '').match(/^(\d{1,2}):(\d{2})$/);
            if (!m) return sock.sendMessage(chatId, { text: '❌ Use 24h format: .dailydata time 07:30' }, { quoted: message });
            const hh = String(parseInt(m[1])).padStart(2,'0');
            const mm = String(parseInt(m[2])).padStart(2,'0');
            if (parseInt(hh) > 23 || parseInt(mm) > 59)
                return sock.sendMessage(chatId, { text: '❌ Invalid time.' }, { quoted: message });
            settings.time = `${hh}:${mm}`;
            await saveSettings(settings);
            return sock.sendMessage(chatId, { text: `⏰ Daily tips will be sent at *${settings.time}* Kampala time.` }, { quoted: message });
        }

        if (sub === 'target') {
            settings.target = chatId;
            await saveSettings(settings);
            return sock.sendMessage(chatId, { text: `📩 Daily tips will now be sent to this chat.` }, { quoted: message });
        }

        if (sub === 'send') {
            const target = settings.target || chatId;
            await sock.sendMessage(chatId, { text: '⏳ Fetching and sending daily tips now...' }, { quoted: message });
            await sendDailyUpdate(sock, target);
            if (target !== chatId) await sock.sendMessage(chatId, { text: `✅ Sent to ${target.split('@')[0]}` });
            return;
        }

        return sock.sendMessage(chatId, { text: '❓ Unknown option. Use .dailydata status to see commands.' }, { quoted: message });
    }
};
