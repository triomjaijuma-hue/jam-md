// ─── PvP Text Battle Game ─────────────────────────────────────────────────────
// Commands: .fight @user  →  challenge someone
//           .fight accept →  accept a challenge
//           .fight decline / .fight reject  → decline
//           .fight attack / .fight a        → attack on your turn
//           .fight special / .fight s       → use special move (once per battle)
//           .fight heal / .fight h          → heal (once per battle)
//           .fight surrender / .fight quit  → give up
// ─────────────────────────────────────────────────────────────────────────────

const ATTACKS = [
    { name: '🥊 Jab',           dmgMin: 8,  dmgMax: 18 },
    { name: '🦵 Roundhouse Kick', dmgMin: 12, dmgMax: 22 },
    { name: '⚡ Thunder Punch',  dmgMin: 10, dmgMax: 25 },
    { name: '🗡️ Slash',         dmgMin: 9,  dmgMax: 20 },
    { name: '🔥 Flame Strike',  dmgMin: 14, dmgMax: 28 },
    { name: '❄️ Ice Blast',     dmgMin: 10, dmgMax: 24 },
    { name: '💨 Wind Slash',    dmgMin: 11, dmgMax: 21 },
    { name: '🌊 Water Whip',    dmgMin: 8,  dmgMax: 19 },
    { name: '🌩️ Lightning Bolt', dmgMin: 15, dmgMax: 30 },
    { name: '🪨 Rock Smash',    dmgMin: 13, dmgMax: 26 },
    { name: '☄️ Meteor Drop',   dmgMin: 16, dmgMax: 32 },
    { name: '🎯 Precision Shot', dmgMin: 12, dmgMax: 23 },
];

const SPECIALS = [
    { name: '💥 MEGA BLAST',     dmgMin: 30, dmgMax: 55 },
    { name: '🌪️ TORNADO FURY',   dmgMin: 28, dmgMax: 50 },
    { name: '🔱 DIVINE STRIKE',  dmgMin: 32, dmgMax: 58 },
    { name: '🐉 DRAGON RAGE',    dmgMin: 35, dmgMax: 60 },
    { name: '☠️ DEATH BLOW',     dmgMin: 25, dmgMax: 65 },
    { name: '⚡ VOLTAGE STORM',  dmgMin: 30, dmgMax: 52 },
];

const MISSES = [
    'but *MISSED!* 💨',
    'but the opponent *DODGED!* 🤸',
    'but it *GLANCED OFF!* 😅',
    'but they *BLOCKED IT!* 🛡️',
];

const HEAL_AMOUNT_MIN = 15;
const HEAL_AMOUNT_MAX = 30;
const STARTING_HP = 100;
const MISS_CHANCE = 0.15; // 15% miss chance
const EXPIRE_MS = 5 * 60 * 1000; // pending challenge expires in 5 min

// { [chatId]: Battle }
const battles = {};
// { [chatId+challengerId]: { challenger, challenged, expires } }
const challenges = {};

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function hpBar(hp) {
    const filled = Math.max(0, Math.round(hp / 10));
    const empty  = 10 - filled;
    const color  = hp > 60 ? '🟩' : hp > 30 ? '🟨' : '🟥';
    return color.repeat(filled) + '⬛'.repeat(empty) + ` ${hp}/100`;
}

function battleStatus(battle) {
    const a = battle.playerA;
    const b = battle.playerB;
    return [
        `👤 *@${a.jid.split('@')[0]}*`,
        `${hpBar(a.hp)}${a.usedSpecial ? '' : ' ⚡'}${a.usedHeal ? '' : ' 💊'}`,
        ``,
        `👤 *@${b.jid.split('@')[0]}*`,
        `${hpBar(b.hp)}${b.usedSpecial ? '' : ' ⚡'}${b.usedHeal ? '' : ' 💊'}`
    ].join('\n');
}

function controlsHint(battle, currentPlayer) {
    const sp  = currentPlayer.usedSpecial ? '' : '  `.fight special` — Special attack (1x)\n';
    const hl  = currentPlayer.usedHeal    ? '' : '  `.fight heal`    — Heal (1x)\n';
    return (
        `*Your moves:*\n` +
        `  \`.fight attack\`  — Normal attack\n` +
        sp +
        hl +
        `  \`.fight surrender\` — Give up\n\n` +
        `⚡ = special available  💊 = heal available`
    );
}

async function endBattle(sock, chatId, battle, winnerJid, loserJid, reason) {
    delete battles[chatId];
    await sock.sendMessage(chatId, {
        text: [
            `🏆 *BATTLE OVER!*`,
            `━━━━━━━━━━━━━━━━━━━`,
            ``,
            `🥇 *Winner: @${winnerJid.split('@')[0]}*`,
            `💀 *Loser:  @${loserJid.split('@')[0]}*`,
            ``,
            reason,
            ``,
            `━━━━━━━━━━━━━━━━━━━`,
            `_Start a new fight with .fight @user_`
        ].join('\n'),
        mentions: [winnerJid, loserJid]
    });
}

export default {
    command: 'fight',
    aliases: ['battle', 'pvp', 'duel'],
    category: 'games',
    description: 'Challenge another user to a PvP text battle!',
    usage: '.fight @user | .fight accept | .fight attack | .fight special | .fight heal | .fight surrender',

    async handler(sock, message, args, context) {
        const { chatId, senderId, channelInfo } = context;
        const sub = (args[0] || '').toLowerCase();

        const senderTag = `@${senderId.split('@')[0]}`;

        // ── Challenge: .fight @user ─────────────────────────────────
        const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;
        const targetJid = mentioned?.[0] || quotedParticipant;

        if (targetJid && !['accept','decline','reject','attack','a','special','s','heal','h','surrender','quit'].includes(sub)) {
            if (targetJid === senderId) {
                return sock.sendMessage(chatId, {
                    text: '❌ You cannot fight yourself!',
                    ...channelInfo
                }, { quoted: message });
            }

            // Check if either player is already in a battle
            if (battles[chatId]) {
                const b = battles[chatId];
                if ([b.playerA.jid, b.playerB.jid].includes(senderId)) {
                    return sock.sendMessage(chatId, {
                        text: `❌ *${senderTag}* you are already in a battle! Finish it first.`,
                        mentions: [senderId],
                        ...channelInfo
                    }, { quoted: message });
                }
            }

            const key = `${chatId}:${senderId}`;
            challenges[key] = {
                challenger: senderId,
                challenged: targetJid,
                chatId,
                expires: Date.now() + EXPIRE_MS
            };

            return sock.sendMessage(chatId, {
                text: [
                    `⚔️ *BATTLE CHALLENGE!*`,
                    `━━━━━━━━━━━━━━━━━━━`,
                    ``,
                    `🥊 *${senderTag}* has challenged *@${targetJid.split('@')[0]}* to a fight!`,
                    ``,
                    `@${targetJid.split('@')[0]}, do you accept?`,
                    `→ *\`.fight accept\`* to fight!`,
                    `→ *\`.fight decline\`* to back out 🐔`,
                    ``,
                    `_Challenge expires in 5 minutes._`
                ].join('\n'),
                mentions: [senderId, targetJid],
                ...channelInfo
            }, { quoted: message });
        }

        // ── Accept ─────────────────────────────────────────────────
        if (sub === 'accept') {
            // Find a challenge directed at this sender
            const challengeEntry = Object.values(challenges).find(
                c => c.chatId === chatId && c.challenged === senderId && Date.now() < c.expires
            );
            if (!challengeEntry) {
                return sock.sendMessage(chatId, {
                    text: '❌ No active challenge found for you. Make sure someone challenged you with `.fight @you`.',
                    ...channelInfo
                }, { quoted: message });
            }

            // Clean up challenge
            const key = `${chatId}:${challengeEntry.challenger}`;
            delete challenges[key];

            // Start battle
            battles[chatId] = {
                playerA: { jid: challengeEntry.challenger, hp: STARTING_HP, usedSpecial: false, usedHeal: false },
                playerB: { jid: senderId,                  hp: STARTING_HP, usedSpecial: false, usedHeal: false },
                currentTurn: challengeEntry.challenger,    // challenger goes first
                round: 1
            };

            const battle = battles[chatId];

            return sock.sendMessage(chatId, {
                text: [
                    `⚔️ *BATTLE STARTED!*`,
                    `━━━━━━━━━━━━━━━━━━━`,
                    ``,
                    battleStatus(battle),
                    ``,
                    `━━━━━━━━━━━━━━━━━━━`,
                    `🎮 *Round 1 — @${battle.currentTurn.split('@')[0]}'s turn!*`,
                    ``,
                    controlsHint(battle, battle.playerA)
                ].join('\n'),
                mentions: [battle.playerA.jid, battle.playerB.jid],
                ...channelInfo
            }, { quoted: message });
        }

        // ── Decline ────────────────────────────────────────────────
        if (['decline', 'reject'].includes(sub)) {
            const challengeEntry = Object.values(challenges).find(
                c => c.chatId === chatId && c.challenged === senderId
            );
            if (!challengeEntry) {
                return sock.sendMessage(chatId, {
                    text: '❌ No challenge to decline.',
                    ...channelInfo
                }, { quoted: message });
            }
            const key = `${chatId}:${challengeEntry.challenger}`;
            delete challenges[key];
            return sock.sendMessage(chatId, {
                text: `🐔 *@${senderId.split('@')[0]} declined the challenge!* What a coward...`,
                mentions: [senderId, challengeEntry.challenger],
                ...channelInfo
            }, { quoted: message });
        }

        // ── All move commands need an active battle ────────────────
        const battle = battles[chatId];
        if (!battle) {
            return sock.sendMessage(chatId, {
                text: [
                    `❌ No battle is running here.`,
                    ``,
                    `Start one: *.fight @user*`
                ].join('\n'),
                ...channelInfo
            }, { quoted: message });
        }

        // Check it's this player's turn
        const isPlayerA = battle.playerA.jid === senderId;
        const isPlayerB = battle.playerB.jid === senderId;
        if (!isPlayerA && !isPlayerB) {
            return sock.sendMessage(chatId, {
                text: `❌ You are not in this battle, ${senderTag}!`,
                mentions: [senderId],
                ...channelInfo
            }, { quoted: message });
        }
        if (battle.currentTurn !== senderId) {
            const opponentTag = `@${battle.currentTurn.split('@')[0]}`;
            return sock.sendMessage(chatId, {
                text: `⏳ It's *${opponentTag}*'s turn, ${senderTag}! Wait for them.`,
                mentions: [battle.currentTurn, senderId],
                ...channelInfo
            }, { quoted: message });
        }

        const attacker = isPlayerA ? battle.playerA : battle.playerB;
        const defender = isPlayerA ? battle.playerB : battle.playerA;

        // ── Surrender ──────────────────────────────────────────────
        if (['surrender', 'quit'].includes(sub)) {
            return endBattle(sock, chatId, battle, defender.jid, attacker.jid,
                `🏳️ *@${senderId.split('@')[0]} surrendered!*`);
        }

        // ── Heal ───────────────────────────────────────────────────
        if (['heal', 'h'].includes(sub)) {
            if (attacker.usedHeal) {
                return sock.sendMessage(chatId, {
                    text: `❌ You already used your heal this battle, ${senderTag}!`,
                    mentions: [senderId],
                    ...channelInfo
                }, { quoted: message });
            }
            const healAmt = rand(HEAL_AMOUNT_MIN, HEAL_AMOUNT_MAX);
            attacker.hp = Math.min(STARTING_HP, attacker.hp + healAmt);
            attacker.usedHeal = true;
            battle.currentTurn = defender.jid;
            battle.round++;

            const lines = [
                `💊 *@${senderId.split('@')[0]} used HEAL!*`,
                ``,
                `❤️ Recovered *${healAmt} HP*!`,
                ``,
                `━━━━━━━━━━━━━━━━━━━`,
                battleStatus(battle),
                `━━━━━━━━━━━━━━━━━━━`,
                ``,
                `🎮 *Round ${battle.round} — @${battle.currentTurn.split('@')[0]}'s turn!*`,
                ``,
                controlsHint(battle, defender)
            ];
            return sock.sendMessage(chatId, {
                text: lines.join('\n'),
                mentions: [attacker.jid, defender.jid],
                ...channelInfo
            }, { quoted: message });
        }

        // ── Attack (normal or special) ─────────────────────────────
        let move, damage, isMiss = false, isSpecial = false;

        if (['special', 's'].includes(sub)) {
            if (attacker.usedSpecial) {
                return sock.sendMessage(chatId, {
                    text: `❌ You already used your special move this battle, ${senderTag}!`,
                    mentions: [senderId],
                    ...channelInfo
                }, { quoted: message });
            }
            isSpecial = true;
            move = pickRandom(SPECIALS);
            damage = rand(move.dmgMin, move.dmgMax);
            attacker.usedSpecial = true;
        } else if (['attack', 'a'].includes(sub) || sub === '') {
            move = pickRandom(ATTACKS);
            if (Math.random() < MISS_CHANCE) {
                isMiss = true;
                damage = 0;
            } else {
                damage = rand(move.dmgMin, move.dmgMax);
            }
        } else {
            return sock.sendMessage(chatId, {
                text: [
                    `❓ Unknown move. Your options:`,
                    `  \`.fight attack\``,
                    `  \`.fight special\``,
                    `  \`.fight heal\``,
                    `  \`.fight surrender\``
                ].join('\n'),
                ...channelInfo
            }, { quoted: message });
        }

        // Apply damage
        defender.hp = Math.max(0, defender.hp - damage);
        battle.currentTurn = defender.jid;
        battle.round++;

        // ── Build result message ────────────────────────────────────
        const moveEmoji = isSpecial ? '💥' : '⚔️';
        let resultLine;
        if (isMiss) {
            resultLine = `${moveEmoji} *@${senderId.split('@')[0]}* used *${move.name}* ${pickRandom(MISSES)}`;
        } else if (isSpecial) {
            resultLine = `${moveEmoji} *@${senderId.split('@')[0]}* unleashed *${move.name}* for *${damage} DMG!* 💢`;
        } else {
            resultLine = `${moveEmoji} *@${senderId.split('@')[0]}* used *${move.name}* for *${damage} DMG!*`;
        }

        // ── Check winner ────────────────────────────────────────────
        if (defender.hp <= 0) {
            return endBattle(sock, chatId, battle, attacker.jid, defender.jid,
                `${resultLine}\n\n💀 *@${defender.jid.split('@')[0]} has been defeated!*`);
        }

        const lines = [
            resultLine,
            ``,
            `━━━━━━━━━━━━━━━━━━━`,
            battleStatus(battle),
            `━━━━━━━━━━━━━━━━━━━`,
            ``,
            `🎮 *Round ${battle.round} — @${battle.currentTurn.split('@')[0]}'s turn!*`,
            ``,
            controlsHint(battle, defender)
        ];

        return sock.sendMessage(chatId, {
            text: lines.join('\n'),
            mentions: [attacker.jid, defender.jid],
            ...channelInfo
        }, { quoted: message });
    }
};
