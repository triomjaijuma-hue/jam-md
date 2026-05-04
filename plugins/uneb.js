// ─── UNEB Past Papers ──────────────────────────────────────────────────────
// Usage:
//   .uneb                   → show help & subjects
//   .uneb ple [year]        → PLE papers
//   .uneb uce [subj] [year] → UCE (O-Level) paper
//   .uneb uace [subj] [year]→ UACE (A-Level) paper

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2009 }, (_, i) => String(2010 + i));

// Subject aliases (normalised → display name + UNEB slug)
const UCE_SUBJECTS = {
    english:        { name: 'English Language',          slug: 'english-language' },
    mathematics:    { name: 'Mathematics',               slug: 'mathematics' },
    math:           { name: 'Mathematics',               slug: 'mathematics' },
    physics:        { name: 'Physics',                   slug: 'physics' },
    chemistry:      { name: 'Chemistry',                 slug: 'chemistry' },
    biology:        { name: 'Biology',                   slug: 'biology' },
    history:        { name: 'History',                   slug: 'history' },
    geography:      { name: 'Geography',                 slug: 'geography' },
    commerce:       { name: 'Commerce',                  slug: 'commerce' },
    literature:     { name: 'Literature in English',     slug: 'literature' },
    crp:            { name: 'Christian Religious Ed.',   slug: 'christian-religious-education' },
    irp:            { name: 'Islamic Religious Ed.',     slug: 'islamic-religious-education' },
    agriculture:    { name: 'Agriculture',               slug: 'agriculture' },
    computer:       { name: 'Computer Studies',          slug: 'computer-studies' },
    ict:            { name: 'Computer Studies',          slug: 'computer-studies' },
    art:            { name: 'Art & Crafts',              slug: 'art' },
    music:          { name: 'Music',                     slug: 'music' },
    french:         { name: 'French',                    slug: 'french' },
    kiswahili:      { name: 'Kiswahili',                 slug: 'kiswahili' },
    swahili:        { name: 'Kiswahili',                 slug: 'kiswahili' },
    entrepreneurship: { name: 'Entrepreneurship',        slug: 'entrepreneurship' },
};

const UACE_SUBJECTS = {
    english:        { name: 'General Paper',             slug: 'general-paper' },
    gp:             { name: 'General Paper',             slug: 'general-paper' },
    mathematics:    { name: 'Mathematics',               slug: 'mathematics' },
    math:           { name: 'Mathematics',               slug: 'mathematics' },
    physics:        { name: 'Physics',                   slug: 'physics' },
    chemistry:      { name: 'Chemistry',                 slug: 'chemistry' },
    biology:        { name: 'Biology',                   slug: 'biology' },
    history:        { name: 'History',                   slug: 'history' },
    geography:      { name: 'Geography',                 slug: 'geography' },
    economics:      { name: 'Economics',                 slug: 'economics' },
    literature:     { name: 'Literature in English',     slug: 'literature' },
    crp:            { name: 'Christian Religious Ed.',   slug: 'christian-religious-education' },
    irp:            { name: 'Islamic Religious Ed.',     slug: 'islamic-religious-education' },
    agriculture:    { name: 'Agriculture',               slug: 'agriculture' },
    computer:       { name: 'Computer Studies',          slug: 'computer-studies' },
    ict:            { name: 'Computer Studies',          slug: 'computer-studies' },
    art:            { name: 'Art',                       slug: 'art' },
    french:         { name: 'French',                    slug: 'french' },
    kiswahili:      { name: 'Kiswahili',                 slug: 'kiswahili' },
    swahili:        { name: 'Kiswahili',                 slug: 'kiswahili' },
    submath:        { name: 'Sub-Mathematics',           slug: 'sub-mathematics' },
    fine:           { name: 'Fine Art',                  slug: 'fine-art' },
    divinity:       { name: 'Divinity',                  slug: 'divinity' },
    entrepreneurship: { name: 'Entrepreneurship',        slug: 'entrepreneurship' },
};

// ─── URL builders ─────────────────────────────────────────────────────────

function unebOfficialUrl(examType, year, subjectSlug) {
    // UNEB official past papers page
    return `https://www.uneb.ac.ug/past-papers/?exam=${examType}&year=${year}&subject=${subjectSlug}`;
}

function unebSearchUrl(examType, subject, year) {
    return `https://www.google.com/search?q=UNEB+${examType}+${subject}+${year}+past+paper+PDF+site:uneb.ac.ug`;
}

function altSearchUrl(examType, subject, year) {
    return `https://www.google.com/search?q=UNEB+Uganda+${examType}+${subject}+past+paper+${year}+PDF`;
}

// Try fetching a real PDF from known sources
async function tryFetchPaperUrl(examType, subjectSlug, year) {
    // Try UNEB official domain variations
    const candidates = [
        `https://www.uneb.ac.ug/wp-content/uploads/${year}/${examType.toLowerCase()}-${subjectSlug}-${year}.pdf`,
        `https://www.uneb.ac.ug/wp-content/uploads/${year}/${examType.toUpperCase()}-${year}-${subjectSlug}.pdf`,
        `https://www.uneb.ac.ug/past-papers/${examType.toLowerCase()}/${year}/${subjectSlug}.pdf`,
        `https://www.uneb.ac.ug/${year}/${subjectSlug}-${examType.toLowerCase()}.pdf`,
    ];
    for (const url of candidates) {
        try {
            const res = await fetch(url, {
                method: 'HEAD',
                signal: AbortSignal.timeout(5000),
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (res.ok && res.headers.get('content-type')?.includes('pdf')) return url;
        } catch { continue; }
    }
    return null;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatUceSubjects() {
    return Object.entries(UCE_SUBJECTS)
        .filter(([k]) => !['math', 'ict', 'swahili'].includes(k))
        .map(([k, v]) => `  • *${k}* — ${v.name}`)
        .join('\n');
}

function formatUaceSubjects() {
    return Object.entries(UACE_SUBJECTS)
        .filter(([k]) => !['math', 'ict', 'swahili', 'gp'].includes(k))
        .map(([k, v]) => `  • *${k}* — ${v.name}`)
        .join('\n');
}

function helpText() {
    return `📚 *UNEB Past Papers*\n\n` +
        `*Usage:*\n` +
        `  • *.uneb ple [year]* — Primary Leaving Exam\n` +
        `  • *.uneb uce [subject] [year]* — O-Level\n` +
        `  • *.uneb uace [subject] [year]* — A-Level\n\n` +
        `*Examples:*\n` +
        `  *.uneb ple 2023*\n` +
        `  *.uneb uce mathematics 2022*\n` +
        `  *.uneb uace physics 2021*\n\n` +
        `*Available years:* 2010 – ${CURRENT_YEAR - 1}\n\n` +
        `*UCE Subjects:*\n${formatUceSubjects()}\n\n` +
        `*UACE Subjects:*\n${formatUaceSubjects()}\n\n` +
        `_Tip: Use *.uneb uce* or *.uneb uace* to see subject list_`;
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export default {
    command: 'uneb',
    aliases: ['pastpaper', 'pastpapers', 'exampaper', 'uace', 'uce', 'ple'],
    category: 'education',
    description: 'Get UNEB past papers (PLE, UCE, UACE) by subject and year',
    usage: '.uneb [exam] [subject] [year]',

    async handler(sock, message, args, context) {
        const { chatId } = context;

        if (!args.length) {
            return sock.sendMessage(chatId, { text: helpText() }, { quoted: message });
        }

        const examRaw = args[0]?.toLowerCase();

        // ── PLE ──────────────────────────────────────────────────────────────
        if (examRaw === 'ple') {
            const year = args[1] || String(CURRENT_YEAR - 1);
            if (!YEARS.includes(year)) {
                return sock.sendMessage(chatId, {
                    text: `❌ *Invalid year.* Available: 2010 – ${CURRENT_YEAR - 1}`
                }, { quoted: message });
            }

            await sock.sendMessage(chatId, { text: `🔍 Searching PLE ${year} papers...` }, { quoted: message });

            const pleSubjects = ['English', 'Mathematics', 'Social Studies & Religious Education (SST/RE)', 'Integrated Science'];
            const offUrl = `https://www.uneb.ac.ug/past-papers/?exam=PLE&year=${year}`;
            const searchUrl = `https://www.google.com/search?q=UNEB+PLE+${year}+past+paper+PDF`;

            let text = `📚 *UNEB PLE ${year} Past Papers*\n`;
            text += `━━━━━━━━━━━━━━━━━━━\n\n`;
            text += `*Subjects examined:*\n`;
            pleSubjects.forEach((s, i) => { text += `  ${i + 1}. ${s}\n`; });
            text += `\n🌐 *Official UNEB page:*\n${offUrl}\n\n`;
            text += `🔎 *Search for PDF:*\n${searchUrl}\n\n`;
            text += `_Tap the official link or search link to find and download the PDFs._`;

            return sock.sendMessage(chatId, { text }, { quoted: message });
        }

        // ── UCE / UACE ────────────────────────────────────────────────────────
        if (examRaw === 'uce' || examRaw === 'uace') {
            const subjects = examRaw === 'uce' ? UCE_SUBJECTS : UACE_SUBJECTS;
            const examLabel = examRaw === 'uce' ? 'UCE (O-Level)' : 'UACE (A-Level)';

            // No subject — list subjects
            if (!args[1]) {
                const list = Object.entries(subjects)
                    .filter(([k]) => !['math', 'ict', 'swahili', 'gp'].includes(k))
                    .map(([k, v]) => `  • *${k}* — ${v.name}`)
                    .join('\n');
                return sock.sendMessage(chatId, {
                    text: `📚 *${examLabel} Subjects:*\n\n${list}\n\n_Usage: *.uneb ${examRaw} [subject] [year]*_`
                }, { quoted: message });
            }

            const subjectKey = args[1]?.toLowerCase().replace(/[^a-z]/g, '');
            const yearArg = args[2] || String(CURRENT_YEAR - 1);

            const subjectInfo = subjects[subjectKey];
            if (!subjectInfo) {
                const keys = Object.keys(subjects).filter(k => !['math', 'ict', 'swahili', 'gp'].includes(k)).join(', ');
                return sock.sendMessage(chatId, {
                    text: `❌ *Unknown subject:* _${subjectKey}_\n\n*Available:* ${keys}`
                }, { quoted: message });
            }

            if (!YEARS.includes(yearArg)) {
                return sock.sendMessage(chatId, {
                    text: `❌ *Invalid year.* Available: 2010 – ${CURRENT_YEAR - 1}`
                }, { quoted: message });
            }

            await sock.sendMessage(chatId, {
                text: `🔍 Searching ${examLabel} ${subjectInfo.name} ${yearArg}...`
            }, { quoted: message });

            // Try to find a direct PDF link
            const directPdf = await tryFetchPaperUrl(examRaw.toUpperCase(), subjectInfo.slug, yearArg);

            const offUrl  = `https://www.uneb.ac.ug/past-papers/?exam=${examRaw.toUpperCase()}&year=${yearArg}&subject=${subjectInfo.slug}`;
            const searchUrl = altSearchUrl(examRaw.toUpperCase(), subjectInfo.name.replace(/ /g, '+'), yearArg);

            if (directPdf) {
                // Send as document
                try {
                    await sock.sendMessage(chatId, {
                        document: { url: directPdf },
                        mimetype: 'application/pdf',
                        fileName: `UNEB_${examRaw.toUpperCase()}_${subjectInfo.name.replace(/ /g, '_')}_${yearArg}.pdf`,
                        caption: `📄 *UNEB ${examLabel}*\n*Subject:* ${subjectInfo.name}\n*Year:* ${yearArg}`
                    }, { quoted: message });
                    return;
                } catch { /* fall through to text */ }
            }

            // Text fallback with links
            let text = `📚 *UNEB ${examLabel} — ${subjectInfo.name} (${yearArg})*\n`;
            text += `━━━━━━━━━━━━━━━━━━━\n\n`;
            text += directPdf
                ? `✅ *Direct PDF link found:*\n${directPdf}\n\n`
                : `⚠️ _Direct PDF link not auto-found. Use the links below:_\n\n`;
            text += `🌐 *UNEB Official Page:*\n${offUrl}\n\n`;
            text += `🔎 *Google Search:*\n${searchUrl}\n\n`;
            text += `📌 *Also try:*\nhttps://www.google.com/search?q=site:uneb.ac.ug+${examRaw.toUpperCase()}+${yearArg}+${encodeURIComponent(subjectInfo.name)}+past+paper\n\n`;
            text += `_Tap any link to find and download the PDF._`;

            return sock.sendMessage(chatId, { text }, { quoted: message });
        }

        // ── Fallback: user may have typed subject directly ─────────────────
        // e.g. .uneb mathematics 2022  (guessing UCE)
        const possibleSubject = examRaw;
        const possibleYear = args[1];

        const uceMatch = UCE_SUBJECTS[possibleSubject];
        if (uceMatch && possibleYear && YEARS.includes(possibleYear)) {
            // re-invoke as UCE
            return this.handler(sock, message, ['uce', possibleSubject, possibleYear], context);
        }

        return sock.sendMessage(chatId, { text: helpText() }, { quoted: message });
    }
};
