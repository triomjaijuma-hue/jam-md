// Uganda East Africa Time (EAT = UTC+3) formatter
// Use this everywhere instead of new Date().toLocaleString()

const TZ = 'Africa/Kampala';

/**
 * Full date + time string in Uganda time
 * e.g. "Mon, 04 May 2026, 14:35"
 */
export function ugaNow() {
    return new Date().toLocaleString('en-GB', {
        timeZone: TZ,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(',', '');
}

/**
 * Time only in Uganda time  e.g. "14:35"
 */
export function ugaTime() {
    return new Date().toLocaleTimeString('en-GB', {
        timeZone: TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

/**
 * Date only in Uganda time  e.g. "04 May 2026"
 */
export function ugaDate() {
    return new Date().toLocaleDateString('en-GB', {
        timeZone: TZ,
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

/**
 * Format any timestamp (ms) as Uganda full datetime
 */
export function ugaFormat(tsMs) {
    return new Date(tsMs).toLocaleString('en-GB', {
        timeZone: TZ,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(',', '');
}
