/**
 * filetype-compat.js
 * Universal wrapper for the `file-type` package.
 * Works with Bun, Node.js, and any installed version of file-type (v12–v20+).
 * Falls back to magic-byte detection when file-type is unavailable.
 */

let _fileTypeFromBuffer = null;
let _loaded = false;

async function loadFileType() {
    if (_loaded) return;
    _loaded = true;
    try {
        const ft = await import('file-type');
        if (typeof ft.fileTypeFromBuffer === 'function') {
            _fileTypeFromBuffer = ft.fileTypeFromBuffer;
        } else if (ft.default && typeof ft.default.fileTypeFromBuffer === 'function') {
            _fileTypeFromBuffer = ft.default.fileTypeFromBuffer;
        } else if (typeof ft.default === 'function') {
            // Very old CJS version where default export IS the function
            _fileTypeFromBuffer = ft.default;
        }
    } catch (e) {
        console.error('[filetype-compat] Could not load file-type:', e.message);
    }
}

/**
 * Detect file type from a Buffer.
 * Falls back to magic-byte detection if file-type package is unavailable.
 * @param {Buffer} buffer
 * @returns {Promise<{ext: string, mime: string}|undefined>}
 */
export async function fileTypeFromBuffer(buffer) {
    await loadFileType();
    if (_fileTypeFromBuffer) {
        try {
            const result = await _fileTypeFromBuffer(buffer);
            if (result) return result;
        } catch (_e) {
            // fall through to magic bytes
        }
    }
    return magicByteFallback(buffer);
}

/**
 * Magic-byte fallback covering common media types used by this bot.
 * @param {Buffer} buffer
 * @returns {{ext: string, mime: string}|undefined}
 */
function magicByteFallback(buffer) {
    if (!buffer || buffer.length < 4) return undefined;
    const b = buffer;

    // JPEG
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
        return { ext: 'jpg', mime: 'image/jpeg' };
    // PNG
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
        return { ext: 'png', mime: 'image/png' };
    // GIF
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)
        return { ext: 'gif', mime: 'image/gif' };
    // WebP (RIFF....WEBP)
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b.length >= 12 && b.slice(8, 12).toString('ascii') === 'WEBP')
        return { ext: 'webp', mime: 'image/webp' };
    // MP4 / MOV (ftyp box)
    if (b.length >= 12) {
        const ftyp = b.slice(4, 8).toString('ascii');
        if (ftyp === 'ftyp') return { ext: 'mp4', mime: 'video/mp4' };
    }
    // WebM / MKV (EBML)
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
        return { ext: 'webm', mime: 'video/webm' };
    // MP3 (ID3)
    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33)
        return { ext: 'mp3', mime: 'audio/mpeg' };
    // MP3 (sync word)
    if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
        return { ext: 'mp3', mime: 'audio/mpeg' };
    // OGG
    if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53)
        return { ext: 'ogg', mime: 'audio/ogg' };
    // PDF
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
        return { ext: 'pdf', mime: 'application/pdf' };
    // ZIP
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)
        return { ext: 'zip', mime: 'application/zip' };

    return undefined;
}
