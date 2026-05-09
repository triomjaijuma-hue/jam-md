import axios from 'axios';
  import yts from 'yt-search';

  const DL_APIS = [
      { url: 'https://api.qasimdev.dpdns.org/api/loaderto/download', key: 'xbps-install-Syu', param: 'apiKey' },
      { url: 'https://api.siputzx.my.id/api/d/ytmp3', key: null, param: null },
      { url: 'https://api.giftedtech.web.id/api/download/ytmp3', key: null, param: null },
  ];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const downloadWithRetry = async (videoUrl) => {
      for (const api of DL_APIS) {
          try {
              const params = { format: 'mp3', url: videoUrl };
              if (api.key) params[api.param] = api.key;
              const { data } = await axios.get(api.url, { params, timeout: 30000 });
              const result = data?.data || data;
              const dlUrl = result?.downloadUrl || result?.url || result?.link;
              if (dlUrl) return { downloadUrl: dlUrl, title: result?.title || '', thumbnail: result?.thumbnail || result?.image || '' };
              throw new Error('No download URL in response');
          } catch (err) {
              console.log('[song] API failed:', api.url.split('/')[2], err.message);
              await wait(1500);
          }
      }
      throw new Error('All download APIs failed — try again in a moment');
  };

  export default {
      command: 'song',
      aliases: ['music', 'audio', 'mp3'],
      category: 'music',
      description: 'Download song from YouTube (MP3)',
      usage: '.song <song name | youtube link>',
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          const query = args.join(' ').trim();
          if (!query)
              return sock.sendMessage(chatId, { text: '🎵 *Song Downloader*\n\nUsage:\n.song <song name | YouTube link>' }, { quoted: message });
          try {
              let video;
              if (query.includes('youtube.com') || query.includes('youtu.be')) {
                  video = { url: query, title: query, thumbnail: null };
              } else {
                  await sock.sendMessage(chatId, { text: '🔍 *Searching...*' }, { quoted: message });
                  const { videos } = await yts(query);
                  if (!videos?.length)
                      return sock.sendMessage(chatId, { text: '❌ No results found.' }, { quoted: message });
                  video = videos[0];
              }
              if (video.thumbnail) {
                  await sock.sendMessage(chatId, {
                      image: { url: video.thumbnail },
                      caption: `🎶 *${video.title || query}*\n⏱ ${video.timestamp || ''}\n\n⏳ Downloading... *(may take up to 30s)*`
                  }, { quoted: message });
              } else {
                  await sock.sendMessage(chatId, {
                      text: `🎶 *${video.title || query}*\n\n⏳ Downloading...`
                  }, { quoted: message });
              }
              const audio = await downloadWithRetry(video.url);
              await sock.sendMessage(chatId, {
                  audio: { url: audio.downloadUrl },
                  mimetype: 'audio/mpeg',
                  fileName: `${(audio.title || video.title || 'song').replace(/[\\/:*?"<>|]/g, '')}.mp3`,
                  ptt: false
              }, { quoted: message });
          } catch (err) {
              console.error('[song] error:', err.message);
              const reason = err.message.includes('timeout') ? 'Download timed out. Try again.' : err.message;
              await sock.sendMessage(chatId, { text: `❌ Failed: ${reason}` }, { quoted: message });
          }
      }
  };
  