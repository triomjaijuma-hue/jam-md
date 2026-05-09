import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
const execAsync = promisify(exec);
const LIB_DIR = path.join(process.cwd(), 'lib');
const BIN_DIR = path.join(LIB_DIR, 'bin');
const SOURCES = [
    { src: 'dna.cpp', bin: 'dna' },
    { src: 'cipher.cpp', bin: 'cipher' },
    { src: 'rle.cpp', bin: 'rle' },
    { src: 'analyze.cpp', bin: 'analyze' },
];
export async function compileAll() {
    // Check if g++ is available first — on Wispbyte/Railway it may not be.
    // If not found, skip silently so startup is not delayed or crashed.
    try {
        await execAsync('g++ --version', { timeout: 5000 });
    } catch {
        console.log('[compile] g++ not found — skipping C++ compilation (optional feature)');
        return;
    }

    if (!fs.existsSync(BIN_DIR)) {
        fs.mkdirSync(BIN_DIR, { recursive: true });
    }
    for (const { src, bin } of SOURCES) {
        const srcPath = path.join(LIB_DIR, src);
        const binPath = path.join(BIN_DIR, bin);
        if (!fs.existsSync(srcPath)) {
            continue; // source not present — skip silently
        }
        if (fs.existsSync(binPath)) {
            const srcMtime = fs.statSync(srcPath).mtimeMs;
            const binMtime = fs.statSync(binPath).mtimeMs;
            if (binMtime >= srcMtime) {
                console.log(`[compile] ${bin} up to date`);
                continue;
            }
        }
        try {
            console.log(`[compile] Compiling ${src}...`);
            await execAsync(`g++ -O2 -std=c++17 -o "${binPath}" "${srcPath}"`, { timeout: 30000 });
            fs.chmodSync(binPath, 0o755);
            console.log(`[compile] ✓ ${bin} compiled`);
        }
        catch (err) {
            console.error(`[compile] ✗ Failed: ${src}: ${err.stderr || err.message}`);
        }
    }
}
export function getBin(name) {
    return path.join(BIN_DIR, name);
}
