const mathGames = {};
let mathListenerRegistered = false;
const pendingMathMode = {};
const modes = {
    noob: [-3, 3, -3, 3, '+-', 15000],
    easy: [-10, 10, -10, 10, '*/+-', 20000],
    normal: [-40, 40, -20, 20, '*/+-', 40000],
    hard: [-100, 100, -70, 70, '*/+-', 60000],
    extreme: [-999999, 999999, -999999, 999999, '*/', 99999],
    impossible: [-99999999999, 99999999999, -99999999999, 999999999999, '*/', 30000],
    impossible2: [-999999999999999, 999999999999999, -999, 999, '/', 30000],
};
const operators = { '+': '+', '-': '-', '*': '×', '/': '÷' };

function genMath(mode) {
    const [a1, a2, b1, b2, ops, time] = modes[mode];
    let a = randomInt(a1, a2);
    const b = randomInt(b1, b2);
    const op = pickRandom([...ops]);
    const expr = `${a} ${op.replace('/', '*')} ${b < 0 ? `(${b})` : b}`;
    let result = eval(expr);
    if (op === '/') [a, result] = [result, a];
    return { str: `${a} ${operators[op]} ${b}`, mode, time, result };
}
function randomInt(from, to) {
    if (from > to) [from, to] = [to, from];
    return Math.floor(Math.random() * (Math.floor(to) - Math.ceil(from) + 1) + Math.ceil(from));
}
function pickRandom(list) { return list[Math.floor(Math.random() * list.length)]; }

async function startGame(sock, chat, mode, quotedMsg) {
    const math = genMath(mode);
    const text = `▢ HOW MUCH IS IT *${math.str}*=\n\n_Time:_ ${(math.time / 1000).toFixed(2)} seconds`;
    const sentMsg = await sock.sendMessage(chat, { text }, { quoted: quotedMsg });
    mathGames[chat] = {
        msg: sentMsg, math, attempts: 4,
        timeout: setTimeout(() => {
            if (mathGames[chat]) {
                sock.sendMessage(chat, { text: `⏳ *Time is up!*\nThe answer was: *${math.result}*` }, { quoted: mathGames[chat].msg });
                delete mathGames[chat];
            }
        }, math.time)
    };
}

export default {
    command: 'math',
    aliases: ['maths', 'ganit'],
    category: 'games',
    description: 'Solve math problems',
    usage: '.math [difficulty]',
    async handler(sock, message, args, _context) {
        const { chatId, config } = _context;
        if (mathGames[chatId]) {
            return sock.sendMessage(chatId, { text: '⚠️ Solve the current problem first!' }, { quoted: mathGames[chatId].msg });
        }
        const mode = args[0]?.toLowerCase();
        if (mode && mode in modes) {
            // User provided difficulty directly e.g. .math normal
            delete pendingMathMode[chatId];
            await startGame(sock, chatId, mode, message);
        } else {
            // Show difficulty menu
            pendingMathMode[chatId] = { ts: Date.now() };
            await sock.sendMessage(chatId, {
                text: `🧮 *Available Difficulties:*\n\n${Object.keys(modes).join(' | ')}\n\n_Reply with a difficulty name or type e.g. *.math normal*_`
            }, { quoted: message });
        }
        if (!mathListenerRegistered) {
            mathListenerRegistered = true;
            sock.ev.on('messages.upsert', async (upsert) => {
                const m = upsert.messages[0];
                if (!m || !m.message || m.key.fromMe) return;
                const chat = m.key.remoteJid;
                const body = (
                    m.message.conversation ||
                    m.message.extendedTextMessage?.text ||
                    ''
                ).trim();
                // Handle pending difficulty selection
                if (pendingMathMode[chat] && (Date.now() - pendingMathMode[chat].ts) < 120000) {
                    const rawMode = body.toLowerCase().replace(/^[.!/]/, '').trim();
                    if (rawMode in modes && !mathGames[chat]) {
                        delete pendingMathMode[chat];
                        await startGame(sock, chat, rawMode, m);
                        return;
                    }
                }
                // Handle answer checking
                if (!mathGames[chat]) return;
                if (!/^-?[0-9]+(\.[0-9]+)?$/.test(body)) return;
                const quotedText = (
                    m.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                    m.message.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
                    ''
                );
                if (!/^▢ HOW MUCH IS IT/i.test(quotedText)) return;
                const game = mathGames[chat];
                if (Number(body) === game.math.result) {
                    clearTimeout(game.timeout);
                    delete mathGames[chat];
                    await sock.sendMessage(chat, { text: `✅ *Correct answer!*\n\nYou won the game.` }, { quoted: m });
                } else {
                    game.attempts--;
                    if (game.attempts <= 0) {
                        clearTimeout(game.timeout);
                        delete mathGames[chat];
                        await sock.sendMessage(chat, { text: `❌ *Game Over!*\n\nThe correct answer was: *${game.math.result}*` }, { quoted: m });
                    } else {
                        await sock.sendMessage(chat, { text: `❎ *Wrong answer!*\n\nYou have ${game.attempts} attempts left.` }, { quoted: m });
                    }
                }
            });
        }
    }
};
