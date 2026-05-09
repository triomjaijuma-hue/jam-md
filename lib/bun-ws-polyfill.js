/**
 * bun-ws-polyfill.js
 * Patches the 'ws' WebSocket client to add missing event stubs for Bun runtime.
 *
 * Bun uses its own WebSocket implementation which does not fire the 'upgrade'
 * and 'unexpected-response' events that Node.js's 'ws' library provides.
 * Baileys tries to add listeners for these events; without this polyfill,
 * Bun logs "[bun] Warning: ws.WebSocket ... is not implemented in bun".
 *
 * This shim makes those event registrations a no-op so the warnings disappear
 * and Baileys works cleanly on Bun.
 */
import { EventEmitter } from 'events';

// Only apply in Bun environment
if (typeof Bun !== 'undefined') {
    try {
        const wsModule = await import('ws');
        const OrigWS = wsModule.default || wsModule.WebSocket;

        if (OrigWS && OrigWS.prototype) {
            const originalOn = OrigWS.prototype.on;
            const originalAddEventListener = OrigWS.prototype.addEventListener;
            const BUN_MISSING_EVENTS = new Set(['upgrade', 'unexpected-response']);

            OrigWS.prototype.on = function (event, listener) {
                if (BUN_MISSING_EVENTS.has(event)) return this; // silently ignore
                return originalOn ? originalOn.call(this, event, listener) : this;
            };

            if (originalAddEventListener) {
                OrigWS.prototype.addEventListener = function (event, listener, options) {
                    if (BUN_MISSING_EVENTS.has(event)) return; // silently ignore
                    return originalAddEventListener.call(this, event, listener, options);
                };
            }
            console.log('[polyfill] Applied Bun WebSocket compatibility shim');
        }
    } catch (e) {
        // ws not available or polyfill not needed — continue silently
    }
}
