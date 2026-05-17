import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const EFFECTS_MENU = `🎧 *Audio Effects (AudioFX)*
━━━━━━━━━━━━━━━━━━━
• *bass*      — Heavy bass boost
• *blown*     — Distorted / blown speaker
• *deep*      — Deep low pitch voice
• *earrape*   — Extremely loud
• *fast*      — Speed up
• *fat*       — Phat bass + slow
• *nightcore* — Anime / nightcore style
• *reverse*   — Play backwards
• *robot*     — Robot voice
• *slow*      — Slow down
• *chipmunk*  — High-pitched chipmunk

━━━━━━━━━━━━━━━━━━━
📌 *How to use:*
Reply to a voice note / audio with:
_.audiofx bass_   or just   _.bass_`;

const FILTERS = {
    bass:      'equalizer=f=94:width_type=o:width=2:g=30',
    blown:     'acrusher=.1:1:64:0:log',
    deep:      'asetrate=29700,aresample=44100',
    earrape:   'volume=12',
    fast:      'atempo=1.63',
    fat:       'equalizer=f=60:width_type=o:width=2:g=15,atempo=0.85',
    nightcore: 'asetrate=52920,aresample=44100',
    reverse:   'areverse',
    robot:     "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)'",
    slow:      'atempo=0.7',
    chipmunk:  'asetrate=88200,aresample=44100'
};

function getFilter(cmd) {
    const c = cmd.toLowerCase();
    for (const [key, filter] of Object.entries(FILTERS)) {
        if (c.includes(key)) return filter;
    }
    return null;
}

async function downloadAudio(message) {
    const m = message.message || {};
    const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
    const audio = m.audioMessage || m.voiceMessage || quoted?.audioMessage || quoted?.voiceMessage;
    if (!audio) return null;
    const stream = await downloadContentFromMessage(audio, 'audio');
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

async function applyEffect(inputBuf, filter) {
    const tmp = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
    const ts = Date.now();
    const inFile  = path.join(tmp, `in_${ts}.ogg`);
    const outFile = path.join(tmp, `out_${ts}.ogg`);
    try {
        fs.writeFileSync(inFile, inputBuf);
        await execFileAsync('ffmpeg', [
            '-y', '-i', inFile,
            '-af', `${filter},aresample=48000`,
            '-c:a', 'libopus', '-b:a', '64k', '-ac', '1',
            outFile
        ]);
        return fs.readFileSync(outFile);
    } finally {
        try { fs.unlinkSync(inFile); } catch { }
        try { fs.unlinkSync(outFile); } catch { }
    }
}

// Female TTS voices — all free, no API key needed
const TTS_VOICES = {
    joanna: 'Joanna',   // US female (clear)
    amy:    'Amy',      // British female (elegant)
    emma:   'Emma',     // British female (warm)
    salli:  'Salli',    // US female (bright)
    aria:   'Aria'      // US female (natural)
};

async function fetchTTS(text, voice = 'Amy') {
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(text.slice(0, 450))}`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`TTS API error: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

export default {
    command: 'audiofx',
    aliases: [
        'bass','blown','deep','earrape','fast','fat',
        'nightcore','reverse','robot','slow','chipmunk',
        'tts','femalesound','speak','voiceover'
    ],
    category: 'music',
    description: 'Apply audio effects OR convert text to beautiful female voice',
    usage: '.audiofx bass (reply to audio) | .tts <text>',

    async handler(sock, message, args, context) {
        const { chatId } = context;
        const rawText = (
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text || ''
        ).trim().toLowerCase();
        const cmdUsed = rawText.slice(1).split(/\s+/)[0];

        // ── TTS / Female Sound ──────────────────────────────────────
        if (['tts','femalesound','speak','voiceover'].includes(cmdUsed)) {
            const text = args.join(' ').trim();
            if (!text) {
                return sock.sendMessage(chatId, {
                    text: `🎙️ *Text to Speech (Female Voice)*\n\nUsage: _.tts <your text>_\nExample: _.tts Hello, how are you today?_\n\n*Voices available:*\n${Object.keys(TTS_VOICES).map(v => `• .tts ${v}: <text>`).join('\n')}\n\n_Default voice: Amy (British female)_`
                }, { quoted: message });
            }

            // Allow voice selection: .tts amy Hello!
            const firstWord = args[0]?.toLowerCase();
            let voice = 'Amy';
            let ttsText = text;
            if (TTS_VOICES[firstWord]) {
                voice = TTS_VOICES[firstWord];
                ttsText = args.slice(1).join(' ').trim();
            }
            if (!ttsText) ttsText = text;

            await sock.sendMessage(chatId, {
                text: `🎙️ Generating *${voice}* voice...`
            }, { quoted: message });

            try {
                const audioBuf = await fetchTTS(ttsText, voice);
                await sock.sendMessage(chatId, {
                    audio: audioBuf,
                    mimetype: 'audio/mpeg',
                    ptt: true
                }, { quoted: message });
            } catch (e) {
                await sock.sendMessage(chatId, {
                    text: `❌ TTS failed: ${e.message}`
                }, { quoted: message });
            }
            return;
        }

        // ── AudioFX ──────────────────────────────────────────────────
        const filter = getFilter(rawText);
        const audioBuf = await downloadAudio(message);

        if (!audioBuf || !filter) {
            return sock.sendMessage(chatId, { text: EFFECTS_MENU }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: `⚙️ Applying *${cmdUsed}* effect...`
        }, { quoted: message });

        try {
            const result = await applyEffect(audioBuf, filter);
            await sock.sendMessage(chatId, {
                audio: result,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            }, { quoted: message });
        } catch (e) {
            const hint = e.message.includes('ffmpeg') || e.message.includes('ENOENT')
                ? '\n\n_Note: ffmpeg must be installed on the server._'
                : '';
            await sock.sendMessage(chatId, {
                text: `❌ Audio processing failed: ${e.message}${hint}`
            }, { quoted: message });
        }
    }
};
