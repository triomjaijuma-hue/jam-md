// ─── UNEB Past Papers ──────────────────────────────────────────────────────
// .uneb                    → help
// .uneb ple [year]         → PLE papers
// .uneb uce [subj] [year]  → UCE (O-Level)
// .uneb uace [subj] [year] → UACE (A-Level)

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2009 }, (_, i) => String(2010 + i));

const UCE_SUBJECTS = {
    english:          { name: 'English Language',             slug: 'english-language' },
    mathematics:      { name: 'Mathematics',                  slug: 'mathematics' },
    math:             { name: 'Mathematics',                  slug: 'mathematics' },
    physics:          { name: 'Physics',                      slug: 'physics' },
    chemistry:        { name: 'Chemistry',                    slug: 'chemistry' },
    biology:          { name: 'Biology',                      slug: 'biology' },
    history:          { name: 'History',                      slug: 'history' },
    geography:        { name: 'Geography',                    slug: 'geography' },
    commerce:         { name: 'Commerce',                     slug: 'commerce' },
    literature:       { name: 'Literature in English',        slug: 'literature' },
    crp:              { name: 'Christian Religious Ed.',      slug: 'christian-religious-education' },
    irp:              { name: 'Islamic Religious Ed.',        slug: 'islamic-religious-education' },
    agriculture:      { name: 'Agriculture',                  slug: 'agriculture' },
    computer:         { name: 'Computer Studies',             slug: 'computer-studies' },
    ict:              { name: 'Computer Studies',             slug: 'computer-studies' },
    art:              { name: 'Art & Crafts',                 slug: 'art' },
    music:            { name: 'Music',                        slug: 'music' },
    french:           { name: 'French',                       slug: 'french' },
    kiswahili:        { name: 'Kiswahili',                    slug: 'kiswahili' },
    swahili:          { name: 'Kiswahili',                    slug: 'kiswahili' },
    entrepreneurship: { name: 'Entrepreneurship',             slug: 'entrepreneurship' },
};

const UACE_SUBJECTS = {
    english:          { name: 'General Paper',                slug: 'general-paper' },
    gp:               { name: 'General Paper',                slug: 'general-paper' },
    mathematics:      { name: 'Mathematics',                  slug: 'mathematics' },
    math:             { name: 'Mathematics',                  slug: 'mathematics' },
    physics:          { name: 'Physics',                      slug: 'physics' },
    chemistry:        { name: 'Chemistry',                    slug: 'chemistry' },
    biology:          { name: 'Biology',                      slug: 'biology' },
    history:          { name: 'History',                      slug: 'history' },
    geography:        { name: 'Geography',                    slug: 'geography' },
    economics:        { name: 'Economics',                    slug: 'economics' },
    literature:       { name: 'Literature in English',        slug: 'literature' },
    crp:              { name: 'Christian Religious Ed.',      slug: 'christian-religious-education' },
    irp:              { name: 'Islamic Religious Ed.',        slug: 'islamic-religious-education' },
    agriculture:      { name: 'Agriculture',                  slug: 'agriculture' },
    computer:         { name: 'Computer Studies',             slug: 'computer-studies' },
    ict:              { name: 'Computer Studies',             slug: 'computer-studies' },
    art:              { name: 'Fine Art',                     slug: 'fine-art' },
    french:           { name: 'French',                       slug: 'french' },
    kiswahili:        { name: 'Kiswahili',                    slug: 'kiswahili' },
    swahili:          { name: 'Kiswahili',                    slug: 'kiswahili' },
    submath:          { name: 'Sub-Mathematics',              slug: 'sub-mathematics' },
    divinity:         { name: 'Divinity',                     slug: 'divinity' },
    entrepreneurship: { name: 'Entrepreneurship',             slug: 'entrepreneurship' },
};

// ─── Real PDF sources (tried in order) ────────────────────────────────────

const FETCH_OPTS = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-UG,en;q=0.9',
    },
    redirect: 'follow'
};

// Scrape a URL looking for PDF links in the HTML
async function scrapePdfLinks(url) {
    try {
        const res = await fetch(url, { ...FETCH_OPTS, signal: AbortSignal.timeout(12000) });
        if (!res.ok) return [];
        const html = await res.text();
        const matches = [...html.matchAll(/href=["']([^"']*\.pdf[^"']*)/gi)].map(m => {
            const href = m[1];
            return href.startsWith('http') ? href : new URL(href, url).href;
        });
        return [...new Set(matches)];
    } catch { return []; }
}

// Verify a URL actually returns a PDF
async function verifyPdf(url) {
    try {
        const res = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(8000),
            headers: { 'User-Agent': FETCH_OPTS.headers['User-Agent'] }
        });
        if (!res.ok) return false;
        const ct = res.headers.get('content-type') || '';
        return ct.includes('pdf') || url.toLowerCase().endsWith('.pdf');
    } catch { return false; }
}

// Try to find a real downloadable PDF for the given paper
async function findPaperPdf(examType, subjectInfo, year) {
    const exam = examType.toUpperCase();
    const slug = subjectInfo.slug;
    const name = subjectInfo.name.replace(/ /g, '+');

    // 1. Try UNEB official site — scrape the past-papers page
    const unebPage = `https://www.uneb.ac.ug/past-papers/?exam=${exam}&year=${year}&subject=${slug}`;
    const unebLinks = await scrapePdfLinks(unebPage);
    for (const link of unebLinks) {
        if (await verifyPdf(link)) return link;
    }

    // 2. Try UNEB WordPress uploads with common filename patterns
    const patterns = [
        `https://www.uneb.ac.ug/wp-content/uploads/${year}/${exam}-${slug}-${year}.pdf`,
        `https://www.uneb.ac.ug/wp-content/uploads/${year}/${slug}-${year}.pdf`,
        `https://www.uneb.ac.ug/wp-content/uploads/${year}/${exam.toLowerCase()}-${slug}-${year}.pdf`,
        `https://www.uneb.ac.ug/wp-content/uploads/${year}/${year}-${exam}-${slug}.pdf`,
    ];
    for (const url of patterns) {
        if (await verifyPdf(url)) return url;
    }

    // 3. Try pastpapers.co.ug
    const pastPapersBase = `https://www.pastpapers.co.ug/${exam.toLowerCase()}-past-papers/${slug}/`;
    const pastLinks = await scrapePdfLinks(pastPapersBase);
    for (const link of pastLinks) {
        if (link.includes(year) && await verifyPdf(link)) return link;
    }

    // 4. Try ugandaexams.net
    const ugExamsUrl = `https://ugandaexams.net/${exam.toLowerCase()}/${slug}/${year}/`;
    const ugLinks = await scrapePdfLinks(ugExamsUrl);
    for (const link of ugLinks) {
        if (await verifyPdf(link)) return link;
    }

    return null;
}

async function findPlePdf(year) {
    const unebPage = `https://www.uneb.ac.ug/past-papers/?exam=PLE&year=${year}`;
    const links = await scrapePdfLinks(unebPage);
    for (const link of links) {
        if (await verifyPdf(link)) return link;
    }
    const patterns = [
        `https://www.uneb.ac.ug/wp-content/uploads/${year}/PLE-${year}.pdf`,
        `https://www.uneb.ac.ug/wp-content/uploads/${year}/ple-${year}.pdf`,
    ];
    for (const url of patterns) {
        if (await verifyPdf(url)) return url;
    }
    return null;
}

// ─── Search links (always available as fallback) ────────────────────────────

function googlePdfSearch(exam, subject, year) {
    const q = encodeURIComponent(`UNEB ${exam} ${subject} ${year} past paper`);
    return `https://www.google.com/search?q=${q}+filetype%3Apdf`;
}

function unebOfficialPage(exam, year, slug) {
    return `https://www.uneb.ac.ug/past-papers/?exam=${exam}&year=${year}&subject=${slug}`;
}

// ─── Help text ──────────────────────────────────────────────────────────────

function formatSubjects(map) {
    return Object.entries(map)
        .filter(([k]) => !['math', 'ict', 'swahili', 'gp'].includes(k))
        .map(([k, v]) => `  • *${k}* — ${v.name}`)
        .join('\n');
}

function helpText() {
    return [
        `📚 *UNEB Past Papers*`,
        ``,
        `*Usage:*`,
        `  • *.uneb ple [year]* — Primary Leaving Exam`,
        `  • *.uneb uce [subject] [year]* — O-Level`,
        `  • *.uneb uace [subject] [year]* — A-Level`,
        ``,
        `*Examples:*`,
        `  .uneb ple 2023`,
        `  .uneb uce mathematics 2022`,
        `  .uneb uace physics 2021`,
        ``,
        `*Available years:* 2010 – ${CURRENT_YEAR - 1}`,
        ``,
        `*UCE Subjects:*`,
        formatSubjects(UCE_SUBJECTS),
        ``,
        `*UACE Subjects:*`,
        formatSubjects(UACE_SUBJECTS),
    ].join('\n');
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

            await sock.sendMessage(chatId, {
                text: `🔍 Searching for PLE ${year} papers...`
            }, { quoted: message });

            const pdf = await findPlePdf(year);

            if (pdf) {
                try {
                    return await sock.sendMessage(chatId, {
                        document: { url: pdf },
                        mimetype: 'application/pdf',
                        fileName: `UNEB_PLE_${year}.pdf`,
                        caption: `📄 *UNEB PLE ${year} Past Paper*`
                    }, { quoted: message });
                } catch { /* fall through */ }
            }

            const pleSubjects = ['English', 'Mathematics', 'SST & Religious Education', 'Integrated Science'];
            return sock.sendMessage(chatId, {
                text: [
                    `📚 *UNEB PLE ${year} Past Papers*`,
                    `━━━━━━━━━━━━━━━━━━━`,
                    ``,
                    `*Subjects:*`,
                    ...pleSubjects.map((s, i) => `  ${i + 1}. ${s}`),
                    ``,
                    `📥 *Download PDFs:*`,
                    `${unebOfficialPage('PLE', year, '')}`,
                    ``,
                    `🔎 *Google PDF search:*`,
                    `${googlePdfSearch('PLE', 'Primary Leaving Exam', year)}`,
                    ``,
                    `_Tap either link and look for the PDF download buttons._`
                ].join('\n')
            }, { quoted: message });
        }

        // ── UCE / UACE ────────────────────────────────────────────────────────
        if (examRaw === 'uce' || examRaw === 'uace') {
            const subjects = examRaw === 'uce' ? UCE_SUBJECTS : UACE_SUBJECTS;
            const examLabel = examRaw === 'uce' ? 'UCE (O-Level)' : 'UACE (A-Level)';

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
                const keys = Object.keys(subjects)
                    .filter(k => !['math', 'ict', 'swahili', 'gp'].includes(k)).join(', ');
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
                text: `🔍 Searching for ${examLabel} *${subjectInfo.name}* ${yearArg} paper...`
            }, { quoted: message });

            const pdf = await findPaperPdf(examRaw, subjectInfo, yearArg);

            if (pdf) {
                try {
                    return await sock.sendMessage(chatId, {
                        document: { url: pdf },
                        mimetype: 'application/pdf',
                        fileName: `UNEB_${examRaw.toUpperCase()}_${subjectInfo.name.replace(/ /g, '_')}_${yearArg}.pdf`,
                        caption: [
                            `📄 *UNEB ${examLabel}*`,
                            `*Subject:* ${subjectInfo.name}`,
                            `*Year:* ${yearArg}`
                        ].join('\n')
                    }, { quoted: message });
                } catch { /* fall through to links */ }
            }

            return sock.sendMessage(chatId, {
                text: [
                    `📚 *UNEB ${examLabel} — ${subjectInfo.name} (${yearArg})*`,
                    `━━━━━━━━━━━━━━━━━━━`,
                    ``,
                    `⚠️ _Couldn't auto-download the PDF. Use the links below:_`,
                    ``,
                    `🌐 *UNEB Official Page:*`,
                    unebOfficialPage(examRaw.toUpperCase(), yearArg, subjectInfo.slug),
                    ``,
                    `🔎 *Google PDF search:*`,
                    googlePdfSearch(examRaw.toUpperCase(), subjectInfo.name, yearArg),
                    ``,
                    `📌 *Direct site search:*`,
                    `https://www.google.com/search?q=site:uneb.ac.ug+${encodeURIComponent(subjectInfo.name)}+${yearArg}+filetype:pdf`,
                    ``,
                    `_Open any link above, find the paper, then download the PDF._`
                ].join('\n')
            }, { quoted: message });
        }

        // ── Shorthand: .uneb mathematics 2022 (guess UCE) ─────────────────────
        const uceMatch = UCE_SUBJECTS[examRaw];
        const yearGuess = args[1];
        if (uceMatch && yearGuess && YEARS.includes(yearGuess)) {
            return this.handler(sock, message, ['uce', examRaw, yearGuess], context);
        }

        return sock.sendMessage(chatId, { text: helpText() }, { quoted: message });
    }
};
