const WORDS = [
    // Tech
    'javascript','python','android','keyboard','internet','software','database','network',
    'password','bluetooth','download','wireless','satellite','algorithm','developer',
    // Animals
    'elephant','dolphin','penguin','giraffe','kangaroo','crocodile','flamingo','cheetah',
    'butterfly','squirrel','porcupine','armadillo','chameleon','hedgehog','wolverine',
    // Food
    'chocolate','strawberry','pineapple','watermelon','avocado','cinnamon','blueberry',
    'mushroom','broccoli','spaghetti','lemonade','croissant','macaroni','coconut',
    // Nature
    'mountain','volcano','hurricane','lightning','rainbow','earthquake','avalanche',
    'waterfall','sunflower','butterfly','dragonfly','bamboo','cactus','tornado',
    // General
    'adventure','beautiful','wonderful','fantastic','celebrate','community','discovery',
    'happiness','friendship','challenge','knowledge','patience','together','treasure'
];

function scramble(word) {
    const arr = word.split('');
    let scrambled;
    let attempts = 0;
    do {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        scrambled = arr.join('');
        attempts++;
    } while (scrambled === word && attempts < 20);
    return scrambled;
}

function hint(word) {
    // Reveal first and last letter, hide middle
    if (word.length <= 3) return word[0] + '_'.repeat(word.length - 1);
    return word[0] + '_'.repeat(word.length - 2) + word[word.length - 1];
}

const wordGames = {};

export default {
    command: 'wordgame',
    aliases: ['wordscramble', 'unscramble', 'scramble', 'stopword', 'wordstop'],
    category: 'games',
    description: 'Scrambled word game — first to unscramble wins!',
    usage: '.wordgame to start | type the answer to win',
    initialized: false,

    async handler(sock, message, args, context) {
        const { chatId } = context;
        const raw = (
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text || ''
        ).trim();
        const cmdUsed = raw.slice(1).split(/\s+/)[0].toLowerCase();

        // ── Stop command ─────────────────────────────────────────────
        if (['stopword', 'wordstop'].includes(cmdUsed)) {
            if (!wordGames[chatId]) {
                return sock.sendMessage(chatId, {
                    text: '❌ No word game is running right now.'
                }, { quoted: message });
            }
            const game = wordGames[chatId];
            clearTimeout(game.timeout);
            if (game.hintTimeout) clearTimeout(game.hintTimeout);
            delete wordGames[chatId];
            return sock.sendMessage(chatId, {
                text: `🛑 *Word game stopped!*\n\nThe word was: *${game.word.toUpperCase()}*`
            }, { quoted: message });
        }

        // ── Already running ─────────────────────────────────────────
        if (wordGames[chatId]) {
            const game = wordGames[chatId];
            const elapsed = Math.floor((Date.now() - game.startTime) / 1000);
            const remaining = 45 - elapsed;
            return sock.sendMessage(chatId, {
                text: `⚠️ A word game is already running!\n\n🔀 *Scrambled:* \`${game.scrambled.toUpperCase()}\`\n⏱️ *Time left:* ~${remaining}s\n\n_Type the answer to win! Or .stopword to quit._`
            }, { quoted: message });
        }

        // ── Start new game ───────────────────────────────────────────
        const word = WORDS[Math.floor(Math.random() * WORDS.length)];
        const scrambled = scramble(word);
        const category = getCategoryHint(word);

        const hintTimeout = setTimeout(() => {
            if (wordGames[chatId]) {
                sock.sendMessage(chatId, {
                    text: `💡 *Hint:* The word looks like \`${hint(word).toUpperCase()}\` _(${word.length} letters)_\n\n🔀 *Scrambled:* \`${scrambled.toUpperCase()}\`\n\n_15 seconds left!_`
                });
            }
        }, 30000);

        const timeout = setTimeout(() => {
            if (wordGames[chatId]) {
                delete wordGames[chatId];
                sock.sendMessage(chatId, {
                    text: `⏰ *Time's up! Nobody got it.*\n\nThe word was: *${word.toUpperCase()}*\n\n_Start a new game with .wordgame_`
                });
            }
        }, 45000);

        wordGames[chatId] = {
            word,
            scrambled,
            startTime: Date.now(),
            timeout,
            hintTimeout
        };

        await sock.sendMessage(chatId, {
            text: `🔤 *WORD SCRAMBLE GAME!*\n━━━━━━━━━━━━━━━━━━━\n\n🔀 *Unscramble this word:*\n\n*\`${scrambled.toUpperCase()}\`*\n\n📂 *Category:* ${category}\n🔢 *Letters:* ${word.length}\n⏱️ *Time:* 45 seconds\n\n━━━━━━━━━━━━━━━━━━━\n_Just type the answer — first correct answer wins!_`
        }, { quoted: message });

        // ── Listen for answers ───────────────────────────────────────
        if (!this.initialized) {
            this.initialized = true;
            sock.ev.on('messages.upsert', async (upsert) => {
                const m = upsert.messages[0];
                if (!m?.message || m.key.fromMe) return;
                const chat = m.key.remoteJid;
                if (!wordGames[chat]) return;

                const body = (
                    m.message.conversation ||
                    m.message.extendedTextMessage?.text || ''
                ).trim().toLowerCase();

                // Ignore commands
                if (!body || body.startsWith('.')) return;

                const game = wordGames[chat];
                if (body === game.word.toLowerCase()) {
                    clearTimeout(game.timeout);
                    if (game.hintTimeout) clearTimeout(game.hintTimeout);
                    delete wordGames[chat];

                    const winnerJid = m.key.participant || m.key.remoteJid;
                    const timeTaken = ((Date.now() - game.startTime) / 1000).toFixed(1);

                    await sock.sendMessage(chat, {
                        text: `🎉 *@${winnerJid.split('@')[0]} got it!*\n\n✅ The word was: *${game.word.toUpperCase()}*\n⏱️ Solved in: *${timeTaken}s*\n\n_Start another with .wordgame_ 🔤`
                    }, { quoted: m, mentions: [winnerJid] });
                }
            });
        }
    }
};

function getCategoryHint(word) {
    const tech    = ['javascript','python','android','keyboard','internet','software','database','network','password','bluetooth','download','wireless','satellite','algorithm','developer'];
    const animals = ['elephant','dolphin','penguin','giraffe','kangaroo','crocodile','flamingo','cheetah','butterfly','squirrel','porcupine','armadillo','chameleon','hedgehog','wolverine'];
    const food    = ['chocolate','strawberry','pineapple','watermelon','avocado','cinnamon','blueberry','mushroom','broccoli','spaghetti','lemonade','croissant','macaroni','coconut'];
    const nature  = ['mountain','volcano','hurricane','lightning','rainbow','earthquake','avalanche','waterfall','sunflower','butterfly','dragonfly','bamboo','cactus','tornado'];
    if (tech.includes(word))    return '💻 Technology';
    if (animals.includes(word)) return '🐾 Animals';
    if (food.includes(word))    return '🍽️ Food & Drink';
    if (nature.includes(word))  return '🌿 Nature';
    return '🌐 General Knowledge';
}
