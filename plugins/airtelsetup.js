// plugins/airtelsetup.js
// One-time setup: saves the Cloudflare Worker URL and UUID to the bot's store.
// Usage (owner only): .airtelsetup <worker-host> <uuid>
// Example: .airtelsetup jam-md-proxy.yourname.workers.dev 550e8400-e29b-41d4-a716-446655440000

export default {
  command: 'airtelsetup',
  aliases: ['cfsetup', 'airtelcfg'],
  category: 'owner',
  description: 'Configure the Cloudflare Worker for Airtel Uganda free internet',
  usage: '.airtelsetup <worker-host> <uuid>',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const store  = context.store || context.db;

    if (!store) {
      await sock.sendMessage(chatId, {
        text: '❌ No data store available. Cannot save config.',
      }, { quoted: message });
      return;
    }

    if (args.length < 2) {
      await sock.sendMessage(chatId, {
        text: [
          '❌ *Missing arguments.*',
          '',
          'Usage: `.airtelsetup <worker-host> <uuid>`',
          '',
          'Example:',
          '`.airtelsetup jam-md-proxy.yourname.workers.dev 550e8400-e29b-41d4-a716-446655440000`',
          '',
          '_Get your worker host from: Cloudflare dashboard → Workers & Pages → jam-md-proxy_',
          '_Generate UUID at: https://www.uuidgenerator.net/_',
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    let [workerHost, uuid] = args;

    // Clean up worker host (remove https:// if pasted)
    workerHost = workerHost.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Basic UUID format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      await sock.sendMessage(chatId, {
        text: [
          '❌ *Invalid UUID format.*',
          '',
          'UUID must look like: `550e8400-e29b-41d4-a716-446655440000`',
          '_Generate one at: https://www.uuidgenerator.net/_',
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    try {
      await store.set('airtel_cf_config', JSON.stringify({ workerHost, uuid }));

      await sock.sendMessage(chatId, {
        text: [
          '✅ *Airtel CF config saved!*',
          '',
          `Worker: \`${workerHost}\``,
          `UUID: \`${uuid}\``,
          '',
          'Users can now run *.airtel* to get free internet configs.',
          '',
          '_Make sure your Cloudflare Worker is deployed and the USER_ID_',
          '_environment variable matches the UUID above._',
        ].join('\n'),
      }, { quoted: message });
    } catch (err) {
      await sock.sendMessage(chatId, {
        text: `❌ Failed to save config: ${err.message}`,
      }, { quoted: message });
    }
  },
};
