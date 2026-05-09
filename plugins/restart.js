import fs from 'fs';

// Detect platform
function isBun() { return typeof globalThis.Bun !== 'undefined'; }
function getPlatformName() {
    if (isBun()) return 'Wispbyte/Bun';
    if (fs.existsSync('/.dockerenv')) return 'Pterodactyl/Docker';
    return process.platform;
}

async function doRestart() {
    if (isBun()) {
        // Wispbyte — crash detection is ON, clean exit triggers auto-restart
        setTimeout(() => process.exit(0), 2500);
        return;
    }
    // Pterodactyl — crash detection OFF, use nohup to spawn detached child
    const script = process.argv[1] || 'index.js';
    const nodeExe = process.execPath;
    const cmd = `nohup ${nodeExe} "${script}" </dev/null >>/proc/1/fd/1 2>&1 &`;
    await new Promise(resolve => {
        import('child_process').then(({ exec }) => {
            exec(cmd, { shell: '/bin/sh', env: process.env }, resolve);
        });
    });
    setTimeout(() => process.exit(0), 2000);
}

export default {
    command: 'restart',
    aliases: ['reboot', 'rb'],
    category: 'owner',
    description: 'Restart the bot — works on Wispbyte and Pterodactyl',
    usage: '.restart',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const platform = getPlatformName();

        await sock.sendMessage(chatId, {
            text: `♻️ *Restarting TRAILER-UPS…*\n\n🖥️ Platform: ${platform}\n_Bot will be back online in a few seconds._\n_Your session is preserved — no re-pairing needed._`
        }, { quoted: message });

        await new Promise(r => setTimeout(r, 1500));
        await doRestart();
    }
};
