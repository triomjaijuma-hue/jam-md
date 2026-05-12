import sharp from 'sharp';
import webpmux from 'node-webpmux';
const { Image } = webpmux;
import { exec } from 'child_process';
import path from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';
import fs from 'fs';

function randomFileName() {
    return path.join(tmpdir(), `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);
}

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

export async function imageToWebp(media) {
    const buf = Buffer.isBuffer(media) ? media : Buffer.from(media);
    return await sharp(buf)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 80 })
        .toBuffer();
}

export async function videoToWebp(media) {
    return new Promise((resolve, reject) => {
        const tmpDir = tmpdir();
        const tempInput = path.join(tmpDir, `vid_${Date.now()}.mp4`);
        const tempOutput = path.join(tmpDir, `vid_${Date.now()}.webp`);
        const buf = Buffer.isBuffer(media) ? media : Buffer.from(media);
        fs.writeFileSync(tempInput, buf);
        exec(
            `ffmpeg -y -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`,
            (error) => {
                try { fs.unlinkSync(tempInput); } catch {}
                if (error) return reject(error);
                const result = fs.readFileSync(tempOutput);
                try { fs.unlinkSync(tempOutput); } catch {}
                resolve(result);
            }
        );
    });
}

export async function writeExifImg(media, metadata) {
    const buf = Buffer.isBuffer(media) ? media : Buffer.from(media);
    const webpBuf = await sharp(buf)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 100 })
        .toBuffer();
    const img = new Image();
    await img.load(webpBuf);
    img.exif = buildExif(metadata);
    const tmpFileOut = randomFileName();
    await img.save(tmpFileOut);
    return tmpFileOut;
}

export async function writeExifVid(media, metadata) {
    const webpBuf = await videoToWebp(media);
    const img = new Image();
    await img.load(webpBuf);
    img.exif = buildExif(metadata);
    const tmpFileOut = randomFileName();
    await img.save(tmpFileOut);
    return tmpFileOut;
}

export async function writeExif(media, metadata) {
    const input = /webp|image|video/.test(media.mimetype) ? media.data : null;
    if (!input) return null;
    const isVideo = /video/.test(media.mimetype);
    let webpBuf;
    if (isVideo) {
        webpBuf = await videoToWebp(input);
    } else {
        const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
        webpBuf = await sharp(buf)
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 100 })
            .toBuffer();
    }
    const img = new Image();
    await img.load(webpBuf);
    img.exif = buildExif(metadata);
    const tmpFileOut = randomFileName();
    await img.save(tmpFileOut);
    return tmpFileOut;
}
