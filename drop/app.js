/**
 * Giffú Drop - Client Application Logic
 * Pure Vanilla JavaScript • Zero bloated frameworks • High Performance
 * Dual Storage Engine: Local Python Server (localhost:8000) + Supabase Cloud Storage (GitHub Pages / giffu.com.br/drop)
 * Security: Giffú Admin Authentication & 2FA Gatekeeper
 */

(function () {
  'use strict';

  // --- AUTHENTICATION CONSTANTS & STATE (SAME AS GIFFÚ ADMIN) ---
  const STATIC_AUTH_USER = "dilan@novel.art.br";
  const STATIC_AUTH_HASH = "b41b60725a8b6510a27b22ff11503a08eba7ea1c66487aa00aafe50407d6e04c";
  const STATIC_AUTH_SALT = "giffu_novel_art_salt_2026";
  const GOOGLE_SCRIPT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyVAeEcZW08W8w_UAkAzkUFhnUF9RR1OVJXlnlxfPREanohccteYbL5E6TvLI53ryv_Zw/exec";

  let isAuthenticated = false;
  let currentChallengeId = null;

  // --- STATE ---
  let items = [];
  let stagedFiles = [];
  let activeFilter = 'all';
  let isSelectionMode = false;
  let selectedItemIds = new Set();
  let currentUploadingXHR = null;
  let supabaseClient = null;

  // Environment detection
  const isStaticHosting = window.location.hostname.includes('github.io') || 
                          window.location.hostname === 'giffu.com.br' || 
                          window.location.hostname.endsWith('giffu.com.br');

  // --- DOM ELEMENTS ---
  const feedContainer = document.getElementById('feedContainer');
  const emptyFeedState = document.getElementById('emptyFeedState');
  const fileInput = document.getElementById('fileInput');
  const textInput = document.getElementById('textInput');
  const btnAttach = document.getElementById('btnAttach');
  const btnSend = document.getElementById('btnSend');
  const stagedFilesBar = document.getElementById('stagedFilesBar');
  const dragOverlay = document.getElementById('dragOverlay');
  const filterChips = document.querySelectorAll('.filter-chip');
  const feedStatsSummary = document.getElementById('feedStatsSummary');
  const storageStatusPill = document.getElementById('storageStatusPill');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const cloudSetupNotice = document.getElementById('cloudSetupNotice');
  const btnConnectCloudNotice = document.getElementById('btnConnectCloudNotice');

  // Auth Overlay Elements
  const dropLoginOverlay = document.getElementById('dropLoginOverlay');
  const dropLoginStepCredentials = document.getElementById('dropLoginStepCredentials');
  const dropLoginStep2FA = document.getElementById('dropLoginStep2FA');
  const adminUsernameInput = document.getElementById('adminUsernameInput');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const loginErrorBox = document.getElementById('loginErrorBox');
  const twoFaErrorBox = document.getElementById('twoFaErrorBox');
  const btnSubmitLogin = document.getElementById('btnSubmitLogin');
  const btnSubmit2FA = document.getElementById('btnSubmit2FA');
  const btnBackToCredentials = document.getElementById('btnBackToCredentials');
  const sentEmailDisplay = document.getElementById('sentEmailDisplay');
  const dropAuthUserBadge = document.getElementById('dropAuthUserBadge');
  const dropAuthUserEmail = document.getElementById('dropAuthUserEmail');
  const btnLogoutDrop = document.getElementById('btnLogoutDrop');

  // Selection
  const btnToggleSelect = document.getElementById('btnToggleSelect');
  const selectionActionBar = document.getElementById('selectionActionBar');
  const selectionCountText = document.getElementById('selectionCountText');
  const btnDownloadSelectedBatch = document.getElementById('btnDownloadSelectedBatch');
  const batchDownloadBtnLabel = document.getElementById('batchDownloadBtnLabel');
  const btnCancelSelection = document.getElementById('btnCancelSelection');

  // Progress Drawer
  const uploadProgressCard = document.getElementById('uploadProgressCard');
  const uploadProgressTitle = document.getElementById('uploadProgressTitle');
  const uploadProgressPercent = document.getElementById('uploadProgressPercent');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const uploadSpeedText = document.getElementById('uploadSpeedText');
  const uploadRemainingText = document.getElementById('uploadRemainingText');

  // Lightbox
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxDownloadBtn = document.getElementById('lightboxDownloadBtn');
  const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

  // Settings
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnCancelSettings = document.getElementById('btnCancelSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const cfgStorageMode = document.getElementById('cfgStorageMode');
  const cloudSettingsSection = document.getElementById('cloudSettingsSection');
  const cfgCloudProvider = document.getElementById('cfgCloudProvider');
  const cfgSupabaseGroup = document.getElementById('cfgSupabaseGroup');
  const cfgCustomApiGroup = document.getElementById('cfgCustomApiGroup');
  const cfgSupabaseUrl = document.getElementById('cfgSupabaseUrl');
  const cfgSupabaseKey = document.getElementById('cfgSupabaseKey');
  const cfgSupabaseBucket = document.getElementById('cfgSupabaseBucket');
  const cfgCustomApiUrl = document.getElementById('cfgCustomApiUrl');

  const toastContainer = document.getElementById('toastContainer');

  // --- HELPERS ---
  const MAX_FILE_SIZE = window.GIFFU_DROP_CONFIG ? window.GIFFU_DROP_CONFIG.maxFileSizeBytes : (1024 * 1024 * 1024);

  async function hashStringSHA256(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (window.matchMedia && window.matchMedia('(max-width: 768px)').matches && 'ontouchstart' in window);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(isoOrTimestamp) {
    if (!isoOrTimestamp) return '';
    const date = new Date(isoOrTimestamp);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Hoje às ${timeStr}`;
    }
    return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${timeStr}`;
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'error') icon = 'fa-circle-exclamation';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const uInt8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  }

  function showLoginError(el, msg) {
    if (!el) return;
    el.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${msg}`;
    el.style.display = 'flex';
  }

  function hideLoginError(el) {
    if (!el) return;
    el.style.display = 'none';
  }

  // --- AUTHENTICATION GATEKEEPER ---
  async function checkDropAuth() {
    // 1. Check shared sessionStorage and localStorage session (same origin as admin.html)
    try {
      const storedSession = sessionStorage.getItem('giffu_admin_session') || localStorage.getItem('giffu_admin_session');
      if (storedSession) {
        const session = JSON.parse(storedSession);
        if (session && session.expiresAt && Date.now() < session.expiresAt) {
          unlockDropUI(session.user || STATIC_AUTH_USER);
          return;
        } else {
          sessionStorage.removeItem('giffu_admin_session');
          localStorage.removeItem('giffu_admin_session');
        }
      }
    } catch (e) {}

    // 2. Check local backend session if running on localhost
    if (!isStaticHosting) {
      try {
        const res = await fetch('/api/auth/status', { headers: { 'Cache-Control': 'no-cache' } });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            unlockDropUI(data.user || STATIC_AUTH_USER);
            return;
          }
        }
      } catch (e) {}
    }

    // Not authenticated: lock screen and display login overlay
    lockDropUI();
  }

  function unlockDropUI(userEmail) {
    isAuthenticated = true;
    if (dropLoginOverlay) dropLoginOverlay.classList.add('hidden');
    if (dropAuthUserBadge) {
      dropAuthUserBadge.style.display = 'flex';
      if (dropAuthUserEmail) dropAuthUserEmail.textContent = userEmail;
    }
    initSupabase();
    fetchItems();
  }

  function lockDropUI() {
    isAuthenticated = false;
    if (dropLoginOverlay) dropLoginOverlay.classList.remove('hidden');
    if (dropLoginStepCredentials) dropLoginStepCredentials.style.display = 'flex';
    if (dropLoginStep2FA) dropLoginStep2FA.style.display = 'none';
    if (dropAuthUserBadge) dropAuthUserBadge.style.display = 'none';
    hideLoginError(loginErrorBox);
    hideLoginError(twoFaErrorBox);
  }

  async function submitDropLogin() {
    if (!adminUsernameInput || !adminPasswordInput) return;

    const username = adminUsernameInput.value.trim().toLowerCase();
    const password = adminPasswordInput.value;

    if (!username || !password) {
      showLoginError(loginErrorBox, 'Por favor, informe seu e-mail e sua senha de administrador.');
      return;
    }

    hideLoginError(loginErrorBox);
    btnSubmitLogin.disabled = true;
    btnSubmitLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Autenticando...';

    // Local server backend authentication
    if (!isStaticHosting) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            currentChallengeId = data.challengeId;
            goTo2FAStep(username);
            return;
          }
        } else {
          const data = await res.json().catch(() => ({}));
          showLoginError(loginErrorBox, data.error || 'Usuário ou senha incorretos.');
          btnSubmitLogin.disabled = false;
          btnSubmitLogin.innerHTML = '<span>Continuar</span> <i class="fas fa-arrow-right"></i>';
          return;
        }
      } catch (e) {}
    }

    // Static GitHub Pages authentication
    try {
      const inputHash = await hashStringSHA256(password + STATIC_AUTH_SALT);

      if (username !== STATIC_AUTH_USER || inputHash !== STATIC_AUTH_HASH) {
        showLoginError(loginErrorBox, 'Usuário ou senha incorretos.');
        btnSubmitLogin.disabled = false;
        btnSubmitLogin.innerHTML = '<span>Continuar</span> <i class="fas fa-arrow-right"></i>';
        return;
      }

      // Generate 6-digit OTP code & challenge
      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const challengeHash = await hashStringSHA256(otpCode + STATIC_AUTH_SALT);
      const expiresAt = Date.now() + 300000; // 5 min

      sessionStorage.setItem('giffu_drop_2fa', JSON.stringify({
        challengeHash,
        expiresAt,
        attempts: 0
      }));

      // Send 2FA email via Google Apps Script (from novelfilmes@gmail.com)
      try {
        await fetch(GOOGLE_SCRIPT_WEBAPP_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            to: username,
            subject: `[${otpCode}] Código de Verificação Giffú Drop`,
            html: `
              <div style="font-family: Arial, sans-serif; background: #0b0b0e; color: #ffffff; padding: 40px 20px; text-align: center;">
                <div style="max-width: 480px; margin: 0 auto; background: #14141b; border: 1px solid rgba(254, 94, 0, 0.3); border-radius: 16px; padding: 32px;">
                  <h2 style="color: #fe5e00; margin-top: 0;">Giffú Drop · Acesso Restrito</h2>
                  <p style="color: #a0a0ab; font-size: 14px;">Seu código de acesso de 6 dígitos para o Drop é:</p>
                  <div style="font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #ffffff; background: rgba(254,94,0,0.15); padding: 18px; border-radius: 12px; margin: 20px 0; border: 1px dashed #fe5e00;">
                    ${otpCode}
                  </div>
                  <p style="color: #6e6e7a; font-size: 12px;">Válido por 5 minutos. Enviado com segurança via Google.</p>
                </div>
              </div>
            `
          })
        });
      } catch (e) {
        console.warn('Envio do Google Apps Script:', e);
      }

      goTo2FAStep(username);

    } catch (err) {
      showLoginError(loginErrorBox, 'Erro ao processar validação de segurança.');
    } finally {
      btnSubmitLogin.disabled = false;
      btnSubmitLogin.innerHTML = '<span>Continuar</span> <i class="fas fa-arrow-right"></i>';
    }
  }

  function goTo2FAStep(username) {
    sentEmailDisplay.textContent = username;
    dropLoginStepCredentials.style.display = 'none';
    dropLoginStep2FA.style.display = 'flex';
    for (let i = 0; i < 6; i++) {
      const box = document.getElementById(`otp-${i}`);
      if (box) box.value = '';
    }
    const firstOtp = document.getElementById('otp-0');
    if (firstOtp) firstOtp.focus();
  }

  async function submitDrop2FA() {
    let code = '';
    for (let i = 0; i < 6; i++) {
      const box = document.getElementById(`otp-${i}`);
      if (box) code += box.value.trim();
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      showLoginError(twoFaErrorBox, 'Por favor, informe os 6 dígitos do código de verificação.');
      return;
    }

    hideLoginError(twoFaErrorBox);
    btnSubmit2FA.disabled = true;
    btnSubmit2FA.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando código...';

    // Local server 2FA
    if (currentChallengeId && !isStaticHosting) {
      try {
        const res = await fetch('/api/auth/verify-2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: currentChallengeId, code })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          saveAndCompleteLogin(data.user || STATIC_AUTH_USER);
          return;
        } else {
          showLoginError(twoFaErrorBox, data.error || 'Código incorreto.');
          btnSubmit2FA.disabled = false;
          btnSubmit2FA.innerHTML = '<span>Verificar e Acessar o Drop</span> <i class="fas fa-check-circle"></i>';
          return;
        }
      } catch (e) {}
    }

    // Static 2FA
    try {
      const rawChallenge = sessionStorage.getItem('giffu_drop_2fa');
      if (!rawChallenge) {
        showLoginError(twoFaErrorBox, 'Desafio 2FA expirado. Faça login novamente.');
        btnSubmit2FA.disabled = false;
        btnSubmit2FA.innerHTML = '<span>Verificar e Acessar o Drop</span> <i class="fas fa-check-circle"></i>';
        return;
      }

      const challenge = JSON.parse(rawChallenge);
      if (Date.now() > challenge.expiresAt) {
        sessionStorage.removeItem('giffu_drop_2fa');
        showLoginError(twoFaErrorBox, 'O código de 6 dígitos expirou. Tente novamente.');
        btnSubmit2FA.disabled = false;
        btnSubmit2FA.innerHTML = '<span>Verificar e Acessar o Drop</span> <i class="fas fa-check-circle"></i>';
        return;
      }

      const inputChallengeHash = await hashStringSHA256(code + STATIC_AUTH_SALT);
      if (inputChallengeHash !== challenge.challengeHash) {
        challenge.attempts = (challenge.attempts || 0) + 1;
        if (challenge.attempts >= 3) {
          sessionStorage.removeItem('giffu_drop_2fa');
          showLoginError(twoFaErrorBox, 'Número máximo de tentativas excedido.');
        } else {
          sessionStorage.setItem('giffu_drop_2fa', JSON.stringify(challenge));
          showLoginError(twoFaErrorBox, 'Código de verificação incorreto.');
        }
        btnSubmit2FA.disabled = false;
        btnSubmit2FA.innerHTML = '<span>Verificar e Acessar o Drop</span> <i class="fas fa-check-circle"></i>';
        return;
      }

      sessionStorage.removeItem('giffu_drop_2fa');
      saveAndCompleteLogin(STATIC_AUTH_USER);

    } catch (err) {
      showLoginError(twoFaErrorBox, 'Erro ao verificar código 2FA.');
    } finally {
      btnSubmit2FA.disabled = false;
      btnSubmit2FA.innerHTML = '<span>Verificar e Acessar o Drop</span> <i class="fas fa-check-circle"></i>';
    }
  }

  function saveAndCompleteLogin(userEmail) {
    const sessionData = {
      user: userEmail,
      expiresAt: Date.now() + 86400000 // 24 hours
    };
    sessionStorage.setItem('giffu_admin_session', JSON.stringify(sessionData));
    localStorage.setItem('giffu_admin_session', JSON.stringify(sessionData));
    unlockDropUI(userEmail);
    showToast('Acesso autorizado! Bem-vindo ao Giffú Drop.', 'success');
  }

  async function logoutDrop() {
    sessionStorage.removeItem('giffu_admin_session');
    localStorage.removeItem('giffu_admin_session');

    if (!isStaticHosting) {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
    }

    lockDropUI();
    showToast('Sessão encerrada com sucesso.', 'info');
  }

  function setupOTPInputs() {
    for (let i = 0; i < 6; i++) {
      const box = document.getElementById(`otp-${i}`);
      if (!box) continue;

      box.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val.length === 1 && i < 5) {
          const nextBox = document.getElementById(`otp-${i + 1}`);
          if (nextBox) nextBox.focus();
        }
        if (i === 5 && val.length === 1) {
          submitDrop2FA();
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i > 0) {
          const prevBox = document.getElementById(`otp-${i - 1}`);
          if (prevBox) {
            prevBox.focus();
            prevBox.value = '';
          }
        } else if (e.key === 'Enter') {
          submitDrop2FA();
        }
      });

      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (/^\d{6}$/.test(pasted)) {
          for (let k = 0; k < 6; k++) {
            const b = document.getElementById(`otp-${k}`);
            if (b) b.value = pasted[k];
          }
          submitDrop2FA();
        }
      });
    }
  }

  // --- SUPABASE STORAGE INITIALIZATION ---
  function initSupabase() {
    const cfg = window.GIFFU_DROP_CONFIG || {};
    const cloud = cfg.cloud || {};
    const sanitizeUrl = window.sanitizeSupabaseUrl || ((u) => (u || '').trim());
    const rawUrl = (cloud.supabaseUrl || '').trim();
    const url = sanitizeUrl(rawUrl);
    const key = (cloud.supabaseAnonKey || '').trim();

    if (url && key && window.supabase) {
      try {
        supabaseClient = window.supabase.createClient(url, key);
        return true;
      } catch (e) {
        console.warn('Erro ao inicializar cliente Supabase:', e);
      }
    }
    supabaseClient = null;
    return false;
  }

  function isSupabaseConfigured() {
    return supabaseClient !== null;
  }

  function getSupabaseBucket() {
    const cfg = window.GIFFU_DROP_CONFIG || {};
    const sanitizeBucket = window.sanitizeBucketName || ((b) => (b || '').trim().toLowerCase() || 'giffu-drop');
    return sanitizeBucket((cfg.cloud && cfg.cloud.bucketName) || 'giffu-drop');
  }

  // --- CLIENT-SIDE VIDEO THUMBNAIL EXTRACTION ---
  function extractVideoThumbnail(file) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('video/')) {
        return resolve(null);
      }

      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const fileUrl = URL.createObjectURL(file);
      video.src = fileUrl;

      const cleanUp = () => {
        URL.revokeObjectURL(fileUrl);
        video.remove();
      };

      video.onloadeddata = () => {
        const targetTime = Math.min(1.0, video.duration > 0 ? video.duration * 0.25 : 0);
        video.currentTime = targetTime;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 720;
          let w = video.videoWidth || 640;
          let h = video.videoHeight || 360;
          if (w > maxDim) {
            h = Math.round(h * (maxDim / w));
            w = maxDim;
          }
          canvas.width = w;
          canvas.height = h;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          cleanUp();
          resolve(dataUrl);
        } catch (err) {
          console.warn('Erro ao renderizar thumbnail em canvas:', err);
          cleanUp();
          resolve(null);
        }
      };

      video.onerror = () => {
        cleanUp();
        resolve(null);
      };

      setTimeout(() => {
        cleanUp();
        resolve(null);
      }, 4000);
    });
  }

  // --- STAGING FILES (BEFORE SEND) ---
  function addFilesToStage(fileList) {
    if (!isAuthenticated) {
      lockDropUI();
      return;
    }

    const files = Array.from(fileList);
    let rejectedOversized = false;

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        showToast(`O arquivo "${file.name}" tem ${formatBytes(file.size)} e ultrapassa o limite de 1 GB. Envio bloqueado.`, 'error');
        rejectedOversized = true;
        continue;
      }

      const exists = stagedFiles.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
      if (!exists) {
        stagedFiles.push(file);
      }
    }

    renderStagedFiles();
    updateSendButtonState();

    if (stagedFiles.length > 0 && !rejectedOversized) {
      showToast(`${files.length} arquivo(s) preparado(s) para envio original.`, 'info');
    }
  }

  function removeStagedFile(index) {
    stagedFiles.splice(index, 1);
    renderStagedFiles();
    updateSendButtonState();
  }

  function clearStagedFiles() {
    stagedFiles = [];
    renderStagedFiles();
    updateSendButtonState();
  }

  function renderStagedFiles() {
    if (stagedFiles.length === 0) {
      stagedFilesBar.style.display = 'none';
      stagedFilesBar.innerHTML = '';
      return;
    }

    stagedFilesBar.style.display = 'flex';
    stagedFilesBar.innerHTML = '';

    stagedFiles.forEach((file, index) => {
      const pill = document.createElement('div');
      pill.className = 'staged-pill';

      let iconClass = 'fa-file';
      if (file.type.startsWith('image/')) iconClass = 'fa-image';
      else if (file.type.startsWith('video/')) iconClass = 'fa-video';

      pill.innerHTML = `
        <i class="fas ${iconClass}" style="color: var(--accent-orange); font-size: 11px;"></i>
        <span style="max-width: 140px; overflow: hidden; text-overflow: ellipsis;">${file.name}</span>
        <span style="color: var(--text-muted); font-size: 10px;">(${formatBytes(file.size)})</span>
        <span class="staged-pill-remove" title="Remover"><i class="fas fa-times"></i></span>
      `;

      pill.querySelector('.staged-pill-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeStagedFile(index);
      });

      stagedFilesBar.appendChild(pill);
    });
  }

  function updateSendButtonState() {
    const hasText = textInput.value.trim().length > 0;
    const hasFiles = stagedFiles.length > 0;
    btnSend.disabled = !hasText && !hasFiles;
  }

  // --- SUPABASE STORAGE PERSISTENCE LAYER ---
  async function loadItemsFromSupabase() {
    if (!isSupabaseConfigured()) return [];
    const bucket = getSupabaseBucket();

    try {
      const { data, error } = await supabaseClient.storage.from(bucket).download('data/items.json');
      if (!error && data) {
        const text = await data.text();
        return JSON.parse(text);
      }
    } catch (e) {
      console.warn('data/items.json não encontrado no bucket, listando arquivos do bucket:', e);
    }

    try {
      const { data: fileList, error: listErr } = await supabaseClient.storage.from(bucket).list('uploads', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
      });

      if (!listErr && fileList) {
        return fileList.map(f => {
          const publicUrl = supabaseClient.storage.from(bucket).getPublicUrl(`uploads/${f.name}`).data.publicUrl;
          const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name);
          const isVid = /\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name);
          const origName = f.name.replace(/^\d+_[a-z0-9]+_/, '');
          return {
            id: `sb_${f.id || f.name}`,
            type: 'file',
            file: {
              id: f.id || f.name,
              originalName: origName,
              storedName: `uploads/${f.name}`,
              url: publicUrl,
              downloadUrl: publicUrl,
              size: f.metadata ? f.metadata.size : 0,
              formattedSize: formatBytes(f.metadata ? f.metadata.size : 0),
              mimeType: f.metadata ? f.metadata.mimetype : 'application/octet-stream',
              category: isImg ? 'image' : (isVid ? 'video' : 'other'),
              thumbnailUrl: isVid ? supabaseClient.storage.from(bucket).getPublicUrl(`thumbs/thumb_${f.name}.jpg`).data.publicUrl : null
            },
            caption: '',
            createdAt: f.created_at || new Date().toISOString(),
            timestamp: new Date(f.created_at || Date.now()).getTime()
          };
        });
      }
    } catch (err) {
      console.error('Erro ao listar arquivos do Supabase:', err);
    }

    return [];
  }

  async function saveItemsToSupabase(newItems) {
    if (!isSupabaseConfigured()) return false;
    const bucket = getSupabaseBucket();

    try {
      const jsonBlob = new Blob([JSON.stringify(newItems, null, 2)], { type: 'application/json' });
      const { error } = await supabaseClient.storage.from(bucket).upload('data/items.json', jsonBlob, {
        upsert: true,
        contentType: 'application/json'
      });
      return !error;
    } catch (e) {
      console.error('Erro ao sincronizar manifesto Supabase:', e);
      return false;
    }
  }

  async function uploadFileToSupabase(file, options) {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase não configurado');
    }

    const bucket = getSupabaseBucket();
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedPath = `uploads/${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${cleanName}`;

    let progress = 10;
    uploadProgressBar.style.width = '20%';
    uploadProgressPercent.textContent = '20%';
    const progressTimer = setInterval(() => {
      progress = Math.min(92, progress + 15);
      uploadProgressBar.style.width = `${progress}%`;
      uploadProgressPercent.textContent = `${progress}%`;
    }, 300);

    let data, uploadErr;
    try {
      const res = await supabaseClient.storage.from(bucket).upload(storedPath, file, {
        cacheControl: '3600',
        upsert: false
      });
      data = res.data;
      uploadErr = res.error;
    } catch (networkErr) {
      uploadErr = networkErr;
    }

    clearInterval(progressTimer);
    uploadProgressBar.style.width = '100%';
    uploadProgressPercent.textContent = '100%';

    if (uploadErr) {
      let rawMsg = uploadErr.message || (typeof uploadErr === 'string' ? uploadErr : 'Falha na comunicação com o Supabase');
      if (/invalid path/i.test(rawMsg) || /PGRST125/i.test(rawMsg)) {
        throw new Error('URL do Supabase incorreta (apontando para REST em vez da raiz). No menu ☁️ Nuvem, informe apenas https://xxxx.supabase.co sem "/rest/v1" e sem barras finais.');
      } else if (/row-level security/i.test(rawMsg) || /security policy/i.test(rawMsg) || /violates/i.test(rawMsg)) {
        throw new Error(`Permissão negada (RLS) no bucket "${bucket}". Crie uma política no Supabase Storage permitindo INSERT e SELECT para anon.`);
      } else if (/bucket not found/i.test(rawMsg) || /not found/i.test(rawMsg)) {
        throw new Error(`Bucket "${bucket}" não encontrado no Supabase. Crie o bucket com esse nome e marque como "Public".`);
      }
      throw new Error(rawMsg);
    }

    const publicUrl = supabaseClient.storage.from(bucket).getPublicUrl(storedPath).data.publicUrl;

    let thumbUrl = null;
    if (options.thumbnailData) {
      try {
        const thumbBlob = dataUrlToBlob(options.thumbnailData);
        const thumbPath = `thumbs/thumb_${Date.now()}_${cleanName}.jpg`;
        const { error: tErr } = await supabaseClient.storage.from(bucket).upload(thumbPath, thumbBlob, {
          contentType: 'image/jpeg',
          upsert: true
        });
        if (!tErr) {
          thumbUrl = supabaseClient.storage.from(bucket).getPublicUrl(thumbPath).data.publicUrl;
        }
      } catch (te) {
        console.warn('Erro ao salvar thumbnail no Supabase:', te);
      }
    }

    const category = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'other');

    return {
      id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      originalName: file.name,
      storedName: storedPath,
      url: publicUrl,
      downloadUrl: publicUrl,
      size: file.size,
      formattedSize: formatBytes(file.size),
      mimeType: file.type || 'application/octet-stream',
      category: category,
      thumbnailUrl: thumbUrl
    };
  }

  // --- FEED DATA FETCHING DISPATCHER ---
  async function fetchItems() {
    if (!isAuthenticated) return;
    const isCloudActive = isSupabaseConfigured();

    if (isStaticHosting) {
      if (isCloudActive) {
        statusDot.style.background = '#10B981';
        statusText.textContent = 'Nuvem (Supabase)';
        if (cloudSetupNotice) cloudSetupNotice.style.display = 'none';

        const sbItems = await loadItemsFromSupabase();
        if (sbItems && sbItems.length > 0) {
          items = sbItems;
          localStorage.setItem('giffu_drop_local_cache', JSON.stringify(items));
        } else {
          const cached = localStorage.getItem('giffu_drop_local_cache');
          if (cached) items = JSON.parse(cached);
        }
        renderFeed();
        updateStats();
        return;
      } else {
        statusDot.style.background = '#F59E0B';
        statusText.textContent = 'Configurar Nuvem';
        if (cloudSetupNotice) cloudSetupNotice.style.display = 'flex';

        const cached = localStorage.getItem('giffu_drop_local_cache');
        if (cached) {
          try {
            items = JSON.parse(cached);
          } catch (e) {}
        }
        renderFeed();
        updateStats();
        return;
      }
    }

    // Running on Localhost:8000
    try {
      const res = await fetch('/api/drop/items');
      if (res.ok) {
        const data = await res.json();
        items = data.items || [];
        renderFeed();
        updateStats();
        statusDot.style.background = '#10B981';
        statusText.textContent = 'Conectado (Local)';
        if (cloudSetupNotice) cloudSetupNotice.style.display = 'none';
      } else {
        throw new Error('Falha ao conectar na API local');
      }
    } catch (err) {
      if (isCloudActive) {
        const sbItems = await loadItemsFromSupabase();
        items = sbItems;
        renderFeed();
        updateStats();
        statusDot.style.background = '#10B981';
        statusText.textContent = 'Nuvem (Supabase)';
      } else {
        statusDot.style.background = '#EF4444';
        statusText.textContent = 'Desconectado';
      }
    }
  }

  function updateStats() {
    let totalBytes = 0;
    let fileCount = 0;

    items.forEach(it => {
      if (it.type === 'file' && it.file) {
        totalBytes += it.file.size || 0;
        fileCount++;
      } else if (it.type === 'batch' && it.files) {
        it.files.forEach(f => {
          totalBytes += f.size || 0;
          fileCount++;
        });
      }
    });

    feedStatsSummary.textContent = `${items.length} mensagem(ns) • ${fileCount} arquivo(s) (${formatBytes(totalBytes)})`;
  }

  // --- UPLOAD CONTROLLER ---
  async function handleSend() {
    if (!isAuthenticated) {
      lockDropUI();
      return;
    }

    const textContent = textInput.value.trim();
    const filesToUpload = [...stagedFiles];

    if (filesToUpload.length === 0 && !textContent) {
      return;
    }

    if (isStaticHosting && !isSupabaseConfigured()) {
      showToast('Para enviar arquivos no GitHub Pages, conecte seu projeto Supabase gratuito no menu de configurações.', 'warning');
      btnOpenSettings.click();
      return;
    }

    textInput.value = '';
    textInput.style.height = 'auto';
    clearStagedFiles();

    // 1. Text-only message
    if (filesToUpload.length === 0 && textContent) {
      const textItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'text',
        text: textContent,
        createdAt: new Date().toISOString(),
        timestamp: Date.now()
      };

      if (isSupabaseConfigured() || isStaticHosting) {
        items.unshift(textItem);
        localStorage.setItem('giffu_drop_local_cache', JSON.stringify(items));
        renderFeed();
        updateStats();
        await saveItemsToSupabase(items);
        showToast('Nota salva no Drop!', 'success');
        return;
      }

      try {
        const res = await fetch('/api/drop/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textContent })
        });
        const data = await res.json();
        if (data.success) {
          items.unshift(data.item);
          renderFeed();
          updateStats();
          showToast('Nota salva no Drop!', 'success');
        } else {
          showToast(data.error || 'Erro ao salvar texto.', 'error');
        }
      } catch (err) {
        showToast('Erro de conexão ao enviar texto.', 'error');
      }
      return;
    }

    // 2. File Uploads
    const isBatch = filesToUpload.length > 1;
    const batchId = isBatch ? `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}` : '';
    const totalFiles = filesToUpload.length;

    showUploadProgress(true);

    const uploadedFiles = [];
    for (let i = 0; i < totalFiles; i++) {
      const file = filesToUpload[i];
      uploadProgressTitle.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Enviando [${i + 1}/${totalFiles}] ${file.name} (${formatBytes(file.size)})...`;

      let thumbData = null;
      if (file.type.startsWith('video/')) {
        uploadProgressTitle.innerHTML = `<i class="fas fa-image"></i> Gerando thumbnail original de ${file.name}...`;
        thumbData = await extractVideoThumbnail(file);
      }

      if (isSupabaseConfigured() || isStaticHosting) {
        try {
          const uploadedFileInfo = await uploadFileToSupabase(file, {
            thumbnailData: thumbData
          });
          uploadedFiles.push(uploadedFileInfo);
        } catch (err) {
          console.error('Falha no upload Supabase:', err);
          showToast(`Erro ao enviar "${file.name}" para a nuvem: ${err.message}`, 'error');
          break;
        }
      } else {
        const success = await uploadSingleFileLocal(file, {
          batchId: isBatch ? batchId : '',
          batchCount: totalFiles,
          caption: (i === 0 && textContent) ? textContent : '',
          thumbnailData: thumbData
        });

        if (!success) {
          showToast(`Falha no upload de "${file.name}". Processo interrompido.`, 'error');
          break;
        }
      }
    }

    showUploadProgress(false);

    if (isSupabaseConfigured() || isStaticHosting) {
      if (uploadedFiles.length > 0) {
        if (isBatch) {
          let batchTotalSize = 0;
          uploadedFiles.forEach(f => batchTotalSize += f.size);
          const batchItem = {
            id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: 'batch',
            batchId: batchId,
            caption: textContent,
            totalExpected: totalFiles,
            files: uploadedFiles,
            totalSize: batchTotalSize,
            formattedTotalSize: formatBytes(batchTotalSize),
            createdAt: new Date().toISOString(),
            timestamp: Date.now()
          };
          items.unshift(batchItem);
        } else {
          const singleItem = {
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: 'file',
            file: uploadedFiles[0],
            caption: textContent,
            createdAt: new Date().toISOString(),
            timestamp: Date.now()
          };
          items.unshift(singleItem);
        }

        localStorage.setItem('giffu_drop_local_cache', JSON.stringify(items));
        renderFeed();
        updateStats();
        await saveItemsToSupabase(items);

        showToast(isBatch ? `Lote de ${uploadedFiles.length} arquivos originais salvo na nuvem!` : 'Arquivo original salvo na nuvem!', 'success');
      }
    } else {
      fetchItems();
    }
  }

  function uploadSingleFileLocal(file, options) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      currentUploadingXHR = xhr;

      const startTime = Date.now();
      let lastLoaded = 0;
      let lastTime = startTime;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          uploadProgressPercent.textContent = `${percent}%`;
          uploadProgressBar.style.width = `${percent}%`;

          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          if (timeDiff > 0.5) {
            const bytesDiff = e.loaded - lastLoaded;
            const speedBps = bytesDiff / timeDiff;
            uploadSpeedText.textContent = `${formatBytes(speedBps)}/s`;

            const remainingBytes = e.total - e.loaded;
            if (speedBps > 0) {
              const remainingSec = Math.round(remainingBytes / speedBps);
              uploadRemainingText.textContent = `${remainingSec}s restantes`;
            }
            lastLoaded = e.loaded;
            lastTime = now;
          }
        }
      };

      xhr.onload = () => {
        currentUploadingXHR = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resp = JSON.parse(xhr.responseText);
            resolve(resp.success);
          } catch (e) {
            resolve(true);
          }
        } else if (xhr.status === 405) {
          showToast('Erro 405: O GitHub Pages não aceita uploads locais. Conecte o Supabase no ícone de nuvem ☁️.', 'error');
          btnOpenSettings.click();
          resolve(false);
        } else {
          try {
            const errResp = JSON.parse(xhr.responseText);
            showToast(errResp.error || 'Erro no upload.', 'error');
          } catch (e) {
            showToast(`Erro ${xhr.status} no upload.`, 'error');
          }
          resolve(false);
        }
      };

      xhr.onerror = () => {
        currentUploadingXHR = null;
        showToast('Erro de conexão durante o upload.', 'error');
        resolve(false);
      };

      xhr.open('POST', '/api/drop/upload', true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.setRequestHeader('X-File-Type', file.type || 'application/octet-stream');
      if (options.batchId) {
        xhr.setRequestHeader('X-Batch-Id', options.batchId);
        xhr.setRequestHeader('X-Batch-Count', options.batchCount.toString());
      }
      if (options.caption) {
        xhr.setRequestHeader('X-Caption', encodeURIComponent(options.caption));
      }
      if (options.thumbnailData) {
        xhr.setRequestHeader('X-Thumbnail-Data', options.thumbnailData);
      }

      xhr.send(file);
    });
  }

  function showUploadProgress(show) {
    if (show) {
      uploadProgressCard.style.display = 'flex';
      uploadProgressPercent.textContent = '0%';
      uploadProgressBar.style.width = '0%';
      uploadSpeedText.textContent = '0 MB/s';
      uploadRemainingText.textContent = 'Iniciando...';
    } else {
      uploadProgressCard.style.display = 'none';
      currentUploadingXHR = null;
    }
  }

  // --- DELETE CONTROLLER ---
  async function deleteItem(id, cardElement) {
    if (!isAuthenticated) return;
    if (!confirm('Deseja realmente apagar este item e seus arquivos originais?')) {
      return;
    }

    if (isSupabaseConfigured() || isStaticHosting) {
      const bucket = getSupabaseBucket();
      const targetItem = items.find(it => it.id === id || it.batchId === id);

      if (targetItem && supabaseClient) {
        const filesToRemove = [];
        if (targetItem.type === 'file' && targetItem.file && targetItem.file.storedName) {
          filesToRemove.push(targetItem.file.storedName);
        } else if (targetItem.type === 'batch' && targetItem.files) {
          targetItem.files.forEach(f => {
            if (f.storedName) filesToRemove.push(f.storedName);
          });
        }
        if (filesToRemove.length > 0) {
          await supabaseClient.storage.from(bucket).remove(filesToRemove);
        }
      }

      items = items.filter(it => it.id !== id && it.batchId !== id);
      localStorage.setItem('giffu_drop_local_cache', JSON.stringify(items));
      cardElement.style.transform = 'scale(0.95)';
      cardElement.style.opacity = '0';
      setTimeout(() => {
        cardElement.remove();
        if (items.length === 0) emptyFeedState.style.display = 'flex';
        updateStats();
      }, 250);
      await saveItemsToSupabase(items);
      showToast('Item excluído da nuvem.', 'info');
      return;
    }

    try {
      const res = await fetch(`/api/drop/items/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        items = items.filter(it => it.id !== id && it.batchId !== id);
        cardElement.style.transform = 'scale(0.95)';
        cardElement.style.opacity = '0';
        setTimeout(() => {
          cardElement.remove();
          if (items.length === 0) {
            emptyFeedState.style.display = 'flex';
          }
          updateStats();
        }, 250);
        showToast('Item excluído com sucesso.', 'info');
      } else {
        showToast(data.error || 'Erro ao excluir item.', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão ao excluir.', 'error');
    }
  }

  // --- BATCH DOWNLOAD (MOBILE GALLERY vs DESKTOP ZIP) ---
  async function downloadBatchFiles(fileList, batchTitle = 'giffu-drop-lote') {
    if (!isAuthenticated) return;
    if (!fileList || fileList.length === 0) return;

    const isMobile = isMobileDevice();

    if (isMobile && navigator.canShare) {
      try {
        showToast('Preparando arquivos para a Galeria...', 'info');

        const shareFiles = [];
        for (const f of fileList) {
          const downloadUrl = f.url || f.downloadUrl;
          const blobRes = await fetch(downloadUrl);
          const blob = await blobRes.blob();
          const shareFile = new File([blob], f.originalName || 'arquivo', { type: f.mimeType || blob.type });
          shareFiles.push(shareFile);
        }

        if (navigator.canShare({ files: shareFiles })) {
          await navigator.share({
            files: shareFiles,
            title: 'Giffú Drop',
            text: 'Arquivos em qualidade original'
          });
          showToast('Arquivos enviados para a Galeria/Compartilhamento!', 'success');
          return;
        }
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') return;
        console.warn('Web Share API não suportada, fallback para download:', shareErr);
      }
    }

    if (window.JSZip) {
      try {
        showToast(`Criando arquivo ZIP com ${fileList.length} arquivo(s) original(is)...`, 'info');
        const zip = new JSZip();

        let loaded = 0;
        for (const f of fileList) {
          const downloadUrl = f.url || f.downloadUrl;
          const res = await fetch(downloadUrl);
          const blob = await res.blob();
          zip.file(f.originalName || `arquivo_${loaded + 1}`, blob);
          loaded++;
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = zipUrl;
        const cleanBatchName = batchTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `${cleanBatchName}_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);

        showToast('Download do ZIP concluído!', 'success');
        return;
      } catch (zipErr) {
        console.error('Erro ao gerar ZIP:', zipErr);
        showToast('Erro ao criar arquivo ZIP. Baixando individualmente...', 'warning');
      }
    }

    fileList.forEach((f, idx) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = f.downloadUrl || f.url;
        a.download = f.originalName || '';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, idx * 400);
    });
  }

  // --- RENDER FEED ITEMS ---
  function renderFeed() {
    feedContainer.innerHTML = '';

    const filtered = items.filter(item => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'text') return item.type === 'text';
      if (activeFilter === 'batch') return item.type === 'batch';
      if (activeFilter === 'image') {
        if (item.type === 'file' && item.file && item.file.category === 'image') return true;
        if (item.type === 'batch' && item.files && item.files.some(f => f.category === 'image')) return true;
        return false;
      }
      if (activeFilter === 'video') {
        if (item.type === 'file' && item.file && item.file.category === 'video') return true;
        if (item.type === 'batch' && item.files && item.files.some(f => f.category === 'video')) return true;
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      emptyFeedState.style.display = 'flex';
      return;
    } else {
      emptyFeedState.style.display = 'none';
    }

    filtered.forEach(item => {
      const card = createItemCard(item);
      feedContainer.appendChild(card);
    });
  }

  function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'drop-card';
    card.dataset.id = item.id;

    if (selectedItemIds.has(item.id)) {
      card.classList.add('selected');
    }

    card.addEventListener('click', (e) => {
      if (isSelectionMode) {
        e.preventDefault();
        toggleCardSelection(item.id, card);
      }
    });

    const header = document.createElement('div');
    header.className = 'card-header';

    let typeTagHtml = '';
    if (item.type === 'text') {
      typeTagHtml = '<span class="card-type-tag"><i class="fas fa-file-alt"></i> Texto</span>';
    } else if (item.type === 'batch') {
      typeTagHtml = `<span class="card-type-tag badge-batch"><i class="fas fa-layer-group"></i> Lote (${item.files ? item.files.length : 0})</span>`;
    } else if (item.type === 'file') {
      const cat = item.file ? item.file.category : 'other';
      if (cat === 'image') typeTagHtml = '<span class="card-type-tag"><i class="fas fa-image"></i> Foto Original</span>';
      else if (cat === 'video') typeTagHtml = '<span class="card-type-tag"><i class="fas fa-video"></i> Vídeo Original</span>';
      else typeTagHtml = '<span class="card-type-tag"><i class="fas fa-file"></i> Arquivo</span>';
    }

    header.innerHTML = `
      <div class="card-meta">
        ${typeTagHtml}
        <span>${formatDate(item.createdAt || item.timestamp)}</span>
      </div>
      <div class="card-actions-row">
        ${item.type === 'text' ? `
          <button class="mini-btn btn-copy" title="Copiar texto"><i class="fas fa-copy"></i></button>
        ` : ''}
        <button class="mini-btn btn-delete" title="Excluir"><i class="fas fa-trash-alt"></i></button>
      </div>
    `;

    const btnCopy = header.querySelector('.btn-copy');
    if (btnCopy) {
      btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(item.text);
        showToast('Texto copiado para a área de transferência!', 'success');
      });
    }

    const btnDel = header.querySelector('.btn-delete');
    if (btnDel) {
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(item.id, card);
      });
    }

    card.appendChild(header);

    if (item.caption) {
      const cap = document.createElement('div');
      cap.className = 'card-caption';
      cap.textContent = item.caption;
      card.appendChild(cap);
    }

    if (item.type === 'text') {
      const textBody = document.createElement('div');
      textBody.className = 'card-text-body';
      textBody.textContent = item.text;
      card.appendChild(textBody);
    } else if (item.type === 'file') {
      renderSingleFileBody(card, item.file);
    } else if (item.type === 'batch') {
      renderBatchBody(card, item);
    }

    return card;
  }

  function renderSingleFileBody(card, f) {
    if (!f) return;

    if (f.category === 'image') {
      const wrap = document.createElement('div');
      wrap.className = 'photo-preview-wrap';
      wrap.innerHTML = `
        <img src="${f.url}" alt="${f.originalName}" loading="lazy">
        <div class="photo-overlay-badges">
          <span class="badge-pill"><i class="fas fa-expand"></i> Clique para ampliar</span>
          <span class="badge-pill">${f.formattedSize}</span>
        </div>
      `;

      wrap.addEventListener('click', (e) => {
        if (!isSelectionMode) {
          e.stopPropagation();
          openLightbox(f.url, `${f.originalName} • ${f.formattedSize}`, f.downloadUrl);
        }
      });

      card.appendChild(wrap);
    } else if (f.category === 'video') {
      const wrap = document.createElement('div');
      wrap.className = 'video-thumb-wrap';

      const thumbSrc = f.thumbnailUrl || '';
      if (thumbSrc) {
        wrap.innerHTML = `
          <img src="${thumbSrc}" alt="Thumbnail de ${f.originalName}">
          <div class="video-play-indicator"><i class="fas fa-play" style="margin-left: 3px;"></i></div>
          <div class="photo-overlay-badges">
            <span class="badge-pill"><i class="fas fa-video"></i> Vídeo Original</span>
            <span class="badge-pill">${f.formattedSize}</span>
          </div>
        `;
      } else {
        wrap.innerHTML = `
          <div class="video-thumb-placeholder">
            <i class="fas fa-video" style="font-size: 36px; color: var(--accent-orange);"></i>
            <span style="font-size: 13px;">Vídeo em Qualidade Original</span>
          </div>
          <div class="photo-overlay-badges">
            <span class="badge-pill">${f.formattedSize}</span>
          </div>
        `;
      }

      wrap.addEventListener('click', (e) => {
        if (!isSelectionMode) {
          e.stopPropagation();
          const a = document.createElement('a');
          a.href = f.downloadUrl;
          a.download = f.originalName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          showToast(`Iniciando download do vídeo original (${f.formattedSize})...`, 'info');
        }
      });

      card.appendChild(wrap);
    }

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.innerHTML = `
      <div class="file-info-text">
        <span class="file-name-truncate" title="${f.originalName}">${f.originalName}</span>
        <span class="file-size-sub">${f.formattedSize} • Qualidade 100% Original</span>
      </div>
      <a href="${f.downloadUrl}" class="btn-download-original" download="${f.originalName}">
        <i class="fas fa-download"></i> <span class="btn-text-full">Baixar Arquivo Original</span>
      </a>
    `;

    card.appendChild(footer);
  }

  function renderBatchBody(card, batchItem) {
    const files = batchItem.files || [];
    const isMobile = isMobileDevice();

    const gallery = document.createElement('div');
    gallery.className = 'batch-gallery';

    files.forEach(f => {
      const cell = document.createElement('div');
      cell.className = 'batch-item-cell';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'batch-thumb-wrap';

      if (f.category === 'image') {
        thumbWrap.innerHTML = `<img src="${f.url}" alt="${f.originalName}" loading="lazy">`;
        thumbWrap.addEventListener('click', (e) => {
          if (!isSelectionMode) {
            e.stopPropagation();
            openLightbox(f.url, `${f.originalName} • ${f.formattedSize}`, f.downloadUrl);
          }
        });
      } else if (f.category === 'video') {
        const tsrc = f.thumbnailUrl || '';
        if (tsrc) {
          thumbWrap.innerHTML = `
            <img src="${tsrc}" alt="${f.originalName}">
            <div style="position: absolute; color: #fff; font-size: 16px;"><i class="fas fa-play"></i></div>
          `;
        } else {
          thumbWrap.innerHTML = `<i class="fas fa-video" style="font-size: 24px; color: var(--accent-orange);"></i>`;
        }
      } else {
        thumbWrap.innerHTML = `<i class="fas fa-file" style="font-size: 24px; color: var(--text-muted);"></i>`;
      }

      cell.appendChild(thumbWrap);

      const details = document.createElement('div');
      details.className = 'batch-item-details';
      details.innerHTML = `
        <div class="batch-item-meta">
          <span class="batch-item-name" title="${f.originalName}">${f.originalName}</span>
          <span class="batch-item-size">${f.formattedSize}</span>
        </div>
        <a href="${f.downloadUrl}" class="mini-btn" download="${f.originalName}" title="Baixar original individual">
          <i class="fas fa-download"></i>
        </a>
      `;

      cell.appendChild(details);
      gallery.appendChild(cell);
    });

    card.appendChild(gallery);

    const footer = document.createElement('div');
    footer.className = 'card-footer';

    const batchDownloadLabel = isMobile ? 'Salvar no Fotos / Galeria' : 'Baixar Lote (.ZIP)';
    const batchDownloadIcon = isMobile ? 'fa-mobile-screen-button' : 'fa-file-zipper';

    footer.innerHTML = `
      <div class="file-info-text">
        <span class="file-name-truncate">Lote com ${files.length} arquivos</span>
        <span class="file-size-sub">${batchItem.formattedTotalSize || formatBytes(batchItem.totalSize)} • Preservação Original</span>
      </div>
      <button class="btn-download-original btn-download-batch">
        <i class="fas ${batchDownloadIcon}"></i> <span>${batchDownloadLabel}</span>
      </button>
    `;

    footer.querySelector('.btn-download-batch').addEventListener('click', (e) => {
      e.stopPropagation();
      downloadBatchFiles(files, `giffu_lote_${batchItem.id}`);
    });

    card.appendChild(footer);
  }

  // --- LIGHTBOX CONTROLLER ---
  function openLightbox(imgSrc, captionText, downloadUrl) {
    lightboxImg.src = imgSrc;
    lightboxCaption.textContent = captionText || '';
    lightboxDownloadBtn.href = downloadUrl || imgSrc;
    lightboxModal.classList.add('active');
  }

  function closeLightbox() {
    lightboxModal.classList.remove('active');
    lightboxImg.src = '';
  }

  lightboxCloseBtn.addEventListener('click', closeLightbox);
  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });

  // --- SELECTION MODE CONTROLLER ---
  function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    btnToggleSelect.classList.toggle('active', isSelectionMode);

    if (isSelectionMode) {
      selectedItemIds.clear();
      selectionActionBar.style.display = 'flex';
      updateSelectionActionBar();
      showToast('Modo de Seleção ativado. Toque nos cards para selecionar.', 'info');
    } else {
      selectedItemIds.clear();
      selectionActionBar.style.display = 'none';
      document.querySelectorAll('.drop-card.selected').forEach(c => c.classList.remove('selected'));
    }
  }

  function toggleCardSelection(itemId, cardElement) {
    if (selectedItemIds.has(itemId)) {
      selectedItemIds.delete(itemId);
      cardElement.classList.remove('selected');
    } else {
      selectedItemIds.add(itemId);
      cardElement.classList.add('selected');
    }
    updateSelectionActionBar();
  }

  function updateSelectionActionBar() {
    const count = selectedItemIds.size;
    selectionCountText.textContent = `${count} item(ns) selecionado(s)`;
    const isMobile = isMobileDevice();
    batchDownloadBtnLabel.textContent = isMobile ? 'Salvar Seleção na Galeria' : 'Baixar Seleção (.ZIP)';
    btnDownloadSelectedBatch.disabled = count === 0;
    btnDownloadSelectedBatch.style.opacity = count === 0 ? '0.4' : '1';
  }

  btnToggleSelect.addEventListener('click', toggleSelectionMode);
  btnCancelSelection.addEventListener('click', toggleSelectionMode);

  btnDownloadSelectedBatch.addEventListener('click', () => {
    const selectedFiles = [];
    items.forEach(it => {
      if (selectedItemIds.has(it.id)) {
        if (it.type === 'file' && it.file) {
          selectedFiles.push(it.file);
        } else if (it.type === 'batch' && it.files) {
          selectedFiles.push(...it.files);
        }
      }
    });

    if (selectedFiles.length === 0) {
      showToast('Nenhum arquivo encontrado nos itens selecionados.', 'warning');
      return;
    }

    downloadBatchFiles(selectedFiles, 'giffu_selecao');
    toggleSelectionMode();
  });

  // --- FILTER CHIPS CONTROLLER ---
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderFeed();
    });
  });

  // --- ATTACH & INPUT CONTROLLERS ---
  btnAttach.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToStage(e.target.files);
    }
    fileInput.value = '';
  });

  textInput.addEventListener('input', () => {
    textInput.style.height = 'auto';
    textInput.style.height = Math.min(120, textInput.scrollHeight) + 'px';
    updateSendButtonState();
  });

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  btnSend.addEventListener('click', handleSend);

  // Drag & drop
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dragOverlay.classList.add('active');
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dragOverlay.classList.remove('active');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.remove('active');

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToStage(e.dataTransfer.files);
    }
  });

  window.addEventListener('paste', (e) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      addFilesToStage(e.clipboardData.files);
      showToast('Arquivo colado da área de transferência!', 'info');
    }
  });

  // --- SETTINGS CONTROLLER ---
  function loadSettingsIntoModal() {
    const cfg = window.GIFFU_DROP_CONFIG || {};
    cfgStorageMode.value = isStaticHosting ? 'cloud' : (cfg.storageMode || 'local');
    toggleCloudSection(cfgStorageMode.value === 'cloud' || isStaticHosting);

    if (cfg.cloud) {
      const sanitizeUrl = window.sanitizeSupabaseUrl || ((u) => (u || '').trim());
      const sanitizeBucket = window.sanitizeBucketName || ((b) => (b || '').trim().toLowerCase() || 'giffu-drop');

      cfgCloudProvider.value = cfg.cloud.provider || 'supabase';
      cfgSupabaseUrl.value = sanitizeUrl(cfg.cloud.supabaseUrl || '');
      cfgSupabaseKey.value = cfg.cloud.supabaseAnonKey || '';
      cfgSupabaseBucket.value = sanitizeBucket(cfg.cloud.bucketName || 'giffu-drop');
      cfgCustomApiUrl.value = cfg.cloud.customApiUrl || '';
    }
    toggleProviderInputs();
  }

  function toggleCloudSection(show) {
    cloudSettingsSection.style.display = show ? 'flex' : 'none';
  }

  function toggleProviderInputs() {
    const prov = cfgCloudProvider.value;
    cfgSupabaseGroup.style.display = prov === 'supabase' ? 'flex' : 'none';
    cfgCustomApiGroup.style.display = prov === 'custom_api' ? 'flex' : 'none';
  }

  cfgStorageMode.addEventListener('change', (e) => toggleCloudSection(e.target.value === 'cloud'));
  cfgCloudProvider.addEventListener('change', toggleProviderInputs);

  if (cfgSupabaseUrl) {
    cfgSupabaseUrl.addEventListener('blur', () => {
      const sanitizeUrl = window.sanitizeSupabaseUrl || ((u) => (u || '').trim());
      if (cfgSupabaseUrl.value) {
        cfgSupabaseUrl.value = sanitizeUrl(cfgSupabaseUrl.value);
      }
    });
  }

  if (cfgSupabaseBucket) {
    cfgSupabaseBucket.addEventListener('blur', () => {
      const sanitizeBucket = window.sanitizeBucketName || ((b) => (b || '').trim().toLowerCase() || 'giffu-drop');
      if (cfgSupabaseBucket.value) {
        cfgSupabaseBucket.value = sanitizeBucket(cfgSupabaseBucket.value);
      }
    });
  }

  btnOpenSettings.addEventListener('click', () => {
    loadSettingsIntoModal();
    settingsModal.classList.add('active');
  });

  if (btnConnectCloudNotice) {
    btnConnectCloudNotice.addEventListener('click', () => {
      btnOpenSettings.click();
    });
  }

  btnCloseSettings.addEventListener('click', () => settingsModal.classList.remove('active'));
  btnCancelSettings.addEventListener('click', () => settingsModal.classList.remove('active'));

  btnSaveSettings.addEventListener('click', () => {
    const sanitizeUrl = window.sanitizeSupabaseUrl || ((u) => (u || '').trim());
    const sanitizeBucket = window.sanitizeBucketName || ((b) => (b || '').trim().toLowerCase() || 'giffu-drop');

    const cleanUrl = sanitizeUrl(cfgSupabaseUrl.value.trim());
    const cleanBucket = sanitizeBucket(cfgSupabaseBucket.value.trim());

    cfgSupabaseUrl.value = cleanUrl;
    cfgSupabaseBucket.value = cleanBucket;

    const newCfg = {
      ...window.GIFFU_DROP_CONFIG,
      storageMode: cfgStorageMode.value,
      cloud: {
        provider: cfgCloudProvider.value,
        supabaseUrl: cleanUrl,
        supabaseAnonKey: cfgSupabaseKey.value.trim(),
        bucketName: cleanBucket,
        customApiUrl: cfgCustomApiUrl.value.trim()
      }
    };

    if (window.saveAppConfig(newCfg)) {
      showToast('Configurações salvas e validadas!', 'success');
      settingsModal.classList.remove('active');
      initSupabase();
      fetchItems();
    } else {
      showToast('Erro ao salvar configurações.', 'error');
    }
  });

  // Auth Button Listeners
  if (btnSubmitLogin) btnSubmitLogin.addEventListener('click', submitDropLogin);
  if (btnSubmit2FA) btnSubmit2FA.addEventListener('click', submitDrop2FA);
  if (btnBackToCredentials) {
    btnBackToCredentials.addEventListener('click', () => {
      dropLoginStep2FA.style.display = 'none';
      dropLoginStepCredentials.style.display = 'flex';
      hideLoginError(twoFaErrorBox);
    });
  }

  if (adminPasswordInput) {
    adminPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitDropLogin();
    });
  }

  if (btnLogoutDrop) {
    btnLogoutDrop.addEventListener('click', logoutDrop);
  }

  // --- INITIALIZATION ---
  setupOTPInputs();
  checkDropAuth();
  updateSendButtonState();

  setInterval(() => {
    if (isAuthenticated) fetchItems();
  }, 10000);

})();
