import axios from 'axios';
import { Image } from 'node-webpmux';
import crypto from 'crypto';
import sharp from 'sharp';

function buildExif({ packname = '', author = '', categories = [''] } = {}) {
    const json = {
        'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
        'sticker-pack-name': packname,
        'sticker-pack-publisher': author,
        'emojis': categories.filter(Boolean)
    };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);
    return exif;
}

async function imageToStickerBuffer(imageBuffer, { packname = '', author = '', categories = [''] } = {}) {
    const webpBuf = await sharp(imageBuffer)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 100 })
        .toBuffer();
    const img = new Image();
    await img.load(webpBuf);
    img.exif = buildExif({ packname, author, categories });
    return await img.save(null);
}

export default {
    command: 'quoted',
    aliases: ['q', 'fakereply'],
    category: 'stickers',
    description: 'Generate a quote sticker from text',
    usage: '.quote <text> or reply to a message',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const ctx = message.message?.extendedTextMessage?.contextInfo;
        let text = args.join(' ').trim();
        if (!text) {
            const q = ctx?.quotedMessage;
            if (!q)
                return sock.sendMessage(chatId, { text: '📝 Please provide text or reply to a message.\n\nUsage: .quote <text>' }, { quoted: message });
            text = q.conversation
                || q.extendedTextMessage?.text
                || q.imageMessage?.caption
                || q.videoMessage?.caption
                || 'Media message';
        }
        const who = ctx?.participant
            || ctx?.mentionedJid?.[0]
            || message.key.participant
            || message.key.remoteJid;
        const [userPfp, contactInfo] = await Promise.allSettled([
            sock.profilePictureUrl(who, 'image'),
            sock.onWhatsApp(who)
        ]);
        const pfp = userPfp.status === 'fulfilled'
            ? userPfp.value
            : 'https://i.ibb.co/9HY4wjz/a4c0b1af253197d4837ff6760d5b81c0.jpg';
        const contactValue = contactInfo.status === 'fulfilled' ? contactInfo.value : null;
        const storeContact = sock.store?.contacts?.[who];
        const userName = storeContact?.name
            || storeContact?.notify
            || contactValue?.[0]?.notify
            || (who.includes('@s.whatsapp.net') ? `+${who.replace('@s.whatsapp.net', '')}` : 'User');
        try {
            const res = await axios.post('https://bot.lyo.su/quote/generate', {
                type: 'quote',
                format: 'png',
                backgroundColor: '#FFFFFF',
                width: 1800,
                height: 200,
                scale: 2,
                messages: [{
                    entities: [],
                    avatar: true,
                    from: { id: 1, name: userName, photo: { url: pfp } },
                    text,
                    replyMessage: {}
                }]
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });
            if (!res.data?.result?.image)
                throw new Error('Invalid API response');
            const bufferImage = Buffer.from(res.data.result.image, 'base64');
            try {
                const stickerBuffer = await imageToStickerBuffer(bufferImage, {
                    packname: 'JAM-MD',
                    author: userName,
                    categories: ['🤩', '🎉']
                });
                await sock.sendMessage(chatId, { sticker: stickerBuffer }, { quoted: message });
            }
            catch {
                await sock.sendMessage(chatId, { image: bufferImage, caption: '📝 Quote image (sticker conversion failed)' }, { quoted: message });
            }
        }
        catch (err) {
            console.error('Quote plugin error:', err);
            const msg = err.message.includes('timeout')
                ? 'Request timed out.'
                : err.message.includes('Invalid API')
                    ? 'API returned invalid data.'
                    : 'Please try again later.';
            await sock.sendMessage(chatId, { text: `❌ Failed to generate quote. ${msg}` }, { quoted: message });
        }
    }
};
