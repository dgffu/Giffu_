// Autenticação real via Google (OAuth 2.0 Authorization Code + PKCE, fluxo de servidor)
//
// Fluxo:
//   1. O navegador abre /api/auth/google/start (popup). O servidor redireciona ao Google com
//      state + PKCE guardados em cookie assinado.
//   2. O Google volta em /api/auth/google/callback com um "code". O servidor troca o code por
//      tokens (com o Client Secret, que nunca vai ao navegador) e lê o perfil verificado.
//   3. Autor: o e-mail precisa estar autorizado; o refresh_token do Drive é guardado no servidor
//      (~/.giffu-entrega) e usado para espelhar/transmitir os vídeos via API do Drive.
//   4. O servidor emite um cookie de sessão assinado (HMAC-SHA256), HttpOnly + SameSite=Lax.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const google = require('./google');

const SESSION_COOKIE = 'giffu_sid';
const OAUTH_COOKIE = 'giffu_oauth';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const OAUTH_TTL_MS = 10 * 60 * 1000;            // 10 minutos para concluir o login

// ---------- Segredo de sessão (fora da pasta do app / do Google Drive) ----------
function loadSessionSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return process.env.SESSION_SECRET;
  }
  const dir = path.join(os.homedir(), '.giffu-entrega');
  const file = path.join(dir, 'session.secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (e) {}
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const SECRET = loadSessionSecret();

// ---------- Cookie assinado ----------
function signValue(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function encodeSigned(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signValue(body)}`;
}

function decodeSigned(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const a = Buffer.from(sig);
  const b = Buffer.from(signValue(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    try {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch (e) {}
  });
  return out;
}

function isSecureRequest(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  return `${isSecureRequest(req) ? 'https' : 'http'}://${req.headers.host}`;
}

function appendCookie(req, res, name, value, { maxAgeSec, cookiePath = '/' }) {
  const parts = [`${name}=${value}`, `Path=${cookiePath}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isSecureRequest(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

// Página mínima que devolve o resultado ao app (popup) e fecha
function sendAuthResult(res, result) {
  const json = JSON.stringify(result).replace(/</g, '\\u003c');
  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Login</title></head>
<body style="font-family:Outfit,system-ui,sans-serif;background:#0b0b0d;color:#a1a1aa;display:grid;place-items:center;height:100vh;margin:0">
<p id="msg">Concluindo login…</p>
<script>
  var result = ${json};
  if (window.opener) {
    window.opener.postMessage({ type: 'giffu-auth', ok: result.ok, error: result.error || null }, location.origin);
    window.close();
  } else if (result.ok) {
    location.replace(result.mode === 'author' ? '/author' : '/');
  } else {
    document.getElementById('msg').textContent = result.error || 'Não foi possível entrar com o Google.';
  }
</script></body></html>`);
}

const AUTHOR_EMAIL = 'novelfilmes@gmail.com';

function createAuth(readDB) {
  function getAuthorizedEmails() {
    return new Set([AUTHOR_EMAIL]);
  }

  function publicUser(session) {
    const email = String(session.email || '').toLowerCase().trim();
    return {
      name: session.name,
      email: session.email,
      avatar: session.avatar,
      isAuthor: email === AUTHOR_EMAIL
    };
  }

  // Anexa req.user (re-avaliando isAuthor a cada requisição)
  function attachUser(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const session = decodeSigned(cookies[SESSION_COOKIE]);
    req.user = session ? publicUser(session) : null;
    next();
  }

  function requireUser(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Faça login com o Google para continuar' });
    next();
  }

  function requireAuthor(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Sessão expirada. Faça login com o Google.' });
    if (!req.user.isAuthor || req.user.email !== AUTHOR_EMAIL) {
      return res.status(403).json({ error: `Acesso restrito ao Autor (apenas ${AUTHOR_EMAIL})` });
    }
    next();
  }

  // Bloqueia requisições de escrita vindas de outra origem (CSRF)
  function sameOriginGuard(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) {
          return res.status(403).json({ error: 'Origem não permitida' });
        }
      } catch (e) {
        return res.status(403).json({ error: 'Origem inválida' });
      }
    }
    next();
  }

  // Limite simples de tentativas de login por IP
  const attempts = new Map();
  function loginRateLimit(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (attempts.get(ip) || []).filter(t => now - t < 60 * 1000);
    if (recent.length >= 20) {
      return res.status(429).send('Muitas tentativas. Aguarde um minuto.');
    }
    recent.push(now);
    attempts.set(ip, recent);
    next();
  }

  function driveConnected() {
    const t = google.readTokens();
    return Boolean(t && t.refresh_token);
  }

  function register(app) {
    app.use('/api', sameOriginGuard);
    app.use('/api', attachUser);

    app.get('/api/auth/config', (req, res) => {
      res.json({ configured: google.getOAuthConfig(readDB).configured });
    });

    app.get('/api/auth/session', (req, res) => {
      res.json({
        user: req.user,
        driveConnected: req.user && req.user.isAuthor ? driveConnected() : undefined
      });
    });

    // 1) Inicia o login: redireciona ao Google
    app.get('/api/auth/google/start', loginRateLimit, (req, res) => {
      const mode = req.query.mode === 'author' ? 'author' : 'client';
      const cfg = google.getOAuthConfig(readDB);
      if (!cfg.configured) {
        return sendAuthResult(res, {
          ok: false, mode,
          error: 'Login com Google ainda não configurado (faltam Client ID e Client Secret). Veja o README.'
        });
      }

      const state = crypto.randomBytes(24).toString('base64url');
      const verifier = crypto.randomBytes(48).toString('base64url');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      appendCookie(req, res, OAUTH_COOKIE,
        encodeSigned({ state, verifier, mode, exp: Date.now() + OAUTH_TTL_MS }),
        { maxAgeSec: OAUTH_TTL_MS / 1000, cookiePath: '/api/auth/google' });

      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
        response_type: 'code',
        scope: mode === 'author' ? `${google.SCOPE_BASIC} ${google.SCOPE_DRIVE}` : google.SCOPE_BASIC,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256'
      });

      const switchAccount = req.query.switch === '1';
      if (mode === 'author') {
        params.set('access_type', 'offline'); // necessário para o refresh_token do Drive
        params.set('login_hint', AUTHOR_EMAIL);
        params.set('prompt', 'consent select_account');
      } else if (switchAccount) {
        params.set('prompt', 'select_account');
      }

      res.set('Cache-Control', 'no-store');
      res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    });

    // 2) Retorno do Google: troca o code por tokens e abre a sessão
    app.get('/api/auth/google/callback', async (req, res) => {
      const cookies = parseCookies(req.headers.cookie);
      const flow = decodeSigned(cookies[OAUTH_COOKIE]);
      appendCookie(req, res, OAUTH_COOKIE, '', { maxAgeSec: 0, cookiePath: '/api/auth/google' });

      const mode = flow && flow.mode === 'author' ? 'author' : 'client';
      const fail = (error) => sendAuthResult(res, { ok: false, mode, error });

      const { code, state, error } = req.query;
      if (error) return fail(error === 'access_denied' ? 'Login cancelado' : 'O Google recusou o login.');
      if (!flow || !code || !state || !safeEqual(state, flow.state)) {
        return fail('Sessão de login inválida ou expirada. Tente novamente.');
      }

      const cfg = google.getOAuthConfig(readDB);
      if (!cfg.configured) return fail('Login com Google não configurado.');

      try {
        const tokenRes = await google.postForm('https://oauth2.googleapis.com/token', {
          code: String(code),
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
          grant_type: 'authorization_code',
          code_verifier: flow.verifier
        });
        if (tokenRes.status !== 200 || !tokenRes.json || !tokenRes.json.access_token) {
          console.error('Falha na troca do code:', tokenRes.text);
          return fail('Não foi possível validar o login com o Google.');
        }
        const tokens = tokenRes.json;

        const profileRes = await google.request('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const p = profileRes.json;
        if (profileRes.status !== 200 || !p || !p.email || p.email_verified !== true) {
          return fail('Não foi possível confirmar o e-mail da conta Google.');
        }

        const profile = {
          sub: String(p.sub),
          email: String(p.email).toLowerCase().trim(),
          name: String(p.name || p.email.split('@')[0]).slice(0, 120),
          avatar: typeof p.picture === 'string' && p.picture.startsWith('https://') ? p.picture : ''
        };

        if (mode === 'author') {
          if (profile.email !== AUTHOR_EMAIL) {
            google.revokeToken(tokens.refresh_token || tokens.access_token);
            return fail(`Acesso negado: apenas ${AUTHOR_EMAIL} pode fazer login como autor. A conta "${profile.email}" só tem permissão no modo de cliente.`);
          }
          if (!String(tokens.scope || '').includes(google.SCOPE_DRIVE)) {
            return fail('Permita o acesso ao Google Drive (somente leitura) para continuar.');
          }
          const previous = google.readTokens();
          const refreshToken = tokens.refresh_token ||
            (previous && previous.email === profile.email ? previous.refresh_token : null);
          if (!refreshToken) {
            return fail('O Google não enviou a autorização offline. Remova o acesso do app em myaccount.google.com/permissions e tente de novo.');
          }
          google.writeTokens({
            email: profile.email,
            refresh_token: refreshToken,
            access_token: tokens.access_token,
            expiry_date: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
            scope: tokens.scope,
            connectedAt: new Date().toISOString()
          });
        }

        appendCookie(req, res, SESSION_COOKIE,
          encodeSigned({ ...profile, exp: Date.now() + SESSION_TTL_MS }),
          { maxAgeSec: SESSION_TTL_MS / 1000 });
        sendAuthResult(res, { ok: true, mode });
      } catch (err) {
        console.error('Falha no login Google:', err.message);
        fail('Não foi possível concluir o login com o Google.');
      }
    });

    app.post('/api/auth/logout', (req, res) => {
      appendCookie(req, res, SESSION_COOKIE, '', { maxAgeSec: 0 });
      res.json({ success: true });
    });

    // Estado / desconexão do Google Drive (somente Autor)
    app.get('/api/drive/status', requireAuthor, (req, res) => {
      const t = google.readTokens();
      res.json({ connected: driveConnected(), email: t ? t.email : null, connectedAt: t ? t.connectedAt : null });
    });

    app.post('/api/drive/disconnect', requireAuthor, async (req, res) => {
      const t = google.readTokens();
      if (t && t.refresh_token) await google.revokeToken(t.refresh_token);
      google.clearTokens();
      res.json({ success: true });
    });
  }

  return { register, requireUser, requireAuthor, getAuthorizedEmails };
}

module.exports = { createAuth };
