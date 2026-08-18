/**
 * videos.js - Dynamic Video Sync, Card Enhancement & Navigation for Giffú Portfolio
 */
(function() {
  // Limpar a barra de endereços (remover .html e index.html) sem recarregar a página
  function cleanBrowserUrl() {
    if (typeof window === 'undefined' || !window.location || window.location.protocol === 'file:') return;
    const path = window.location.pathname;
    if (path.endsWith('.html') || path.includes('.html')) {
      let clean = path.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
      if (clean === '') clean = '/';
      const target = clean + window.location.search + window.location.hash;
      if (target !== path + window.location.search + window.location.hash) {
        try {
          window.history.replaceState(null, '', target);
        } catch (e) {}
      }
    }
  }
  cleanBrowserUrl();

  function initCleanLinks() {
    if (typeof window === 'undefined' || !window.location || window.location.protocol === 'file:') return;
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      if (href.endsWith('.html') && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//') && !href.startsWith('#')) {
        let clean = href.replace(/^index\.html$/i, './').replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
        a.setAttribute('href', clean);
      }
    });
  }

  function getPageCategory() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('motion')) return 'motion';
    if (path.includes('eventos')) return 'eventos';
    if (path.includes('marcas')) return 'marcas';
    return null;
  }

  function parseVideoId(url) {
    if (!url) return null;
    if (url.includes('v=')) {
      const match = url.match(/[?&]v=([^&]+)/);
      return match ? match[1] : null;
    }
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  async function loadVideos() {
    const category = getPageCategory();
    if (!category) return;
    let allVideos = [];

    const endpoints = [
      `videos.json?_t=${Date.now()}`,
      `http://localhost:5173/videos.json?_t=${Date.now()}`,
      `http://127.0.0.1:5173/videos.json?_t=${Date.now()}`
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, { cache: 'no-store' });
        if (res.ok) {
          const jsonVideos = await res.json();
          if (Array.isArray(jsonVideos) && jsonVideos.length > 0) {
            allVideos = jsonVideos;
            try {
              localStorage.setItem('giffu_videos', JSON.stringify(allVideos));
            } catch (e) {}
            renderGrid(category, allVideos);
            return;
          }
        }
      } catch (e) {}
    }

    // Fallback offline
    try {
      const stored = localStorage.getItem('giffu_videos');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allVideos = parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read local video storage:', e);
    }

    renderGrid(category, allVideos);
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
  window.getHighResThumb = getHighResThumb;

  window.checkAndCropThumb = function(img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const aspect = img.naturalWidth / img.naturalHeight;
    if (aspect > 1.2 && aspect < 1.45) {
      img.classList.add('crop-4-3');
    } else {
      img.classList.remove('crop-4-3');
    }
  };

  window.autoCropAllThumbs = function() {
    document.querySelectorAll('.video-card img, .admin-video-thumb img, .thumb-edit-preview img').forEach(img => {
      if (img.complete) {
        checkAndCropThumb(img);
      } else {
        img.addEventListener('load', () => checkAndCropThumb(img));
      }
    });
  };

  window.handleThumbError = function(img, videoId) {
    if (!img) return;
    const step = parseInt(img.dataset.fallbackStep || '0', 10);
    if (step === 0 && videoId) {
      img.dataset.fallbackStep = '1';
      img.src = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    } else if (step === 1 && videoId) {
      img.dataset.fallbackStep = '2';
      img.src = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
    } else if (step === 2 && videoId) {
      img.dataset.fallbackStep = '3';
      img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    } else if (step === 3 && videoId) {
      img.dataset.fallbackStep = '4';
      img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
    setTimeout(() => checkAndCropThumb(img), 50);
  };

  function enhanceStaticCards() {
    document.querySelectorAll('.video-card').forEach(card => {
      if (!card.querySelector('.play-icon-badge')) {
        const playBtn = document.createElement('div');
        playBtn.className = 'play-icon-badge';
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        card.appendChild(playBtn);
      }
      const img = card.querySelector('img');
      if (img) {
        if (img.complete) checkAndCropThumb(img);
        else img.addEventListener('load', () => checkAndCropThumb(img));
      }
    });
  }

  function renderGrid(category, videos) {
    if (category === 'home') {
      const categories = ['marcas', 'motion', 'eventos'];
      categories.forEach(cat => {
        const grid = document.querySelector(`#grid-${cat}`);
        if (grid) {
          const catVideos = videos.filter(v => v.page === cat);
          grid.innerHTML = '';
          if (catVideos.length > 0) {
            catVideos.forEach(v => {
              const cardElem = createCardElement(v);
              grid.appendChild(cardElem);
            });
          } else {
            grid.innerHTML = `
              <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <i class="fas fa-clock" style="font-size: 28px; color: var(--accent-orange); margin-bottom: 10px; opacity: 0.8; display: block;"></i>
                <h4 style="font-size: 16px; color: var(--text-primary); margin-bottom: 4px;">Em breve</h4>
                <p style="font-size: 13px;">Novos projetos em produção.</p>
              </div>
            `;
          }
        }
      });
    } else {
      const grid = document.querySelector('.video-grid');
      if (grid) {
        const categoryVideos = videos.filter(v => v.page === category);
        grid.innerHTML = '';
        if (categoryVideos.length > 0) {
          categoryVideos.forEach(v => {
            const cardElem = createCardElement(v);
            grid.appendChild(cardElem);
          });
        } else {
          grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
              <i class="fas fa-clock" style="font-size: 36px; color: var(--accent-orange); margin-bottom: 14px; opacity: 0.8; display: block;"></i>
              <h3 style="font-size: 20px; color: var(--text-primary); margin-bottom: 8px;">Em breve</h3>
              <p style="font-size: 14px; max-width: 400px; margin: 0 auto;">Novos vídeos e produções desta categoria serão adicionados em breve.</p>
            </div>
          `;
        }
      }
    }

    enhanceStaticCards();
    // Re-bind overlay click handlers for all cards
    bindOverlayEvents();
    autoCropAllThumbs();
  }

  function createCardElement(v) {
    const a = document.createElement('a');
    a.className = 'video-card';
    a.href = v.youtubeUrl || `https://www.youtube.com/watch?v=${v.id}`;
    a.target = '_blank';
    a.dataset.videoId = v.id;

    const thumbUrl = getHighResThumb(v.thumb, v.id);

    a.innerHTML = `
      <img src="${thumbUrl}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="handleThumbError(this, '${v.id}')" onload="checkAndCropThumb(this)">
      <div class="play-icon-badge"><i class="fas fa-play"></i></div>
      <div class="video-info">
        <h3 class="video-title">${escapeHtml(v.title)}</h3>
        <p class="video-subtitle">${escapeHtml(v.subtitle)}</p>
      </div>
    `;
    return a;
  }


  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
  }

  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
  }

  function ensureVideoOverlayExists() {
    let overlay = document.getElementById('video-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'video-overlay';
      overlay.innerHTML = `
        <span class="close" onclick="closeVideo()" aria-label="Fechar Vídeo">&times;</span>
        <iframe id="video-frame" src="" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>
      `;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  let ytPlayerInstance = null;
  let qualityInterval = null;

  function loadYouTubeIframeApi() {
    if (!window.YT && !document.getElementById('youtube-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }

  function applyHighestQuality(player) {
    if (!player) return;
    try {
      if (typeof player.getAvailableQualityLevels === 'function') {
        const levels = player.getAvailableQualityLevels();
        if (Array.isArray(levels) && levels.length > 0) {
          // O primeiro elemento de getAvailableQualityLevels é a resolução máxima suportada (ex: 'highres', 'hd2160' 4K, 'hd1440' 2K, 'hd1080')
          player.setPlaybackQuality(levels[0]);
          player.setSuggestedQuality(levels[0]);
        } else {
          player.setPlaybackQuality('highres');
          player.setSuggestedQuality('highres');
        }
      } else {
        if (typeof player.setPlaybackQuality === 'function') player.setPlaybackQuality('highres');
        if (typeof player.setSuggestedQuality === 'function') player.setSuggestedQuality('highres');
      }
    } catch (e) {}
  }

  function sendPostMessageMaxQuality(iframe) {
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'setPlaybackQuality',
        args: ['highres']
      }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'setSuggestedQuality',
        args: ['highres']
      }), '*');
    } catch (e) {}
  }

  function closeVideo() {
    if (qualityInterval) {
      clearInterval(qualityInterval);
      qualityInterval = null;
    }
    const overlay = document.getElementById('video-overlay');
    const iframe = document.getElementById('video-frame');
    if (overlay) {
      overlay.style.display = 'none';
    }
    if (ytPlayerInstance && typeof ytPlayerInstance.stopVideo === 'function') {
      try { ytPlayerInstance.stopVideo(); } catch(e) {}
    }
    if (iframe) {
      iframe.src = '';
    }
  }
  window.closeVideo = closeVideo;
  window.closeOverlayVideo = closeVideo;

  let overlayEventsBound = false;
  function initOverlayEvents() {
    if (overlayEventsBound) return;
    overlayEventsBound = true;

    const overlay = ensureVideoOverlayExists();

    // 1. Fechar ao clicar no 'X'
    overlay.querySelectorAll('.close').forEach(btn => {
      btn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        closeVideo();
      };
    });

    // 2. Fechar ao clicar no fundo escuro (fora do iframe)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeVideo();
      }
    });

    // 3. Fechar ao pressionar a tecla ESC (Escape)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
        closeVideo();
      }
    });
  }

  function playOverlayVideo(videoId) {
    const overlay = ensureVideoOverlayExists();
    const iframe = document.getElementById('video-frame');
    initOverlayEvents();

    if (!overlay || !iframe) {
      window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
      return;
    }

    if (qualityInterval) {
      clearInterval(qualityInterval);
      qualityInterval = null;
    }

    // Parâmetro vq=highres para requisitar resolução nativa máxima (8K/4K/2160p/1440p/1080p)
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&vq=highres&enablejsapi=1&origin=${encodeURIComponent(window.location.origin || '*')}&rel=0&modestbranding=1&playsinline=1`;
    iframe.src = embedUrl;
    overlay.style.display = 'flex';

    // Integração direta com a API YT.Player para forçar qualidade máxima
    if (window.YT && window.YT.Player) {
      try {
        if (!ytPlayerInstance) {
          ytPlayerInstance = new YT.Player('video-frame', {
            events: {
              onReady: (event) => {
                applyHighestQuality(event.target);
                event.target.playVideo();
              },
              onStateChange: (event) => {
                if (event.data === (window.YT.PlayerState ? window.YT.PlayerState.PLAYING : 1)) {
                  applyHighestQuality(event.target);
                }
              }
            }
          });
        } else if (typeof ytPlayerInstance.loadVideoById === 'function') {
          ytPlayerInstance.loadVideoById({
            videoId: videoId,
            suggestedQuality: 'highres'
          });
          applyHighestQuality(ytPlayerInstance);
        }
      } catch (e) {
        console.warn('Erro ao inicializar YT Player:', e);
      }
    }

    // Reforçar o comando de qualidade máxima durante o buffer inicial
    let attempts = 0;
    qualityInterval = setInterval(() => {
      attempts++;
      sendPostMessageMaxQuality(iframe);
      if (ytPlayerInstance) applyHighestQuality(ytPlayerInstance);
      if (attempts >= 8) {
        clearInterval(qualityInterval);
        qualityInterval = null;
      }
    }, 600);
  }
  window.playOverlayVideo = playOverlayVideo;

  function openVideo(videoId) {
    if (!videoId) return;

    if (isMobileDevice()) {
      const isAndroid = /Android/i.test(navigator.userAgent);

      let deepLinkUrl = `youtube://www.youtube.com/watch?v=${videoId}`;
      if (isAndroid) {
        deepLinkUrl = `intent://www.youtube.com/watch?v=${videoId}#Intent;package=com.google.android.youtube;scheme=https;end`;
      }

      let appOpened = false;
      const startTime = Date.now();

      function onBlurOrHide() {
        appOpened = true;
      }

      window.addEventListener('pagehide', onBlurOrHide, { once: true });
      window.addEventListener('blur', onBlurOrHide, { once: true });
      const onVisChange = () => {
        if (document.hidden) appOpened = true;
      };
      document.addEventListener('visibilitychange', onVisChange, { once: true });

      // Tentar abrir o app do YouTube via deep-link
      window.location.href = deepLinkUrl;

      // Fallback: se o app do YouTube não abrir em 1.2s e a página continuar visível, reproduzir normalmente
      setTimeout(() => {
        window.removeEventListener('pagehide', onBlurOrHide);
        window.removeEventListener('blur', onBlurOrHide);
        document.removeEventListener('visibilitychange', onVisChange);

        if (!appOpened && !document.hidden && (Date.now() - startTime < 2000)) {
          playOverlayVideo(videoId);
        }
      }, 1200);
    } else {
      playOverlayVideo(videoId);
    }
  }
  window.openVideo = openVideo;
  window.handleVideoClick = openVideo;

  function bindOverlayEvents() {
    document.querySelectorAll('.video-card').forEach(card => {
      if (card.dataset.bound) return;
      card.dataset.bound = 'true';

      const href = card.getAttribute('href') || '';
      const videoId = card.dataset.videoId || parseVideoId(href);

      if (videoId) {
        card.addEventListener('click', (e) => {
          e.preventDefault();
          openVideo(videoId);
        });
      }
    });
  }

  function updateThemeToggleIcons(isLight) {
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.innerHTML = isLight ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
      btn.setAttribute('title', isLight ? 'Modo Escuro' : 'Modo Claro');
      btn.setAttribute('aria-label', isLight ? 'Alternar para Modo Escuro' : 'Alternar para Modo Claro');
    });
  }

  function applyTheme(isLight) {
    if (isLight) {
      document.documentElement.classList.add('light-mode');
      if (document.body) document.body.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
      if (document.body) document.body.classList.remove('light-mode');
    }
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('giffu_theme');
    const isLight = savedTheme === 'light';
    applyTheme(isLight);
    updateThemeToggleIcons(isLight);

    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      if (btn.dataset.boundTheme) return;
      btn.dataset.boundTheme = 'true';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const currentlyLight = !document.documentElement.classList.contains('light-mode');
        applyTheme(currentlyLight);
        localStorage.setItem('giffu_theme', currentlyLight ? 'light' : 'dark');
        updateThemeToggleIcons(currentlyLight);
      });
    });
  }

  // Pre-apply light mode immediately as script parses to prevent screen flicker
  try {
    const preTheme = localStorage.getItem('giffu_theme');
    if (preTheme === 'light') {
      document.documentElement.classList.add('light-mode');
      if (document.body) document.body.classList.add('light-mode');
    }
  } catch (e) {}


  function initMobileMenu() {
    const toggleBtn = document.querySelector('.mobile-nav-toggle');
    const menu = document.querySelector('.menu');
    if (toggleBtn && menu) {
      toggleBtn.addEventListener('click', () => {
        menu.classList.toggle('mobile-open');
        const icon = toggleBtn.querySelector('i');
        if (icon) {
          if (menu.classList.contains('mobile-open')) {
            icon.className = 'fas fa-times';
          } else {
            icon.className = 'fas fa-bars';
          }
        }
      });
    }
  }

  function initLanguageToggle() {
    const saved = localStorage.getItem('giffu_lang') || 'pt';
    updateAllLangButtons(saved);

    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const curr = btn.getAttribute('data-lang') || 'pt';
        const next = curr === 'pt' ? 'en' : 'pt';
        localStorage.setItem('giffu_lang', next);
        updateAllLangButtons(next);
      });
    });
  }

  function updateAllLangButtons(lang) {
    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
      btn.setAttribute('data-lang', lang);
      btn.setAttribute('title', lang === 'pt' ? 'Mudar para Inglês (EN)' : 'Mudar para Português (PT)');
      btn.setAttribute('aria-label', lang === 'pt' ? 'Mudar para Inglês' : 'Switch to English');
    });
  }

  function initApp() {
    cleanBrowserUrl();
    initCleanLinks();
    initTheme();
    initMobileMenu();
    initLanguageToggle();
    initOverlayEvents();
    loadYouTubeIframeApi();
    loadVideos();
    autoCropAllThumbs();
  }


  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();

