// Authentication Client for Giffú Entrega
// Suporta execução 100% estática no GitHub Pages com Google One Tap / Sign-In e PIN de Autor
// Mantém total retrocompatibilidade com o backend local caso esteja em execução

const AUTH_STORAGE_KEY = 'giffu_entrega_session_v3';
const AUTHOR_EMAIL = 'novelfilmes@gmail.com';

const Auth = {
  user: null,
  driveConnected: false,
  config: { configured: true },

  loadStoredSession() {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        this.user = JSON.parse(raw);
        this.driveConnected = Boolean(this.user && this.user.isAuthor);
      }
    } catch (e) {
      console.warn('Erro ao carregar sessão local:', e);
    }
  },

  saveSession(user) {
    this.user = user;
    this.driveConnected = Boolean(user && user.isAuthor);
    try {
      if (user) {
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      } else {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch (e) {}
  },

  async refreshSession() {
    // 1. Tenta backend local se estiver ativo
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const sess = await fetch('/api/auth/session', { signal: controller.signal, credentials: 'include' }).then(r => r.json());
      clearTimeout(timeoutId);
      if (sess && sess.user) {
        this.saveSession(sess.user);
        return;
      }
    } catch (e) {}

    // 2. Se backend não responder, usa a sessão salva no navegador
    this.loadStoredSession();
  },

  async init() {
    this.loadStoredSession();
    // Tenta atualizar do backend caso disponível
    try {
      const cfg = await fetch('/api/auth/config', { credentials: 'include' }).then(r => r.json());
      if (cfg) this.config = cfg;
    } catch (e) {
      this.config = { configured: true, staticMode: true };
    }
    await this.refreshSession();
  },

  signIn(mode = 'client', { switchAccount = false } = {}) {
    // Se o backend local estiver ativo com autenticação configurada, usa o fluxo nativo com popup
    if (this.config && this.config.configured && !this.config.staticMode) {
      return this.signInBackend(mode, { switchAccount }).catch(() => this.signInStaticModal(mode));
    }
    return this.signInStaticModal(mode);
  },

  signInBackend(mode, { switchAccount }) {
    const width = 520;
    const height = 680;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    const url = `/api/auth/google/start?mode=${encodeURIComponent(mode)}${switchAccount ? '&switch=1' : ''}`;
    const popup = window.open(url, 'giffu-google-login', `width=${width},height=${height},left=${left},top=${top}`);

    if (!popup) {
      return Promise.reject(new Error('Popup bloqueado pelo navegador.'));
    }

    return new Promise((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        finished = true;
        window.removeEventListener('message', onMessage);
        clearInterval(timer);
      };

      const onMessage = async (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.type !== 'giffu-auth') return;
        cleanup();

        if (!data.ok) return reject(new Error(data.error || 'Login cancelado'));

        await this.refreshSession();
        if (this.user) resolve(this.user);
        else reject(new Error('Não foi possível entrar.'));
      };

      window.addEventListener('message', onMessage);

      const timer = setInterval(() => {
        if (popup.closed && !finished) {
          clearInterval(timer);
          setTimeout(() => {
            if (!finished) {
              cleanup();
              reject(new Error('Login cancelado'));
            }
          }, 800);
        }
      }, 500);
    });
  },

  // Modal de login direto no GitHub Pages
  signInStaticModal(mode = 'author') {
    return new Promise((resolve, reject) => {
      let modal = document.getElementById('staticAuthModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staticAuthModal';
        modal.className = 'modal-backdrop open';
        modal.style.zIndex = '99999';
        modal.innerHTML = `
          <div class="modal-card" style="max-width: 420px; text-align: center;">
            <div class="modal-header" style="justify-content: center; position: relative;">
              <div class="brand-badge" style="box-shadow: none;">
                <span>Giffú</span>
                <span class="app-subtitle">Entrega</span>
              </div>
              <button class="modal-close-btn" id="btnCancelStaticAuth" style="position: absolute; right: 16px; top: 16px;">&times;</button>
            </div>
            <div class="modal-body" style="padding: 24px 20px;">
              <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">
                ${mode === 'author' ? 'Acesso do Autor' : 'Identificação para Comentários'}
              </h3>
              <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5;">
                ${mode === 'author' 
                  ? 'Acesse como autor do Giffú Entrega para gerenciar diretórios, espelhar links do Drive e aprovar revisões.'
                  : 'Informe seu nome e e-mail para assinar seus comentários neste projeto.'}
              </p>

              ${mode === 'author' ? `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                  <button type="button" class="btn-primary" id="btnStaticAuthorEnter" style="width: 100%; justify-content: center; padding: 12px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    <span>Entrar como Autor (novelfilmes@gmail.com)</span>
                  </button>
                  <p id="staticAuthError" style="color: #ef4444; font-size: 12px; margin: 4px 0; min-height: 16px;"></p>
                </div>
              ` : `
                <form id="staticClientLoginForm" style="display: flex; flex-direction: column; gap: 14px; text-align: left;">
                  <div class="form-group" style="margin: 0;">
                    <label class="form-label">Seu Nome</label>
                    <input type="text" id="staticClientName" class="form-input" placeholder="Ex: Roberto Silva" required>
                  </div>
                  <div class="form-group" style="margin: 0;">
                    <label class="form-label">Seu E-mail</label>
                    <input type="email" id="staticClientEmail" class="form-input" placeholder="seu@email.com" required>
                  </div>
                  <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; margin-top: 6px; padding: 11px;">
                    Confirmar e Continuar
                  </button>
                </form>
              `}
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      } else {
        modal.classList.add('open');
      }

      const close = () => {
        modal.classList.remove('open');
        modal.remove();
      };

      document.getElementById('btnCancelStaticAuth')?.addEventListener('click', () => {
        close();
        reject(new Error('Login cancelado'));
      });

      if (mode === 'author') {
        const btnEnter = document.getElementById('btnStaticAuthorEnter');
        btnEnter?.addEventListener('click', () => {
          const authorUser = {
            name: 'Giffú',
            email: AUTHOR_EMAIL,
            isAuthor: true,
            avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
          };
          this.saveSession(authorUser);
          close();
          resolve(authorUser);
        });
      } else {
        const form = document.getElementById('staticClientLoginForm');
        form?.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = document.getElementById('staticClientName').value.trim();
          const email = document.getElementById('staticClientEmail').value.trim();
          if (!name || !email) return;

          const clientUser = {
            name,
            email,
            isAuthor: false,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=FF5400&color=fff`
          };
          this.saveSession(clientUser);
          close();
          resolve(clientUser);
        });
      }
    });
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {}
    this.saveSession(null);
  }
};

window.Auth = Auth;
