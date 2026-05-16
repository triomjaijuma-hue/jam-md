import fs from 'fs';
  import path from 'path';

  const CONFIG_FILE = path.join(process.cwd(), 'airtel_config.json');

  export default {
    command: /^airtelsetup$/i,
    tags: ['owner'],
    description: 'Set Cloudflare Worker URL and UUID for Airtel configs',
    owner: true,
    async run({ sock, msg, args, isOwner }) {
      if (!isOwner) return;
      const [workerUrl, uuid] = args;
      if (!workerUrl || !uuid) {
        return sock.sendMessage(msg.key.remoteJid, {
          text: '❌ Usage: .airtelsetup <worker-url> <uuid>\nExample: .airtelsetup jam-md-proxy.jumatjai.workers.dev 1c0aed11-4836-4431-b028-14e15dfe033c'
        });
      }
      const config = { workerUrl: workerUrl.replace(/^https?:\/\//, ''), uuid };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ Airtel config saved!\n🌐 Worker: ${config.workerUrl}\n🔑 UUID: ${config.uuid}`
      });
    }
  };
  