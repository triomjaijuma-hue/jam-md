import path from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';
import fs from 'fs';

// Lazy-loaded to prevent bot crash if stickers-formatter fails to load
let _Sticker = null;
let _StickerTypes = null;
let _stickerLoadError = null;

async function getStickerLib() {
    if (_stickerLoadError) throw _stickerLoadError;
    if (_Sticker) return { Sticker: _Sticker, StickerTypes: _StickerTypes };
    try {
        const mod = await import('stickers-formatter');
        _Sticker = mod.Sticker;
        _StickerTypes = mod.StickerTypes;
        return { Sticker: _Sticker, StickerTypes: _StickerTypes };
    } catch (err) {
        _stickerLoadError = new Error(`stickers-formatter unavailable: ${err.message}`);
        throw _stickerLoadError;
    }
}

function randomFileName() {
    return path.join(tmpdir(), `${crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);
}

export async function imageToWebp(media) {
    const { Sticker, StickerTypes } = await getStickerLib();
    return await new Sticker(media, { type: StickerTypes.DEFAULT }).toBuffer();
}

export async function videoToWebp(media) {
    const { Sticker, StickerTypes } = await getStickerLib();
    return await new Sticker(media, { type: StickerTypes.DEFAULT }).toBuffer();
}

export async function writeExifImg(media, metadata) {
    const { Sticker, StickerTypes } = await getStickerLib();
    const buff = await new Sticker(media, {
        pack: metadata.packname,
        author: metadata.author,
        categories: (metadata.categories || ['']),
        type: StickerTypes.DEFAULT
    }).toBuffer();
    const tmpFileOut = randomFileName();
    fs.writeFileSync(tmpFileOut, buff);
    return tmpFileOut;
}

export async function writeExifVid(media, metadata) {
    const { Sticker, StickerTypes } = await getStickerLib();
    const buff = await new Sticker(media, {
        pack: metadata.packname,
        author: metadata.author,
        categories: (metadata.categories || ['']),
        type: StickerTypes.DEFAULT
    }).toBuffer();
    const tmpFileOut = randomFileName();
    fs.writeFileSync(tmpFileOut, buff);
    return tmpFileOut;
}

export async function writeExif(media, metadata) {
    const input = /webp|image|video/.test(media.mimetype) ? media.data : null;
    if (!input) return null;
    const { Sticker, StickerTypes } = await getStickerLib();
    const buff = await new Sticker(input, {
        pack: metadata.packname,
        author: metadata.author,
        categories: (metadata.categories || ['']),
        type: StickerTypes.DEFAULT
    }).toBuffer();
    const tmpFileOut = randomFileName();
    fs.writeFileSync(tmpFileOut, buff);
    return tmpFileOut;
}
