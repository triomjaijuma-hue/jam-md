export default {
    command: 'radio',
    aliases: ['fm', 'stream', 'listen'],
    category: 'media',
    description: 'Stream live radio stations (Pearl FM, Apex FM)',
    usage: '.radio <station name>  |  .radio list',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const query = args.join(' ').trim().toLowerCase();

        const STATIONS = {
            'pearl': {
                name: 'Pearl FM 107.9',
                location: 'Kampala, Uganda',
                freq: '107.9 MHz',
                stream: 'https://dc4.serverse.com/proxy/pearlfm/stream',
                emoji: '🎙️'
            },
            'apex': {
                name: 'Apex FM 103.5',
                location: 'Jinja, Uganda',
                freq: '103.5 MHz',
                stream: 'https://stream.apexfm.co.ug/live',
                emoji: '📻'
            }
        };

        // Show station list
        if (!query || query === 'list') {
            const list = Object.values(STATIONS)
                .map(s => `${s.emoji} *${s.name}*\n   📍 ${s.location} | ${s.freq}`)
                .join('\n\n');
            return sock.sendMessage(chatId, {
                text: `📻 *Available Radio Stations*\n━━━━━━━━━━━━━━━━━━━\n\n${list}\n\n━━━━━━━━━━━━━━━━━━━\n_Usage: .radio pearl  or  .radio apex_`
            }, { quoted: message });
        }

        // Match station
        const key = Object.keys(STATIONS).find(k =>
            query.includes(k) || STATIONS[k].name.toLowerCase().includes(query)
        );

        if (!key) {
            return sock.sendMessage(chatId, {
                text: `❌ Station not found.\n\nAvailable stations:\n• *.radio pearl* — Pearl FM 107.9\n• *.radio apex* — Apex FM 103.5\n• *.radio list* — Show all`
            }, { quoted: message });
        }

        const station = STATIONS[key];
        await sock.sendMessage(chatId, {
            text: `⏳ Connecting to *${station.name}*...`
        }, { quoted: message });

        try {
            // Test if stream is reachable before sending
            const check = await fetch(station.stream, {
                method: 'HEAD',
                headers: { 'User-Agent': 'Mozilla/5.0', 'Icy-MetaData': '1' },
                signal: AbortSignal.timeout(10000)
            });

            if (!check.ok && check.status !== 200 && check.status !== 302) {
                throw new Error(`Stream returned status ${check.status}`);
            }

            const caption = `${station.emoji} *${station.name}*\n━━━━━━━━━━━━━━━━━━━\n📍 *Location:* ${station.location}\n📡 *Frequency:* ${station.freq}\n🔴 *Status:* Live\n━━━━━━━━━━━━━━━━━━━`;

            await sock.sendMessage(chatId, {
                audio: { url: station.stream },
                mimetype: 'audio/mpeg',
                ptt: false,
                caption
            }, { quoted: message });

            await sock.sendMessage(chatId, { text: caption }, { quoted: message });

        } catch (err) {
            const msg = err.name === 'TimeoutError'
                ? `⏱️ *${station.name}* is not responding right now. Try again later.`
                : `📡 *${station.name}* stream link:\n${station.stream}\n\n_Tap the link to open in your browser if audio doesn't play._`;
            await sock.sendMessage(chatId, { text: msg }, { quoted: message });
        }
    }
};
