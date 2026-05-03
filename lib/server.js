import express from 'express';
import { createServer } from 'http';
import config from '../config.js';

const packageInfo = {
    name: config.botName || 'JAM-MD',
    version: config.version || '6.0.0',
    description: config.description || 'WhatsApp Bot',
    author: config.author || 'JAM-MD'
};

const app = express();
const server = createServer(app);
const PORT = config.port || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Shared socket reference — set by index.js when bot connects
let _sock = null;
export function setSocket(sock) {
    _sock = sock;
}

// ─── Status Page ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    const uptimeSeconds = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeString = `${hours}h ${minutes}m ${seconds}s`;
    const isConnected = !!_sock?.user;
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JAM-MD Status</title>
<style>
  :root { --g: #25d366; --bg: #0f172a; --card: rgba(30,41,59,.8); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: #fff; font-family: 'Inter', system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
  .card { background: var(--card); backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,.08); border-radius: 24px;
    padding: 32px 28px; width: 100%; max-width: 420px; text-align: center;
    box-shadow: 0 24px 60px rgba(0,0,0,.5); }
  .badge { display: inline-flex; align-items: center; gap: 8px;
    background: rgba(37,211,102,.12); color: var(--g);
    padding: 5px 16px; border-radius: 50px; font-size: .8rem; font-weight: 700; margin-bottom: 22px; }
  .dot { width: 8px; height: 8px; background: var(--g); border-radius: 50%;
    box-shadow: 0 0 10px var(--g); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }
  h1 { font-size: 2rem; letter-spacing: 2px; margin-bottom: 6px; }
  .desc { color: #94a3b8; font-size: .88rem; margin-bottom: 24px; }
  .grid { display: grid; gap: 10px; margin-bottom: 24px; }
  .row { background: rgba(0,0,0,.25); padding: 11px 16px; border-radius: 12px;
    display: flex; justify-content: space-between; align-items: center; }
  .lbl { color: #64748b; font-size: .72rem; text-transform: uppercase; font-weight: 800; letter-spacing: .5px; }
  .val { font-weight: 600; font-family: monospace; color: #f1f5f9; font-size: .9rem; }
  .status-dot { width: 10px; height: 10px; border-radius: 50%;
    background: ${isConnected ? '#22c55e' : '#ef4444'};
    box-shadow: 0 0 8px ${isConnected ? '#22c55e' : '#ef4444'}; display: inline-block; margin-right: 6px; }
  .pair-btn { display: block; width: 100%; padding: 13px;
    background: linear-gradient(135deg, var(--g), #128c7e);
    color: #fff; font-weight: 700; font-size: .95rem; border: none;
    border-radius: 12px; cursor: pointer; text-decoration: none;
    transition: opacity .2s; letter-spacing: .5px; }
  .pair-btn:hover { opacity: .88; }
  footer { margin-top: 20px; font-size: .68rem; color: #334155; letter-spacing: 1px; }
</style>
</head>
<body>
<div class="card">
  <div class="badge"><span class="dot"></span> SYSTEM ONLINE</div>
  <h1>JAM-MD</h1>
  <p class="desc">${packageInfo.description}</p>
  <div class="grid">
    <div class="row"><span class="lbl">WhatsApp</span><span class="val"><span class="status-dot"></span>${isConnected ? 'Connected' : 'Disconnected'}</span></div>
    <div class="row"><span class="lbl">Version</span><span class="val">${packageInfo.version}</span></div>
    <div class="row"><span class="lbl">Uptime</span><span class="val">${uptimeString}</span></div>
    <div class="row"><span class="lbl">Owner</span><span class="val">${config.botOwner || 'Jaiton fangs'}</span></div>
  </div>
  <a href="/pair" class="pair-btn">🔗 Get Pairing Code</a>
  <footer>JAM-MD BOT &nbsp;•&nbsp; by Jaiton fangs</footer>
</div>
</body>
</html>`);
});

// ─── Web Pairing Page ───────────────────────────────────────────────────────
app.get('/pair', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JAM-MD — Get Pairing Code</title>
<style>
  :root { --g: #25d366; --bg: #0f172a; --card: rgba(30,41,59,.85); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: #fff;
    font-family: 'Inter', system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 16px; }
  .card { background: var(--card); backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,.08); border-radius: 24px;
    padding: 36px 30px; width: 100%; max-width: 440px;
    box-shadow: 0 24px 60px rgba(0,0,0,.5); }
  .logo { font-size: 2.2rem; font-weight: 900; letter-spacing: 3px;
    color: var(--g); text-align: center; margin-bottom: 4px; }
  .sub { text-align: center; color: #94a3b8; font-size: .85rem; margin-bottom: 28px; }
  label { display: block; font-size: .78rem; color: #94a3b8;
    text-transform: uppercase; font-weight: 700; letter-spacing: .6px; margin-bottom: 8px; }
  input { width: 100%; padding: 13px 16px; background: rgba(0,0,0,.3);
    border: 1.5px solid rgba(255,255,255,.1); border-radius: 12px;
    color: #fff; font-size: 1rem; outline: none; transition: border .2s; }
  input:focus { border-color: var(--g); }
  input::placeholder { color: #475569; }
  .hint { font-size: .75rem; color: #475569; margin-top: 7px; margin-bottom: 20px; }
  button { width: 100%; padding: 14px;
    background: linear-gradient(135deg, var(--g), #128c7e);
    color: #fff; font-weight: 700; font-size: 1rem; border: none;
    border-radius: 12px; cursor: pointer; transition: opacity .2s;
    letter-spacing: .5px; }
  button:hover { opacity: .88; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  #result { margin-top: 24px; display: none; }
  .code-box { background: rgba(37,211,102,.1); border: 1.5px solid rgba(37,211,102,.3);
    border-radius: 14px; padding: 20px; text-align: center; }
  .code-label { font-size: .75rem; color: #94a3b8; margin-bottom: 8px;
    text-transform: uppercase; font-weight: 700; letter-spacing: .5px; }
  .code { font-size: 2rem; font-weight: 900; letter-spacing: 6px;
    color: var(--g); font-family: monospace; }
  .code-steps { font-size: .8rem; color: #94a3b8; margin-top: 14px;
    line-height: 1.6; text-align: left; }
  .error-box { background: rgba(239,68,68,.1); border: 1.5px solid rgba(239,68,68,.3);
    border-radius: 12px; padding: 16px; color: #fca5a5; font-size: .88rem; }
  .spinner { display: none; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,.3);
    border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite;
    margin: 0 auto; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .back { display: inline-block; margin-top: 18px; color: #64748b;
    font-size: .8rem; text-decoration: none; }
  .back:hover { color: var(--g); }
</style>
</head>
<body>
<div class="card">
  <div class="logo">JAM-MD</div>
  <p class="sub">WhatsApp Pairing — by Jaiton fangs</p>

  <label for="phone">Your WhatsApp Number</label>
  <input type="tel" id="phone" placeholder="256765309986" autocomplete="off" />
  <p class="hint">Enter your full number with country code, no + or spaces (e.g. 256765309986)</p>

  <button id="btn" onclick="requestCode()">Get Pairing Code</button>
  <div class="spinner" id="spin"></div>

  <div id="result"></div>
  <a href="/" class="back">← Back to status</a>
</div>
<script>
async function requestCode() {
  const phone = document.getElementById('phone').value.replace(/\\D/g,'');
  const btn = document.getElementById('btn');
  const spin = document.getElementById('spin');
  const result = document.getElementById('result');
  result.style.display = 'none';
  if (!phone || phone.length < 7) {
    result.style.display = 'block';
    result.innerHTML = '<div class="error-box">⚠️ Please enter a valid phone number.</div>';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Requesting...';
  spin.style.display = 'block';
  try {
    const res = await fetch('/pair/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    spin.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Get Pairing Code';
    result.style.display = 'block';
    if (data.code) {
      result.innerHTML = \`
        <div class="code-box">
          <div class="code-label">Your Pairing Code</div>
          <div class="code">\${data.code}</div>
          <div class="code-steps">
            <b>How to link:</b><br>
            1. Open WhatsApp on your phone<br>
            2. Tap ⋮ Menu → Linked Devices → Link a Device<br>
            3. Tap "Link with phone number instead"<br>
            4. Enter this code within 60 seconds
          </div>
        </div>\`;
    } else {
      result.innerHTML = \`<div class="error-box">❌ \${data.error || 'Failed to get pairing code. Try again.'}</div>\`;
    }
  } catch(e) {
    spin.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Get Pairing Code';
    result.style.display = 'block';
    result.innerHTML = '<div class="error-box">❌ Network error. Make sure the bot server is running.</div>';
  }
}
document.getElementById('phone').addEventListener('keydown', e => {
  if (e.key === 'Enter') requestCode();
});
</script>
</body>
</html>`);
});

// ─── Pairing Code API ───────────────────────────────────────────────────────
app.post('/pair/request', async (req, res) => {
    try {
        const phone = String(req.body?.phone || '').replace(/\D/g, '');
        if (!phone || phone.length < 7) {
            return res.json({ error: 'Invalid phone number' });
        }
        if (!_sock) {
            return res.json({ error: 'Bot is not connected yet. Wait a moment and try again.' });
        }
        // Check if already registered (session exists) — pairing not needed
        if (_sock.user) {
            return res.json({ error: 'Bot is already linked! No pairing needed. Use .update to restart safely.' });
        }
        let code = await _sock.requestPairingCode(phone);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ code });
    } catch (err) {
        return res.json({ error: err.message || 'Failed to generate pairing code' });
    }
});

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        connected: !!_sock?.user,
        memory: {
            rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`
        },
        version: packageInfo.version,
        bot: packageInfo.name,
        timestamp: new Date().toISOString()
    });
});

app.get('/process', (req, res) => {
    const { send } = req.query;
    if (!send) return res.status(400).json({ error: 'Missing send query' });
    res.json({ status: 'Received', data: send });
});

export { app, server, PORT };
