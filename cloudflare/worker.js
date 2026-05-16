// JAM-MD Cloudflare VLESS Proxy
// Deploy to Cloudflare Workers (free plan) — no VPS needed
// Set USER_ID environment variable to your UUID in the Cloudflare dashboard

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userId = env.USER_ID || '00000000-0000-0000-0000-000000000000';

    if (url.pathname === '/') {
      return new Response('JAM-MD Proxy — OK', { status: 200 });
    }

    if (url.pathname === '/info') {
      return new Response(JSON.stringify({ status: 'ok', path: '/vless' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }

    return handleVless(request, userId);
  },
};

async function handleVless(request, userId) {
  const [client, server] = new WebSocketPair();
  server.accept();

  handleStream(server, userId).catch(() => {
    try { server.close(1011, 'Stream error'); } catch {}
  });

  return new Response(null, { status: 101, webSocket: client });
}

async function handleStream(ws, userId) {
  const { connect } = await import('cloudflare:sockets');
  let remoteSocket = null;
  let headerDone = false;
  const queue = [];

  ws.addEventListener('message', async ({ data }) => {
    const buf = data instanceof ArrayBuffer ? data : await new Response(data).arrayBuffer();

    if (!headerDone) {
      // ── Parse VLESS header ───────────────────────────────────────────────
      const view = new DataView(buf);
      let off = 0;

      if (view.getUint8(off++) !== 0) {
        ws.close(1002, 'Bad version'); return;
      }

      // UUID (16 bytes)
      const uuidBytes = new Uint8Array(buf, off, 16); off += 16;
      const uuid = fmtUUID(uuidBytes);
      if (uuid.toLowerCase() !== userId.toLowerCase()) {
        ws.close(1002, 'Auth failed'); return;
      }

      // Addon length
      const addonLen = view.getUint8(off++);
      off += addonLen;

      // Command (1 = TCP)
      const cmd = view.getUint8(off++);
      if (cmd !== 1) { ws.close(1002, 'TCP only'); return; }

      // Port
      const port = view.getUint16(off); off += 2;

      // Address
      const addrType = view.getUint8(off++);
      let host;
      if (addrType === 1) {
        host = `${view.getUint8(off)}.${view.getUint8(off+1)}.${view.getUint8(off+2)}.${view.getUint8(off+3)}`;
        off += 4;
      } else if (addrType === 2) {
        const len = view.getUint8(off++);
        host = new TextDecoder().decode(new Uint8Array(buf, off, len));
        off += len;
      } else if (addrType === 3) {
        const parts = [];
        for (let i = 0; i < 8; i++) parts.push(view.getUint16(off + i * 2).toString(16));
        host = parts.join(':');
        off += 16;
      } else {
        ws.close(1002, 'Bad addr'); return;
      }

      const payload = buf.slice(off);
      headerDone = true;

      // ── Open TCP connection to destination ───────────────────────────────
      try {
        remoteSocket = connect({ hostname: host, port });
        const writer = remoteSocket.writable.getWriter();

        // VLESS response header
        ws.send(new Uint8Array([0, 0]));

        // Initial payload
        if (payload.byteLength > 0) await writer.write(new Uint8Array(payload));

        // Drain queue
        for (const chunk of queue) await writer.write(chunk);
        queue.length = 0;
        writer.releaseLock();

        // Remote → WebSocket
        remoteSocket.readable.pipeTo(new WritableStream({
          write(chunk) { try { ws.send(chunk); } catch {} },
          close() { try { ws.close(); } catch {} },
          abort() { try { ws.close(); } catch {} },
        })).catch(() => { try { ws.close(); } catch {} });

      } catch {
        ws.close(1011, 'Connect failed');
      }

    } else if (remoteSocket) {
      const writer = remoteSocket.writable.getWriter();
      await writer.write(new Uint8Array(buf));
      writer.releaseLock();
    } else {
      queue.push(new Uint8Array(buf));
    }
  });

  ws.addEventListener('close', () => {
    try { remoteSocket?.close(); } catch {}
  });
}

function fmtUUID(b) {
  const h = Array.from(b).map(x => x.toString(16).padStart(2, '0'));
  return [h.slice(0,4), h.slice(4,6), h.slice(6,8), h.slice(8,10), h.slice(10)].map(g => g.join('')).join('-');
}
