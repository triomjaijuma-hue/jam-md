// Pure JavaScript Unicode text styling — no external API needed
const STYLES = [
    { name: 'Bold',          map: [0x1D400, 0x1D41A, 0x1D7CE] },
    { name: 'Italic',        map: [0x1D434, 0x1D44E, null] },
    { name: 'Bold Italic',   map: [0x1D468, 0x1D482, null] },
    { name: 'Script',        map: [0x1D49C, 0x1D4B6, null] },
    { name: 'Fraktur',       map: [0x1D504, 0x1D51E, null] },
    { name: 'Double Struck', map: [0x1D538, 0x1D552, null] },
    { name: 'Monospace',     map: [0x1D670, 0x1D68A, 0x1D7F6] },
    { name: 'Sans',          map: [0x1D5A0, 0x1D5BA, 0x1D7E2] },
    { name: 'Sans Bold',     map: [0x1D5D4, 0x1D5EE, 0x1D7EC] },
    { name: 'Sans Italic',   map: [0x1D608, 0x1D622, null] },
];

// Special overrides for chars that don't follow sequential Unicode
const OVERRIDES = {
    'Script': { h: 0x210E, I: 0x2111 },
    'Fraktur': { C: 0x212D, H: 0x210C, I: 0x2111, R: 0x211C, Z: 0x2128 },
    'Double Struck': { C: 0x2102, H: 0x210D, N: 0x2115, P: 0x2119, Q: 0x211A, R: 0x211D, Z: 0x2124 },
};

function styleChar(ch, [upperStart, lowerStart, digitStart]) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90 && upperStart) return String.fromCodePoint(upperStart + c - 65);
    if (c >= 97 && c <= 122 && lowerStart) return String.fromCodePoint(lowerStart + c - 97);
    if (c >= 48 && c <= 57 && digitStart) return String.fromCodePoint(digitStart + c - 48);
    return ch;
}

function convertText(text, style) {
    const overrides = OVERRIDES[style.name] || {};
    return [...text].map(ch => {
        if (overrides[ch]) return String.fromCodePoint(overrides[ch]);
        return styleChar(ch, style.map);
    }).join('');
}

export default {
    command: 'stext',
    aliases: ['fancytext', 'textstyle', 'styletext'],
    category: 'menu',
    description: 'Style text in different fancy Unicode formats',
    usage: '.stext <text>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const text = args.join(' ').trim();
        if (!text) {
            return await sock.sendMessage(chatId, {
                text: '*Please provide text to style.*\nExample: .stext Hello World'
            }, { quoted: message });
        }
        const results = STYLES.map(s => ({ name: s.name, result: convertText(text, s) }));
        let messageText = `🎨 *Styled Text for:* _${text}_\n\nReply with a number to send:\n\n`;
        results.forEach((item, i) => {
            messageText += `*${i + 1}.* ${item.result}  _(${item.name})_\n`;
        });
        const sentMsg = await sock.sendMessage(chatId, { text: messageText }, { quoted: message });
        const listener = async ({ messages }) => {
            const m = messages[0];
            if (!m?.message || m.key.remoteJid !== chatId) return;
            const ctx = m.message?.extendedTextMessage?.contextInfo;
            if (!ctx?.stanzaId || ctx.stanzaId !== sentMsg.key.id) return;
            const replyText = m.message.conversation || m.message.extendedTextMessage?.text || '';
            const choice = parseInt(replyText.trim(), 10);
            if (isNaN(choice) || choice < 1 || choice > results.length) {
                return sock.sendMessage(chatId, {
                    text: `❌ Invalid choice. Pick a number between 1 and ${results.length}.`
                }, { quoted: m });
            }
            sock.ev.off('messages.upsert', listener);
            await sock.sendMessage(chatId, { text: results[choice - 1].result }, { quoted: m });
        };
        sock.ev.on('messages.upsert', listener);
    }
};
