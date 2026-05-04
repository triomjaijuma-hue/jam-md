const WORDS = [
    'javascript','nodejs','python','typescript','database','algorithm','function',
    'variable','developer','programming','software','internet','keyboard','monitor',
    'password','security','network','server','browser','download','whatsapp','telegram',
    'computer','android','iphone','battery','charger','wireless','bluetooth','satellite',
    'elephant','dolphin','penguin','giraffe','kangaroo','chocolate','strawberry',
    'mountain','universe','adventure','beautiful','wonderful','fantastic','celebrate'
];

const HANGMAN_ART = [
    '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```'
];

const games = {};

export default {
    command: 'hangman',
    aliases: ['hang', 'hm', 'guess'],
    category: 'games',
    description: 'Play Hangman — guess the word letter by letter',
    usage: '.hangman to start | .guess <letter> to play',

    async handler(sock, message, args, context) {
        const { chatId } = context;
        const raw = (
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text || ''
        ).trim();
        const cmdUsed = raw.slice(1).split(/\s+/)[0].toLowerCase();
        const senderJid = message.key.participant || message.key.remoteJid;
        const senderTag = `@${senderJid.split('@')[0]}`;

        // ── .guess <letter> ─────────────────────────────────────────
        if (cmdUsed === 'guess') {
            const letter = args[0]?.toLowerCase();
            if (!letter || !/^[a-z]$/.test(letter)) {
                return sock.sendMessage(chatId, {
                    text: '❌ Please guess a *single letter*.\nExample: _.guess a_'
                }, { quoted: message });
            }
            if (!games[chatId]) {
                return sock.sendMessage(chatId, {
                    text: '❌ No hangman game is running.\nStart one with _.hangman_'
                }, { quoted: message });
            }

            const game = games[chatId];
            if (game.guessed.includes(letter)) {
                return sock.sendMessage(chatId, {
                    text: `⚠️ ${senderTag} already guessed *"${letter}"* — try another letter!\n\n${game.display.join(' ')}`
                }, {
                    quoted: message,
                    mentions: [senderJid]
                });
            }

            game.guessed.push(letter);
            const isCorrect = game.word.includes(letter);

            if (isCorrect) {
                for (let i = 0; i < game.word.length; i++) {
                    if (game.word[i] === letter) game.display[i] = letter;
                }
            } else {
                game.wrong++;
            }

            const won  = !game.display.includes('_');
            const lost = game.wrong >= 6;

            const art = HANGMAN_ART[game.wrong];
            const guessedStr = game.guessed.join(' ').toUpperCase();

            if (won) {
                delete games[chatId];
                return sock.sendMessage(chatId, {
                    text: `🎉 *${senderTag} guessed it!*\n\nThe word was: *${game.word.toUpperCase()}*\n\n${art}\n\n🏆 Congratulations!`
                }, { quoted: message, mentions: [senderJid] });
            }
            if (lost) {
                delete games[chatId];
                return sock.sendMessage(chatId, {
                    text: `💀 *Game Over!*\n\nThe word was: *${game.word.toUpperCase()}*\n\n${art}\n\n_Better luck next time! Start a new game with .hangman_`
                }, { quoted: message });
            }

            const livesLeft = 6 - game.wrong;
            const resultLine = isCorrect
                ? `✅ ${senderTag} — *"${letter}"* is correct!`
                : `❌ ${senderTag} — *"${letter}"* is NOT in the word.`;

            await sock.sendMessage(chatId, {
                text: `${resultLine}\n\n${art}\n\n*Word:* ${game.display.join(' ')}\n\n💔 *Lives left:* ${livesLeft}/6\n📝 *Guessed:* ${guessedStr}\n\n_Use .guess <letter> to continue_`
            }, { quoted: message, mentions: [senderJid] });
            return;
        }

        // ── .hangman — start new game ────────────────────────────────
        if (games[chatId]) {
            const g = games[chatId];
            return sock.sendMessage(chatId, {
                text: `⚠️ A game is already in progress!\n\n${HANGMAN_ART[g.wrong]}\n\n*Word:* ${g.display.join(' ')}\n💔 *Lives left:* ${6 - g.wrong}/6\n\n_Guess with .guess <letter>  |  Stop with .stophangman_`
            }, { quoted: message });
        }

        const word = WORDS[Math.floor(Math.random() * WORDS.length)];
        games[chatId] = {
            word,
            display: Array(word.length).fill('_'),
            guessed: [],
            wrong: 0
        };

        await sock.sendMessage(chatId, {
            text: `🎮 *HANGMAN STARTED!*\n\n${HANGMAN_ART[0]}\n\n*Word:* ${'_ '.repeat(word.length).trim()} _(${word.length} letters)_\n\n💔 *Lives:* 6/6\n\n_Guess with .guess <letter>_\n_Stop anytime with .stophangman_`
        }, { quoted: message });
    }
};
