// Base Google OAuth 2.0 + Drive API helpers (sem dependências externas)
//
// Credenciais (NUNCA ficam dentro da pasta do app / Google Drive):
//   - variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET, ou
//   - ~/.giffu-entrega/google_oauth.json  (o JSON baixado do Google Cloud Console serve como está)
// Tokens do Drive do Autor ficam em ~/.giffu-entrega/drive_tokens.json (modo 0600).

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { URL, URLSearchParams } = require('url');

const CONFIG_DIR = path.join(os.homedir(), '.giffu-entrega');
const OAUTH_FILE = path.join(CONFIG_DIR, 'google_oauth.json');
const TOKENS_FILE = path.join(CONFIG_DIR, 'drive_tokens.json');

const SCOPE_BASIC = 'openid email profile';
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.readonly';

function ensureDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

// ---------- Requisições HTTPS ----------
function request(urlString, { method = 'GET', headers = {}, body = null, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = https.request(url, { method, headers, timeout }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > 5 * 1024 * 1024) return req.destroy(new Error('Resposta grande demais'));
        chunks.push(c);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao falar com o Google')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function postForm(urlString, fields) {
  const body = new URLSearchParams(fields).toString();
  return request(urlString, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    },
    body
  });
}

// ---------- Configuração OAuth ----------
function getOAuthConfig(readDB) {
  let clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  let clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    try {
      const raw = JSON.parse(fs.readFileSync(OAUTH_FILE, 'utf8'));
      const cfg = raw.web || raw.installed || raw;
      clientId = clientId || String(cfg.client_id || '').trim();
      clientSecret = clientSecret || String(cfg.client_secret || '').trim();
    } catch (e) {}
  }

  if (!clientId && readDB) {
    const db = readDB();
    clientId = ((db.settings && db.settings.googleClientId) || '').trim();
  }

  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

// ---------- Armazenamento dos tokens do Drive ----------
function readTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeTokens(tokens) {
  ensureDir();
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  try { fs.chmodSync(TOKENS_FILE, 0o600); } catch (e) {}
}

function clearTokens() {
  try { fs.unlinkSync(TOKENS_FILE); } catch (e) {}
}

async function revokeToken(token) {
  try {
    await postForm('https://oauth2.googleapis.com/revoke', { token });
  } catch (e) {}
}

// ---------- Access token do Drive (renova sozinho) ----------
let refreshing = null;

async function getDriveAccessToken(readDB) {
  const tokens = readTokens();
  if (!tokens || !tokens.refresh_token) {
    const err = new Error('Google Drive não conectado. Faça login com Google como Autor.');
    err.code = 'DRIVE_NOT_CONNECTED';
    throw err;
  }

  if (tokens.access_token && tokens.expiry_date && tokens.expiry_date - 60 * 1000 > Date.now()) {
    return tokens.access_token;
  }

  if (!refreshing) {
    refreshing = (async () => {
      const cfg = getOAuthConfig(readDB);
      if (!cfg.configured) {
        const err = new Error('Credenciais OAuth do Google não configuradas.');
        err.code = 'OAUTH_NOT_CONFIGURED';
        throw err;
      }
      const res = await postForm('https://oauth2.googleapis.com/token', {
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token'
      });
      if (res.status !== 200 || !res.json || !res.json.access_token) {
        if (res.json && res.json.error === 'invalid_grant') {
          clearTokens(); // acesso revogado: exige novo login do Autor
          const err = new Error('O acesso ao Drive foi revogado. Faça login com Google novamente.');
          err.code = 'DRIVE_NOT_CONNECTED';
          throw err;
        }
        throw new Error('Não foi possível renovar o acesso ao Google Drive.');
      }
      const updated = {
        ...tokens,
        access_token: res.json.access_token,
        expiry_date: Date.now() + (Number(res.json.expires_in) || 3600) * 1000
      };
      writeTokens(updated);
      return updated.access_token;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

module.exports = {
  SCOPE_BASIC,
  SCOPE_DRIVE,
  request,
  postForm,
  getOAuthConfig,
  readTokens,
  writeTokens,
  clearTokens,
  revokeToken,
  getDriveAccessToken
};
