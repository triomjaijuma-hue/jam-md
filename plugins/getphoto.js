import { Readable } from 'stream';

  /**
   * Search DuckDuckGo images — no API key needed.
   * Returns an array of image result objects.
   */
  async function ddgImageSearch(query) {
      // Step 1: Get VQD token from DDG HTML
      const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
      const controller1 = new AbortController();
      const tid1 = setTimeout(() => controller1.abort(), 10000);
      const htmlRes = await fetch(searchUrl, {
          signal: controller1.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
      });
      clearTimeout(tid1);
      const html = await htmlRes.text();
      const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
      if (!vqdMatch) throw new Error('Could not get search token from DuckDuckGo');
      const vqd = vqdMatch[1];

      // Step 2: Fetch image results
      const imgUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&o=json&p=1&s=0`;
      const controller2 = new AbortController();
      const tid2 = setTimeout(() => controller2.abort(), 10000);
      const imgRes = await fetch(imgUrl, {
          signal: controller2.signal,
          headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
              'Referer': 'https://duckduckgo.com/'
          }
      });
      clearTimeout(tid2);
      if (!imgRes.ok) throw new Error(`DDG image API returned ${imgRes.status}`);
      const data = await imgRes.json();
      return data.results || [];
  }

  /**
   * Download an image URL into a Buffer.
   * Tries each URL until one succeeds.
   */
  async function fetchImageBuffer(urls) {
      for (const url of urls) {
          if (!url || !url.startsWith('http')) continue;
          try {
              const controller = new AbortController();
              const tid = setTimeout(() => controller.abort(), 15000);
              const res = await fetch(url, {
                  signal: controller.signal,
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
              });
              clearTimeout(tid);
              if (!res.ok) continue;
              const ct = res.headers.get('content-type') || '';
              if (!ct.startsWith('image/')) continue;
              const buf = Buffer.from(await res.arrayBuffer());
              if (buf.length > 1000) return { buf, url };
          } catch { continue; }
      }
      return null;
  }

  export default {
      command: 'photo',
      aliases: ['getphoto', 'pic', 'fetchphoto', 'findphoto', 'searchphoto'],
      category: 'search',
      description: 'Search and fetch real photos of anyone from the web',
      usage: '.photo <name or query>',
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          let query = args.join(' ').trim();

          if (!query) {
              return sock.sendMessage(chatId, {
                  text: `📸 *Usage:* .photo <name or query>\n\n` +
                      `*Examples:*\n` +
                      `• .photo Ice Spice\n` +
                      `• .photo Lionel Messi 2024\n` +
                      `• .photo Elon Musk twitter\n` +
                      `• .photo Rihanna red carpet\n` +
                      `• .photo Beyoncé concert\n\n` +
                      `_Fetches real photos from the web_`
              }, { quoted: message });
          }

          // Let user specify which result they want: .photo 3 Elon Musk
          let resultIndex = 0;
          const firstWord = args[0];
          if (/^\d+$/.test(firstWord) && parseInt(firstWord) >= 1 && parseInt(firstWord) <= 10) {
              resultIndex = parseInt(firstWord) - 1;
              query = args.slice(1).join(' ').trim();
              if (!query) return sock.sendMessage(chatId, { text: '❌ Please provide a name after the number.' }, { quoted: message });
          }

          await sock.sendMessage(chatId, {
              text: `🔍 Searching for photos of *${query}*...`
          }, { quoted: message });

          try {
              await sock.presenceSubscribe(chatId);
              await sock.sendPresenceUpdate('composing', chatId);
          } catch { }

          let results;
          try {
              results = await ddgImageSearch(query);
          } catch (err) {
              return sock.sendMessage(chatId, {
                  text: `❌ Search failed: ${err.message}\nTry again in a moment.`
              }, { quoted: message });
          }

          if (!results || results.length === 0) {
              return sock.sendMessage(chatId, {
                  text: `❌ No photos found for "*${query}*". Try a different name or search term.`
              }, { quoted: message });
          }

          // Try fetching starting from the requested index
          let fetched = null;
          let triedIndex = resultIndex;
          const maxTries = Math.min(results.length, resultIndex + 6);

          while (!fetched && triedIndex < maxTries) {
              const result = results[triedIndex];
              // Try full image first, then thumbnail
              fetched = await fetchImageBuffer([result.image, result.thumbnail]);
              if (!fetched) triedIndex++;
          }

          if (!fetched) {
              return sock.sendMessage(chatId, {
                  text: `❌ Found search results but couldn't download the images.\nTry: .photo ${query} (different result)`
              }, { quoted: message });
          }

          const result = results[triedIndex];
          const caption = [
              `📸 *${result.title || query}*`,
              result.source ? `🌐 ${result.source}` : null,
              `\n_Result ${triedIndex + 1} of ${results.length} for "${query}"_`,
              `_Type .photo 2 ${query} for the next result_`
          ].filter(Boolean).join('\n');

          await sock.sendMessage(chatId, {
              image: fetched.buf,
              caption
          }, { quoted: message });
      }
  };
  