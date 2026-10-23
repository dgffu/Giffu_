// Google authentication client for Giffú Entrega
// O login acontece em um popup do próprio servidor (OAuth 2.0 + PKCE). O navegador nunca vê
// tokens nem o Client Secret: a sessão fica em um cookie HttpOnly.

const Auth = {
  user: null,
  driveConnected: false,
  config: { configured: false },

  async refreshSession() {
    try {
      const sess = await fetch('/api/auth/session').then(r => r.json());
      this.user = sess.user || null;
      this.driveConnected = Boolean(sess.driveConnected);
    } catch (e) {
      console.error('Erro ao consultar sessão:', e);
    }
  },

  async init() {
    try {
      this.config = await fetch('/api/auth/config').then(r => r.json());
    } catch (e) {
      console.error('Erro ao iniciar autenticação:', e);
    }
    await this.refreshSession();
  },

  // mode: 'author' (painel + conexão com o Drive) | 'client' (somente comentários)
  // IMPORTANTE: window.open precisa rodar direto no clique, antes de qualquer await
  signIn(mode = 'client', { switchAccount = false } = {}) {
    if (!this.config.configured) {
      return Promise.reject(new Error('Login com Google ainda não configurado (faltam Client ID e Client Secret). Veja o README.'));
    }

    const width = 520;
    const height = 680;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    const url = `/api/auth/google/start?mode=${encodeURIComponent(mode)}${switchAccount ? '&switch=1' : ''}`;
    const popup = window.open(url, 'giffu-google-login', `width=${width},height=${height},left=${left},top=${top}`);

    if (!popup) {
      return Promise.reject(new Error('O navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo.'));
    }

    return new Promise((resolve, reject) => {
      let finished = false;
      let timer = null;

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
        else reject(new Error('Não foi possível entrar com o Google.'));
      };

      window.addEventListener('message', onMessage);

      // Se o usuário fechar o popup sem concluir
      timer = setInterval(() => {
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

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    this.user = null;
    this.driveConnected = false;
  }
};

// Se a sessão expirar no servidor, volta para a tela de login do Autor
(function installSessionGuard() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await originalFetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const isApi = url.startsWith('/api/') && !url.startsWith('/api/auth/') && !url.startsWith('/api/projects/verify-password');
      if (res.status === 401 && isApi && Auth.user) {
        Auth.user = null;
        if (window.app) {
          window.app.authorSession = null;
          if (!window.app.isClientMode) window.app.render();
          window.showToast && window.showToast('Sessão expirada. Faça login novamente.');
        }
      }
    } catch (e) {}
    return res;
  };
})();

window.Auth = Auth;
