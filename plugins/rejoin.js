import fs from 'fs';
import path from 'path';
import { dataFile } from '../lib/paths.js';

const LEFT_GROUPS_FILE = dataFile('leftGroups.json');

function loadLeftGroups() {
    try {
        if (fs.existsSync(LEFT_GROUPS_FILE)) return JSON.parse(fs.readFileSync(LEFT_GROUPS_FILE, 'utf8'));
    } catch { }
    return [];
}

function saveLeftGroups(list) {
    try {
        const dir = path.dirname(LEFT_GROUPS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(LEFT_GROUPS_FILE, JSON.stringify(list, null, 2));
    } catch (e) {
        console.error('[Rejoin] Save error:', e.message);
    }
}

/**
 * Called by messageHandler when the owner leaves/is removed from a group.
 * Stores the group info + invite link so .rejoin can retrieve it later.
 */
export async function handleOwnerLeave(sock, groupId, ownerJid) {
    try {
        let name = groupId;
        let inviteCode = null;
        try {
            const meta = await sock.groupMetadata(groupId);
            name = meta.subject || groupId;
        } catch { }
        try {
            inviteCode = await sock.groupInviteCode(groupId);
        } catch { }

        const list = loadLeftGroups();
        // Remove duplicate entry for same group
        const filtered = list.filter(g => g.id !== groupId);
        filtered.unshift({
            id: groupId,
            name,
            inviteCode,
            leftAt: new Date().toISOString()
        });
        // Keep last 20
        saveLeftGroups(filtered.slice(0, 20));
        console.log(`[Rejoin] Saved left group: ${name}`);
    } catch (e) {
        console.error('[Rejoin] handleOwnerLeave error:', e.message);
    }
}

export default {
    command: 'rejoin',
    aliases: ['rjoin', 'groupback', 'getback'],
    category: 'owner',
    description: 'Rejoin a group you accidentally left — no link or admin help needed',
    usage: '.rejoin | .rejoin <name or number>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const query = args.join(' ').trim().toLowerCase();

        // ── Case 1: .rejoin with no args — show live list of all groups bot is in ──
        if (!query) {
            try {
                await sock.sendMessage(chatId, { text: '📋 Fetching groups...' }, { quoted: message });
                const groups = await sock.groupFetchAllParticipating();
                const list = Object.values(groups);
                if (!list.length) {
                    return sock.sendMessage(chatId, {
                        text: '❌ Bot is not in any groups.'
                    }, { quoted: message });
                }
                let text = `👥 *Groups Bot Is In (${list.length}):*\n\n`;
                list.slice(0, 30).forEach((g, i) => {
                    text += `*${i + 1}.* ${g.subject}\n`;
                });
                if (list.length > 30) text += `\n_...and ${list.length - 30} more_`;
                text += `\n\n📌 *To get an invite link:*\n_.rejoin <number or group name>_\n\nExample: _.rejoin 1_ or _.rejoin Family_`;
                await sock.sendMessage(chatId, { text }, { quoted: message });
            } catch (e) {
                await sock.sendMessage(chatId, {
                    text: `❌ Failed to fetch groups: ${e.message}`
                }, { quoted: message });
            }
            return;
        }

        // ── Case 2: .rejoin <query> — find group and send invite link ──
        try {
            await sock.sendMessage(chatId, { text: `🔎 Finding group *"${query}"*...` }, { quoted: message });
            const groups = await sock.groupFetchAllParticipating();
            const list = Object.values(groups);

            // Match by number (1-based index) or name
            let match = null;
            const num = parseInt(query, 10);
            if (!isNaN(num) && num >= 1 && num <= list.length) {
                match = list[num - 1];
            } else {
                match = list.find(g => g.subject.toLowerCase().includes(query));
            }

            if (!match) {
                // Check recently-left groups as fallback
                const leftGroups = loadLeftGroups();
                const leftMatch = leftGroups.find(g =>
                    g.name.toLowerCase().includes(query) ||
                    (!isNaN(num) && leftGroups.indexOf(g) === num - 1)
                );
                if (leftMatch) {
                    if (leftMatch.inviteCode) {
                        const link = `https://chat.whatsapp.com/${leftMatch.inviteCode}`;
                        return sock.sendMessage(chatId, {
                            text: `🔗 *Rejoin Link (recently left)*\n\n*Group:* ${leftMatch.name}\n*Left:* ${new Date(leftMatch.leftAt).toLocaleString()}\n\n${link}\n\n_Tap the link to rejoin_`
                        }, { quoted: message });
                    }
                    return sock.sendMessage(chatId, {
                        text: `❌ Found *${leftMatch.name}* in recently-left list but no invite link was saved.\nAsk an admin for the link.`
                    }, { quoted: message });
                }
                return sock.sendMessage(chatId, {
                    text: `❌ No group found matching *"${query}"*.\n\nUse _.rejoin_ (no args) to see all groups with their numbers.`
                }, { quoted: message });
            }

            // Get fresh invite link
            let inviteCode;
            try {
                inviteCode = await sock.groupInviteCode(match.id);
            } catch (e) {
                return sock.sendMessage(chatId, {
                    text: `❌ Couldn't get invite link for *${match.subject}*.\n\nReason: ${e.message}\n_Bot may need to be an admin to generate links._`
                }, { quoted: message });
            }

            const link = `https://chat.whatsapp.com/${inviteCode}`;
            const participantCount = match.participants?.length || '?';
            await sock.sendMessage(chatId, {
                text: `🔗 *Group Invite Link*\n\n*Name:* ${match.subject}\n*Members:* ${participantCount}\n\n${link}\n\n_Tap the link above to rejoin the group._`
            }, { quoted: message });

        } catch (e) {
            await sock.sendMessage(chatId, {
                text: `❌ Error: ${e.message}`
            }, { quoted: message });
        }
    }
};
