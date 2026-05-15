import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export async function ytdlpAvailable() {
    try { await execAsync('yt-dlp --version', { timeout: 5000 }); return true; }
    catch { return false; }
}

export async function downloadAudio(url) {
    const tmpDir = await mkdtemp(join(tmpdir(), 'jam-dl-'));
    try {
        const out = join(tmpDir, 'audio.%(ext)s');
        await execAsync(
            `yt-dlp -x --audio-format mp3 --audio-quality 5 --no-playlist --socket-timeout 30 --retries 3 -o "${out}" "${url}"`,
            { timeout: 180000 }
        );
        const buffer = await readFile(join(tmpDir, 'audio.mp3'));
        return { buffer, tmpDir };
    } catch (err) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        throw err;
    }
}

export async function cleanupTmp(tmpDir) {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}
