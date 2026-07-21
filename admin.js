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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  cleanupLocalStorageVideos();
  loadSavedClientId();
  loadSavedGitHubToken();
  initGoogleAuth();
  loadAdminVideos();
  setupDragAndDrop();
});

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
  } else {
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } else {
      initGoogleAuth();
      if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } else {
        alert('Carregando biblioteca do Google. Por favor, tente novamente em alguns segundos.');
      }
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

  if (isConnected) {
    dot.classList.add('connected');
    txt.textContent = text || 'Conectado';
    btn.innerHTML = `<i class="fas fa-sign-out-alt"></i> Desconectar`;
    btn.style.background = '#dc2626';
    btn.style.color = '#fff';
    btn.title = 'Clique para desconectar sua conta';

    if (uploadForm) uploadForm.style.display = 'block';
    if (uploadLock) uploadLock.style.display = 'none';
    if (manageContent) manageContent.style.display = 'block';
    if (manageLock) manageLock.style.display = 'none';
  } else {
    dot.classList.remove('connected');
    txt.textContent = text || 'Não conectado';
    btn.innerHTML = `<i class="fab fa-google"></i> Conectar Conta`;
    btn.style.background = '#fff';
    btn.style.color = '#171717';
    btn.title = 'Clique para conectar sua conta do Google';

    if (uploadForm) uploadForm.style.display = 'none';
    if (uploadLock) uploadLock.style.display = 'block';
    if (manageContent) manageContent.style.display = 'none';
    if (manageLock) manageLock.style.display = 'block';
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
  } else if (tabName === 'config') {
    document.querySelector('.tab-btn:nth-child(3)').classList.add('active');
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

function handleThumbFileSelect(input) {
  if (input.files && input.files[0]) {
    selectedThumbFile = input.files[0];
    document.getElementById('thumbDropText').innerHTML = `
      <strong>Imagem selecionada:</strong> ${escapeHtml(selectedThumbFile.name)}
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

async function uploadCustomThumbnail(videoId, imageFile) {
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': imageFile.type
    },
    body: imageFile
  });
  return res.ok;
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

function saveVideoToPortfolio(videoObj) {
  let stored = cleanupLocalStorageVideos();
  const cleanObj = sanitizeVideoObj(videoObj);

  // Avoid duplicates
  stored = stored.filter(v => v.id !== cleanObj.id);
  stored.unshift(cleanObj); // prepend new video

  try {
    localStorage.setItem('giffu_videos', JSON.stringify(stored));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      console.error('QuotaExceededError ao salvar no localStorage. Tentando minificar dados...');
      const minified = stored.map(v => ({
        id: v.id,
        title: v.title,
        subtitle: v.subtitle,
        thumb: `https://img.youtube.com/vi/${v.id}/hq720.jpg`,
        page: v.page,
        youtubeUrl: v.youtubeUrl || `https://www.youtube.com/watch?v=${v.id}`
      }));
      try {
        localStorage.setItem('giffu_videos', JSON.stringify(minified));
      } catch (err2) {
        alert('Atenção: O limite de armazenamento do localStorage foi excedido. Vídeo mantido nesta sessão.');
      }
    } else {
      console.error('Erro ao salvar no localStorage:', e);
    }
  }

  // Attempt automatic online sync if GitHub token configured
  if (getGitHubToken()) {
    syncPortfolioToGitHub(cleanObj);
  }
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

async function syncPortfolioToGitHub(singleVideoObj = null) {
  const token = getGitHubToken();
  
  if (!token) {
    alert('Para sincronizar com o site online giffu.com.br automaticamente sem usar o terminal:\n\nCole o seu GitHub Personal Access Token na aba "Configurar API Google"!');
    return false;
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
      ? `feat(portfolio): adicionar vídeo "${singleVideoObj.title}"`
      : `feat(portfolio): atualizar lista do portfólio online`;

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
      alert('🎉 Portfólio publicado online com sucesso! O site giffu.com.br foi atualizado e os vídeos estão visíveis em todos os dispositivos.');
      return true;
    } else {
      const errJson = await putRes.json();
      throw new Error(errJson.message || 'Falha ao atualizar no GitHub.');
    }

  } catch (err) {
    console.error('Erro na sincronização online via GitHub API:', err);
    alert(`Erro ao sincronizar online: ${err.message}`);
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

// --- THUMBNAIL EDITOR CONTROLLER ---
let editingVideoId = null;
let editingThumbFile = null;

function openThumbEditor(id) {
  const video = (window.adminVideosList || []).find(v => v.id === id);
  if (!video) return;

  editingVideoId = id;
  editingThumbFile = null;

  document.getElementById('thumbEditVideoTitle').textContent = video.title || 'Sem título';
  document.getElementById('thumbEditVideoId').textContent = `ID do Vídeo: ${id}`;
  
  const currentThumb = getHighResThumb(video.thumb, id);
  document.getElementById('thumbEditPreviewImg').src = currentThumb;
  document.getElementById('thumbEditFileInput').value = '';
  document.getElementById('thumbEditUrlInput').value = (video.thumb && !video.thumb.includes('youtube.com/vi/')) ? video.thumb : '';
  document.getElementById('thumbEditStatus').style.display = 'none';

  document.getElementById('thumbEditModal').classList.add('active');
}

function closeThumbEditor() {
  editingVideoId = null;
  editingThumbFile = null;
  document.getElementById('thumbEditModal').classList.remove('active');
}

function handleThumbEditFileSelect(input) {
  if (input.files && input.files[0]) {
    editingThumbFile = input.files[0];
    const objectUrl = URL.createObjectURL(editingThumbFile);
    document.getElementById('thumbEditPreviewImg').src = objectUrl;
    document.getElementById('thumbEditUrlInput').value = '';
  }
}

function handleThumbEditUrlInput(input) {
  const val = input.value.trim();
  if (val) {
    editingThumbFile = null;
    document.getElementById('thumbEditFileInput').value = '';
    document.getElementById('thumbEditPreviewImg').src = val;
  }
}

function resetThumbToYouTubeDefault() {
  if (!editingVideoId) return;
  editingThumbFile = null;
  document.getElementById('thumbEditFileInput').value = '';
  document.getElementById('thumbEditUrlInput').value = '';
  const defaultUrl = `https://img.youtube.com/vi/${editingVideoId}/hq720.jpg`;
  document.getElementById('thumbEditPreviewImg').src = defaultUrl;
}

async function saveEditedThumbnail() {
  if (!editingVideoId) return;

  const statusEl = document.getElementById('thumbEditStatus');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Salvando thumbnail...';

  let newThumbUrl = document.getElementById('thumbEditPreviewImg').src;

  try {
    // 1. Send thumbnail to YouTube API if file is selected & OAuth connected
    if (editingThumbFile && accessToken) {
      statusEl.textContent = 'Enviando thumbnail para o YouTube via API...';
      try {
        await uploadCustomThumbnail(editingVideoId, editingThumbFile);
        statusEl.textContent = 'Thumbnail atualizada no YouTube com sucesso!';
      } catch (err) {
        console.warn('Não foi possível enviar para o YouTube API:', err);
      }
    }

    // 2. Handle image URL / file preview
    if (editingThumbFile) {
      await GiffuDB.saveMedia(`thumb_${editingVideoId}`, editingThumbFile);
      newThumbUrl = `https://img.youtube.com/vi/${editingVideoId}/hq720.jpg?t=${Date.now()}`;
    } else if (document.getElementById('thumbEditUrlInput').value.trim()) {
      newThumbUrl = document.getElementById('thumbEditUrlInput').value.trim();
    }

    // 3. Update localStorage video record
    let stored = cleanupLocalStorageVideos();
    const videoIndex = stored.findIndex(v => v.id === editingVideoId);
    
    if (videoIndex !== -1) {
      stored[videoIndex].thumb = newThumbUrl;
    } else {
      const video = (window.adminVideosList || []).find(v => v.id === editingVideoId);
      if (video) {
        const updated = { ...video, thumb: newThumbUrl };
        stored.unshift(updated);
      }
    }

    localStorage.setItem('giffu_videos', JSON.stringify(stored));
    
    statusEl.textContent = 'Thumbnail salva com sucesso!';
    setTimeout(() => {
      closeThumbEditor();
      loadAdminVideos();
    }, 600);

  } catch (err) {
    console.error('Erro ao salvar thumbnail:', err);
    statusEl.textContent = `Erro ao salvar: ${err.message}`;
  }
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

async function loadAdminVideos() {
  const container = document.getElementById('adminVideoGrid');
  if (!container) return;

  let allVideos = [];

  // Local Storage videos
  try {
    const raw = localStorage.getItem('giffu_videos');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) allVideos = parsed;
    }
  } catch (e) {}

  // Merge static videos.json or DEFAULT_PORTFOLIO_VIDEOS
  let staticList = DEFAULT_PORTFOLIO_VIDEOS;
  try {
    const res = await fetch('videos.json');
    if (res.ok) {
      const jsonVideos = await res.json();
      if (Array.isArray(jsonVideos) && jsonVideos.length > 0) {
        staticList = jsonVideos;
      }
    }
  } catch (e) {}

  const existingIds = new Set(allVideos.map(v => v.id));
  staticList.forEach(v => {
    if (!existingIds.has(v.id)) {
      allVideos.push(v);
    }
  });

  window.adminVideosList = allVideos;
  renderAdminVideoGrid(allVideos);
}

function filterManagedVideos() {
  const search = document.getElementById('manageSearch').value.toLowerCase();
  const category = document.getElementById('manageCategory').value;

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

  renderAdminVideoGrid(filtered);
}

function renderAdminVideoGrid(videos) {
  const container = document.getElementById('adminVideoGrid');
  if (!container) return;

  if (videos.length === 0) {
    container.innerHTML = `<p style="grid-column: 1/-1; color: #888; text-align: center; padding: 40px;">Nenhum vídeo encontrado.</p>`;
    return;
  }

  container.innerHTML = videos.map(v => {
    const thumbUrl = getHighResThumb(v.thumb, v.id);
    return `
      <div class="admin-video-card">
        <div class="admin-video-thumb">
          <img src="${thumbUrl}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="handleThumbError(this, '${v.id}')">
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
            <button class="btn-secondary" style="font-size:12px; padding:6px 10px;" onclick="openThumbEditor('${v.id}')" title="Editar Thumbnail">
              <i class="fas fa-image"></i> Capa
            </button>
            <button class="btn-secondary" style="font-size:12px; padding:6px 10px;" onclick="copyCardHtml('${v.id}')" title="Copiar HTML">
              <i class="fas fa-code"></i> HTML
            </button>
            <button class="btn-danger" onclick="deletePortfolioVideo('${v.id}')" title="Excluir">
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
  if (!confirm('Deseja remover este vídeo do portfólio no site?')) return;

  let stored = [];
  try {
    const raw = localStorage.getItem('giffu_videos');
    if (raw) stored = JSON.parse(raw);
  } catch (e) {}

  stored = stored.filter(v => v.id !== id);
  localStorage.setItem('giffu_videos', JSON.stringify(stored));
  loadAdminVideos();
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
