/*****************************************************************************
 *                                                                           *
 *                     Developed By Jaiton fangs                                *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/JAM-MD                         *
 *  ▶️  YouTube  : https://youtube.com/@JAM-MD                       *
 *  💬  WhatsApp :                                                           *
 *                                                                           *
 *    © 2026 JAM-MD. All rights reserved.                            *
 *                                                                           *
 *    Description: Track who first sent any forwarded media in groups.       *
 *                                                                           *
 *****************************************************************************/

export default {
    command: 'ftrack',
    aliases: ['trackfwd', 'origin', 'firstsend', 'whofirst'],
    category: 'general',
    description: 'See who first sent a forwarded image, video, audio or document',
    usage: '.ftrack (reply to media) | .ftrack stats',
    async handler(sock, message, args, context) {
        const { chatId, channelInfo, config } = context;
        const { getMediaHash, getTrackEntry, getMediaInfo, getTrackerStats } = await import('../lib/forwardTracker.js');

        // .ftrack stats
        if (args[0] === 'stats') {
            const { total, topEntries } = getTrackerStats();
            if (total === 0) {
                return await sock.sendMessage(chatId, {
                    text: '\u{1F4CA} *No tracked media yet.*\n\nThe bot automatically tracks all images, videos, audio and documents sent in groups while it is online.',
                    ...channelInfo
                }, { quoted: message });
            }
            let text = '\u{1F4CA} *FORWARD TRACKER STATS*\n';
            text += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
            text += '*Total unique files tracked:* ' + total + '\n\n';
            text += '*Top 5 Most Forwarded:*\n\n';
            topEntries.forEach((e, i) => {
                const type = e.mediaType.charAt(0).toUpperCase() + e.mediaType.slice(1);
                text += (i + 1) + '. ' + type + ' — *' + e.senders.length + ' senders*\n';
                if (e.caption) text += '   _' + e.caption.substring(0, 50) + '_\n';
            });
            return await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        // Must be a reply to media
        const ctxInfo = message.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = ctxInfo?.quotedMessage;

        if (!quotedMsg) {
            return await sock.sendMessage(chatId, {
                text: '\u274C *Reply to any image, video, audio or document with .ftrack*\n\n*Example:* Reply to a forwarded video and type .ftrack\n\n*Tip:* Type .ftrack stats to see top forwarded files.',
                ...channelInfo
            }, { quoted: message });
        }

        const synth = { message: quotedMsg };
        const info = getMediaInfo(synth);

        if (!info) {
            return await sock.sendMessage(chatId, {
                text: '\u274C *This message type cannot be tracked.*\n\nOnly images, videos, audio and documents are tracked.',
                ...channelInfo
            }, { quoted: message });
        }

        const entry = getTrackEntry(info.hash);

        if (!entry || entry.senders.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '\u26A0\uFE0F *No tracking data for this file.*\n\n_Tracking only works for media sent while the bot was online._',
                ...channelInfo
            }, { quoted: message });
        }

        const senders = [...entry.senders].sort((a, b) => a.sentAt - b.sentAt);
        const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
        const tz = config.timeZone || 'Africa/Kampala';

        let text = '\u{1F4CA} *FORWARD TRACKER*\n';
        text += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
        text += '*Type:* ' + entry.mediaType.charAt(0).toUpperCase() + entry.mediaType.slice(1) + '\n';
        if (entry.caption) text += '*Caption:* ' + entry.caption.substring(0, 80) + '\n';
        text += '*Total senders recorded:* ' + senders.length + '\n';
        text += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n';

        const MAX_SHOW = 20;
        senders.slice(0, MAX_SHOW).forEach((s, i) => {
            const medal = medals[i] || (i + 1) + '.';
            let dateStr = '?';
            try {
                dateStr = new Date(s.sentAt).toLocaleString('en-GB', {
                    timeZone: tz, day: '2-digit', month: 'short',
                    year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
            } catch (_e) {}
            const where = s.isGroup ? '\u{1F465} Group' : '\u{1F4AC} Private';
            text += medal + ' @' + s.num + '\n';
            text += '   \u{1F550} ' + dateStr + '\n';
            text += '   ' + where + '\n\n';
        });

        if (senders.length > MAX_SHOW) {
            text += '... and *' + (senders.length - MAX_SHOW) + '* more senders not shown.';
        }

        const mentions = senders.slice(0, MAX_SHOW).map(s => s.num + '@s.whatsapp.net');
        await sock.sendMessage(chatId, { text, mentions, ...channelInfo }, { quoted: message });
    }
};
