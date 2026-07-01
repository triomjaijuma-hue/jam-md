const net = require('net');
const { URL } = require('url');

function parseVmess(line) {
  try {
    const b64 = line.replace(/^vmess:\/\//, '');
    const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    return { host: json.add, port: Number(json.port) };
  } catch {
    return null;
  }
}

function parseUriStyle(line) {
  // vless://uuid@host:port?...   trojan://password@host:port?...
  try {
    const url = new URL(line);
    if (url.hostname && url.port) {
      return { host: url.hostname, port: Number(url.port) };
    }
    return null;
  } catch {
    return null;
  }
}

function parseShadowsocks(line) {
  // ss://method:password@host:port  OR  ss://BASE64(method:password@host:port)
  try {
    const rest = line.replace(/^ss:\/\//, '').split('#')[0];
    if (rest.includes('@')) {
      const hostPart = rest.split('@')[1];
      const hostPort = hostPart.split(/[?/]/)[0];
      const [host, portStr] = hostPort.split(':');
      if (host && portStr) return { host, port: Number(portStr) };
    }
    const decoded = Buffer.from(rest, 'base64').toString('utf-8');
    const match = decoded.match(/@([^:]+):(\d+)/);
    if (match) return { host: match[1], port: Number(match[2]) };
  } catch {
    // fall through
  }
  return null;
}

function extractHostPort(line) {
  if (!line || typeof line !== 'string') return null;
  if (line.startsWith('vmess://')) return parseVmess(line);
  if (line.startsWith('ss://')) return parseShadowsocks(line);
  if (line.startsWith('vless://') || line.startsWith('trojan://')) return parseUriStyle(line);
  return null;
}

function tcpCheck(host, port, timeoutMs) {
  return new Promise((resolve) => {
    if (!host || !port || Number.isNaN(port)) {
      resolve({ online: false, latencyMs: null, error: 'unparseable' });
      return;
    }
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const finish = (online, error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ online, latencyMs: online ? Date.now() - start : null, error: error || null });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (err) => finish(false, err.code || err.message));
    socket.connect(port, host);
  });
}

async function checkConfigsHealth(configs, { timeoutMs = 2000 } = {}) {
  return Promise.all(
    configs.map(async (c) => {
      const target = extractHostPort(c.line);
      const result = target
        ? await tcpCheck(target.host, target.port, timeoutMs)
        : { online: false, latencyMs: null, error: 'unparseable' };
      return {
        ...c,
        host: target ? target.host : null,
        port: target ? target.port : null,
        online: result.online,
        latencyMs: result.latencyMs,
        error: result.error
      };
    })
  );
}

module.exports = { checkConfigsHealth, extractHostPort };
