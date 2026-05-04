import fs from 'fs';
import path from 'path';
import { dataFile } from './paths.js';
import { printLog } from './print.js';

const TRACKER_FILE = dataFile('forward_tracker.json');
const MAX_ENTRIES = 5000;
const MAX_SENDERS_PER_ENTRY = 100;

function ensureDataDir() {
    const dir = path.dirname(TRACKER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readTracker() {
    try {
        if (fs.existsSync(TRACKER_FILE)) return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf-8'));
    } catch (_e) {}
    return {};
}

function writeTracker(data) {
    try {
        ensureDataDir();
        const entries = Object.entries(data);
        if (entries.length > MAX_ENTRIES) {
            entries.sort((a, b) => (a[1].firstSeenAt || 0) - (b[1].firstSeenAt || 0));
            data = Object.fromEntries(entries.slice(entries.length - MAX_ENTRIES));
        }
        fs.writeFileSync(TRACKER_FILE, JSON.stringify(data));
    } catch (e) {
        printLog('warning', 'forwardTracker write: ' + e.message);
    }
}

const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];

export function getMediaInfo(msg) {
    for (const type of MEDIA_TYPES) {
        const m = msg?.message?.[type];
        if (m?.fileSha256) {
            const raw = m.fileSha256;
            let buf;
            try {
                buf = Buffer.isBuffer(raw) ? raw : Buffer.from(Object.values(raw));
            } catch (_e) { continue; }
            const hash = buf.toString('hex').substring(0, 40);
            if (hash.length < 8) continue;
            return {
                hash,
                mediaType: type.replace('Message', ''),
                caption: (m.caption || '').substring(0, 120),
                isForwarded: !!(m.contextInfo?.isForwarded || (m.contextInfo?.forwardingScore || 0) > 0)
            };
        }
    }
    return null;
}

export function getMediaHash(msg) {
    return getMediaInfo(msg)?.hash || null;
}

export function trackForwardedMessage(message, senderId, pushName, chatId, isGroup) {
    try {
        const info = getMediaInfo(message);
        if (!info) return;
        const { hash, mediaType, caption } = info;
        const senderNum = senderId.split('@')[0];
        const timestamp = (Number(message.messageTimestamp) * 1000) || Date.now();
        const tracker = readTracker();
        if (!tracker[hash]) {
            tracker[hash] = { mediaType, caption, firstSeenAt: timestamp, senders: [] };
        }
        const entry = tracker[hash];
        const alreadySent = entry.senders.some(s => s.num === senderNum);
        if (!alreadySent && entry.senders.length < MAX_SENDERS_PER_ENTRY) {
            entry.senders.push({
                num: senderNum,
                name: pushName || senderNum,
                sentAt: timestamp,
                chatId,
                isGroup: !!isGroup
            });
        }
        writeTracker(tracker);
    } catch (e) {
        printLog('warning', 'forwardTracker: ' + e.message);
    }
}

export function getTrackEntry(hash) {
    return readTracker()[hash] || null;
}

export function getTrackerStats() {
    const tracker = readTracker();
    const entries = Object.values(tracker);
    const sorted = [...entries].sort((a, b) => b.senders.length - a.senders.length);
    return { total: entries.length, topEntries: sorted.slice(0, 5) };
}
