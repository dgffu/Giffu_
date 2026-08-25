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
        const res = await fetch(ep, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
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

  // --- INTELIGENT BILINGUAL TRANSLATION ENGINE ---
  const I18N_DATA = {
    pt: {
      navHome: 'Home',
      navDownloads: 'Ferramentas',
      navMarcas: 'Para Marcas',
      navMotion: 'Motion Design',
      navEventos: 'Edição de Eventos',
      navAbout: 'Sobre',

      homeHeroSub: 'Transformando conceitos em narrativas audiovisuais de alto padrão. Edição comercial para marcas, identidades visuais dinâmicas, filmes cinematográficos e ferramentas para quem cria com audiovisual.',
      homeBtnMarcas: '<i class="fas fa-play"></i> Ver Portfólio Comercial',
      homeBtnDownloads: '<i class="fas fa-wrench"></i> Ferramentas',
      homeSectionTag: 'O que você procura?',
      homeSectionTitle: 'Explore as Áreas do Portfólio',
      homePillarMarcasTitle: 'Para Marcas',
      homePillarMarcasDesc: 'Comerciais, campanhas corporativas e projetos audiovisuais produzidos com ritmo cinematográfico e padrão de transmissão para marcas de destaque.',
      homePillarMarcasBtn: 'Acessar Portfólio Comercial',
      homePillarMotionTitle: 'Motion Design',
      homePillarMotionDesc: 'Identidades visuais animadas, vinhetas 2D/3D, idents de marca, broadcast design refinado e sincronismo sonoro imersivo.',
      homePillarMotionBtn: 'Acessar Motion Design',
      homePillarEventosTitle: 'Edição de Eventos',
      homePillarEventosDesc: 'Same-Day Edits e filmes de eventos montados com sensibilidade narrativa, ritmo dinâmico e tratamento de cor personalizado.',
      homePillarEventosBtn: 'Acessar Filmes de Eventos',
      homePillarDownloadsTitle: 'Ferramentas',
      homePillarDownloadsDesc: 'Presets, scripts, apps e utilitários criados para acelerar e elevar a qualidade do seu fluxo de edição e pós-produção.',
      homePillarDownloadsBtn: 'Acessar Ferramentas',
      homeHighlightsTag: 'Destaques do Portfólio',
      homeHighlightsTitle: 'Projetos em Destaque',
      homeHighlightsSub: 'Trabalhos recentes selecionados que demonstram domínio técnico, ritmo narrativo e excelência visual.',
      homeSeeAllMarcas: 'Ver Todos os Projetos Comerciais <i class="fas fa-arrow-right"></i>',

      marcasBadge: '<i class="fas fa-briefcase"></i> Portfólio Comercial',
      marcasTitle: 'Edição & Pós-Produção para Marcas',
      marcasSub: 'Projetos comerciais, campanhas e conteúdos audiovisuais produzidos com ritmo cinematográfico e padrão de transmissão para marcas de destaque.',

      motionBadge: '<i class="fas fa-cube"></i> Animação & VFX',
      motionTitle: 'Motion Design & Identidades Visuais',
      motionSub: 'Vinhetas 2D/3D, idents, animações de logo, elementos gráficos dinâmicos e aberturas para marcas e projetos autorais.',

      eventosBadge: '<i class="fas fa-heart"></i> Filmes de Casamento & Eventos',
      eventosTitle: 'Edição de Filmes & Eventos',
      eventosSub: 'Same-Day Edits, Save The Date, Teasers e Filmes de Casamento produzidos com narrativa emocional e acabamento de cinema.',

      downloadsBadge: '<i class="fas fa-wrench"></i> Ferramentas & Recursos',
      downloadsTitle: 'Ferramentas do Editor',
      downloadsSub: 'Presets, scripts, apps e utilitários criados para acelerar seu fluxo de trabalho audiovisual.',
      downloadsSearchPlaceholder: 'Buscar recursos...',
      downloadsBtnText: 'Baixar',
      downloadsBtnDownload: 'Baixar',
      downloadsBtnBuy: 'Comprar',
      downloadsBtnAccess: 'Acessar',
      downloadsModalBtn: '<i class="fas fa-download"></i> Baixar Agora',
      downloadsModalBtnDownload: '<i class="fas fa-download"></i> Baixar Agora',
      downloadsModalBtnBuy: '<i class="fas fa-shopping-cart"></i> Comprar Agora',
      downloadsModalBtnAccess: '<i class="fas fa-arrow-up-right-from-square"></i> Acessar Ferramenta',
      downloadsModalClose: 'Fechar',
      downloadsFilterAll: 'Todos',
      downloadsFilterApps: 'Apps & Ferramentas',
      downloadsEmptyTitle: 'Em breve',
      downloadsEmptyDesc: 'Novos recursos estão sendo preparados para a biblioteca.',
      downloadsNoResults: 'Nenhum recurso encontrado com os filtros selecionados.',

      aboutTitle: 'Sobre mim',
      aboutServicesTitle: '<i class="fas fa-layer-group"></i> Serviços',
      aboutToolsTitle: '<i class="fas fa-wrench"></i> Ferramentas',
      aboutP1: 'Oi, sou o <b>Dilan Giffú</b>. Sou filmmaker, motion designer, edito vídeos e também escrevo <i>(mas não conta pra ninguém)</i>.',
      aboutP2: 'Estou há <b>14 anos</b> envolvido no universo da edição de vídeo e há mais de <b>8 anos</b> trabalhando profissionalmente na área. Comecei criando conteúdo no YouTube, até que migrei para a área de eventos sociais e logo parti também para o motion design.',
      aboutP3: 'Em 2019 fundei a <b>Novel</b>, minha produtora audiovisual de projetos autorais, mas continuo servindo a projetos incríveis aos quais sou apresentado constantemente — desde eventos corporativos a grandes produções, seja na idealização, captação ou pós-produção.',
      aboutP4: 'Desenvolvi este espaço independente da minha marca para que o trabalho em que prestei serviços a outras empresas possa transmitir a excelência com a qual sempre busco realizar meu trabalho.',
      aboutStat1Num: '14 anos',
      aboutStat1Lbl: 'de Audiovisual',
      aboutStat2Num: '8 anos',
      aboutStat2Lbl: 'Profissionalmente',
      aboutStat3Num: '2019',
      aboutStat3Lbl: 'Fundação da Novel',
      aboutQuoteText: '"Assim resplandeça a vossa luz diante dos homens, para que vejam as vossas boas obras e glorifiquem a vosso Pai, que está nos céus."',
      aboutQuoteRef: '— Mateus 5:16',

      footerCopyright: '© 2026 Dilan Giffú · Todos os direitos reservados.',
      emptyGridTitle: 'Em breve',
      emptyGridSub: 'Novos vídeos e produções desta categoria serão adicionados em breve.',
      themeLight: 'Modo Claro',
      themeDark: 'Modo Escuro'
    },
    en: {
      navHome: 'Home',
      navDownloads: 'Tools',
      navMarcas: 'For Brands',
      navMotion: 'Motion Design',
      navEventos: 'Event Editing',
      navAbout: 'About',

      homeHeroSub: 'Transforming concepts into high-end audiovisual narratives. Commercial editing for brands, dynamic visual identities, cinematic films, and tools for creators.',
      homeBtnMarcas: '<i class="fas fa-play"></i> View Commercial Portfolio',
      homeBtnDownloads: '<i class="fas fa-wrench"></i> Tools',
      homeSectionTag: 'What are you looking for?',
      homeSectionTitle: 'Explore Portfolio Categories',
      homePillarMarcasTitle: 'For Brands',
      homePillarMarcasDesc: 'Commercials, corporate campaigns, and audiovisual projects crafted with cinematic pacing and broadcast standards for leading brands.',
      homePillarMarcasBtn: 'Access Commercial Portfolio',
      homePillarMotionTitle: 'Motion Design',
      homePillarMotionDesc: 'Animated visual identities, 2D/3D openers, brand idents, refined broadcast design, and immersive sound sync.',
      homePillarMotionBtn: 'Access Motion Design',
      homePillarEventosTitle: 'Event Editing',
      homePillarEventosDesc: 'Same-Day Edits and event films crafted with narrative sensitivity, dynamic pacing, and custom color grading.',
      homePillarEventosBtn: 'Access Event Films',
      homePillarDownloadsTitle: 'Tools',
      homePillarDownloadsDesc: 'Practical presets, scripts, apps, and utilities built to elevate and accelerate your post-production workflow.',
      homePillarDownloadsBtn: 'Access Tools',
      homeHighlightsTag: 'Portfolio Highlights',
      homeHighlightsTitle: 'Featured Projects',
      homeHighlightsSub: 'Selected recent projects showcasing technical mastery, narrative pacing, and visual excellence.',
      homeSeeAllMarcas: 'View All Commercial Projects <i class="fas fa-arrow-right"></i>',

      marcasBadge: '<i class="fas fa-briefcase"></i> Commercial Portfolio',
      marcasTitle: 'Editing & Post-Production for Brands',
      marcasSub: 'Commercial projects, campaigns, and audiovisual content produced with cinematic pacing and broadcast standards for standout brands.',

      motionBadge: '<i class="fas fa-cube"></i> Animation & VFX',
      motionTitle: 'Motion Design & Visual Identities',
      motionSub: '2D/3D idents, logo animations, dynamic graphic elements, and title sequences for brands and original projects.',

      eventosBadge: '<i class="fas fa-heart"></i> Wedding & Event Films',
      eventosTitle: 'Film & Event Editing',
      eventosSub: 'Same-Day Edits, Save The Date, Teasers, and Wedding Films produced with emotional storytelling and cinematic finish.',

      downloadsBadge: '<i class="fas fa-wrench"></i> Resources & Tools',
      downloadsTitle: 'Editor Tools',
      downloadsSub: 'Exclusive collection of presets, templates, sound design, apps, and utilities built to speed up your post-production workflow.',
      downloadsSearchPlaceholder: 'Search resources...',
      downloadsBtnText: 'Download',
      downloadsBtnDownload: 'Download',
      downloadsBtnBuy: 'Buy',
      downloadsBtnAccess: 'Access',
      downloadsModalBtn: '<i class="fas fa-download"></i> Download Now',
      downloadsModalBtnDownload: '<i class="fas fa-download"></i> Download Now',
      downloadsModalBtnBuy: '<i class="fas fa-shopping-cart"></i> Buy Now',
      downloadsModalBtnAccess: '<i class="fas fa-arrow-up-right-from-square"></i> Access Tool',
      downloadsModalClose: 'Close',
      downloadsFilterAll: 'All',
      downloadsFilterApps: 'Apps & Tools',
      downloadsEmptyTitle: 'Coming soon',
      downloadsEmptyDesc: 'New resources are currently being prepared for the library.',
      downloadsNoResults: 'No resources found matching the selected filters.',

      aboutTitle: 'About Me',
      aboutServicesTitle: '<i class="fas fa-layer-group"></i> Services',
      aboutToolsTitle: '<i class="fas fa-wrench"></i> Tools',
      aboutP1: 'Hi, I\'m <b>Dilan Giffú</b>. I\'m a filmmaker, motion designer, video editor, and writer <i>(don\'t tell anyone)</i>.',
      aboutP2: 'I have been involved in the video editing universe for <b>14 years</b> and working professionally for over <b>8 years</b>. I started by creating content on YouTube, later transitioning to social events and motion design.',
      aboutP3: 'In 2019, I founded <b>Novel</b>, my audiovisual studio for original projects. I continue contributing to remarkable productions — from corporate events to large-scale films, across concept, filming, and post-production.',
      aboutP4: 'I built this independent portfolio space so that the projects I deliver for partner brands faithfully convey the excellence I strive for in every production.',
      aboutStat1Num: '14 years',
      aboutStat1Lbl: 'in Audiovisual',
      aboutStat2Num: '8 years',
      aboutStat2Lbl: 'Professionally',
      aboutStat3Num: '2019',
      aboutStat3Lbl: 'Novel Founded',
      aboutQuoteText: '"Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven."',
      aboutQuoteRef: '— Matthew 5:16',

      footerCopyright: '© 2026 Dilan Giffú · All rights reserved.',
      emptyGridTitle: 'Coming soon',
      emptyGridSub: 'New videos and productions in this category will be added soon.',
      themeLight: 'Light Mode',
      themeDark: 'Dark Mode'
    }
  };

  function getActiveLang() {
    return localStorage.getItem('giffu_lang') || 'pt';
  }

  function applyLanguage(lang) {
    if (!lang) lang = 'pt';
    const dict = I18N_DATA[lang] || I18N_DATA.pt;

    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-br';

    // 1. Atualizar Navegação
    const navHome = document.querySelector('nav.menu a[href*="index"]');
    if (navHome) navHome.textContent = dict.navHome;
    const navDownloads = document.querySelector('nav.menu a[href*="ferramentas"], nav.menu a[href*="downloads"]');
    if (navDownloads) navDownloads.textContent = dict.navDownloads;
    const navMarcas = document.querySelector('nav.menu a[href*="marcas"]');
    if (navMarcas) navMarcas.textContent = dict.navMarcas;
    const navMotion = document.querySelector('nav.menu a[href*="motion"]');
    if (navMotion) navMotion.textContent = dict.navMotion;
    const navEventos = document.querySelector('nav.menu a[href*="eventos"]');
    if (navEventos) navEventos.textContent = dict.navEventos;
    const navAbout = document.querySelector('nav.menu a[href*="about"]');
    if (navAbout) navAbout.textContent = dict.navAbout;

    // 2. Atualizar Hero Sections das páginas
    const homeSub = document.querySelector('.home-hero-subtitle');
    if (homeSub) homeSub.textContent = dict.homeHeroSub;

    const homeBtnM = document.querySelector('.home-btn-primary');
    if (homeBtnM) homeBtnM.innerHTML = dict.homeBtnMarcas;
    const homeBtnD = document.querySelector('.home-btn-secondary');
    if (homeBtnD) homeBtnD.innerHTML = dict.homeBtnDownloads;

    const homeSecTag = document.querySelector('.home-section-tag');
    if (homeSecTag) homeSecTag.textContent = dict.homeSectionTag;
    const homeSecTitle = document.querySelector('.home-section-title');
    if (homeSecTitle) homeSecTitle.textContent = dict.homeSectionTitle;

    // Bento Pillars no index
    const pillars = document.querySelectorAll('.home-pillar-card');
    if (pillars.length >= 4) {
      // 0: Marcas
      const p0Title = pillars[0].querySelector('.home-pillar-title');
      const p0Desc = pillars[0].querySelector('.home-pillar-desc');
      const p0Btn = pillars[0].querySelector('.home-pillar-bottom span');
      if (p0Title) p0Title.textContent = dict.homePillarMarcasTitle;
      if (p0Desc) p0Desc.textContent = dict.homePillarMarcasDesc;
      if (p0Btn) p0Btn.textContent = dict.homePillarMarcasBtn;

      // 1: Motion
      const p1Title = pillars[1].querySelector('.home-pillar-title');
      const p1Desc = pillars[1].querySelector('.home-pillar-desc');
      const p1Btn = pillars[1].querySelector('.home-pillar-bottom span');
      if (p1Title) p1Title.textContent = dict.homePillarMotionTitle;
      if (p1Desc) p1Desc.textContent = dict.homePillarMotionDesc;
      if (p1Btn) p1Btn.textContent = dict.homePillarMotionBtn;

      // 2: Eventos
      const p2Title = pillars[2].querySelector('.home-pillar-title');
      const p2Desc = pillars[2].querySelector('.home-pillar-desc');
      const p2Btn = pillars[2].querySelector('.home-pillar-bottom span');
      if (p2Title) p2Title.textContent = dict.homePillarEventosTitle;
      if (p2Desc) p2Desc.textContent = dict.homePillarEventosDesc;
      if (p2Btn) p2Btn.textContent = dict.homePillarEventosBtn;

      // 3: Downloads
      const p3Title = pillars[3].querySelector('.home-pillar-title');
      const p3Desc = pillars[3].querySelector('.home-pillar-desc');
      const p3Btn = pillars[3].querySelector('.home-pillar-bottom span');
      if (p3Title) p3Title.textContent = dict.homePillarDownloadsTitle;
      if (p3Desc) p3Desc.innerHTML = dict.homePillarDownloadsDesc;
      if (p3Btn) p3Btn.textContent = dict.homePillarDownloadsBtn;
    }

    // Home Highlights
    const hlTag = document.querySelector('.home-highlights-tag');
    if (hlTag) hlTag.textContent = dict.homeHighlightsTag;
    const hlTitle = document.querySelector('.home-highlights-title');
    if (hlTitle) hlTitle.textContent = dict.homeHighlightsTitle;
    const hlSub = document.querySelector('.home-highlights-sub');
    if (hlSub) hlSub.textContent = dict.homeHighlightsSub;
    const hlSeeAll = document.querySelector('.home-see-all-marcas');
    if (hlSeeAll) hlSeeAll.innerHTML = dict.homeSeeAllMarcas;

    // Páginas de Categorias (Marcas / Motion / Eventos / Downloads)
    const pageCat = getPageCategory();
    const heroBadge = document.querySelector('.hero-banner-tag') || document.querySelector('.hero-badge');
    const heroTitle = document.querySelector('.hero-banner-title') || document.querySelector('.hero-title');
    const heroSub = document.querySelector('.hero-banner-sub') || document.querySelector('.hero-subtitle');

    if (pageCat === 'marcas') {
      if (heroBadge) heroBadge.innerHTML = dict.marcasBadge;
      if (heroTitle) heroTitle.textContent = dict.marcasTitle;
      if (heroSub) heroSub.textContent = dict.marcasSub;
    } else if (pageCat === 'motion') {
      if (heroBadge) heroBadge.innerHTML = dict.motionBadge;
      if (heroTitle) heroTitle.textContent = dict.motionTitle;
      if (heroSub) heroSub.textContent = dict.motionSub;
    } else if (pageCat === 'eventos') {
      if (heroBadge) heroBadge.innerHTML = dict.eventosBadge;
      if (heroTitle) heroTitle.textContent = dict.eventosTitle;
      if (heroSub) heroSub.textContent = dict.eventosSub;
    }

    // Downloads page elements
    const dlBadge = document.querySelector('.library-badge');
    if (dlBadge) dlBadge.innerHTML = dict.downloadsBadge;
    const dlTitle = document.querySelector('.library-title');
    if (dlTitle) dlTitle.textContent = dict.downloadsTitle;
    const dlSub = document.querySelector('.library-subtitle');
    if (dlSub) dlSub.textContent = dict.downloadsSub;

    const dlSearch = document.getElementById('librarySearch');
    if (dlSearch) dlSearch.placeholder = dict.downloadsSearchPlaceholder;

    // Filtros de Downloads
    const filterAll = document.querySelector('.filter-chip[data-category="all"]');
    if (filterAll) filterAll.textContent = dict.downloadsFilterAll;
    const filterApps = document.querySelector('.filter-chip[data-category="apps"]');
    if (filterApps) filterApps.textContent = dict.downloadsFilterApps;

    // Textos de botões de download nos cards respeitando o actionType
    document.querySelectorAll('.resource-card').forEach(card => {
      const actionType = card.dataset.actionType || 'download';
      const btnSpan = card.querySelector('.btn-download-text');
      const btnIcon = card.querySelector('.btn-lib-download i');
      if (btnSpan) {
        if (actionType === 'buy') {
          btnSpan.textContent = dict.downloadsBtnBuy || 'Comprar';
          if (btnIcon) btnIcon.className = 'fas fa-shopping-cart';
        } else if (actionType === 'access') {
          btnSpan.textContent = dict.downloadsBtnAccess || 'Acessar';
          if (btnIcon) btnIcon.className = 'fas fa-arrow-up-right-from-square';
        } else {
          btnSpan.textContent = dict.downloadsBtnDownload || 'Baixar';
          if (btnIcon) btnIcon.className = 'fas fa-download';
        }
      }
    });

    const dlCloseBtns = document.querySelectorAll('.btn-secondary[onclick="closeResourceModal()"]');
    dlCloseBtns.forEach(btn => btn.textContent = dict.downloadsModalClose);

    const emptyNoticeTitle = document.querySelector('#emptyLibraryNotice h3');
    if (emptyNoticeTitle) emptyNoticeTitle.textContent = dict.downloadsEmptyTitle;
    const emptyNoticeDesc = document.querySelector('#emptyLibraryNotice p');
    if (emptyNoticeDesc) emptyNoticeDesc.textContent = dict.downloadsEmptyDesc;

    const noResultsTitle = document.querySelector('#noResultsNotice h3');
    if (noResultsTitle) noResultsTitle.textContent = dict.downloadsNoResults;

    // About Page
    const aboutHeading = document.querySelector('.about-content-main h1');
    if (aboutHeading) aboutHeading.textContent = dict.aboutTitle;

    const skillTitles = document.querySelectorAll('.skills-title');
    if (skillTitles.length >= 2) {
      skillTitles[0].innerHTML = dict.aboutServicesTitle;
      skillTitles[1].innerHTML = dict.aboutToolsTitle;
    }

    const skillBadges = document.querySelectorAll('.skill-badge');
    skillBadges.forEach(badge => {
      const text = badge.textContent.trim();
      if (lang === 'en') {
        if (text === 'Edição Comercial') badge.textContent = 'Commercial Editing';
        if (text === '3D (em breve)') badge.textContent = '3D (coming soon)';
      } else {
        if (text === 'Commercial Editing') badge.textContent = 'Edição Comercial';
        if (text === '3D (coming soon)') badge.textContent = '3D (em breve)';
      }
    });

    const aboutParas = document.querySelectorAll('.about-content-main .about-text');
    if (aboutParas.length >= 4) {
      aboutParas[0].innerHTML = dict.aboutP1;
      aboutParas[1].innerHTML = dict.aboutP2;
      aboutParas[2].innerHTML = dict.aboutP3;
      aboutParas[3].innerHTML = dict.aboutP4;
    }

    const statLabels = document.querySelectorAll('.stat-label');
    const statNumbers = document.querySelectorAll('.stat-number');
    if (statLabels.length >= 3 && statNumbers.length >= 3) {
      statNumbers[0].textContent = dict.aboutStat1Num;
      statLabels[0].textContent = dict.aboutStat1Lbl;
      statNumbers[1].textContent = dict.aboutStat2Num;
      statLabels[1].textContent = dict.aboutStat2Lbl;
      statNumbers[2].textContent = dict.aboutStat3Num;
      statLabels[2].textContent = dict.aboutStat3Lbl;
    }

    const quoteText = document.querySelector('.quote-text');
    if (quoteText) quoteText.textContent = dict.aboutQuoteText;
    const quoteRef = document.querySelector('.quote-ref');
    if (quoteRef) quoteRef.textContent = dict.aboutQuoteRef;

    // Footer
    const footerText = document.querySelector('.footer-text');
    if (footerText) footerText.textContent = dict.footerCopyright;

    // Empty video notice
    const emptyNotice = document.getElementById('emptyNotice');
    if (emptyNotice) {
      const h3 = emptyNotice.querySelector('h3');
      const p = emptyNotice.querySelector('p');
      if (h3) h3.textContent = dict.emptyGridTitle;
      if (p) p.textContent = pageCat === 'home' ? dict.emptyHomeSub : dict.emptyGridSub;
    }

    // Botões de alternar idioma
    updateAllLangButtons(lang);
  }

  function initLanguageToggle() {
    const saved = getActiveLang();
    applyLanguage(saved);

    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const curr = btn.getAttribute('data-lang') || getActiveLang();
        const next = curr === 'pt' ? 'en' : 'pt';
        localStorage.setItem('giffu_lang', next);
        applyLanguage(next);
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

  // Sincronização de idioma entre abas
  window.addEventListener('storage', (e) => {
    if (e.key === 'giffu_lang') {
      applyLanguage(e.newValue || 'pt');
    }
  });

  window.GiffuI18n = {
    getActiveLang,
    applyLanguage,
    I18N_DATA
  };

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

  // Sincronização em tempo real instantânea entre abas e mudanças no Admin
  window.addEventListener('storage', (e) => {
    if (e.key === 'giffu_videos') {
      const category = getPageCategory();
      if (!category) return;
      try {
        const parsed = JSON.parse(e.newValue);
        if (Array.isArray(parsed)) {
          renderGrid(category, parsed);
          return;
        }
      } catch (err) {}
      loadVideos();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadVideos();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();

