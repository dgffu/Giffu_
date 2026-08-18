/**
 * admin.js - Giffú Admin Panel Controller
 * Handles Google OAuth, YouTube Data API v3 Resumable Uploads, Thumbnail setup, and Video Management.
 */

let accessToken = null;
let tokenClient = null;
let selectedVideoFile = null;
let selectedThumbFile = null;

// Default or stored Client ID
const DEFAULT_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID";

// Initialize on DOM ready or immediately if already loaded
function initAdminApp() {
  cleanupLocalStorageVideos();
  loadSavedClientId();
  loadSavedGitHubToken();
  initGoogleAuth();
  loadAdminVideos();
  loadAdminDownloads();
  setupDragAndDrop();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminApp);
} else {
  initAdminApp();
}

// --- GOOGLE OAUTH 2.0 INTEGRATION ---
function getClientId() {
  return localStorage.getItem('giffu_google_client_id') || DEFAULT_CLIENT_ID;
}

function loadSavedClientId() {
  const saved = localStorage.getItem('giffu_google_client_id');
  if (saved) {
    document.getElementById('googleClientId').value = saved;
  }
}

function saveClientId() {
  const input = document.getElementById('googleClientId').value.trim();
  if (input) {
    localStorage.setItem('giffu_google_client_id', input);
    alert('Client ID salvo com sucesso! Agora você pode conectar sua conta.');
    initGoogleAuth();
  } else {
    alert('Por favor, informe um Client ID válido.');
  }
}

const ALLOWED_PRIMARY_EMAIL = 'dilangoficial@gmail.com';

function clearAuthStorage() {
  try {
    localStorage.removeItem('giffu_google_access_token');
    localStorage.removeItem('giffu_google_token_expires_at');
    localStorage.removeItem('giffu_google_user_email');
  } catch (e) {}
}

async function validateGoogleUser(token) {
  try {
    let userEmail = '';
    let userName = '';

    // 1. Consultar UserInfo do Google
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const info = await res.json();
        userEmail = (info.email || '').toLowerCase().trim();
        userName = info.name || userEmail;
      }
    } catch (e) {
      console.warn('Erro ao consultar userinfo do Google:', e);
    }

    // 2. Consultar dados do canal do YouTube (para contas de marca)
    let channelTitle = '';
    let channelCustomUrl = '';
    try {
      const ytRes = await fetch('https://www.googleapis.com/youtube/v3/channels?mine=true&part=snippet', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (ytRes.ok) {
        const ytData = await ytRes.json();
        if (ytData.items && ytData.items.length > 0) {
          const snippet = ytData.items[0].snippet;
          channelTitle = (snippet.title || '').toLowerCase();
          channelCustomUrl = (snippet.customUrl || '').toLowerCase();
          if (!userName) userName = snippet.title;
        }
      }
    } catch (e) {
      console.warn('Erro ao consultar canal do YouTube:', e);
    }

    // Regras de Autorização:
    // - E-mail principal dilangoficial@gmail.com
    // - E-mail de conta de marca do Google (*@pages.plusgoogle.com)
    // - Canal do YouTube vinculado à marca Dilan Giffú
    const isPrimary = userEmail === ALLOWED_PRIMARY_EMAIL;
    const isBrandEmail = userEmail.endsWith('@pages.plusgoogle.com');
    const isDilanChannel = channelCustomUrl.includes('dilangiffu') || channelCustomUrl.includes('giffu') || channelTitle.includes('dilan') || channelTitle.includes('giffú') || channelTitle.includes('giffu');

    const isAllowed = isPrimary || isBrandEmail || isDilanChannel;

    return {
      isAllowed,
      email: userEmail || channelTitle || 'Conta do Google',
      userName
    };
  } catch (e) {
    console.error('Erro na validação de permissões:', e);
    return { isAllowed: false, email: null, error: e };
  }
}

async function checkSavedSession() {
  try {
    const savedToken = localStorage.getItem('giffu_google_access_token');
    const expiresAt = parseInt(localStorage.getItem('giffu_google_token_expires_at') || '0', 10);
    const savedEmail = localStorage.getItem('giffu_google_user_email');
    
    if (savedToken && expiresAt && Date.now() < expiresAt) {
      accessToken = savedToken;
      const validation = await validateGoogleUser(savedToken);
      if (validation.isAllowed) {
        const displayEmail = validation.email || savedEmail || 'dilangoficial@gmail.com';
        updateAuthUI(true, `Conectado (${displayEmail})`);
        return true;
      } else {
        clearAuthStorage();
        accessToken = null;
        updateAuthUI(false, 'Acesso Negado');
        return false;
      }
    } else if (savedToken) {
      clearAuthStorage();
    }
  } catch (e) {
    console.warn('Erro ao verificar sessão salva:', e);
  }
  updateAuthUI(false, 'Não conectado');
  return false;
}

function initGoogleAuth() {
  const clientId = getClientId();
  if (!clientId || clientId === DEFAULT_CLIENT_ID) {
    updateAuthUI(false, 'Configurar Client ID');
    return;
  }

  // Restore saved session if valid
  checkSavedSession();

  if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.email openid profile',
      prompt: 'select_account',
      callback: async (tokenResponse) => {
        if (tokenResponse.access_token) {
          const tempToken = tokenResponse.access_token;
          updateAuthUI(false, 'Verificando permissões...');

          const validation = await validateGoogleUser(tempToken);

          if (validation.isAllowed) {
            accessToken = tempToken;
            const expiresInMs = (tokenResponse.expires_in || 3600) * 1000;
            const expiresAt = Date.now() + expiresInMs;
            const displayEmail = validation.email || 'dilangoficial@gmail.com';
            
            try {
              localStorage.setItem('giffu_google_access_token', accessToken);
              localStorage.setItem('giffu_google_token_expires_at', expiresAt.toString());
              localStorage.setItem('giffu_google_user_email', displayEmail);
            } catch (e) {}

            updateAuthUI(true, `Conectado (${displayEmail})`);
          } else {
            // Revogar e limpar se não for autorizado
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
              try { google.accounts.oauth2.revoke(tempToken, () => {}); } catch(e) {}
            }
            accessToken = null;
            clearAuthStorage();
            updateAuthUI(false, 'Acesso Negado');
            alert(`Acesso Negado!\n\nConta informada: ${validation.email || 'Desconhecida'}`);
          }
        } else {
          updateAuthUI(false, 'Falha ao conectar');
        }
      },
    });
  } else {
    setTimeout(() => {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2 && !tokenClient) {
        initGoogleAuth();
      }
    }, 1000);
  }
}

function disconnectGoogleAuth() {
  if (!confirm('Deseja desconectar sua conta do Google?')) return;

  if (accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
    try {
      google.accounts.oauth2.revoke(accessToken, () => {});
    } catch (e) {}
  }

  accessToken = null;
  clearAuthStorage();

  updateAuthUI(false, 'Não conectado');
  alert('Conta desconectada com sucesso.');
}

function handleAuthButtonClick() {
  if (accessToken) {
    disconnectGoogleAuth();
    return;
  }

  const clientId = getClientId();
  if (!clientId || clientId === DEFAULT_CLIENT_ID) {
    alert('Para conectar sua conta do Google, configure seu Google Client ID na aba "Configurar API Google".\n\nRedirecionando para a aba de configuração...');
    switchTab('config');
    const input = document.getElementById('googleClientId');
    if (input) input.focus();
    return;
  }

  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  } else {
    initGoogleAuth();
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } else {
      alert('Aguardando carregamento da biblioteca do Google ou verificação do Client ID. Por favor, tente novamente em instantes.');
    }
  }
}

function updateAuthUI(isConnected, text) {
  const dot = document.getElementById('authStatusDot');
  const txt = document.getElementById('authStatusText');
  const btn = document.getElementById('btnGoogleAuth');

  if (!btn) return;

  btn.onclick = handleAuthButtonClick;

  const uploadForm = document.getElementById('uploadForm');
  const uploadLock = document.getElementById('uploadLockNotice');
  const manageContent = document.getElementById('manageProtectedContent');
  const manageLock = document.getElementById('manageLockNotice');

  // Gerenciar Vídeos fica sempre acessível para reordenação e edição
  if (manageContent) manageContent.style.display = 'block';
  if (manageLock) manageLock.style.display = 'none';

  if (isConnected) {
    dot.classList.add('connected');
    txt.textContent = text || 'Conectado';
    btn.innerHTML = `<i class="fas fa-sign-out-alt"></i> Desconectar`;
    btn.style.background = '#dc2626';
    btn.style.color = '#fff';
    btn.title = 'Clique para desconectar sua conta';

    if (uploadForm) uploadForm.style.display = 'block';
    if (uploadLock) uploadLock.style.display = 'none';
  } else {
    dot.classList.remove('connected');
    txt.textContent = text || 'Não conectado';
    btn.innerHTML = `<i class="fab fa-google"></i> Conectar Conta`;
    btn.style.background = '#fff';
    btn.style.color = '#171717';
    btn.title = 'Clique para conectar sua conta do Google';

    if (uploadForm) uploadForm.style.display = 'none';
    if (uploadLock) uploadLock.style.display = 'block';
  }
}

// --- TAB SWITCHING ---
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(content => content.style.display = 'none');

  if (tabName === 'upload') {
    document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
    document.getElementById('tab-upload').style.display = 'block';
  } else if (tabName === 'manage') {
    document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
    document.getElementById('tab-manage').style.display = 'block';
    loadAdminVideos();
  } else if (tabName === 'downloads') {
    document.querySelector('.tab-btn:nth-child(3)').classList.add('active');
    document.getElementById('tab-downloads').style.display = 'block';
    loadAdminDownloads();
  } else if (tabName === 'config') {
    document.querySelector('.tab-btn:nth-child(4)').classList.add('active');
    document.getElementById('tab-config').style.display = 'block';
  }
}

// --- FILE SELECTION & DROPZONES ---
function setupDragAndDrop() {
  const videoDz = document.getElementById('videoDropzone');
  const thumbDz = document.getElementById('thumbDropzone');

  ['dragenter', 'dragover'].forEach(eventName => {
    videoDz.addEventListener(eventName, (e) => { e.preventDefault(); videoDz.classList.add('dragover'); });
    thumbDz.addEventListener(eventName, (e) => { e.preventDefault(); thumbDz.classList.add('dragover'); });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    videoDz.addEventListener(eventName, (e) => { e.preventDefault(); videoDz.classList.remove('dragover'); });
    thumbDz.addEventListener(eventName, (e) => { e.preventDefault(); thumbDz.classList.remove('dragover'); });
  });

  videoDz.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('video/')) {
      handleVideoFileSelect({ files: files });
    }
  });

  thumbDz.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleThumbFileSelect({ files: files });
    }
  });
}

function handleVideoFileSelect(input) {
  if (input.files && input.files[0]) {
    selectedVideoFile = input.files[0];
    document.getElementById('videoDropText').innerHTML = `
      <strong>Vídeo selecionado:</strong> ${escapeHtml(selectedVideoFile.name)} (${(selectedVideoFile.size / (1024 * 1024)).toFixed(1)} MB)
    `;

    // Auto-fill Title if empty
    const titleInput = document.getElementById('videoTitle');
    if (!titleInput.value) {
      const fileNameWithoutExt = selectedVideoFile.name.replace(/\.[^/.]+$/, "");
      titleInput.value = fileNameWithoutExt;
    }
  }
}

async function handleThumbFileSelect(input) {
  if (input.files && input.files[0]) {
    const rawFile = input.files[0];
    selectedThumbFile = await cropImageTo16x9Blob(rawFile);
    document.getElementById('thumbDropText').innerHTML = `
      <strong>Imagem ajustada (16:9 sem bordas):</strong> ${escapeHtml(selectedThumbFile.name)}
    `;

    const objectUrl = URL.createObjectURL(selectedThumbFile);
    const img = document.getElementById('thumbPreviewImg');
    img.src = objectUrl;
    document.getElementById('thumbPreviewBox').style.display = 'block';
  }
}


// --- YOUTUBE UPLOAD CONTROLLER ---
async function startVideoUpload() {
  const title = document.getElementById('videoTitle').value.trim();
  const subtitle = document.getElementById('videoSubtitle').value.trim();
  const page = document.getElementById('videoPage').value;
  const privacy = document.getElementById('videoPrivacy').value;
  const tagsStr = document.getElementById('videoTags').value.trim();
  const description = document.getElementById('videoDescription').value.trim();

  if (!selectedVideoFile) {
    alert('Por favor, selecione um arquivo de vídeo para fazer upload.');
    return;
  }
  if (!title || !subtitle) {
    alert('Por favor, preencha o Título e o Subtítulo/Créditos.');
    return;
  }

  // Check OAuth Token
  if (!accessToken) {
    alert('Por favor, conecte a conta autorizada (dilangoficial@gmail.com ou conta de marca) clicando em "Conectar Conta" no topo antes de enviar.');
    if (tokenClient) tokenClient.requestAccessToken({ prompt: 'select_account' });
    return;
  }

  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];
  const progressContainer = document.getElementById('progressContainer');
  const progressStatus = document.getElementById('progressStatus');
  const progressPercent = document.getElementById('progressPercent');
  const progressFill = document.getElementById('progressFill');

  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressStatus.textContent = 'Iniciando upload no YouTube...';

  try {
    // Step 1: Initiate Resumable Upload Session
    const metadata = {
      snippet: {
        title: title,
        description: description || `${title}\n\nCréditos: ${subtitle}\n\nPortfólio Giffú`,
        tags: tags,
        categoryId: '24' // Entertainment
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: false
      }
    };

    const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': selectedVideoFile.size,
        'X-Upload-Content-Type': selectedVideoFile.type
      },
      body: JSON.stringify(metadata)
    });

    if (!initRes.ok) {
      throw new Error(`Erro ao iniciar sessão no YouTube: ${initRes.statusText}`);
    }

    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('Servidor do YouTube não retornou URL de upload.');
    }

    // Step 2: Upload File with Progress Tracking
    progressStatus.textContent = 'Enviando arquivo de vídeo...';

    const uploadResult = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', selectedVideoFile.type);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          progressFill.style.width = `${percent}%`;
          progressPercent.textContent = `${percent}%`;
          progressStatus.textContent = `Enviando vídeo: ${(e.loaded / (1024 * 1024)).toFixed(1)} MB / ${(e.total / (1024 * 1024)).toFixed(1)} MB`;
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 201) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Falha no envio do vídeo: ${xhr.status} ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Erro de conexão durante o upload.'));
      xhr.send(selectedVideoFile);
    });

    const videoId = uploadResult.id;
    progressStatus.textContent = `Vídeo enviado com sucesso! (ID: ${videoId})`;

    // Step 3: Custom Thumbnail Upload (if selected)
    let thumbPath = `https://img.youtube.com/vi/${videoId}/hq720.jpg`;
    if (selectedThumbFile) {
      progressStatus.textContent = 'Enviando thumbnail customizada para o YouTube...';
      try {
        await uploadCustomThumbnail(videoId, selectedThumbFile);
        progressStatus.textContent = 'Thumbnail anexada ao YouTube com sucesso!';
      } catch (thumbErr) {
        console.warn('Erro na thumbnail no YouTube:', thumbErr);
      }
    }

    // Step 4: Register Video in Site Portfolio Database
    const newVideoObj = {
      id: videoId,
      title: title,
      subtitle: subtitle,
      thumb: thumbPath,
      page: page,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`
    };

    saveVideoToPortfolio(newVideoObj);

    progressStatus.textContent = 'Vídeo publicado no YouTube e adicionado ao site!';
    alert(`🎉 Sucesso! O vídeo "${title}" foi publicado no YouTube e já está disponível na página "${getPageLabel(page)}" do site!`);

    // Reset Form
    document.getElementById('uploadForm').reset();
    document.getElementById('thumbPreviewBox').style.display = 'none';
    document.getElementById('videoDropText').textContent = 'Arraste e solte seu arquivo de vídeo aqui ou clique para selecionar';
    document.getElementById('thumbDropText').textContent = 'Selecione uma imagem para a capa do vídeo (opcional)';
    selectedVideoFile = null;
    selectedThumbFile = null;

    // Switch to Manage tab
    switchTab('manage');

  } catch (err) {
    console.error('Upload Error:', err);
    progressStatus.textContent = `Erro: ${err.message}`;
    alert(`Erro no upload: ${err.message}`);
  }
}

function cropImageTo16x9Blob(file) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return resolve(file);
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const targetWidth = 1280;
      const targetHeight = 720;
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const sourceWidth = img.width;
      const sourceHeight = img.height;
      const targetAspect = 16 / 9;
      const sourceAspect = sourceWidth / sourceHeight;

      let drawWidth, drawHeight, offsetX, offsetY;

      if (sourceAspect > targetAspect) {
        // Image is wider than 16:9 -> crop left & right sides
        drawHeight = sourceHeight;
        drawWidth = sourceHeight * targetAspect;
        offsetX = (sourceWidth - drawWidth) / 2;
        offsetY = 0;
      } else {
        // Image is taller than 16:9 (4:3, 1:1, vertical 9:16) -> crop top & bottom
        drawWidth = sourceWidth;
        drawHeight = sourceWidth / targetAspect;
        offsetX = 0;
        offsetY = (sourceHeight - drawHeight) / 2;
      }

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight, 0, 0, targetWidth, targetHeight);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name || 'thumbnail.jpg', { type: 'image/jpeg' }));
        } else {
          resolve(file);
        }
      }, 'image/jpeg', 0.92);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

async function uploadCustomThumbnail(videoId, imageFile) {
  const croppedFile = await cropImageTo16x9Blob(imageFile);
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': croppedFile.type || 'image/jpeg'
    },
    body: croppedFile
  });
  return res.ok;
}


function parseVideoId(url) {
  if (!url || typeof url !== 'string') return '';
  url = url.trim();
  if (url.match(/^[a-zA-Z0-9_-]{11}$/)) return url;
  const matchV = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (matchV) return matchV[1];
  const matchShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (matchShort) return matchShort[1];
  const matchEmbed = url.match(/youtube\.com\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
  if (matchEmbed) return matchEmbed[1];
  return url;
}

// --- INDEXEDDB HELPER FOR HEAVY LOCAL MEDIA (TESTS / OFFLINE BLOBS) ---
const GiffuDB = {
  dbName: 'GiffuMediaDB',
  dbVersion: 1,
  storeName: 'media_blobs',

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async saveMedia(id, blobOrFile) {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const request = store.put(blobOrFile, id);
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('IndexedDB save media error:', err);
      return false;
    }
  },

  async getMedia(id) {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const request = store.get(id);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('IndexedDB get media error:', err);
      return null;
    }
  },

  async deleteMedia(id) {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('IndexedDB delete media error:', err);
      return false;
    }
  }
};

function sanitizeVideoObj(v) {
  const sanitized = { ...v };
  if (!sanitized.thumb || sanitized.thumb.startsWith('data:')) {
    sanitized.thumb = `https://img.youtube.com/vi/${sanitized.id}/hq720.jpg`;
  }
  return sanitized;
}

function cleanupLocalStorageVideos() {
  try {
    const raw = localStorage.getItem('giffu_videos');
    if (!raw) return [];
    let list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    let modified = false;
    list = list.map(v => {
      if (v.thumb && (v.thumb.startsWith('data:') || v.thumb.includes('maxresdefault.jpg'))) {
        modified = true;
        return {
          ...v,
          thumb: `https://img.youtube.com/vi/${v.id}/hq720.jpg`
        };
      }
      return v;
    });

    if (modified) {
      localStorage.setItem('giffu_videos', JSON.stringify(list));
      console.info('Limpeza de localStorage concluída: thumbnails base64/baixas atualizadas.');
    }
    return list;
  } catch (e) {
    console.warn('Erro ao limpar localStorage:', e);
    return [];
  }
}

async function persistVideosUniversally(videosList, singleVideoObj = null) {
  const cleanList = (videosList || window.adminVideosList || []).map(sanitizeVideoObj);
  
  // 1. Atualizar localStorage como cache de sessão
  try {
    localStorage.setItem('giffu_videos', JSON.stringify(cleanList));
  } catch(e) {}

  // 2. Gravar no servidor local (tenta rota relativa e localhost:5173 / 127.0.0.1:5173)
  const localEndpoints = [
    '/api/save-videos',
    'http://localhost:5173/api/save-videos',
    'http://127.0.0.1:5173/api/save-videos'
  ];

  for (const ep of localEndpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanList)
      });
      if (res.ok) {
        console.info(`✅ videos.json gravado com sucesso no disco via ${ep}`);
        break;
      }
    } catch(e) {}
  }

  // 3. Sincronizar com GitHub API se o token estiver configurado
  if (getGitHubToken()) {
    await syncPortfolioToGitHub(singleVideoObj, true);
  }
}

async function persistDownloadsUniversally(downloadsList) {
  const cleanList = downloadsList || adminDownloads || [];

  // 1. Atualizar localStorage como cache de sessão
  try {
    localStorage.setItem('giffu_downloads', JSON.stringify(cleanList));
  } catch(e) {}

  // 2. Gravar no servidor local (tenta rota relativa e localhost:5173 / 127.0.0.1:5173)
  const localEndpoints = [
    '/api/save-downloads',
    'http://localhost:5173/api/save-downloads',
    'http://127.0.0.1:5173/api/save-downloads'
  ];

  for (const ep of localEndpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanList)
      });
      if (res.ok) {
        console.info(`✅ downloads.json gravado com sucesso no disco via ${ep}`);
        break;
      }
    } catch(e) {}
  }

  // 3. Sincronizar com GitHub API se o token estiver configurado
  if (getGitHubToken()) {
    await syncDownloadsToGitHub(true);
  }
}

function saveVideoToPortfolio(videoObj) {
  const cleanObj = sanitizeVideoObj(videoObj);
  let list = window.adminVideosList || [];
  list = list.filter(v => v.id !== cleanObj.id);
  list.unshift(cleanObj);
  window.adminVideosList = list;
  persistVideosUniversally(list, cleanObj);
  filterManagedVideos();
}

// --- MODAL DE ADICIONAR VÍDEO DO YOUTUBE MANUALMENTE ---
function openAddManualVideoModal() {
  const modal = document.getElementById('addManualVideoModal');
  const form = document.getElementById('manualVideoForm');
  if (form) form.reset();
  const preview = document.getElementById('manualVideoThumbPreview');
  if (preview) preview.src = '';
  if (modal) modal.classList.add('active');
}

function closeAddManualVideoModal() {
  const modal = document.getElementById('addManualVideoModal');
  if (modal) modal.classList.remove('active');
}

function handleManualVideoUrlChange(input) {
  const val = input.value.trim();
  const vId = parseVideoId(val) || val;
  const customThumb = document.getElementById('manualVideoCustomThumbInput')?.value.trim();
  const preview = document.getElementById('manualVideoThumbPreview');
  if (preview) {
    if (customThumb) {
      preview.src = customThumb;
    } else if (vId && vId.length >= 6) {
      preview.src = `https://img.youtube.com/vi/${vId}/hq720.jpg`;
    }
  }
}

function handleManualCustomThumbChange(input) {
  const val = input.value.trim();
  const preview = document.getElementById('manualVideoThumbPreview');
  if (preview && val) {
    preview.src = val;
  } else {
    const urlInput = document.getElementById('manualVideoUrlInput');
    if (urlInput) handleManualVideoUrlChange(urlInput);
  }
}

async function saveManualVideo(e) {
  if (e) e.preventDefault();
  const urlVal = document.getElementById('manualVideoUrlInput').value.trim();
  const title = document.getElementById('manualVideoTitleInput').value.trim();
  const subtitle = document.getElementById('manualVideoSubtitleInput').value.trim();
  const page = document.getElementById('manualVideoPageSelect').value;
  const customThumb = document.getElementById('manualVideoCustomThumbInput')?.value.trim();

  const vId = parseVideoId(urlVal) || urlVal;
  if (!vId) {
    alert('Por favor, informe um Link ou ID válido do YouTube.');
    return;
  }
  if (!title || !subtitle) {
    alert('Por favor, preencha o Título e o Subtítulo.');
    return;
  }

  const thumbUrl = customThumb || `https://img.youtube.com/vi/${vId}/hq720.jpg`;

  const newVideoObj = {
    id: vId,
    title: title,
    subtitle: subtitle,
    thumb: thumbUrl,
    page: page,
    youtubeUrl: `https://www.youtube.com/watch?v=${vId}`
  };

  saveVideoToPortfolio(newVideoObj);
  closeAddManualVideoModal();
  alert(`🎉 Vídeo "${title}" adicionado com sucesso ao portfólio na página "${getPageLabel(page)}"!`);
}

// --- GITHUB ONLINE PORTFOLIO SYNC ---
function getGitHubToken() {
  return localStorage.getItem('giffu_github_token') || '';
}

function loadSavedGitHubToken() {
  const saved = getGitHubToken();
  const el = document.getElementById('githubToken');
  if (saved && el) {
    el.value = saved;
  }
}

function saveGitHubToken() {
  const input = document.getElementById('githubToken').value.trim();
  if (input) {
    localStorage.setItem('giffu_github_token', input);
    alert('GitHub Token salvo com sucesso! O painel agora sincronizará automaticamente todas as alterações com o site online giffu.com.br!');
  } else {
    localStorage.removeItem('giffu_github_token');
    alert('GitHub Token removido.');
  }
}

async function syncPortfolioToGitHub(singleVideoObj = null, silent = false) {
  let token = getGitHubToken();
  
  if (!token) {
    if (!silent) {
      const entered = prompt('Para sincronizar com o site online giffu.com.br e todos os dispositivos do mundo:\n\nCole o seu GitHub Personal Access Token (com escopo repo):');
      if (entered && entered.trim()) {
        localStorage.setItem('giffu_github_token', entered.trim());
        token = entered.trim();
        loadSavedGitHubToken();
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  const repoPath = 'dgffu/Giffu_';
  const filePath = 'videos.json';
  const apiUrl = `https://api.github.com/repos/${repoPath}/contents/${filePath}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!res.ok) {
      throw new Error(`Acesso negado ao repositório do GitHub (HTTP ${res.status}). Verifique o Token.`);
    }

    const fileData = await res.json();
    const sha = fileData.sha;

    let fullList = (window.adminVideosList || []).map(sanitizeVideoObj);
    if (singleVideoObj) {
      fullList = fullList.filter(v => v.id !== singleVideoObj.id);
      fullList.unshift(sanitizeVideoObj(singleVideoObj));
    }

    const jsonStr = JSON.stringify(fullList, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));

    const commitMsg = singleVideoObj 
      ? `feat(portfolio): atualizar vídeo "${singleVideoObj.title}"`
      : `feat(portfolio): atualizar lista e ordem do portfólio online`;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: commitMsg,
        content: base64Content,
        sha: sha
      })
    });

    if (putRes.ok) {
      if (!silent) {
        alert('🎉 Portfólio publicado online com sucesso! O site giffu.com.br foi atualizado e os vídeos estão sincronizados em todos os dispositivos.');
      } else {
        console.info('✅ Portfólio sincronizado automaticamente no GitHub.');
      }
      return true;
    } else {
      const errJson = await putRes.json();
      throw new Error(errJson.message || 'Falha ao atualizar no GitHub.');
    }

  } catch (err) {
    console.error('Erro na sincronização online via GitHub API:', err);
    if (!silent) {
      alert(`Erro ao sincronizar online: ${err.message}`);
    }
    return false;
  }
}

function downloadUpdatedVideosJson() {
  const fullList = (window.adminVideosList || []).map(sanitizeVideoObj);
  const jsonStr = JSON.stringify(fullList, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'videos.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copyPortfolioJson() {
  const fullList = (window.adminVideosList || []).map(sanitizeVideoObj);
  const jsonStr = JSON.stringify(fullList, null, 2);
  navigator.clipboard.writeText(jsonStr).then(() => {
    alert('Código JSON do portfólio copiado com sucesso para a área de transferência!');
  }).catch(() => {
    prompt('Copie o código JSON abaixo:', jsonStr);
  });
}

// --- VIDEO & THUMBNAIL EDITOR CONTROLLER ---
let editingVideoId = null;
let editingThumbFile = null;

function openVideoEditor(id) {
  const video = (window.adminVideosList || []).find(v => v.id === id);
  if (!video) return;

  editingVideoId = id;
  editingThumbFile = null;

  const titleEl = document.getElementById('videoEditTitleInput');
  const subtitleEl = document.getElementById('videoEditSubtitleInput');
  const pageEl = document.getElementById('videoEditPageSelect');
  const idEl = document.getElementById('thumbEditVideoId');

  if (titleEl) titleEl.value = video.title || '';
  if (subtitleEl) subtitleEl.value = video.subtitle || '';
  if (pageEl) pageEl.value = video.page || 'marcas';
  if (idEl) idEl.textContent = `ID do Vídeo: ${id}`;
  
  const currentThumb = getHighResThumb(video.thumb, id);
  const previewImg = document.getElementById('thumbEditPreviewImg');
  if (previewImg) previewImg.src = currentThumb;

  const fileInput = document.getElementById('thumbEditFileInput');
  if (fileInput) fileInput.value = '';

  const urlInput = document.getElementById('thumbEditUrlInput');
  if (urlInput) urlInput.value = (video.thumb && !video.thumb.includes('youtube.com/vi/')) ? video.thumb : '';

  const statusEl = document.getElementById('thumbEditStatus');
  if (statusEl) statusEl.style.display = 'none';

  const modal = document.getElementById('thumbEditModal');
  if (modal) modal.classList.add('active');
}

function openThumbEditor(id) {
  openVideoEditor(id);
}

function closeVideoEditor() {
  editingVideoId = null;
  editingThumbFile = null;
  const modal = document.getElementById('thumbEditModal');
  if (modal) modal.classList.remove('active');
}

function closeThumbEditor() {
  closeVideoEditor();
}

async function handleThumbEditFileSelect(input) {
  if (input.files && input.files[0]) {
    const rawFile = input.files[0];
    editingThumbFile = await cropImageTo16x9Blob(rawFile);
    const objectUrl = URL.createObjectURL(editingThumbFile);
    const previewImg = document.getElementById('thumbEditPreviewImg');
    if (previewImg) previewImg.src = objectUrl;
    const urlInput = document.getElementById('thumbEditUrlInput');
    if (urlInput) urlInput.value = '';
  }
}

function handleThumbEditUrlInput(input) {
  const val = input.value.trim();
  if (val) {
    editingThumbFile = null;
    const fileInput = document.getElementById('thumbEditFileInput');
    if (fileInput) fileInput.value = '';
    const previewImg = document.getElementById('thumbEditPreviewImg');
    if (previewImg) previewImg.src = val;
  }
}

function resetThumbToYouTubeDefault() {
  if (!editingVideoId) return;
  editingThumbFile = null;
  const fileInput = document.getElementById('thumbEditFileInput');
  if (fileInput) fileInput.value = '';
  const urlInput = document.getElementById('thumbEditUrlInput');
  if (urlInput) urlInput.value = '';
  const defaultUrl = `https://img.youtube.com/vi/${editingVideoId}/hq720.jpg`;
  const previewImg = document.getElementById('thumbEditPreviewImg');
  if (previewImg) previewImg.src = defaultUrl;
}

async function saveEditedVideo() {
  if (!editingVideoId) return;

  const newTitleInput = document.getElementById('videoEditTitleInput');
  const newSubtitleInput = document.getElementById('videoEditSubtitleInput');
  const newPageSelect = document.getElementById('videoEditPageSelect');

  const newTitle = newTitleInput ? newTitleInput.value.trim() : '';
  const newSubtitle = newSubtitleInput ? newSubtitleInput.value.trim() : '';
  const newPage = newPageSelect ? newPageSelect.value : 'marcas';

  if (!newTitle || !newSubtitle) {
    alert('Por favor, preencha o Título e o Subtítulo do vídeo.');
    return;
  }

  const statusEl = document.getElementById('thumbEditStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Salvando alterações...';
  }

  let newThumbUrl = document.getElementById('thumbEditPreviewImg')?.src || '';

  try {
    // 1. Send thumbnail to YouTube API if file is selected & OAuth connected
    if (editingThumbFile && accessToken) {
      if (statusEl) statusEl.textContent = 'Enviando thumbnail para o YouTube via API...';
      try {
        await uploadCustomThumbnail(editingVideoId, editingThumbFile);
        if (statusEl) statusEl.textContent = 'Thumbnail atualizada no YouTube com sucesso!';
      } catch (err) {
        console.warn('Não foi possível enviar para o YouTube API:', err);
      }
    }

    // 2. Handle image URL / file preview
    if (editingThumbFile) {
      await GiffuDB.saveMedia(`thumb_${editingVideoId}`, editingThumbFile);
      newThumbUrl = `https://img.youtube.com/vi/${editingVideoId}/hq720.jpg?t=${Date.now()}`;
    } else {
      const urlVal = document.getElementById('thumbEditUrlInput')?.value.trim();
      if (urlVal) {
        newThumbUrl = urlVal;
      }
    }

    // 3. Update in-memory video array directly
    if (!window.adminVideosList) window.adminVideosList = [];
    const videoIndex = window.adminVideosList.findIndex(v => v.id === editingVideoId);
    let updatedVideoObj = null;

    if (videoIndex !== -1) {
      window.adminVideosList[videoIndex].title = newTitle;
      window.adminVideosList[videoIndex].subtitle = newSubtitle;
      window.adminVideosList[videoIndex].page = newPage;
      window.adminVideosList[videoIndex].thumb = newThumbUrl;
      updatedVideoObj = window.adminVideosList[videoIndex];
    } else {
      updatedVideoObj = { 
        id: editingVideoId, 
        title: newTitle, 
        subtitle: newSubtitle, 
        page: newPage, 
        thumb: newThumbUrl,
        youtubeUrl: `https://www.youtube.com/watch?v=${editingVideoId}`
      };
      window.adminVideosList.unshift(updatedVideoObj);
    }

    if (statusEl) statusEl.textContent = 'Alterações salvas com sucesso!';

    // Persistência universal (Disco Local + GitHub API + LocalStorage)
    await persistVideosUniversally(window.adminVideosList, updatedVideoObj);
    filterManagedVideos();
    closeVideoEditor();

  } catch (err) {
    console.error('Erro ao salvar vídeo:', err);
    if (statusEl) statusEl.textContent = `Erro ao salvar: ${err.message}`;
  }
}

function saveEditedThumbnail() {
  saveEditedVideo();
}

// --- VIDEO MANAGEMENT LIST ---
const DEFAULT_PORTFOLIO_VIDEOS = [
  { "id": "4_D9v2UouJ8", "title": "Connected Innovation Center", "subtitle": "Lamídia, Accenture (2025)", "thumb": "source/thumbs/C0009.jpeg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=4_D9v2UouJ8" },
  { "id": "7ihaPVzhgJs", "title": "Leaders Academy", "subtitle": "Lamídia, S.I.N. Implant System (2025)", "thumb": "source/thumbs/C0000.jpg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=7ihaPVzhgJs" },
  { "id": "jKV0vrUENZs", "title": "PHZin na Tuzzy", "subtitle": "Lamídia, Tuzzy E-Sports (2025)", "thumb": "source/thumbs/C0001.jpeg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=jKV0vrUENZs" },
  { "id": "CUAhYbEv8YQ", "title": "Feedzai Fusion Brasil", "subtitle": "Jhou Alves, Feedzai (2025)", "thumb": "source/thumbs/C0010.jpeg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=CUAhYbEv8YQ" },
  { "id": "KQOwsIB8oyQ", "title": "MUB + Tardezinha", "subtitle": "Lamídia, EletroLab (2025)", "thumb": "source/thumbs/C0003.jpg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=KQOwsIB8oyQ" },
  { "id": "cHb1WKNsXQ8", "title": "Techops 2025", "subtitle": "Produtora Studio 32, Zurich (2025)", "thumb": "source/thumbs/C0011.jpeg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=cHb1WKNsXQ8" },
  { "id": "bc3rQenOo3s", "title": "GoldeN Krypto Fan Fest", "subtitle": "Lamídia, PremieRPet + Warner Bros. (2025)", "thumb": "source/thumbs/C0002.jpg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=bc3rQenOo3s" },
  { "id": "Y2Tq8arePZo", "title": "Seja AP Fortaleza", "subtitle": "W88 Audiovisual, Seja AP (2025)", "thumb": "source/thumbs/C0008.png", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=Y2Tq8arePZo" },
  { "id": "jpPGKWp2MtU", "title": "6º Congresso de Gestão em Saúde (CBIGS)", "subtitle": "Pericles Frazão, SBA (2025)", "thumb": "source/thumbs/C0006.jpeg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=jpPGKWp2MtU" },
  { "id": "TQ88EMZXT7U", "title": "Carta de Valores AVICZA", "subtitle": "Alves Veiga, AVICZA (2025)", "thumb": "source/thumbs/C0007.jpeg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=TQ88EMZXT7U" },
  { "id": "uQCYxcs5tg8", "title": "Showreel Dilan Giffú + Brandão", "subtitle": "Brandão Foto & Filmes (2021)", "thumb": "source/thumbs/C0005.jpg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=uQCYxcs5tg8" },
  { "id": "ZwFBS2I9k8c", "title": "Mil Folhas Campinas + Dani Bolina", "subtitle": "Suzan, Mil Folhas (2019)", "thumb": "source/thumbs/C0004.jpg", "page": "marcas", "youtubeUrl": "https://www.youtube.com/watch?v=ZwFBS2I9k8c" },
  { "id": "WI7Fr9Uu6LU", "title": "Chamada Mega Help", "subtitle": "Força Jovem Universal – Voluntário (2023)", "thumb": "source/thumbs/M0004.jpeg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=WI7Fr9Uu6LU" },
  { "id": "s38e7WF80qY", "title": "FJU Brasil (2026 Ident)", "subtitle": "Força Jovem Universal – Voluntário (2026)", "thumb": "source/thumbs/M0011.jpg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=s38e7WF80qY" },
  { "id": "3oOaSoravMY", "title": "Encontro Jovem FJU", "subtitle": "Força Jovem Universal – Voluntário (2023)", "thumb": "source/thumbs/M0000.jpeg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=3oOaSoravMY" },
  { "id": "DNIH-UJjA7E", "title": "Mês do Sagrado (Intro)", "subtitle": "Unipro Editora (2024)", "thumb": "source/thumbs/M0009.jpg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=DNIH-UJjA7E" },
  { "id": "5iTgehhbatA", "title": "Uma Carta de 1984 3D", "subtitle": "Força Jovem Universal – Voluntário (2024)", "thumb": "source/thumbs/M0006.jpeg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=5iTgehhbatA" },
  { "id": "N1Y9d4e9oSM", "title": "Aprendendo a Prospera (Intro)", "subtitle": "Unipro Editora (2024)", "thumb": "source/thumbs/M0010.jpg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=N1Y9d4e9oSM" },
  { "id": "S0sojg8ZSek", "title": "Cobrita", "subtitle": "Novel Original (2025)", "thumb": "source/thumbs/M0008.jpeg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=S0sojg8ZSek" },
  { "id": "oyudqwIdX54", "title": "Timeline Distrito do Anhembi", "subtitle": "Força Jovem Universal – Voluntário (2024)", "thumb": "source/thumbs/M0005.jpg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=oyudqwIdX54" },
  { "id": "78IpkKw_BqM", "title": "Israel Foto & Filmes Ident", "subtitle": "Novel Original (2025)", "thumb": "source/thumbs/M0003.jpg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=78IpkKw_BqM" },
  { "id": "NqtKmib9FGI", "title": "ASAS ERP Move", "subtitle": "Novel Original (2025)", "thumb": "source/thumbs/M0002.jpeg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=NqtKmib9FGI" },
  { "id": "HWxRqiz1a2s", "title": "MTC Logo", "subtitle": "Novel Original (2023)", "thumb": "source/thumbs/M0001.jpg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=HWxRqiz1a2s" },
  { "id": "kEEsa3Vn_Kk", "title": "PINE Ident", "subtitle": "Novel Original (2021)", "thumb": "source/thumbs/M0007.jpeg", "page": "motion", "youtubeUrl": "https://www.youtube.com/watch?v=kEEsa3Vn_Kk" },
  { "id": "90_Kk6-_1hc", "title": "Sara + Enock", "subtitle": "Israel Foto & Filmes, Same... Week Edit (2025)", "thumb": "source/thumbs/0010.jpg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=90_Kk6-_1hc" },
  { "id": "ZA4vYe1OSU4", "title": "Mayara + João", "subtitle": "Danilo Lobato Filmes, Same-Day Edit (2025)", "thumb": "source/thumbs/0017.png", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=ZA4vYe1OSU4" },
  { "id": "fKsPPKJPvQc", "title": "Duda + Gabriel", "subtitle": "Novel Original, Save The Date (2025)", "thumb": "source/thumbs/0001.jpeg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=fKsPPKJPvQc" },
  { "id": "5afYdW4DuL4", "title": "Mariana + Mateus", "subtitle": "Israel Foto & Filmes, Same-Day Edit (2025)", "thumb": "source/thumbs/0009.jpg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=5afYdW4DuL4" },
  { "id": "QMv8C126NhQ", "title": "Vanessa + Lucas", "subtitle": "Alves Veiga, Same-Day Edit (2025)", "thumb": "source/thumbs/0015.png", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=QMv8C126NhQ" },
  { "id": "WGQDH3Idb9M", "title": "Paloma + João", "subtitle": "Caravita Filmes, Save The Date (2025)", "thumb": "source/thumbs/0016.png", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=WGQDH3Idb9M" },
  { "id": "Zlj8SIv1b-k", "title": "Larissa + Fernando", "subtitle": "Israel Foto & Filmes, Same-Day Edit (2023)", "thumb": "source/thumbs/0013.jpg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=Zlj8SIv1b-k" },
  { "id": "Ug5jx1XnZak", "title": "Nicolly + Matheus", "subtitle": "Israel Foto & Filmes, Same Day Edit (2025)", "thumb": "source/thumbs/0011.jpg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=Ug5jx1XnZak" },
  { "id": "24PenPH8UaM", "title": "Alicia + Thiago", "subtitle": "Israel Foto & Filmes, Same-Day Edit (2023)", "thumb": "source/thumbs/0014.jpg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=24PenPH8UaM" },
  { "id": "Yf-o41Xvyn8", "title": "Brenda + Dalmo", "subtitle": "Novel, TSG & Emoções, Same-Day Edit (2021)", "thumb": "source/thumbs/0002.jpeg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=Yf-o41Xvyn8" },
  { "id": "XpVMAfHKmY0", "title": "Kaiene + Juscelino", "subtitle": "Brandão Foto & Filmes, Filme (2021)", "thumb": "source/thumbs/0012.jpeg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=XpVMAfHKmY0" },
  { "id": "VO_EETYBaJc", "title": "Mariana + Vinicius", "subtitle": "Alves Veiga, Pré-Wedding (2025)", "thumb": "source/thumbs/0008.jpg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=VO_EETYBaJc" },
  { "id": "nx2DH6eLW6I", "title": "Paula + Bruno", "subtitle": "Alves Veiga, Pré-Wedding (2025)", "thumb": "source/thumbs/0007.jpg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=nx2DH6eLW6I" },
  { "id": "8gU3dYty1MM", "title": "Ale + Allif", "subtitle": "Márcio Felix, Filme (2025)", "thumb": "source/thumbs/0006.jpg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=8gU3dYty1MM" },
  { "id": "bDiT41EtoYc", "title": "Fabi + Caíque", "subtitle": "Novel Original, Filme (2023)", "thumb": "source/thumbs/0004.jpeg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=bDiT41EtoYc" },
  { "id": "SMnXTYnoTL4", "title": "Júlia + Júnior (Aftercut)", "subtitle": "Suzan & Novel, Aftercut (2019)", "thumb": "source/thumbs/0005.jpeg", "page": "eventos", "youtubeUrl": "https://www.youtube.com/watch?v=SMnXTYnoTL4" }
];

function getDeletedVideoIds() {
  try {
    const raw = localStorage.getItem('giffu_deleted_video_ids');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function addDeletedVideoId(id) {
  const list = getDeletedVideoIds();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem('giffu_deleted_video_ids', JSON.stringify(list));
  }
}

async function loadAdminVideos() {
  const container = document.getElementById('adminVideoGrid');
  if (!container) return;

  let allVideos = [];

  // 1. Sempre carregar do videos.json oficial
  try {
    const res = await fetch(`videos.json?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const jsonVideos = await res.json();
      if (Array.isArray(jsonVideos) && jsonVideos.length > 0) {
        allVideos = jsonVideos;
        try {
          localStorage.setItem('giffu_videos', JSON.stringify(allVideos.map(sanitizeVideoObj)));
        } catch(e) {}
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar videos.json no admin:', e);
  }

  // 2. Fallback caso offline
  if (allVideos.length === 0) {
    try {
      const raw = localStorage.getItem('giffu_videos');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allVideos = parsed;
        }
      }
    } catch(e) {}
  }

  if (allVideos.length === 0) {
    allVideos = DEFAULT_PORTFOLIO_VIDEOS;
  }

  window.adminVideosList = allVideos;
  filterManagedVideos();
}

function getCurrentlyFilteredList() {
  const searchEl = document.getElementById('manageSearch');
  const categoryEl = document.getElementById('manageCategory');
  const search = searchEl ? searchEl.value.toLowerCase().trim() : '';
  const category = categoryEl ? categoryEl.value : 'all';

  let filtered = window.adminVideosList || [];
  if (category !== 'all') {
    filtered = filtered.filter(v => v.page === category);
  }
  if (search) {
    filtered = filtered.filter(v => 
      (v.title && v.title.toLowerCase().includes(search)) || 
      (v.subtitle && v.subtitle.toLowerCase().includes(search))
    );
  }
  return filtered;
}

function filterManagedVideos() {
  const filtered = getCurrentlyFilteredList();
  renderAdminVideoGrid(filtered);
}

// --- VIDEO REORDERING & DRAG-AND-DROP ---
let draggedVideoId = null;

function handleCardDragStart(e, id) {
  draggedVideoId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  const card = e.currentTarget;
  setTimeout(() => {
    if (card) card.classList.add('dragging');
  }, 0);
}

function handleCardDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleCardDragEnter(e) {
  e.preventDefault();
  const card = e.currentTarget;
  if (card && !card.classList.contains('dragging')) {
    card.classList.add('drag-over');
  }
}

function handleCardDragLeave(e) {
  const card = e.currentTarget;
  if (card) {
    card.classList.remove('drag-over');
  }
}

function handleCardDrop(e, targetId) {
  e.preventDefault();
  const card = e.currentTarget;
  if (card) card.classList.remove('drag-over');

  const sourceId = draggedVideoId || e.dataTransfer.getData('text/plain');
  if (!sourceId || sourceId === targetId) return;

  reorderVideos(sourceId, targetId);
}

function handleCardDragEnd(e) {
  draggedVideoId = null;
  document.querySelectorAll('.admin-video-card').forEach(c => {
    c.classList.remove('dragging', 'drag-over');
  });
}

function reorderVideos(sourceId, targetId) {
  if (!window.adminVideosList) return;
  const fromIndex = window.adminVideosList.findIndex(v => v.id === sourceId);
  const toIndex = window.adminVideosList.findIndex(v => v.id === targetId);

  if (fromIndex === -1 || toIndex === -1) return;

  const [movedItem] = window.adminVideosList.splice(fromIndex, 1);
  window.adminVideosList.splice(toIndex, 0, movedItem);

  saveReorderedList();
}

function moveVideoOrder(videoId, direction) {
  if (!window.adminVideosList) return;

  const filteredList = getCurrentlyFilteredList();
  const filteredIndex = filteredList.findIndex(v => v.id === videoId);
  if (filteredIndex === -1) return;

  const targetFilteredIndex = filteredIndex + direction;
  if (targetFilteredIndex < 0 || targetFilteredIndex >= filteredList.length) return;

  const targetVideo = filteredList[targetFilteredIndex];
  if (!targetVideo) return;

  reorderVideos(videoId, targetVideo.id);
}

function saveReorderedList() {
  const cleanList = (window.adminVideosList || []).map(sanitizeVideoObj);
  persistVideosUniversally(cleanList, null);
  filterManagedVideos();
}

window.handleCardDragStart = handleCardDragStart;
window.handleCardDragOver = handleCardDragOver;
window.handleCardDragEnter = handleCardDragEnter;
window.handleCardDragLeave = handleCardDragLeave;
window.handleCardDrop = handleCardDrop;
window.handleCardDragEnd = handleCardDragEnd;
window.moveVideoOrder = moveVideoOrder;

function renderAdminVideoGrid(videos) {
  const container = document.getElementById('adminVideoGrid');
  if (!container) return;

  if (videos.length === 0) {
    container.innerHTML = `<p style="grid-column: 1/-1; color: #888; text-align: center; padding: 40px;">Nenhum vídeo encontrado.</p>`;
    return;
  }

  container.innerHTML = videos.map((v, index) => {
    const thumbUrl = getHighResThumb(v.thumb, v.id);
    const isFirst = index === 0;
    const isLast = index === videos.length - 1;
    return `
      <div class="admin-video-card" 
           draggable="true" 
           data-video-id="${v.id}"
           ondragstart="handleCardDragStart(event, '${v.id}')"
           ondragover="handleCardDragOver(event)"
           ondragenter="handleCardDragEnter(event)"
           ondragleave="handleCardDragLeave(event)"
           ondrop="handleCardDrop(event, '${v.id}')"
           ondragend="handleCardDragEnd(event)">
        
        <div class="drag-handle-bar" title="Arraste para reposicionar">
          <div class="drag-handle-info">
            <i class="fas fa-grip-vertical"></i>
            <span>#${index + 1} &bull; ${getPageLabel(v.page)}</span>
          </div>
          <div class="reorder-btn-group">
            <button type="button" class="reorder-btn" onclick="event.stopPropagation(); moveVideoOrder('${v.id}', -1)" title="Mover para cima" ${isFirst ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
              <i class="fas fa-arrow-up"></i>
            </button>
            <button type="button" class="reorder-btn" onclick="event.stopPropagation(); moveVideoOrder('${v.id}', 1)" title="Mover para baixo" ${isLast ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
              <i class="fas fa-arrow-down"></i>
            </button>
          </div>
        </div>

        <div class="admin-video-thumb">
          <img src="${thumbUrl}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="handleThumbError(this, '${v.id}')">
          <span class="order-badge">#${index + 1}</span>
          <span class="page-badge">${getPageLabel(v.page)}</span>
        </div>
        
        <div class="admin-video-content">
          <div>
            <h4>${escapeHtml(v.title)}</h4>
            <p>${escapeHtml(v.subtitle)}</p>
          </div>
          <div class="admin-video-actions">
            <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" class="btn-secondary" style="font-size:12px; padding:6px 10px;">
              <i class="fab fa-youtube"></i> Ver
            </a>
            <button type="button" class="btn-secondary" style="font-size:12px; padding:6px 10px;" onclick="openVideoEditor('${v.id}')" title="Editar Título, Subtítulo, Página e Capa">
              <i class="fas fa-edit"></i> Editar
            </button>
            <button type="button" class="btn-secondary" style="font-size:12px; padding:6px 10px;" onclick="copyCardHtml('${v.id}')" title="Copiar HTML">
              <i class="fas fa-code"></i> HTML
            </button>
            <button type="button" class="btn-danger" onclick="deletePortfolioVideo('${v.id}')" title="Excluir">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function getPageLabel(page) {
  if (page === 'marcas') return 'Para Marcas';
  if (page === 'motion') return 'Motion Design';
  if (page === 'eventos') return 'Edição de Eventos';
  return page;
}

function copyCardHtml(id) {
  const video = (window.adminVideosList || []).find(v => v.id === id);
  if (!video) return;

  const htmlSnippet = `      <a class="video-card" href="https://www.youtube.com/watch?v=${video.id}" target="_blank">
        <img src="${video.thumb}" alt="Thumb">
        <div class="video-info">
        <h3 class="video-title">${video.title}</h3>
        <p class="video-subtitle">${video.subtitle}</p>
        </div>
      </a>`;

  navigator.clipboard.writeText(htmlSnippet).then(() => {
    alert(`HTML do card copiado para a área de transferência:\n\n${htmlSnippet}`);
  }).catch(() => {
    prompt('Copie o código HTML abaixo:', htmlSnippet);
  });
}

function deletePortfolioVideo(id) {
  const video = (window.adminVideosList || []).find(v => v.id === id);
  const title = video ? video.title : 'este vídeo';
  if (!confirm(`Deseja realmente remover "${title}" do portfólio?`)) return;

  // 1. Registrar na lista de IDs excluídos
  addDeletedVideoId(id);

  // 2. Atualizar memória e lista
  let stored = [];
  try {
    const raw = localStorage.getItem('giffu_videos');
    if (raw) stored = JSON.parse(raw);
  } catch (e) {}

  stored = stored.filter(v => v.id !== id);
  if (window.adminVideosList) {
    window.adminVideosList = window.adminVideosList.filter(v => v.id !== id);
  }

  // 3. Persistência Universal
  persistVideosUniversally(stored, null);
  filterManagedVideos();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

function getHighResThumb(thumb, videoId) {
  if (!thumb) {
    return videoId ? `https://img.youtube.com/vi/${videoId}/hq720.jpg` : '';
  }
  if (thumb.includes('youtube.com/vi/')) {
    const match = thumb.match(/\/vi\/([^\/]+)/);
    const vId = match ? match[1] : videoId;
    if (vId) return `https://img.youtube.com/vi/${vId}/hq720.jpg`;
  }
  return thumb;
}

if (typeof window.handleThumbError === 'undefined') {
  window.handleThumbError = function(img, videoId) {
    if (!img) return;
    const step = parseInt(img.dataset.fallbackStep || '0', 10);
    if (step === 0 && videoId) {
      img.dataset.fallbackStep = '1';
      img.src = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
    } else if (step === 1 && videoId) {
      img.dataset.fallbackStep = '2';
      img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    } else if (step === 2 && videoId) {
      img.dataset.fallbackStep = '3';
      img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
  };
}

// ==========================================================================
// GERENCIADOR DE DOWNLOADS (BIBLIOTECA DO EDITOR) NO PAINEL ADMIN
// ==========================================================================

let adminDownloads = [];
let adminDownloadsFilter = 'all';

function getDeletedDownloadIds() {
  try {
    const raw = localStorage.getItem('giffu_deleted_download_ids');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function addDeletedDownloadId(id) {
  const list = getDeletedDownloadIds();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem('giffu_deleted_download_ids', JSON.stringify(list));
  }
}

async function loadAdminDownloads() {
  const container = document.getElementById('adminDownloadsGrid');
  if (!container) return;

  // 1. Sempre carregar do downloads.json oficial
  try {
    const res = await fetch(`downloads.json?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json)) {
        adminDownloads = json;
        try {
          localStorage.setItem('giffu_downloads', JSON.stringify(adminDownloads));
        } catch(e) {}
        renderAdminDownloadsGrid();
        return;
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar downloads.json no admin:', e);
  }

  // 2. Fallback caso offline
  try {
    const raw = localStorage.getItem('giffu_downloads');
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        adminDownloads = parsed;
      }
    }
  } catch (e) {}

  renderAdminDownloadsGrid();
}

function filterAdminDownloads(category, btnElem) {
  adminDownloadsFilter = category;
  document.querySelectorAll('#tab-downloads .lib-filter-btn').forEach(b => b.classList.remove('active'));
  if (btnElem) btnElem.classList.add('active');
  renderAdminDownloadsGrid();
}

function renderAdminDownloadsGrid() {
  const container = document.getElementById('adminDownloadsGrid');
  if (!container) return;
  container.innerHTML = '';

  const filtered = adminDownloads.filter((item) => {
    if (adminDownloadsFilter === 'all') return true;
    return item.category === adminDownloadsFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: var(--text-secondary);">
        <i class="fas fa-box-open" style="font-size: 36px; color: #FE5E00; margin-bottom: 12px; display: block;"></i>
        <h4 style="color: var(--text-primary); font-size: 16px; margin-bottom: 6px;">Nenhum recurso nesta categoria</h4>
        <p style="font-size: 13px;">Clique em <strong>"Novo Recurso"</strong> para cadastrar novos arquivos.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((item) => {
    const globalIndex = adminDownloads.findIndex(d => d.id === item.id);
    const card = document.createElement('div');
    card.className = 'admin-download-card';
    card.setAttribute('draggable', 'true');
    card.dataset.index = globalIndex;
    card.dataset.id = item.id;

    const iconClass = item.icon || 'fas fa-download';
    const categoryLabels = {
      'premiere-templates': 'Premiere Pro Templates',
      'ae-templates': 'After Effects Templates',
      'premiere-tools': 'Premiere Pro Tools',
      'ae-tools': 'After Effects Tools',
      'music': 'Royalty Free Music',
      'sfx': 'Sound Effects',
      'apps': 'Apps & Ferramentas',
      // Aliases para compatibilidade com versões anteriores
      'presets': 'Premiere Pro Templates',
      'luts': 'Premiere Pro Tools',
      'scripts': 'After Effects Tools',
      'workspace': 'Apps & Ferramentas'
    };
    const catLabel = categoryLabels[item.category] || item.category || 'Recurso';

    card.innerHTML = `
      <!-- Alça de arrastar e Botões de Reordenação -->
      <div class="drag-handle-bar">
        <div class="drag-handle-info">
          <i class="fas fa-grip-vertical"></i>
          <span>#${globalIndex + 1}</span>
        </div>
        <div class="reorder-btn-group">
          <button type="button" class="reorder-btn" title="Mover para Cima" onclick="moveDownloadResource(${globalIndex}, -1)">
            <i class="fas fa-arrow-up"></i>
          </button>
          <button type="button" class="reorder-btn" title="Mover para Baixo" onclick="moveDownloadResource(${globalIndex}, 1)">
            <i class="fas fa-arrow-down"></i>
          </button>
        </div>
      </div>

      <div class="admin-download-header">
        <span class="order-badge">#${globalIndex + 1}</span>
        <span class="page-badge">${escapeHtml(item.badgeText || 'Recurso')}</span>
        <div class="admin-download-icon-wrap">
          <i class="${escapeHtml(iconClass)}"></i>
        </div>
      </div>

      <div class="admin-download-content">
        <div>
          <span style="font-size: 11px; text-transform: uppercase; color: #FE5E00; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">
            ${escapeHtml(catLabel)} · ${escapeHtml(item.software || 'Universal')}
          </span>
          <h4>${escapeHtml(item.title)}</h4>
          <p class="admin-download-desc">${escapeHtml(item.description || '')}</p>
          
          <div class="admin-download-meta">
            ${item.format ? `<span><i class="fas fa-file-code"></i> ${escapeHtml(item.format)}</span>` : ''}
            ${item.fileSize ? `<span><i class="fas fa-hdd"></i> ${escapeHtml(item.fileSize)}</span>` : ''}
            ${item.compatibility ? `<span><i class="fas fa-check-circle"></i> ${escapeHtml(item.compatibility)}</span>` : ''}
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 12px; margin-top: 4px; gap: 8px;">
          <div style="font-size: 11.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">
            ${item.downloadUrl && item.downloadUrl !== '#' && item.downloadUrl !== 'https://github.com/dgffu/Giffu_' ? '<i class="fas fa-link" style="color:#2ecc71;"></i> Link Ativo' : '<i class="fas fa-unlink" style="color:#aaa;"></i> Link Padrão'}
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-secondary" style="font-size: 12px; padding: 5px 10px;" onclick="openDownloadModal('${escapeHtml(item.id)}')">
              <i class="fas fa-edit"></i> Editar
            </button>
            <button type="button" class="btn-secondary" style="font-size: 12px; padding: 5px 8px; color: #ff5252; border-color: rgba(255, 82, 82, 0.3);" onclick="deleteDownloadResource('${escapeHtml(item.id)}')">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  setupDownloadDragAndDrop();
}

function openDownloadModal(idOrNew) {
  const modal = document.getElementById('downloadEditModal');
  const heading = document.getElementById('downloadModalHeading');
  if (!modal) return;

  if (idOrNew === 'new') {
    heading.textContent = 'Novo Recurso para Download';
    document.getElementById('downloadIdInput').value = `down-${Date.now()}`;
    document.getElementById('downloadTitleInput').value = '';
    document.getElementById('downloadCategorySelect').value = 'premiere-templates';
    document.getElementById('downloadSoftwareInput').value = 'Premiere Pro';
    document.getElementById('downloadBadgeInput').value = 'MOGRT';
    document.getElementById('downloadIconSelect').value = 'fas fa-bolt';
    document.getElementById('downloadDescInput').value = '';
    document.getElementById('downloadFormatInput').value = '.mogrt';
    document.getElementById('downloadSizeInput').value = '10 MB';
    document.getElementById('downloadCompatInput').value = 'Premiere 2022+';
    document.getElementById('downloadDetailsDescInput').value = '';
    document.getElementById('downloadFileNameInput').value = '';
    document.getElementById('downloadUrlInput').value = '';
  } else {
    const item = adminDownloads.find(d => d.id === idOrNew);
    if (!item) return;

    heading.textContent = 'Editar Recurso de Download';
    document.getElementById('downloadIdInput').value = item.id;
    document.getElementById('downloadTitleInput').value = item.title || '';
    document.getElementById('downloadCategorySelect').value = item.category || 'premiere-templates';
    document.getElementById('downloadSoftwareInput').value = item.software || '';
    document.getElementById('downloadBadgeInput').value = item.badgeText || '';
    document.getElementById('downloadIconSelect').value = item.icon || 'fas fa-bolt';
    document.getElementById('downloadDescInput').value = item.description || '';
    document.getElementById('downloadFormatInput').value = item.format || '';
    document.getElementById('downloadSizeInput').value = item.fileSize || '';
    document.getElementById('downloadCompatInput').value = item.compatibility || '';
    document.getElementById('downloadDetailsDescInput').value = item.detailsDesc || '';
    document.getElementById('downloadFileNameInput').value = item.fileName || '';
    document.getElementById('downloadUrlInput').value = (item.downloadUrl && item.downloadUrl !== '#') ? item.downloadUrl : '';
  }

  // Atualizar badge de link direto
  handleDriveLinkInput(document.getElementById('downloadUrlInput'));

  modal.classList.add('active');
}

function closeDownloadModal() {
  const modal = document.getElementById('downloadEditModal');
  if (modal) modal.classList.remove('active');
}

// Conversor inteligente de links do Google Drive para Download Direto (Clicou, Baixou)
function convertToDirectGoogleDriveLink(url) {
  if (!url || typeof url !== 'string') return url;
  url = url.trim();

  // Verifica se é link do Google Drive
  if (!url.includes('drive.google.com')) return url;

  let fileId = null;

  // Formato 1: drive.google.com/file/d/FILE_ID/view... ou /edit... ou /preview...
  const matchFileD = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileD) {
    fileId = matchFileD[1];
  }

  // Formato 2: drive.google.com/open?id=FILE_ID ou ?id=FILE_ID ou &id=FILE_ID
  if (!fileId) {
    const matchIdParam = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchIdParam) {
      fileId = matchIdParam[1];
    }
  }

  // Formato 3: drive.google.com/uc?id=FILE_ID
  if (!fileId) {
    const matchUc = url.match(/\/uc\?.*id=([a-zA-Z0-9_-]+)/);
    if (matchUc) {
      fileId = matchUc[1];
    }
  }

  // Formato 4: drive.google.com/d/FILE_ID
  if (!fileId) {
    const matchD = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD) {
      fileId = matchD[1];
    }
  }

  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  return url;
}

function handleDriveLinkInput(inputElem) {
  if (!inputElem) return;
  const original = inputElem.value.trim();
  const converted = convertToDirectGoogleDriveLink(original);
  const statusBadge = document.getElementById('driveDirectStatus');

  if (converted && converted.includes('drive.google.com/uc?export=download&id=')) {
    if (original !== converted) {
      inputElem.value = converted;
    }
    if (statusBadge) statusBadge.style.display = 'inline-block';
  } else {
    if (statusBadge) statusBadge.style.display = 'none';
  }
}

function saveDownloadResource(e) {
  if (e) e.preventDefault();

  const id = document.getElementById('downloadIdInput').value;
  const title = document.getElementById('downloadTitleInput').value.trim();
  const category = document.getElementById('downloadCategorySelect').value;
  const software = document.getElementById('downloadSoftwareInput').value.trim();
  const badgeText = document.getElementById('downloadBadgeInput').value.trim() || 'Recurso';
  const icon = document.getElementById('downloadIconSelect').value;
  const description = document.getElementById('downloadDescInput').value.trim();
  const format = document.getElementById('downloadFormatInput').value.trim();
  const fileSize = document.getElementById('downloadSizeInput').value.trim();
  const compatibility = document.getElementById('downloadCompatInput').value.trim();
  const detailsDesc = document.getElementById('downloadDetailsDescInput').value.trim() || description;
  const fileName = document.getElementById('downloadFileNameInput').value.trim() || `${title.replace(/\s+/g, '-')}.zip`;
  
  let rawUrl = document.getElementById('downloadUrlInput').value.trim();
  let downloadUrl = 'https://github.com/dgffu/Giffu_';
  if (rawUrl) {
    downloadUrl = convertToDirectGoogleDriveLink(rawUrl);
  }

  if (!title || !description) {
    alert('Por favor, preencha pelo menos o título e a descrição do recurso.');
    return;
  }

  const newObj = {
    id: id || `down-${Date.now()}`,
    title,
    category,
    software,
    badgeText,
    icon,
    description,
    format,
    fileSize,
    compatibility,
    detailsDesc,
    fileName,
    downloadUrl
  };

  const existingIdx = adminDownloads.findIndex(d => d.id === id);
  if (existingIdx !== -1) {
    adminDownloads[existingIdx] = newObj;
  } else {
    adminDownloads.unshift(newObj);
  }

  persistDownloadsUniversally(adminDownloads);
  closeDownloadModal();
  renderAdminDownloadsGrid();
  alert('Recurso salvo com sucesso!');
}

function deleteDownloadResource(id) {
  const item = adminDownloads.find(d => d.id === id);
  const title = item ? item.title : 'este item';
  if (!confirm(`Deseja realmente excluir "${title}" da Biblioteca de Downloads?`)) {
    return;
  }

  addDeletedDownloadId(id);
  adminDownloads = adminDownloads.filter(d => d.id !== id);
  persistDownloadsUniversally(adminDownloads);
  renderAdminDownloadsGrid();
}

function moveDownloadResource(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= adminDownloads.length) return;

  const temp = adminDownloads[index];
  adminDownloads[index] = adminDownloads[targetIndex];
  adminDownloads[targetIndex] = temp;

  persistDownloadsUniversally(adminDownloads);
  renderAdminDownloadsGrid();
}

function setupDownloadDragAndDrop() {
  const cards = document.querySelectorAll('#adminDownloadsGrid .admin-download-card');
  let draggedCard = null;

  cards.forEach(card => {
    card.addEventListener('dragstart', function(e) {
      draggedCard = this;
      this.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this.dataset.index);
    });

    card.addEventListener('dragend', function() {
      this.classList.remove('dragging');
      cards.forEach(c => c.classList.remove('drag-over'));
      draggedCard = null;
    });

    card.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (this !== draggedCard) {
        this.classList.add('drag-over');
      }
    });

    card.addEventListener('dragleave', function() {
      this.classList.remove('drag-over');
    });

    card.addEventListener('drop', function(e) {
      e.preventDefault();
      this.classList.remove('drag-over');
      if (!draggedCard || draggedCard === this) return;

      const fromIndex = parseInt(draggedCard.dataset.index, 10);
      const toIndex = parseInt(this.dataset.index, 10);

      if (isNaN(fromIndex) || isNaN(toIndex) || fromIndex === toIndex) return;

      const itemToMove = adminDownloads.splice(fromIndex, 1)[0];
      adminDownloads.splice(toIndex, 0, itemToMove);

      persistDownloadsUniversally(adminDownloads);
      renderAdminDownloadsGrid();
    });
  });
}

async function resetDefaultDownloads() {
  if (!confirm('Deseja restaurar a lista padrão de recursos da Biblioteca do Editor?')) {
    return;
  }

  try {
    localStorage.removeItem('giffu_deleted_download_ids');
    const res = await fetch('downloads.json');
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json)) {
        adminDownloads = json;
        localStorage.setItem('giffu_downloads', JSON.stringify(adminDownloads));
        localStorage.setItem('giffu_downloads_initialized', 'true');
        renderAdminDownloadsGrid();
        alert('Recursos restaurados para os padrões com sucesso!');
      }
    }
  } catch (e) {
    alert('Erro ao carregar dados padrão.');
  }
}

// --- DOWNLOADS SYNC & EXPORT TOOLS ---
async function syncDownloadsToGitHub(silent = false) {
  let token = getGitHubToken();
  if (!token) {
    if (!silent) {
      const entered = prompt('Para sincronizar os Downloads com o site online giffu.com.br e todos os dispositivos do mundo:\n\nCole o seu GitHub Personal Access Token (com escopo repo):');
      if (entered && entered.trim()) {
        localStorage.setItem('giffu_github_token', entered.trim());
        token = entered.trim();
        loadSavedGitHubToken();
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  const repoPath = 'dgffu/Giffu_';
  const filePath = 'downloads.json';
  const apiUrl = `https://api.github.com/repos/${repoPath}/contents/${filePath}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let sha = '';
    if (res.ok) {
      const fileData = await res.json();
      sha = fileData.sha;
    }

    const fullList = adminDownloads || [];
    const jsonStr = JSON.stringify(fullList, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));

    const bodyPayload = {
      message: 'feat(downloads): atualizar lista de downloads online',
      content: base64Content
    };
    if (sha) bodyPayload.sha = sha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (putRes.ok) {
      if (!silent) {
        alert('🎉 Downloads publicados online com sucesso no GitHub! Todos os dispositivos estão sincronizados.');
      } else {
        console.info('✅ Downloads sincronizados automaticamente com o GitHub.');
      }
      return true;
    } else {
      const errJson = await putRes.json();
      throw new Error(errJson.message || 'Falha ao atualizar no GitHub.');
    }
  } catch (err) {
    console.error('Erro na sincronização de downloads via GitHub API:', err);
    if (!silent) {
      alert(`Erro ao sincronizar downloads online: ${err.message}`);
    }
    return false;
  }
}

function downloadUpdatedDownloadsJson() {
  const jsonStr = JSON.stringify(adminDownloads || [], null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'downloads.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copyDownloadsJson() {
  const jsonStr = JSON.stringify(adminDownloads || [], null, 2);
  navigator.clipboard.writeText(jsonStr).then(() => {
    alert('Código JSON dos downloads copiado com sucesso para a área de transferência!');
  }).catch(() => {
    prompt('Copie o código JSON abaixo:', jsonStr);
  });
}

