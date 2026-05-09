import express from 'express';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import config from '../config.js';
import { rateLimitMiddleware } from './guardian.js';


  // ─── In-memory log ring buffer (last 200 lines) ──────────────────────────────
  const _logBuffer = [];
  const _LOG_MAX = 200;
  function _pushLog(level, args) {
      const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      _logBuffer.push({ ts: Date.now(), level, line });
      if (_logBuffer.length > _LOG_MAX) _logBuffer.shift();
  }
  const _origLog   = console.log.bind(console);
  const _origWarn  = console.warn.bind(console);
  const _origError = console.error.bind(console);
  console.log   = (...a) => { _origLog(...a);   _pushLog('log',   a); };
  console.warn  = (...a) => { _origWarn(...a);  _pushLog('warn',  a); };
  console.error = (...a) => { _origError(...a); _pushLog('error', a); };

  
  // ─── Logs password protection ─────────────────────────────────────────────────
  const LOGS_PASSWORD = process.env.LOGS_PASSWORD || 'jammd-logs';
  function _isLogsAuthed(req) {
      const cookie = req.headers.cookie || '';
      const m = cookie.match(/logs_auth=([^;]+)/);
      return m ? m[1] === Buffer.from(LOGS_PASSWORD).toString('base64') : false;
  }

  const packageInfo = {
    name: config.botName || 'JAM-MD',
    version: config.version || '6.0.0',
    description: config.description || 'WhatsApp Bot',
    author: config.author || 'JAM-MD'
};

const app = express();
const server = createServer(app);
const PORT = config.port || 5000;

TP flood / DDoS ─────────────────────────────────
app.use(rateLimitMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let _sock = null;
export function setSocket(sock) {
    _sock = sock;
}

let _pendingCode = null;
let _pendingCodeExpiry = 0;
export function setPairingCode(code) {
    _pendingCode = code;
    _pendingCodeExpiry = Date.now() + 65000;
    setTimeout(() => { _pendingCode = null; }, 65000);
}

const SHARED_CSS = `
  :root { --g: #25d366; --bg: #0f172a; --card: rgba(30,41,59,.85); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: #fff; font-family: 'Inter', system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
  .card { background: var(--card); backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,.08); border-radius: 24px;
    padding: 36px 30px; width: 100%; max-width: 460px;
    box-shadow: 0 24px 60px rgba(0,0,0,.5); }
  .logo { font-size: 2rem; font-weight: 900; letter-spacing: 3px; color: var(--g);
    text-align: center; margin-bottom: 4px; }
  .sub { text-align: center; color: #94a3b8; font-size: .85rem; margin-bottom: 28px; }
  .badge { display: inline-flex; align-items: center; gap: 8px;
    background: rgba(37,211,102,.12); color: var(--g);
    padding: 5px 16px; border-radius: 50px; font-size: .8rem; font-weight: 700; margin-bottom: 18px; }
  .dot { width: 8px; height: 8px; background: var(--g); border-radius: 50%;
    box-shadow: 0 0 10px var(--g); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.4} }
  label { display: block; font-size: .75rem; color: #94a3b8;
    text-transform: uppercase; font-weight: 700; letter-spacing: .6px; margin-bottom: 8px; }
  input, textarea { width: 100%; padding: 13px 16px; background: rgba(0,0,0,.3);
    border: 1.5px solid rgba(255,255,255,.1); border-radius: 12px;
    color: #fff; font-size: .9rem; outline: none; transition: border .2s;
    font-family: inherit; resize: none; }
  input:focus, textarea:focus { border-color: var(--g); }
  input::placeholder, textarea::placeholder { color: #475569; }
  .hint { font-size: .74rem; color: #475569; margin-top: 6px; margin-bottom: 18px; }
  .btn { width: 100%; padding: 14px;
    background: linear-gradient(135deg, var(--g), #128c7e);
    color: #fff; font-weight: 700; font-size: .95rem; border: none;
    border-radius: 12px; cursor: pointer; transition: opacity .2s; letter-spacing: .5px; }
  .btn:hover { opacity: .88; }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn-outline { background: transparent; border: 1.5px solid var(--g); color: var(--g); }
  .btn-outline:hover { background: rgba(37,211,102,.1); opacity: 1; }
  .grid { display: grid; gap: 10px; margin-bottom: 22px; }
  .row { background: rgba(0,0,0,.25); padding: 11px 16px; border-radius: 12px;
    display: flex; justify-content: space-between; align-items: center; }
  .lbl { color: #64748b; font-size: .72rem; text-transform: uppercase; font-weight: 800; letter-spacing: .5px; }
  .val { font-weight: 600; font-family: monospace; color: #f1f5f9; font-size: .88rem; }
  .code-box { background: rgba(37,211,102,.08); border: 1.5px solid rgba(37,211,102,.25);
    border-radius: 14px; padding: 20px; text-align: center; }
  .code-label { font-size: .72rem; color: #94a3b8; margin-bottom: 8px;
    text-transform: uppercase; font-weight: 700; letter-spacing: .5px; }
  .code { font-size: 1.9rem; font-weight: 900; letter-spacing: 6px;
    color: var(--g); font-family: monospace; }
  .error-box { background: rgba(239,68,68,.1); border: 1.5px solid rgba(239,68,68,.3);
    border-radius: 12px; padding: 16px; color: #fca5a5; font-size: .88rem; }
  .warn-box { background: rgba(234,179,8,.08); border: 1.5px solid rgba(234,179,8,.25);
    border-radius: 12px; padding: 14px; color: #fde68a; font-size: .82rem; line-height: 1.6; }
  .info-box { background: rgba(59,130,246,.08); border: 1.5px solid rgba(59,130,246,.25);
    border-radius: 12px; padding: 14px; color: #93c5fd; font-size: .82rem; line-height: 1.6; }
  .success-box { background: rgba(37,211,102,.08); border: 1.5px solid rgba(37,211,102,.25);
    border-radius: 12px; padding: 16px; color: #86efac; font-size: .85rem; line-height: 1.7; }
  .spinner { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,.3);
    border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite;
    margin: 0 auto; display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .nav { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
  .nav a { flex: 1; text-align: center; padding: 10px;
    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
    border-radius: 10px; color: #94a3b8; font-size: .8rem; text-decoration: none;
    transition: all .2s; }
  .nav a:hover { color: var(--g); border-color: rgba(37,211,102,.3);
    background: rgba(37,211,102,.07); }
  .steps { font-size: .8rem; color: #94a3b8; line-height: 1.8; margin-top: 14px; text-align: left; }
  .steps b { color: #e2e8f0; }
  .mt { margin-top: 14px; }
`;

app.get('/', (req, res) => {
    const up = Math.floor(process.uptime());
    const uptimeString = `${Math.floor(up/3600)}h ${Math.floor((up%3600)/60)}m ${up%60}s`;
    const isConnected = !!_sock?.user;
    const statusColor = isConnected ? '#22c55e' : '#ef4444';
    res.send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JAM-MD Status</title><style>${SHARED_CSS}
  .status-dot{width:10px;height:10px;border-radius:50%;background:${statusColor};
    box-shadow:0 0 8px ${statusColor};display:inline-block;margin-right:6px;}
</style></head><body><div class="card">
  <div style="text-align:center;margin-bottom:18px">
    <div class="badge"><span class="dot"></span> SYSTEM ONLINE</div>
  </div>
  <div class="logo">JAM-MD</div>
  <p class="sub">${packageInfo.description}</p>
  <div class="grid">
    <div class="row"><span class="lbl">WhatsApp</span><span class="val"><span class="status-dot"></span>${isConnected?'Connected':'Disconnected'}</span></div>
    <div class="row"><span class="lbl">Version</span><span class="val">${packageInfo.version}</span></div>
    <div class="row"><span class="lbl">Uptime</span><span class="val">${uptimeString}</span></div>
    <div class="row"><span class="lbl">Owner</span><span class="val">${config.botOwner||'Jaiton fangs'}</span></div>
  </div>
  <div class="nav">
    <a href="/pair">🔗 Pair Device</a>
    <a href="/session">💾 Save Session</a>
    <a href="/health">❤️ Health</a>
    <a href="/ping">📡 Ping</a>
  </div>
</div></body></html>`);
});

app.get('/pair', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const pairingCode = (_pendingCode && Date.now() < _pendingCodeExpiry) ? _pendingCode : null;
    res.send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JAM-MD — Pair Device</title><style>${SHARED_CSS}</style></head><body>
<div class="card">
  <div class="logo">JAM-MD</div>
  <p class="sub">WhatsApp Pairing — by Jaiton fangs</p>
  ${pairingCode ? `<div class="code-box" style="margin-bottom:22px">
    <div class="code-label">✅ Pairing Code Ready — enter this in WhatsApp now</div>
    <div class="code">${pairingCode}</div>
    <p style="font-size:.78rem;color:#94a3b8;margin-top:12px;line-height:1.6">
      WhatsApp → ⋮ → <b>Linked Devices</b> → Link a Device → <b>Link with phone number instead</b><br>
      Enter the code above within 60 seconds
    </p>
  </div>` : ''}
  <label for="phone">Your WhatsApp Number</label>
  <input type="tel" id="phone" placeholder="256765309986" autocomplete="off"/>
  <p class="hint">Full number with country code, no + or spaces</p>
  <button class="btn" id="btn" onclick="requestCode()">Get Pairing Code</button>
  <div class="spinner mt" id="spin"></div>
  <div id="result" style="margin-top:20px;display:none"></div>
  <div class="nav"><a href="/">← Home</a><a href="/session">💾 Save Session</a></div>
</div>
<script>
let _retryTimer=null,_retryPhone=null;
async function requestCode(phone,isRetry){
  if(!phone) phone=document.getElementById('phone').value.replace(/\\D/g,'');
  const btn=document.getElementById('btn'),spin=document.getElementById('spin'),result=document.getElementById('result');
  result.style.display='none';
  if(!phone||phone.length<7){result.style.display='block';result.innerHTML='<div class="error-box">⚠️ Enter your full number with country code (no + or spaces).</div>';return;}
  if(!isRetry){_retryPhone=phone;if(_retryTimer)clearTimeout(_retryTimer);}
  btn.disabled=true;btn.textContent='Requesting...';spin.style.display='block';
  try{
    const res=await fetch('/pair/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})});
    const data=await res.json();
    spin.style.display='none';btn.disabled=false;btn.textContent='Get Pairing Code';result.style.display='block';
    if(data.code){
      if(_retryTimer){clearTimeout(_retryTimer);_retryTimer=null;}
      result.innerHTML=\`<div class="code-box">
        <div class="code-label">✅ Your Pairing Code</div>
        <div class="code" id="codeVal">\${data.code}</div>
        <button onclick="copyCode()" id="cpyBtn" style="margin-top:12px;padding:9px 24px;background:rgba(37,211,102,.15);color:var(--g);border:1.5px solid var(--g);border-radius:8px;cursor:pointer;font-weight:700;font-size:.85rem">📋 Copy Code</button>
        <div style="font-size:.78rem;color:#94a3b8;margin-top:14px;line-height:1.75">
          <b>Steps to link in WhatsApp:</b><br>
          1. Open WhatsApp on your phone<br>
          2. Tap ⋮ → <b>Linked Devices</b> → Link a Device<br>
          3. Tap <b>"Link with phone number instead"</b><br>
          4. Enter your number then type this code<br>
          ⏱️ Code expires in ~60 seconds<br><br>
          Done? → <a href="/session" style="color:var(--g);font-weight:700">Save Session →</a>
        </div>
      </div>\`;
    }else if(data.error&&data.error.includes('not ready')){
      let cd=6;
      result.innerHTML=\`<div class="warn-box">⏳ <b>Bot is still starting up…</b><br>Auto-retrying in <span id="cd">\${cd}</span>s — no action needed.<br><small style="opacity:.7">This is normal on a fresh deploy or restart.</small></div>\`;
      const iv=setInterval(()=>{cd--;const el=document.getElementById('cd');if(el)el.textContent=cd;if(cd<=0){clearInterval(iv);requestCode(_retryPhone,true);}},1000);
    }else if(data.error&&data.error.includes('already linked')){
      result.innerHTML=\`<div class="success-box">✅ <b>Bot is already connected!</b><br><br>Go to <a href="/session" style="color:var(--g);font-weight:700">Save Session →</a> to export your SESSION_ID so the bot survives restarts without re-pairing.</div>\`;
    }else{
      result.innerHTML=\`<div class="error-box">❌ \${data.error||'Failed. Please try again.'}</div>\`;
    }
  }catch(e){
    spin.style.display='none';btn.disabled=false;btn.textContent='Get Pairing Code';result.style.display='block';
    result.innerHTML='<div class="error-box">❌ Network error. Check your connection and try again.</div>';
  }
}
function copyCode(){
  const code=document.getElementById('codeVal')?.textContent;
  if(!code)return;
  navigator.clipboard?.writeText(code).catch(()=>{});
  const b=document.getElementById('cpyBtn');
  if(b){b.textContent='✅ Copied!';setTimeout(()=>b.textContent='📋 Copy Code',2500);}
}
document.getElementById('phone').addEventListener('keydown',e=>{if(e.key==='Enter')requestCode();});
</script></body></html>`);
});

app.post('/pair/request', async (req, res) => {
    try {
        const phone = String(req.body?.phone || '').replace(/\D/g, '');
        if (!phone || phone.length < 7) return res.json({ error: 'Invalid phone number' });
        let waited = 0;
        while (!_sock && waited < 12000) {
            await new Promise(r => setTimeout(r, 500));
            waited += 500;
        }
        if (!_sock) return res.json({ error: 'Bot is not ready yet. Wait a moment and try again.' });
        if (_sock.user) return res.json({ error: 'Bot is already linked! Visit /session to save your SESSION_ID.' });
        let code = await _sock.requestPairingCode(phone);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        setPairingCode(code);
        return res.json({ code });
    } catch (err) {
        return res.json({ error: err.message || 'Failed to generate pairing code' });
    }
});

app.get('/session', (req, res) => {
    const isConnected = !!_sock?.user;
    res.send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JAM-MD — Save Session</title><style>${SHARED_CSS}
  .session-str{width:100%;background:rgba(0,0,0,.4);border:1.5px solid rgba(37,211,102,.3);
    border-radius:10px;padding:12px;color:#86efac;font-family:monospace;font-size:.72rem;
    word-break:break-all;line-height:1.5;max-height:80px;overflow-y:auto;outline:none;resize:none;}
  .copy-btn{margin-top:10px;padding:11px;font-size:.85rem;}
  .step-num{display:inline-flex;align-items:center;justify-content:center;
    width:22px;height:22px;background:var(--g);border-radius:50%;
    color:#000;font-weight:800;font-size:.7rem;margin-right:8px;flex-shrink:0;}
  .step-row{display:flex;align-items:flex-start;margin-bottom:10px;font-size:.83rem;color:#cbd5e1;}
</style></head><body>
<div class="card">
  <div class="logo">JAM-MD</div>
  <p class="sub">Session Manager — save your bot's login</p>
  <div id="content">
    ${isConnected ? `
    <div class="success-box" style="margin-bottom:18px">
      ✅ <b>Bot is connected!</b> Your session is ready to export below.
    </div>
    <label>Your SESSION_ID</label>
    <textarea class="session-str" id="sessStr" readonly placeholder="Loading..."></textarea>
    <button class="btn copy-btn" onclick="copySession()" id="copyBtn">📋 Copy SESSION_ID</button>
    <div id="copyMsg" style="display:none;text-align:center;margin-top:8px;color:var(--g);font-size:.8rem">✅ Copied to clipboard!</div>
    <div class="info-box mt">
      <div class="step-row"><span class="step-num">1</span>Copy the SESSION_ID above</div>
      <div class="step-row"><span class="step-num">2</span>Open Wispbyte → your service → <b>Environment</b></div>
      <div class="step-row"><span class="step-num">3</span>Add or update: <b>SESSION_ID</b> = paste the value</div>
      <div class="step-row"><span class="step-num">4</span>Redeploy — no re-pairing needed ✅</div>
    </div>
    ` : `
    <div class="warn-box" style="margin-bottom:18px">
      ⚠️ <b>Bot is not connected yet.</b><br>
      You need to pair your WhatsApp first, then come back here to save the session.
    </div>
    <a href="/pair" class="btn" style="display:block;text-align:center;text-decoration:none;margin-bottom:14px">
      🔗 Go to Pair Device
    </a>
    <div class="info-box">
      <b>How this works:</b><br><br>
      <div class="step-row"><span class="step-num">1</span>Visit <b>/pair</b>, enter your number, get the code</div>
      <div class="step-row"><span class="step-num">2</span>Enter the code on WhatsApp to link the bot</div>
      <div class="step-row"><span class="step-num">3</span>Come back here — your SESSION_ID will appear</div>
      <div class="step-row"><span class="step-num">4</span>Copy it and set it in Wispbyte Environment Variables</div>
    </div>
    `}
  </div>
  <div class="nav" style="margin-top:20px">
    <a href="/">← Home</a>
    <a href="/pair">🔗 Pair Device</a>
  </div>
</div>
<script>
${isConnected ? `
async function loadSession(){
  try{
    const res=await fetch('/session/export');
    const data=await res.json();
    if(data.session){
      document.getElementById('sessStr').value=data.session;
    } else {
      document.getElementById('sessStr').value='Error: '+(data.error||'Could not load session');
    }
  }catch(e){
    document.getElementById('sessStr').value='Network error loading session.';
  }
}
async function copySession(){
  const txt=document.getElementById('sessStr').value;
  if(!txt||txt.startsWith('Error'))return;
  try{
    await navigator.clipboard.writeText(txt);
  }catch(e){
    const ta=document.getElementById('sessStr');
    ta.select();document.execCommand('copy');
  }
  const msg=document.getElementById('copyMsg');
  const btn=document.getElementById('copyBtn');
  btn.textContent='✅ Copied!';
  msg.style.display='block';
  setTimeout(()=>{btn.textContent='📋 Copy SESSION_ID';msg.style.display='none';},2500);
}
loadSession();
` : `
setTimeout(()=>location.reload(),5000);
`}
</script>
</body></html>`);
});

app.get('/session/export', (req, res) => {
    try {
        const credsPath = path.join(process.cwd(), 'session', 'creds.json');
        if (!fs.existsSync(credsPath)) {
            return res.json({ error: 'No session file found. Pair your WhatsApp first.' });
        }
        const raw = fs.readFileSync(credsPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed.noiseKey && !parsed.signedIdentityKey && !parsed.registrationId) {
            return res.json({ error: 'Session file exists but appears invalid.' });
        }
        const session = Buffer.from(JSON.stringify(parsed)).toString('base64');
        return res.json({ session, format: 'base64' });
    } catch (err) {
        return res.json({ error: err.message });
    }
});

// ─── Health Check ─────────────────────────────────────────────────────────────
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

// ─── Ping / Keep-alive endpoint ───────────────────────────────────────────────
// Wispbyte (and UptimeRobot, BetterStack, etc.) can ping this URL every 5 min
// to prevent the container from sleeping due to inactivity.

  app.post('/logs/auth', (req, res) => {
      const { password } = req.body || {};
      if (password === LOGS_PASSWORD) {
          const tok = Buffer.from(LOGS_PASSWORD).toString('base64');
          res.setHeader('Set-Cookie', 'logs_auth=' + tok + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + (7 * 24 * 3600));
          return res.json({ ok: true });
      }
      return res.status(401).json({ ok: false });
  });

  app.get('/logs/logout', (req, res) => {
      res.setHeader('Set-Cookie', 'logs_auth=; Path=/; Max-Age=0');
      res.redirect('/logs');
  });

  app.get('/logs/json', (req, res) => {
      if (!_isLogsAuthed(req)) return res.status(401).json({ error: 'Unauthorized' });
      const n = Math.min(parseInt(req.query.n || '50', 10), _LOG_MAX);
      res.json({ lines: _logBuffer.slice(-n), uptime: Math.floor(process.uptime()), connected: !!_sock?.user });
  });

  app.get('/logs', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!_isLogsAuthed(req)) {
          return res.send(`<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>JAM-MD — Logs Login</title>
  <style>${SHARED_CSS}</style></head><body>
  <div class="card">
    <div class="logo">JAM-MD</div>
    <p class="sub">Password required to view logs</p>
    <div id="err"></div>
    <label for="pw">Password</label>
    <input type="password" id="pw" placeholder="Enter password" autocomplete="current-password"/>
    <p class="hint">Set LOGS_PASSWORD in Wispbyte environment variables (default: jammd-logs)</p>
    <button class="btn" style="margin-top:14px" onclick="login()">🔓 Unlock Logs</button>
    <div class="nav" style="margin-top:18px"><a href="/">← Home</a></div>
  </div>
  <script>
  function login(){
    const pw=document.getElementById('pw').value;
    if(!pw)return;
    fetch('/logs/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})})
      .then(r=>r.json()).then(d=>{
        if(d.ok)location.href='/logs';
        else document.getElementById('err').innerHTML='<div class="error-box" style="margin-bottom:14px">❌ Wrong password</div>';
      }).catch(()=>{});
  }
  document.getElementById('pw').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
  </script></body></html>`);
      }
      res.send(`<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>JAM-MD — Logs</title>
  <style>
  ${SHARED_CSS}
  body{display:block;padding:16px;background:#0a0f1e;}
  .log-wrap{background:#000;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:16px;
    font-family:monospace;font-size:.78rem;line-height:1.7;overflow-x:auto;max-height:75vh;overflow-y:auto;}
  .log-line{white-space:pre-wrap;word-break:break-all;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.03);}
  .log-line.warn{color:#fde68a;}.log-line.error{color:#fca5a5;}.log-line.log{color:#d1fae5;}
  .ts{color:#475569;margin-right:8px;font-size:.7rem;}
  .bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;}
  .badge-on{background:rgba(37,211,102,.15);color:#22c55e;padding:4px 12px;border-radius:50px;font-size:.78rem;font-weight:700;}
  .badge-off{background:rgba(239,68,68,.15);color:#ef4444;padding:4px 12px;border-radius:50px;font-size:.78rem;font-weight:700;}
  .controls{display:flex;gap:8px;flex-wrap:wrap;}
  .btn-sm{padding:7px 16px;font-size:.78rem;border-radius:8px;cursor:pointer;border:1.5px solid var(--g);
    background:transparent;color:var(--g);font-weight:700;transition:all .2s;}
  .btn-sm:hover{background:rgba(37,211,102,.12);}
  .btn-sm.active{background:rgba(37,211,102,.2);}
  .uptime{color:#64748b;font-size:.8rem;}
  </style>
  </head><body>
  <div style="max-width:860px;margin:0 auto">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <div class="logo" style="font-size:1.4rem">JAM-MD <span style="font-size:.9rem;color:#64748b;font-weight:400">/ logs</span></div>
      <div class="nav" style="margin:0;width:auto;gap:8px">
        <a href="/">← Home</a>
        <a href="/logs/logout" style="color:#ef4444;border-color:rgba(239,68,68,.3)">🔒 Logout</a>
      </div>
    </div>
    <div class="bar">
      <div id="status-badge" class="badge-on">● Checking…</div>
      <div class="controls">
        <button class="btn-sm active" id="btn-auto" onclick="toggleAuto()">⟳ Auto-refresh ON</button>
        <button class="btn-sm" onclick="loadLogs()">↺ Refresh now</button>
        <button class="btn-sm" onclick="clearView()">✕ Clear view</button>
      </div>
    </div>
    <div class="uptime" id="uptime" style="margin-bottom:10px"></div>
    <div class="log-wrap" id="log-box"><span style="color:#475569">Loading logs…</span></div>
  </div>
  <script>
  let _auto = true, _timer = null;
  function fmt(ts){ const d=new Date(ts); return d.toTimeString().slice(0,8); }
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  async function loadLogs(){
    try{
      const r = await fetch('/logs/json?n=50');
      if(r.status===401){ location.href='/logs'; return; }
      const data = await r.json();
      const badge = document.getElementById('status-badge');
      const upEl  = document.getElementById('uptime');
      badge.className = data.connected ? 'badge-on' : 'badge-off';
      badge.textContent = data.connected ? '● WhatsApp Connected' : '● WhatsApp Disconnected';
      const up = data.uptime;
      upEl.textContent = 'Uptime: ' + Math.floor(up/3600) + 'h ' + Math.floor((up%3600)/60) + 'm ' + (up%60) + 's  |  ' + data.lines.length + ' log lines';
      const box = document.getElementById('log-box');
      const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      box.innerHTML = data.lines.map(l =>
        '<div class="log-line ' + l.level + '"><span class="ts">' + fmt(l.ts) + '</span>' + esc(l.line) + '</div>'
      ).join('') || '<span style="color:#475569">No logs yet.</span>';
      if(wasAtBottom) box.scrollTop = box.scrollHeight;
    } catch(e){ console.warn('log fetch failed', e); }
  }
  function toggleAuto(){
    _auto = !_auto;
    const btn = document.getElementById('btn-auto');
    btn.textContent = _auto ? '⟳ Auto-refresh ON' : '⟳ Auto-refresh OFF';
    btn.className = _auto ? 'btn-sm active' : 'btn-sm';
    if(_auto) scheduleNext(); else if(_timer) clearTimeout(_timer);
  }
  function scheduleNext(){ if(_auto){ if(_timer) clearTimeout(_timer); _timer = setTimeout(()=>{ loadLogs(); scheduleNext(); }, 4000); } }
  function clearView(){ document.getElementById('log-box').innerHTML='<span style="color:#475569">View cleared.</span>'; }
  loadLogs();
  scheduleNext();
  document.getElementById('log-box').scrollTop = 99999;
  </script>
  </body></html>`);
  });

  app.get('/ping', (req, res) => {
    res.json({
        pong: true,
        uptime: Math.floor(process.uptime()),
        connected: !!_sock?.user,
        ts: Date.now()
    });
});

app.get('/process', (req, res) => {
    const { send } = req.query;
    if (!send) return res.status(400).json({ error: 'Missing send query' });
    res.json({ status: 'Received', data: send });
});


  // ─── Keep-alive: prevents Wispbyte container from sleeping ───────────────────
  // Pings both localhost and the public IP every 20s.
  // 20s is well inside Wispbyte's ~60s idle timeout — no external service needed.
  export function startKeepAlive() {
      const LOCAL  = 'http://localhost:' + PORT + '/ping';
      const PUBLIC = (config.keepAliveUrl || '').replace(/\/$/, '') + '/ping';

      const ping = () => {
          fetch(LOCAL,  { signal: AbortSignal.timeout(8000) }).catch(() => {});
          if (config.keepAliveUrl) {
              fetch(PUBLIC, { signal: AbortSignal.timeout(8000) }).catch(() => {});
          }
      };

      setTimeout(ping, 5000);               // first ping 5s after boot
      setInterval(ping, 20 * 1000);         // then every 20s
      console.log('[keep-alive] pinging every 20s — localhost + ' + (config.keepAliveUrl || 'no public URL'));
  }

  
export { app, server, PORT };
