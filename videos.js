/**
 * videos.js - Dynamic Video Sync, Card Enhancement & Navigation for Giffú Portfolio
 */
(function() {
  function getPageCategory() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('motion')) return 'motion';
    if (path.includes('eventos')) return 'eventos';
    return 'marcas'; // default for index.html / main page
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
    let allVideos = [];

    // Load custom saved videos from localStorage if available
    try {
      const stored = localStorage.getItem('giffu_videos');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          allVideos = parsed.map(v => {
            if (v.thumb && (v.thumb.startsWith('data:') || v.thumb.includes('hqdefault.jpg'))) {
              return {
                ...v,
                thumb: `https://img.youtube.com/vi/${v.id}/maxresdefault.jpg`
              };
            }
            return v;
          });
        }
      }
    } catch (e) {
      console.warn('Could not read local video storage:', e);
    }

    // Fetch static videos.json to combine
    try {
      const res = await fetch('videos.json');
      if (res.ok) {
        const jsonVideos = await res.json();
        if (Array.isArray(jsonVideos)) {
          const existingIds = new Set(allVideos.map(v => v.id));
          jsonVideos.forEach(v => {
            if (!existingIds.has(v.id)) {
              allVideos.push(v);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Could not fetch videos.json:', e);
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

  function enhanceStaticCards() {
    document.querySelectorAll('.video-card').forEach(card => {
      if (!card.querySelector('.play-icon-badge')) {
        const playBtn = document.createElement('div');
        playBtn.className = 'play-icon-badge';
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        card.appendChild(playBtn);
      }
    });
  }

  function renderGrid(category, videos) {
    const grid = document.querySelector('.video-grid');
    if (!grid) return;

    enhanceStaticCards();

    // Identify already rendered cards in the DOM to avoid duplication
    const existingCards = Array.from(grid.querySelectorAll('.video-card'));
    const renderedIds = new Set();

    existingCards.forEach(card => {
      const href = card.getAttribute('href') || '';
      const vId = parseVideoId(href);
      if (vId) renderedIds.add(vId);
    });

    // Filter videos matching current page category
    const categoryVideos = videos.filter(v => v.page === category);

    // Prepend videos that aren't in the static HTML grid yet
    categoryVideos.reverse().forEach(v => {
      if (!renderedIds.has(v.id)) {
        const cardElem = createCardElement(v);
        grid.insertBefore(cardElem, grid.firstChild);
        renderedIds.add(v.id);
      }
    });

    // Re-bind overlay click handlers for all cards
    bindOverlayEvents();
  }

  function createCardElement(v) {
    const a = document.createElement('a');
    a.className = 'video-card';
    a.href = v.youtubeUrl || `https://www.youtube.com/watch?v=${v.id}`;
    a.target = '_blank';
    a.dataset.videoId = v.id;

    const thumbUrl = getHighResThumb(v.thumb, v.id);

    a.innerHTML = `
      <img src="${thumbUrl}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="handleThumbError(this, '${v.id}')">
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

  function playOverlayVideo(videoId) {
    const overlay = document.getElementById('video-overlay');
    const iframe = document.getElementById('video-frame');
    if (overlay && iframe) {
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&vq=hd3840`;
      overlay.style.display = 'flex';
    } else {
      window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
    }
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

  function initApp() {
    initTheme();
    initMobileMenu();
    loadVideos();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();

