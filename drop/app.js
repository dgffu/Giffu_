/**
 * Giffú Drop - Client Application Logic
 * Pure Vanilla JavaScript • Zero bloated frameworks • High Performance
 */

(function () {
  'use strict';

  // --- STATE ---
  let items = [];
  let stagedFiles = [];
  let activeFilter = 'all';
  let isSelectionMode = false;
  let selectedItemIds = new Set();
  let currentUploadingXHR = null;

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

  // --- CLIENT-SIDE VIDEO THUMBNAIL EXTRACTION ---
  function extractVideoThumbnail(file) {
    return new Promise((resolve) => {
      // Must be a video file
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
        // Seek to 1 second or 25% of video
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

      // Fallback timeout if seek doesn't trigger
      setTimeout(() => {
        cleanUp();
        resolve(null);
      }, 4000);
    });
  }

  // --- STAGING FILES (BEFORE SEND) ---
  function addFilesToStage(fileList) {
    const files = Array.from(fileList);
    let rejectedOversized = false;

    for (const file of files) {
      // 1 GB Validation Check
      if (file.size > MAX_FILE_SIZE) {
        showToast(`O arquivo "${file.name}" tem ${formatBytes(file.size)} e ultrapassa o limite de 1 GB. Envio bloqueado.`, 'error');
        rejectedOversized = true;
        continue;
      }

      // Check if already staged
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

  // --- FEED DATA FETCHING ---
  async function fetchItems() {
    try {
      const res = await fetch('/api/drop/items');
      if (res.ok) {
        const data = await res.json();
        items = data.items || [];
        renderFeed();
        updateStats();
        statusDot.style.background = '#10B981';
        statusText.textContent = 'Conectado (Local)';
      } else {
        throw new Error('Falha ao conectar na API local');
      }
    } catch (err) {
      console.warn('Servidor local não respondeu, tentando cache ou modo nuvem:', err);
      statusDot.style.background = '#F59E0B';
      statusText.textContent = 'Aguardando Servidor';
      // Load from local storage fallback if any
      const cached = localStorage.getItem('giffu_drop_local_cache');
      if (cached) {
        try {
          items = JSON.parse(cached);
          renderFeed();
          updateStats();
        } catch (e) {}
      }
    }
  }

  async function updateStats() {
    try {
      const res = await fetch('/api/drop/stats');
      if (res.ok) {
        const stats = await res.json();
        feedStatsSummary.textContent = `${stats.totalItems} mensagem(ns) • ${stats.totalFiles} arquivo(s) (${stats.formattedTotal})`;
      } else {
        feedStatsSummary.textContent = `${items.length} item(ns)`;
      }
    } catch (e) {
      feedStatsSummary.textContent = `${items.length} item(ns)`;
    }
  }

  // --- UPLOAD CONTROLLER ---
  async function handleSend() {
    const textContent = textInput.value.trim();
    const filesToUpload = [...stagedFiles];

    if (filesToUpload.length === 0 && !textContent) {
      return;
    }

    // Reset input fields immediately for snappy UI
    textInput.value = '';
    textInput.style.height = 'auto';
    clearStagedFiles();

    // 1. Text-only message
    if (filesToUpload.length === 0 && textContent) {
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

    // 2. File Uploads (Single or Batch Stack)
    const isBatch = filesToUpload.length > 1;
    const batchId = isBatch ? `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}` : '';
    const totalFiles = filesToUpload.length;

    showUploadProgress(true);

    let uploadedCount = 0;
    for (let i = 0; i < totalFiles; i++) {
      const file = filesToUpload[i];
      uploadProgressTitle.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Enviando [${i + 1}/${totalFiles}] ${file.name} (${formatBytes(file.size)})...`;

      // Extract thumbnail if it's a video
      let thumbData = null;
      if (file.type.startsWith('video/')) {
        uploadProgressTitle.innerHTML = `<i class="fas fa-image"></i> Gerando thumbnail original de ${file.name}...`;
        thumbData = await extractVideoThumbnail(file);
      }

      const success = await uploadSingleFile(file, {
        batchId: isBatch ? batchId : '',
        batchCount: totalFiles,
        caption: (i === 0 && textContent) ? textContent : '',
        thumbnailData: thumbData
      });

      if (!success) {
        showToast(`Falha no upload de "${file.name}". Processo interrompido.`, 'error');
        break;
      }
      uploadedCount++;
    }

    showUploadProgress(false);

    if (uploadedCount === totalFiles) {
      showToast(isBatch ? `Lote de ${totalFiles} arquivos originais enviado com sucesso!` : 'Arquivo original enviado!', 'success');
      fetchItems();
    }
  }

  function uploadSingleFile(file, options) {
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

          // Speed & Remaining calculation
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
    if (!confirm('Deseja realmente apagar este item e seus arquivos originais do servidor?')) {
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
  /**
   * Core Batch Download Logic:
   * - Mobile: Uses Web Share API (navigator.share) with File objects.
   *   On iOS and Android, this prompts "Salvar Imagens / Vídeos na Galeria"!
   * - Desktop: Bundles everything into a .ZIP archive via JSZip.
   */
  async function downloadBatchFiles(fileList, batchTitle = 'giffu-drop-lote') {
    if (!fileList || fileList.length === 0) return;

    const isMobile = isMobileDevice();

    // 1. MOBILE FLOW: Web Share API -> Direct to Gallery/Photos
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
        if (shareErr.name === 'AbortError') {
          // User closed share sheet, nothing to do
          return;
        }
        console.warn('Web Share API não suportada para estes arquivos ou erro, fallback para download direto:', shareErr);
      }
    }

    // 2. DESKTOP FLOW (PC / Mac) OR MOBILE FALLBACK: JSZip Archive
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

    // 3. Fallback: Download each individually
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

    // Card Selection in Selection Mode
    card.addEventListener('click', (e) => {
      if (isSelectionMode) {
        e.preventDefault();
        toggleCardSelection(item.id, card);
      }
    });

    // Header Meta
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

    // Copy Button listener
    const btnCopy = header.querySelector('.btn-copy');
    if (btnCopy) {
      btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(item.text);
        showToast('Texto copiado para a área de transferência!', 'success');
      });
    }

    // Delete Button listener
    const btnDel = header.querySelector('.btn-delete');
    if (btnDel) {
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(item.id, card);
      });
    }

    card.appendChild(header);

    // Caption if present
    if (item.caption) {
      const cap = document.createElement('div');
      cap.className = 'card-caption';
      cap.textContent = item.caption;
      card.appendChild(cap);
    }

    // BODY DISPATCHER
    if (item.type === 'text') {
      const textBody = document.createElement('div');
      textBody.className = 'card-text-body';
      textBody.textContent = item.text;
      card.appendChild(textBody);
    } 
    else if (item.type === 'file') {
      const f = item.file;
      renderSingleFileBody(card, f);
    } 
    else if (item.type === 'batch') {
      renderBatchBody(card, item);
    }

    return card;
  }

  // --- RENDER SINGLE FILE BODY ---
  function renderSingleFileBody(card, f) {
    if (!f) return;

    // 1. PHOTO: High quality inline preview
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
    }

    // 2. VIDEO: Displays thumbnail only + original download button
    else if (f.category === 'video') {
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
          // Trigger download directly or open preview
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

    // FOOTER: Details & Original Download Button
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

  // --- RENDER BATCH BODY (ARQUIVOS EMPILHADOS) ---
  function renderBatchBody(card, batchItem) {
    const files = batchItem.files || [];
    const isMobile = isMobileDevice();

    // Batch Stack Gallery
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

      // Meta and single download inside cell
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

    // BATCH ACTION FOOTER (Mobile Gallery / Desktop ZIP)
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
    fileInput.value = ''; // Reset for re-selection
  });

  // Auto-resize textarea
  textInput.addEventListener('input', () => {
    textInput.style.height = 'auto';
    textInput.style.height = Math.min(120, textInput.scrollHeight) + 'px';
    updateSendButtonState();
  });

  // Keyboard shortcut: Cmd/Ctrl + Enter or Enter to send
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  btnSend.addEventListener('click', handleSend);

  // --- FULLSCREEN DRAG & DROP ---
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

  // --- CLIPBOARD PASTE SUPPORT ---
  window.addEventListener('paste', (e) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      addFilesToStage(e.clipboardData.files);
      showToast('Arquivo colado da área de transferência!', 'info');
    }
  });

  // --- SETTINGS CONTROLLER ---
  function loadSettingsIntoModal() {
    const cfg = window.GIFFU_DROP_CONFIG;
    cfgStorageMode.value = cfg.storageMode || 'local';
    toggleCloudSection(cfgStorageMode.value === 'cloud');

    if (cfg.cloud) {
      cfgCloudProvider.value = cfg.cloud.provider || 'supabase';
      cfgSupabaseUrl.value = cfg.cloud.supabaseUrl || '';
      cfgSupabaseKey.value = cfg.cloud.supabaseAnonKey || '';
      cfgSupabaseBucket.value = cfg.cloud.bucketName || 'giffu-drop';
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

  btnOpenSettings.addEventListener('click', () => {
    loadSettingsIntoModal();
    settingsModal.classList.add('active');
  });

  btnCloseSettings.addEventListener('click', () => settingsModal.classList.remove('active'));
  btnCancelSettings.addEventListener('click', () => settingsModal.classList.remove('active'));

  btnSaveSettings.addEventListener('click', () => {
    const newCfg = {
      ...window.GIFFU_DROP_CONFIG,
      storageMode: cfgStorageMode.value,
      cloud: {
        provider: cfgCloudProvider.value,
        supabaseUrl: cfgSupabaseUrl.value.trim(),
        supabaseAnonKey: cfgSupabaseKey.value.trim(),
        bucketName: cfgSupabaseBucket.value.trim() || 'giffu-drop',
        customApiUrl: cfgCustomApiUrl.value.trim()
      }
    };

    if (window.saveAppConfig(newCfg)) {
      showToast('Configurações salvas!', 'success');
      settingsModal.classList.remove('active');
      fetchItems();
    } else {
      showToast('Erro ao salvar configurações.', 'error');
    }
  });

  // --- INITIALIZATION ---
  fetchItems();
  updateSendButtonState();

  // Periodically refresh feed every 10 seconds
  setInterval(fetchItems, 10000);

})();
