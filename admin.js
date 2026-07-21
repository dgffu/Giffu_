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

function initGoogleAuth() {
  const clientId = getClientId();
  if (!clientId || clientId === DEFAULT_CLIENT_ID) {
    updateAuthUI(false, 'Configurar Client ID');
    return;
  }

  if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      callback: (tokenResponse) => {
        if (tokenResponse.access_token) {
          accessToken = tokenResponse.access_token;
          updateAuthUI(true, 'Conectado (dilangoficial@gmail.com)');
        } else {
          updateAuthUI(false, 'Falha ao conectar');
        }
      },
    });

    document.getElementById('btnGoogleAuth').onclick = () => {
      if (tokenClient) {
        tokenClient.requestAccessToken();
      }
    };
  }
}

function updateAuthUI(isConnected, text) {
  const dot = document.getElementById('authStatusDot');
  const txt = document.getElementById('authStatusText');
  const btn = document.getElementById('btnGoogleAuth');

  if (isConnected) {
    dot.classList.add('connected');
    txt.textContent = text || 'Conectado';
    btn.innerHTML = `<i class="fas fa-check-circle"></i> Conta Conectada`;
    btn.style.background = '#22c55e';
    btn.style.color = '#fff';
  } else {
    dot.classList.remove('connected');
    txt.textContent = text || 'Não conectado';
    btn.innerHTML = `<i class="fab fa-google"></i> Conectar Conta`;
    btn.style.background = '#fff';
    btn.style.color = '#171717';
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
    alert('Por favor, conecte sua conta do Google clicando em "Conectar Conta" no topo antes de enviar.');
    if (tokenClient) tokenClient.requestAccessToken();
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
async function loadAdminVideos() {
  const container = document.getElementById('adminVideoGrid');
  if (!container) return;

  let allVideos = [];

  // Local Storage videos
  try {
    const raw = localStorage.getItem('giffu_videos');
    if (raw) allVideos = JSON.parse(raw);
  } catch (e) {}

  // Merge static videos.json
  try {
    const res = await fetch('videos.json');
    if (res.ok) {
      const jsonVideos = await res.json();
      const existingIds = new Set(allVideos.map(v => v.id));
      jsonVideos.forEach(v => {
        if (!existingIds.has(v.id)) {
          allVideos.push(v);
        }
      });
    }
  } catch (e) {}

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
