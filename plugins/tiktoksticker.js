import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import webp from 'node-webpmux';

export default {
    command: 'tiktoksticker',
    aliases: ['ttsticker', 'ttstick', 'ttsk'],
    category: 'stickers',
    description: 'Turn a TikTok video thumbnail into a WhatsApp sticker',
    usage: '.tiktoksticker <TikTok URL>',
    async handler(sock, message, args, context) {
        const { chatId, config } = context;
        const url = args.join(' ').trim();

        if (!url) {
            return sock.sendMessage(chatId, {
                text: '🎵 *TikTok Sticker*\n\nProvide a TikTok URL.\nExample: _.tiktoksticker https://vm.tiktok.com/XXXX_'
            }, { quoted: message });
        }
        if (!url.match(/tiktok\.com|vm\.tiktok|vt\.tiktok/i)) {
            return sock.sendMessage(chatId, {
                text: '❌ That doesn\'t look like a TikTok link.\nExample: _.tiktoksticker https://vm.tiktok.com/XXXX_'
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, { text: '⏳ Creating TikTok sticker...' }, { quoted: message });

        const tmpDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const tempImg = path.join(tmpDir, `ttsticker_in_${Date.now()}.jpg`);
        const tempOut = path.join(tmpDir, `ttsticker_out_${Date.now()}.webp`);

        try {
            // 1. Fetch TikTok metadata
            const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=0`;
            const res = await fetch(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tikwm.com/' },
                signal: AbortSignal.timeout(30000)
            });
            const json = await res.json();
            if (!json || json.code !== 0 || !json.data) {
                throw new Error(json?.msg || 'Invalid API response');
            }
            const d = json.data;

            const coverUrl = d.cover || d.origin_cover;
            if (!coverUrl) throw new Error('No thumbnail found for this TikTok');

            // 2. Download the thumbnail
            const imgRes = await fetch(coverUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tikwm.com/' },
                signal: AbortSignal.timeout(30000)
            });
            if (!imgRes.ok) throw new Error(`Thumbnail fetch failed: ${imgRes.status}`);
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(tempImg, imgBuffer);

            // 3. Convert to 512x512 WebP with ffmpeg (same pipeline as sticker2.js)
            await new Promise((resolve, reject) => {
                exec(
                    `ffmpeg -y -i "${tempImg}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOut}"`,
                    (err) => (err ? reject(err) : resolve())
                );
            });

            let webpBuffer = fs.readFileSync(tempOut);

            // 4. Embed EXIF metadata (pack name / author)
            const img = new webp.Image();
            await img.load(webpBuffer);
            const json2 = {
                'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
                'sticker-pack-name': config?.packname || 'JAM-MD',
                'sticker-pack-publisher': config?.author || 'JAM-MD',
                'emojis': ['🎵']
            };
            const exifAttr = Buffer.from([
                0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
                0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x16, 0x00, 0x00, 0x00
            ]);
            const jsonBuf = Buffer.from(JSON.stringify(json2), 'utf8');
            const exif = Buffer.concat([exifAttr, jsonBuf]);
            exif.writeUIntLE(jsonBuf.length, 14, 4);
            img.exif = exif;
            const finalBuffer = await img.save(null);

            // 5. Send sticker
            await sock.sendMessage(chatId, { sticker: finalBuffer }, { quoted: message });

            // 6. Optionally send caption info
            await sock.sendMessage(chatId, {
                text: `🎵 *TikTok Sticker*\n👤 *${d.author?.nickname || 'Unknown'}* @${d.author?.unique_id || ''}\n🎧 ${d.music_info?.title || 'Original sound'}`
            }, { quoted: message });

        } catch (err) {
            const msg = err.name === 'TimeoutError'
                ? '⏱️ Request timed out. Please try again.'
                : `❌ Failed to create sticker.\nReason: ${err.message}`;
            await sock.sendMessage(chatId, { text: msg }, { quoted: message });
        } finally {
            // Clean up temp files
            for (const f of [tempImg, tempOut]) {
                try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
            }
        }
    }
};
