// Main Application Controller for Giffú Entrega

const APP_CATEGORIES = [
  { 
    id: 'Eventos', 
    name: 'Eventos', 
    svg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>' 
  },
  { 
    id: 'Marcas', 
    name: 'Marcas', 
    svg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg>' 
  },
  { 
    id: 'IURD', 
    name: 'IURD', 
    svg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M10 2v2.26L7.5 3.14 6.09 4.55l2.5 1.25L6 7.05v2.95H3v12h18V10h-3V7.05l-2.59-1.25 2.5-1.25-1.41-1.41L14 4.26V2h-4zm-5 10h2v2H5v-2zm0 4h2v2H5v-2zm6-4h2v2h-2v-2zm0 4h2v2h-2v-2zm6-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>' 
  },
  { 
    id: 'Pessoal', 
    name: 'Pessoal', 
    svg: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>' 
  }
];

class EntregaApp {
  constructor() {
    this.data = null;
    this.currentView = 'author_lobby'; // 'author_lobby' | 'author' | 'client_gallery' | 'client_player'
    this.selectedProject = null;
    this.selectedVideo = null;
    this.playerInstance = null;
    this.commentsController = null;
    this.isClientMode = false;
    this.unlockedSlugs = new Set();
    this.authorSession = null; // preenchido apenas com sessão Google verificada pelo servidor
    this.mediaFilter = 'all'; // 'all' | 'video' | 'image'
    this.lobbyFilter = 'all'; // 'all' | 'active' | 'archived'
    this.lobbyCategoryFilter = 'all'; // 'all' | 'Eventos' | 'Marcas' | 'IURD' | 'Pessoal'
    this.lobbySearchQuery = '';
    this.commentsVisible = false; // Oculta por padrão para dar mais espaço ao player
    this.isSelectionMode = false;
    this.selectedMediaIds = new Set();

    this.init();
  }

  loadAuthorSession() {
    const user = window.Auth && window.Auth.user;
    return user && user.isAuthor && user.email === 'novelfilmes@gmail.com' ? user : null;
  }

  loginAuthor(user) {
    if (!user || user.email !== 'novelfilmes@gmail.com') {
      window.showToast('Apenas novelfilmes@gmail.com pode acessar como autor');
      return;
    }
    this.authorSession = user;
    window.showToast(`Conectado como ${user.email}`);
    this.render();
  }

  async logoutAuthor() {
    await window.Auth.logout();
    this.authorSession = null;
    window.showToast('Sessão encerrada');
    this.render();
  }

  bindAuthorLoginGateEvents() {
    const btnConnect = document.getElementById('btnConnectAuthorDriveGoogle');
    const errorEl = document.getElementById('authorLoginError');
    const noticeEl = document.getElementById('authorGateNotice');

    const currentUser = window.Auth && window.Auth.user;
    if (noticeEl) {
      if (currentUser && currentUser.email !== 'novelfilmes@gmail.com') {
        noticeEl.style.display = 'block';
        noticeEl.innerHTML = `Conectado atualmente como <strong>${currentUser.email}</strong> (modo cliente).<br>O Modo Autor exige login exclusivamente com <strong>novelfilmes@gmail.com</strong>.`;
      } else {
        noticeEl.style.display = 'none';
      }
    }

    if (btnConnect) {
      btnConnect.onclick = async () => {
        if (errorEl) errorEl.textContent = '';
        btnConnect.disabled = true;
        try {
          const user = await window.Auth.signIn('author', { switchAccount: true });
          if (!user || user.email !== 'novelfilmes@gmail.com') {
            throw new Error('Apenas novelfilmes@gmail.com pode fazer login como autor.');
          }
          this.loginAuthor(user);
        } catch (err) {
          if (errorEl && err.message !== 'Login cancelado') {
            errorEl.textContent = err.message || 'Não foi possível entrar com o Google.';
          }
        } finally {
          btnConnect.disabled = false;
        }
      };
    }
  }

  async init() {
    this.setupTheme();
    this.setupMobileOrientationGuard();
    await window.Auth.init();
    this.authorSession = this.loadAuthorSession();
    await this.fetchData();
    this.detectRoute();
    this.bindGlobalEvents();
  }

  setupMobileOrientationGuard() {
    const lockPortrait = () => {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(() => {});
      }
    };

    // Attempt lock portrait early and on user interaction
    lockPortrait();
    window.addEventListener('click', lockPortrait, { passive: true });
    window.addEventListener('touchstart', lockPortrait, { passive: true });

    const guard = document.getElementById('mobilePortraitGuard');
    const btnGuardWatch = document.getElementById('btnGuardWatchFullscreen');

    if (btnGuardWatch) {
      btnGuardWatch.onclick = () => {
        if (this.playerInstance) {
          const info = this.playerInstance.getOrientationInfo();
          this.playerInstance.play();
          this.playerInstance.enterFullscreen(info.direction);
          if (guard) guard.style.display = 'none';
        }
      };
    }

    const checkOrientation = () => {
      const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (!isMobile) {
        if (guard) guard.style.display = 'none';
        return;
      }

      let angle = 0;
      let type = '';
      if (screen.orientation) {
        angle = screen.orientation.angle || 0;
        type = screen.orientation.type || '';
      } else if (typeof window.orientation !== 'undefined') {
        angle = window.orientation;
      }
      if (angle === -90) angle = 270;

      const isLandscape = (angle === 90 || angle === 270 || type.startsWith('landscape') || (window.innerWidth > window.innerHeight && window.innerHeight < 600));

      const isVideoFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        (this.playerInstance && this.playerInstance.video && this.playerInstance.video.webkitDisplayingFullscreen) ||
        document.body.classList.contains('video-fullscreen-active')
      );

      const isVideoPlaying = !!(
        this.playerInstance &&
        this.playerInstance.video &&
        !this.playerInstance.video.paused &&
        !this.playerInstance.video.ended
      );

      if (isLandscape) {
        if (isVideoPlaying) {
          // Playing video: fullscreen in the direction rotated
          if (guard) guard.style.display = 'none';
          if (this.playerInstance && !isVideoFullscreen) {
            const direction = (angle === 270 || type === 'landscape-secondary') ? 'landscape-secondary' : 'landscape-primary';
            this.playerInstance.enterFullscreen(direction);
          }
        } else if (isVideoFullscreen) {
          // Already in fullscreen
          if (guard) guard.style.display = 'none';
        } else {
          // On mobile in landscape, but no video playing:
          // Keep page from turning by showing the guard
          if (guard) {
            guard.style.display = 'flex';
            if (btnGuardWatch) {
              btnGuardWatch.style.display = (this.playerInstance && this.playerInstance.video) ? 'inline-flex' : 'none';
            }
          }
        }
      } else {
        // Portrait mode
        if (guard) guard.style.display = 'none';
        if (this.playerInstance && isVideoFullscreen) {
          this.playerInstance.exitFullscreen();
        }
      }
    };

    window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 150));
    if (screen.orientation) {
      screen.orientation.addEventListener('change', () => setTimeout(checkOrientation, 100));
    }
    window.addEventListener('resize', checkOrientation);
    document.addEventListener('fullscreenchange', checkOrientation);
    document.addEventListener('webkitfullscreenchange', checkOrientation);
  }

  setupTheme() {
    const savedTheme = localStorage.getItem('giffu_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcon(savedTheme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('giffu_theme', next);
    this.updateThemeIcon(next);
  }

  updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    if (theme === 'light') {
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>`;
      btn.title = "Alternar para Modo Escuro";
    } else {
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>`;
      btn.title = "Alternar para Modo Claro";
    }
  }

  async fetchData() {
    try {
      this.data = await window.API.getData();
      if (this.data && Array.isArray(this.data.projects)) {
        this.data.projects.sort((a, b) => 
          (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
        );
      }
    } catch (e) {
      console.error('Erro ao buscar dados:', e);
    }
  }

  detectRoute() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);

    let slug = null;
    let videoId = null;

    const searchParams = new URLSearchParams(window.location.search);
    const pParam = searchParams.get('p');
    if (pParam) {
      const pParts = pParam.split('/').filter(Boolean);
      slug = pParts[0];
      videoId = pParts[1];
      try {
        const cleanPath = '/entrega/' + pParts.join('/') + window.location.hash;
        window.history.replaceState(null, '', cleanPath);
      } catch (e) {}
    } else if (parts[0] === 'entrega' && parts[1]) {
      slug = parts[1];
      videoId = parts[2];
    } else if (/^\d{4}$/.test(parts[0]) && parts[1]) {
      slug = parts[1];
      videoId = parts[2];
    }

    if (slug) {
      const proj = (this.data.projects || []).find(p => p.slug === slug);
      if (proj) {
        this.selectedProject = proj;
        this.isClientMode = true;

        if (videoId) {
          const vid = proj.videos.find(v => v.id === videoId);
          if (vid) {
            this.selectedVideo = vid;
            this.currentView = 'client_player';
          } else {
            this.currentView = 'client_gallery';
          }
        } else {
          this.currentView = 'client_gallery';
        }
        this.render();
        return;
      }
    }

    // Default to Author view: homepage is the directories lobby
    this.isClientMode = false;
    const authorProjParam = searchParams.get('project');
    const authorVidParam = searchParams.get('video');

    if (authorProjParam) {
      const proj = (this.data.projects || []).find(p => p.id === authorProjParam || p.slug === authorProjParam);
      if (proj) {
        this.selectedProject = proj;
        if (authorVidParam) {
          const vid = (proj.videos || []).find(v => v.id === authorVidParam);
          if (vid) {
            this.selectedVideo = vid;
            this.currentView = 'client_player';
            this.render();
            return;
          }
        }
        this.currentView = 'author';
        this.render();
        return;
      }
    }

    if (!this.selectedProject) {
      this.currentView = 'author_lobby';
    } else {
      this.currentView = 'author';
    }
    this.render();
  }

  navigateTo(path) {
    window.history.pushState({}, '', path);
    this.detectRoute();
  }

  render() {
    const loginGate = document.getElementById('authorLoginGate');
    const appContainer = document.querySelector('.app-container');

    // If Author mode and NOT logged in with Google: show login gate
    if (!this.isClientMode && !this.authorSession) {
      if (loginGate) loginGate.style.display = 'flex';
      if (appContainer) appContainer.style.display = 'none';
      this.bindAuthorLoginGateEvents();
      return;
    }

    // Otherwise hide login gate and show app
    if (loginGate) loginGate.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';

    this.renderHeader();

    const sidebar = document.getElementById('authorSidebar');
    if (this.isClientMode) {
      if (sidebar) sidebar.style.display = 'none';
    } else {
      if (sidebar) sidebar.style.display = 'flex';
      this.renderSidebar();
    }

    // If client mode and protected with password
    if (this.isClientMode && this.selectedProject && this.selectedProject.password && !this.unlockedSlugs.has(this.selectedProject.slug)) {
      this.renderPasswordGate();
      return;
    }

    const mainContainer = document.getElementById('mainContentArea');
    if (!mainContainer) return;

    this.updateDocumentTitle();

    if (this.currentView === 'client_player') {
      this.renderPlayerDetailView(mainContainer);
    } else if (this.currentView === 'author_lobby' || (!this.isClientMode && !this.selectedProject)) {
      this.renderDirectoryLobby(mainContainer);
    } else {
      this.renderGalleryView(mainContainer);
    }
  }

  updateDocumentTitle() {
    const hideGiffu = this.isClientMode && (this.selectedProject ? (this.selectedProject.hideBrandName !== false) : true);
    const defaultAppTitle = hideGiffu ? 'Entrega' : 'Giffú Entrega';

    if (this.currentView === 'client_player' && this.selectedVideo) {
      document.title = this.selectedVideo.title;
    } else if (this.selectedProject) {
      document.title = this.selectedProject.name;
    } else {
      document.title = defaultAppTitle;
    }
  }

  renderHeader() {
    const brandElement = document.getElementById('headerBrand');
    const headerRight = document.getElementById('headerRight');

    if (!headerRight || !brandElement) return;

    if (this.isClientMode) {
      const clientName = this.selectedProject ? (this.selectedProject.clientName || 'Cliente') : 'Entrega';
      headerRight.innerHTML = `<span class="client-name-display">${clientName}</span>`;

      // Hide Giffú name for client: only "Entrega" is displayed in the brand title
      const hideGiffu = this.selectedProject ? (this.selectedProject.hideBrandName !== false) : true;
      if (hideGiffu) {
        brandElement.innerHTML = `
          <div class="brand-badge">
            <span>Entrega</span>
          </div>
        `;
      } else {
        brandElement.innerHTML = `
          <div class="brand-badge">
            <span>Giffú</span>
            <span class="app-subtitle">Entrega</span>
          </div>
        `;
      }
    } else {
      brandElement.innerHTML = `
        <div class="brand-badge">
          <span>Giffú</span>
          <span class="app-subtitle">Entrega</span>
        </div>
      `;

      headerRight.innerHTML = `
        <span class="header-mode-tag">Versão Autor</span>
        <button class="btn-mode-switch" id="btnPreviewClient" title="Ver exatamente o que o cliente vê">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          Visualizar como Cliente
        </button>
      `;

      document.getElementById('btnPreviewClient')?.addEventListener('click', () => {
        if (this.selectedProject) {
          this.navigateTo(`/entrega/${this.selectedProject.slug}`);
        }
      });
    }

    brandElement.style.cursor = 'pointer';
    brandElement.title = this.isClientMode ? 'Voltar para a entrega' : 'Ir para o lobby de diretórios';
    brandElement.onclick = (e) => {
      e.preventDefault();
      if (this.isClientMode) {
        if (this.selectedProject) {
          this.navigateTo(`/entrega/${this.selectedProject.slug}`);
        }
      } else {
        this.goToLobby();
      }
    };
  }

  goToLobby() {
    if (this.playerInstance) {
      this.playerInstance.destroy();
      this.playerInstance = null;
    }
    this.cleanupPhotoFullscreen();
    this.selectedProject = null;
    this.selectedVideo = null;
    this.isSelectionMode = false;
    this.selectedMediaIds.clear();
    this.currentView = 'author_lobby';
    window.history.pushState({}, '', '/author');
    this.render();
  }

  openProject(proj) {
    if (this.playerInstance) {
      this.playerInstance.destroy();
      this.playerInstance = null;
    }
    this.cleanupPhotoFullscreen();
    this.selectedProject = proj;
    this.selectedVideo = null;
    this.isSelectionMode = false;
    this.selectedMediaIds.clear();
    this.currentView = 'author';
    this.render();
  }

  getUnresolvedCommentsCount(videoId) {
    if (!this.data || !this.data.comments) return 0;
    return this.data.comments.filter(c => c.videoId === videoId && !c.resolved).length;
  }

  getUnresolvedCommentsCountForProject(projectId) {
    if (!this.data || !this.data.comments) return 0;
    return this.data.comments.filter(c => c.projectId === projectId && !c.resolved).length;
  }

  renderSidebar() {
    const treeContainer = document.getElementById('directoryTree');
    if (!treeContainer || !this.data) return;

    const currentYear = new Date().getFullYear().toString();
    const allProjects = this.data.projects || [];
    const activeProjects = allProjects.filter(p => !p.archived);
    const archivedProjects = allProjects.filter(p => p.archived);

    let html = `
      <div class="sidebar-lobby-item ${!this.selectedProject ? 'active' : ''}" id="btnSidebarLobby" title="Ver todos os diretórios">
        <div class="sidebar-lobby-left">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          <span>Todos os Diretórios</span>
        </div>
        <span class="lobby-total-count">${allProjects.length}</span>
      </div>
    `;

    html += APP_CATEGORIES.map(cat => {
      const projsInCat = activeProjects.filter(p => (p.category || 'Eventos') === cat.name);
      const isSelectedInCat = this.selectedProject && (this.selectedProject.category || 'Eventos') === cat.name;
      const catYears = Array.from(new Set([currentYear, ...projsInCat.map(p => p.year || currentYear)]))
        .sort((a, b) => b.localeCompare(a));

      return `
        <div class="category-group ${!isSelectedInCat && projsInCat.length === 0 ? 'collapsed' : ''}" data-category="${cat.name}">
          <div class="category-header" data-category="${cat.name}" title="Clique para recolher ou arraste um diretório para cá">
            <div class="category-header-left">
              <span class="category-arrow">▼</span>
              <span class="category-icon">${cat.svg}</span>
              <span class="category-title">${cat.name}</span>
            </div>
            <span class="category-count">${projsInCat.length}</span>
          </div>

          <div class="category-body">
            ${projsInCat.length === 0 ? `
              <div class="category-empty-drop" data-category="${cat.name}">
                Nenhum diretório (arraste para cá)
              </div>
            ` : catYears.map(yr => {
              const projsInYear = projsInCat
                .filter(p => (p.year || currentYear) === yr)
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
              if (projsInYear.length === 0 && yr !== currentYear) return '';
              return `
                <div class="year-group" data-year="${yr}">
                  <div class="year-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="year-arrow">▼</span>
                    <span>${yr}</span>
                  </div>
                  <div class="year-projects">
                    ${projsInYear.length === 0 ? `
                      <div class="empty-year-hint">Sem diretórios em ${yr}</div>
                    ` : projsInYear.map(p => {
                      const unresolvedInDir = this.getUnresolvedCommentsCountForProject(p.id);
                      return `
                        <div class="project-item ${this.selectedProject && this.selectedProject.id === p.id ? 'active' : ''}" 
                             data-id="${p.id}" 
                             draggable="true" 
                             title="${p.name} (Arraste para mover de categoria)">
                          <div class="project-item-left">
                            ${unresolvedInDir > 0 ? `
                              <span class="dir-unresolved-badge" title="${unresolvedInDir} comentário${unresolvedInDir > 1 ? 's' : ''} a resolver">${unresolvedInDir}</span>
                            ` : ''}
                            <span class="proj-label">${p.name}</span>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Add Archive Section in Sidebar
    html += `
      <div class="archive-section ${archivedProjects.length === 0 ? 'collapsed' : ''}" id="archiveSection">
        <div class="archive-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="archive-header-left">
            <span class="year-arrow">▼</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>
            <span>Arquivo</span>
          </div>
          <span class="archive-count">${archivedProjects.length}</span>
        </div>
        <div class="archive-projects">
          ${archivedProjects.length === 0 ? `
            <div style="font-size: 11px; color: var(--text-muted); padding: 8px 10px;">Nenhum projeto arquivado</div>
          ` : [...archivedProjects].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })).map(p => {
            const unresolvedInDir = this.getUnresolvedCommentsCountForProject(p.id);
            return `
            <div class="project-item ${this.selectedProject && this.selectedProject.id === p.id ? 'active' : ''}" data-id="${p.id}" title="${p.name}">
              <div class="project-item-left">
                ${unresolvedInDir > 0 ? `
                  <span class="dir-unresolved-badge" title="${unresolvedInDir} comentário${unresolvedInDir > 1 ? 's' : ''} a resolver">${unresolvedInDir}</span>
                ` : ''}
                <span class="proj-label">${p.name}</span>
              </div>
            </div>
          `;}).join('')}
        </div>
      </div>
    `;

    treeContainer.innerHTML = html;

    // Attach click events
    document.getElementById('btnSidebarLobby')?.addEventListener('click', () => {
      this.goToLobby();
    });

    treeContainer.querySelectorAll('.category-header').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        const group = hdr.closest('.category-group');
        if (group) group.classList.toggle('collapsed');
      });
    });

    treeContainer.querySelectorAll('.project-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        const proj = this.data.projects.find(p => p.id === id);
        if (proj) {
          this.openProject(proj);
        }
      });
    });

    // Render author profile in sidebar footer
    const authorAvatar = document.getElementById('sidebarAuthorAvatar');
    const authorName = document.getElementById('sidebarAuthorName');
    const authorEmail = document.getElementById('sidebarAuthorEmail');
    if (authorAvatar) authorAvatar.src = (this.authorSession && this.authorSession.avatar) || this.data?.settings?.authorAvatar || 'https://lh3.googleusercontent.com/a/default-user=s96-c';
    if (authorName) authorName.textContent = (this.authorSession && this.authorSession.name) || this.data?.settings?.authorName || 'Giffú';
    if (authorEmail) authorEmail.textContent = (this.authorSession && this.authorSession.email) || this.data?.settings?.authorEmail || 'novelfilmes@gmail.com';

    document.getElementById('btnSidebarLogout')?.addEventListener('click', () => {
      this.logoutAuthor();
    });

    this.attachDragAndDropHandlers();
  }

  attachDragAndDropHandlers() {
    // Draggable elements (both in sidebar tree and in lobby pastinhas)
    const draggableItems = document.querySelectorAll('.project-item[draggable="true"], .folder-card[draggable="true"]');
    draggableItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const id = item.getAttribute('data-id');
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('is-dragging');
        document.body.classList.add('is-dragging-directory');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('is-dragging');
        document.body.classList.remove('is-dragging-directory');
        document.querySelectorAll('.is-drag-over').forEach(el => el.classList.remove('is-drag-over'));
      });
    });

    // Drop target elements (Category headers, drop boxes, and category buttons)
    const dropTargets = document.querySelectorAll('[data-category]');
    dropTargets.forEach(target => {
      target.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      target.addEventListener('dragenter', (e) => {
        e.preventDefault();
        target.classList.add('is-drag-over');
      });

      target.addEventListener('dragleave', (e) => {
        if (!target.contains(e.relatedTarget)) {
          target.classList.remove('is-drag-over');
        }
      });

      target.addEventListener('drop', async (e) => {
        e.preventDefault();
        target.classList.remove('is-drag-over');
        const projId = e.dataTransfer.getData('text/plain');
        const targetCategory = target.getAttribute('data-category');
        if (projId && targetCategory) {
          await this.moveProjectToCategory(projId, targetCategory);
        }
      });
    });
  }

  async moveProjectToCategory(projId, targetCategory) {
    if (!this.data || !this.data.projects) return;
    const proj = this.data.projects.find(p => p.id === projId);
    if (!proj) return;

    const currentCat = proj.category || 'Eventos';
    if (currentCat === targetCategory) {
      window.showToast(`O diretório já está em "${targetCategory}"`);
      return;
    }

    try {
      proj.category = targetCategory;
      await window.API.updateProjectCategory(projId, targetCategory);
      window.showToast(`Diretório movido para "${targetCategory}" ✓`);
      this.renderSidebar();
      if (!this.selectedProject) {
        const lobbyContainer = document.getElementById('authorLobbyContainer');
        if (lobbyContainer) this.renderDirectoryLobby(lobbyContainer);
      }
    } catch (err) {
      alert('Erro ao mover diretório: ' + err.message);
    }
  }

  renderDirectoryLobby(container) {
    if (this.playerInstance) {
      this.playerInstance.destroy();
      this.playerInstance = null;
    }
    this.cleanupPhotoFullscreen();

    const allProjects = this.data?.projects || [];
    const activeProjects = allProjects.filter(p => !p.archived);
    const archivedProjects = allProjects.filter(p => p.archived);

    // Compute stats
    let totalVideos = 0;
    let totalPhotos = 0;
    let totalUnresolvedComments = 0;

    allProjects.forEach(p => {
      const items = p.videos || [];
      totalVideos += items.filter(v => v.type !== 'image').length;
      totalPhotos += items.filter(v => v.type === 'image').length;
      totalUnresolvedComments += this.getUnresolvedCommentsCountForProject(p.id);
    });

    const searchQuery = (this.lobbySearchQuery || '').trim().toLowerCase();
    const projectsWithPending = allProjects.filter(p => this.getUnresolvedCommentsCountForProject(p.id) > 0);

    const filteredProjects = allProjects.filter(p => {
      // Tab filter
      if (this.lobbyFilter === 'active' && p.archived) return false;
      if (this.lobbyFilter === 'archived' && !p.archived) return false;
      if (this.lobbyFilter === 'pending' && this.getUnresolvedCommentsCountForProject(p.id) === 0) return false;

      // Category filter
      if (this.lobbyCategoryFilter && this.lobbyCategoryFilter !== 'all') {
        if ((p.category || 'Eventos') !== this.lobbyCategoryFilter) return false;
      }

      // Search filter
      if (searchQuery) {
        const nameMatch = (p.name || '').toLowerCase().includes(searchQuery);
        const clientMatch = (p.clientName || '').toLowerCase().includes(searchQuery);
        const slugMatch = (p.slug || '').toLowerCase().includes(searchQuery);
        const yearMatch = (p.year || '').toString().toLowerCase().includes(searchQuery);
        const catMatch = (p.category || 'Eventos').toLowerCase().includes(searchQuery);
        return nameMatch || clientMatch || slugMatch || yearMatch || catMatch;
      }
      return true;
    });

    filteredProjects.sort((a, b) => 
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );

    container.innerHTML = `
      <div class="lobby-wrapper">
        <!-- Lobby Top Header -->
        <div class="lobby-header">
          <div class="lobby-header-left">
            <div class="lobby-title-row">
              <div class="lobby-icon-badge">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
              </div>
              <h1 class="lobby-title">Diretórios de Entrega</h1>
              <span class="lobby-count-pill">${allProjects.length}</span>
            </div>
            <p class="lobby-subtitle">Visão geral dos diretórios espelhados do Google Drive para entrega aos clientes.</p>
          </div>
          <div class="lobby-header-right">
            <button class="btn-primary" id="btnLobbyAddDirectory">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Novo Diretório
            </button>
          </div>
        </div>

        <!-- Metric KPI Cards -->
        <div class="lobby-stats-grid">
          <div class="lobby-stat-card">
            <div class="lobby-stat-icon folder-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            </div>
            <div class="lobby-stat-info">
              <span class="lobby-stat-value">${activeProjects.length}</span>
              <span class="lobby-stat-label">Diretórios Ativos</span>
            </div>
          </div>

          <div class="lobby-stat-card">
            <div class="lobby-stat-icon media-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg>
            </div>
            <div class="lobby-stat-info">
              <span class="lobby-stat-value">${totalVideos + totalPhotos}</span>
              <span class="lobby-stat-label">${totalVideos} vídeos • ${totalPhotos} fotos</span>
            </div>
          </div>

          <div class="lobby-stat-card ${totalUnresolvedComments > 0 ? 'has-unresolved' : ''}">
            <div class="lobby-stat-icon comment-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z"/></svg>
            </div>
            <div class="lobby-stat-info">
              <div class="lobby-stat-unresolved-row">
                <span class="lobby-stat-value">${totalUnresolvedComments}</span>
                ${totalUnresolvedComments > 0 ? '<span class="lobby-stat-dot"></span>' : ''}
              </div>
              <span class="lobby-stat-label">${totalUnresolvedComments === 1 ? 'Comentário a resolver' : 'Comentários a resolver'}</span>
            </div>
          </div>
        </div>

        <!-- Filter & Search Bar -->
        <div class="lobby-toolbar">
          <div class="lobby-search-box">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input type="text" id="inputLobbySearch" placeholder="Buscar por pasta, cliente, ano..." value="${this.lobbySearchQuery || ''}" />
            ${this.lobbySearchQuery ? `<button class="clear-search-btn" id="btnClearLobbySearch" title="Limpar busca">×</button>` : ''}
          </div>

          <div class="lobby-filter-tabs">
            <button class="filter-tab ${this.lobbyFilter === 'all' ? 'active' : ''}" data-filter="all">
              Todos <span class="tab-badge">${allProjects.length}</span>
            </button>
            <button class="filter-tab ${this.lobbyFilter === 'pending' ? 'active' : ''}" data-filter="pending">
              ${projectsWithPending.length > 0 ? '<span class="filter-red-dot"></span>' : ''}
              Com Pendências <span class="tab-badge">${projectsWithPending.length}</span>
            </button>
            <button class="filter-tab ${this.lobbyFilter === 'active' ? 'active' : ''}" data-filter="active">
              Ativos <span class="tab-badge">${activeProjects.length}</span>
            </button>
            <button class="filter-tab ${this.lobbyFilter === 'archived' ? 'active' : ''}" data-filter="archived">
              Arquivados <span class="tab-badge">${archivedProjects.length}</span>
            </button>
          </div>
        </div>

        <!-- Category Filter Bar -->
        <div class="lobby-category-bar">
          <button class="category-tab-btn ${(!this.lobbyCategoryFilter || this.lobbyCategoryFilter === 'all') ? 'active' : ''}" data-cat-filter="all">
            Todas Categorias <span class="cat-badge">${allProjects.length}</span>
          </button>
          ${APP_CATEGORIES.map(cat => {
            const countInCat = allProjects.filter(p => (p.category || 'Eventos') === cat.name).length;
            return `
              <button class="category-tab-btn ${this.lobbyCategoryFilter === cat.name ? 'active' : ''}" 
                      data-cat-filter="${cat.name}" 
                      data-category="${cat.name}"
                      title="Filtrar por ${cat.name} ou arraste um diretório para cá">
                ${cat.svg}
                <span>${cat.name}</span>
                <span class="cat-badge">${countInCat}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Folders Grid / Lobby Pastinhas -->
        ${filteredProjects.length === 0 ? `
          <div class="lobby-empty-state">
            <div class="lobby-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            </div>
            <h3>${allProjects.length === 0 ? 'Nenhum diretório cadastrado' : 'Nenhum diretório encontrado'}</h3>
            <p>${allProjects.length === 0 ? 'Espelhe seu primeiro diretório do Google Drive para começar a entregar aos clientes.' : 'Tente pesquisar por outro termo ou selecione outra aba de filtro.'}</p>
            ${allProjects.length === 0 ? `
              <button class="btn-primary" id="btnLobbyEmptyAdd" style="margin-top: 14px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Adicionar Primeiro Diretório
              </button>
            ` : `
              <button class="btn-secondary" id="btnResetLobbyFilters" style="margin-top: 14px;">
                Limpar Busca e Filtros
              </button>
            `}
          </div>
        ` : `
          <div class="lobby-folders-grid">
            ${filteredProjects.map(proj => {
              const unresolvedInDir = this.getUnresolvedCommentsCountForProject(proj.id);
              const items = proj.videos || [];
              const vCount = items.filter(v => v.type !== 'image').length;
              const iCount = items.filter(v => v.type === 'image').length;
              const clientUrl = `${window.location.origin}/entrega/${proj.slug}`;
              const customDisplayUrl = `https://${this.data?.settings?.baseDomain || 'giffu.com.br'}/entrega/${proj.slug}`;
              const currentYear = new Date().getFullYear().toString();

              return `
                <div class="folder-card ${proj.archived ? 'is-archived' : ''}" data-id="${proj.id}" draggable="true" title="${proj.name} (Arraste para mover de categoria)">
                  <!-- Folder Top Tab -->
                  <div class="folder-card-tab">
                    <span class="folder-tab-category">${proj.category || 'Eventos'}</span>
                    <span class="folder-tab-sep">•</span>
                    <span class="folder-tab-label">${proj.year || currentYear}</span>
                  </div>

                  <div class="folder-card-body">
                    <!-- Top Icon and Status Badges -->
                    <div class="folder-card-header">
                      <div class="folder-svg-wrapper">
                        <svg class="folder-main-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2.5 7C2.5 5.61929 3.61929 4.5 5 4.5H9.17157C9.83464 4.5 10.4706 4.76339 10.9393 5.23223L12.7071 7H19C20.3807 7 21.5 8.11929 21.5 9.5V17.5C21.5 18.8807 20.3807 20 19 20H5C3.61929 20 2.5 18.8807 2.5 17.5V7Z" fill="url(#folderGrad_${proj.id})" stroke="rgba(255,255,255,0.18)" stroke-width="1.2"/>
                          <path d="M2.5 10.5C2.5 9.39543 3.39543 8.5 4.5 8.5H19.5C20.6046 8.5 21.5 9.39543 21.5 10.5V17.5C21.5 18.8807 20.3807 20 19 20H5C3.61929 20 2.5 18.8807 2.5 17.5V10.5Z" fill="url(#folderFrontGrad_${proj.id})" fill-opacity="0.9" stroke="rgba(255,255,255,0.22)" stroke-width="1.2"/>
                          <defs>
                            <linearGradient id="folderGrad_${proj.id}" x1="2.5" y1="4.5" x2="21.5" y2="20" gradientUnits="userSpaceOnUse">
                              <stop stop-color="#FF7A30"/>
                              <stop offset="1" stop-color="#CC4000"/>
                            </linearGradient>
                            <linearGradient id="folderFrontGrad_${proj.id}" x1="2.5" y1="8.5" x2="21.5" y2="20" gradientUnits="userSpaceOnUse">
                              <stop stop-color="#FF9457"/>
                              <stop offset="1" stop-color="#D94800"/>
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>

                      <div class="folder-header-badges">
                        ${unresolvedInDir > 0 ? `
                          <div class="folder-badge-unresolved" title="${unresolvedInDir} comentário${unresolvedInDir > 1 ? 's' : ''} a resolver">
                            <span>${unresolvedInDir} ${unresolvedInDir === 1 ? 'pendente' : 'pendentes'}</span>
                          </div>
                        ` : ''}

                        ${proj.archived ? `
                          <div class="folder-badge-archived" title="Diretório Arquivado">Arquivado</div>
                        ` : ''}

                        ${proj.password ? `
                          <div class="folder-badge-locked" title="Protegido por senha">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                          </div>
                        ` : ''}
                      </div>
                    </div>

                    <!-- Folder Title & Meta -->
                    <div class="folder-content">
                      <h3 class="folder-name" title="${proj.name}">${proj.name}</h3>
                      <div class="folder-meta-row">
                        ${proj.clientName ? `<span class="folder-client-tag">${proj.clientName}</span>` : ''}
                        <span class="folder-files-count">
                          ${items.length === 0 ? 'Vazio' : `${vCount > 0 ? `${vCount} vídeo${vCount > 1 ? 's' : ''}` : ''}${vCount > 0 && iCount > 0 ? ' • ' : ''}${iCount > 0 ? `${iCount} foto${iCount > 1 ? 's' : ''}` : ''}`}
                        </span>
                      </div>
                    </div>

                    <!-- Folder Footer / Quick Actions -->
                    <div class="folder-footer">
                      <button class="btn-folder-copy" data-url="${clientUrl}" data-display-url="${customDisplayUrl}" title="Copiar link de entrega do cliente">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                        <span>Copiar Link</span>
                      </button>

                      <div class="folder-open-action">
                        <span>Abrir</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // Bind Lobby Events
    document.getElementById('btnLobbyAddDirectory')?.addEventListener('click', () => {
      this.openAddDirectoryModal();
    });

    document.getElementById('btnLobbyEmptyAdd')?.addEventListener('click', () => {
      this.openAddDirectoryModal();
    });

    const searchInput = document.getElementById('inputLobbySearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.lobbySearchQuery = e.target.value;
        this.renderDirectoryLobby(container);
        const newSearchInput = document.getElementById('inputLobbySearch');
        if (newSearchInput) {
          newSearchInput.focus();
          newSearchInput.setSelectionRange(newSearchInput.value.length, newSearchInput.value.length);
        }
      });
    }

    document.getElementById('btnClearLobbySearch')?.addEventListener('click', () => {
      this.lobbySearchQuery = '';
      this.renderDirectoryLobby(container);
    });

    document.getElementById('btnResetLobbyFilters')?.addEventListener('click', () => {
      this.lobbySearchQuery = '';
      this.lobbyFilter = 'all';
      this.renderDirectoryLobby(container);
    });

    container.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.lobbyFilter = tab.getAttribute('data-filter') || 'all';
        this.renderDirectoryLobby(container);
      });
    });

    container.querySelectorAll('[data-cat-filter]').forEach(tab => {
      tab.addEventListener('click', () => {
        this.lobbyCategoryFilter = tab.getAttribute('data-cat-filter') || 'all';
        this.renderDirectoryLobby(container);
      });
    });

    this.attachDragAndDropHandlers();

    container.querySelectorAll('.folder-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-folder-copy')) return;

        const id = card.getAttribute('data-id');
        const proj = this.data.projects.find(p => p.id === id);
        if (proj) {
          this.openProject(proj);
        }
      });
    });

    container.querySelectorAll('.btn-folder-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        const displayUrl = btn.getAttribute('data-display-url');
        if (url) {
          navigator.clipboard.writeText(url);
          const originalHtml = btn.innerHTML;
          btn.classList.add('copied');
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
            <span>Copiado!</span>
          `;
          window.showToast(`Link copiado: ${displayUrl}`);
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalHtml;
          }, 2000);
        }
      });
    });
  }

  renderGalleryView(container) {
    if (this.playerInstance) {
      this.playerInstance.destroy();
      this.playerInstance = null;
    }
    this.cleanupPhotoFullscreen();

    // Empty state when no projects exist
    if (!this.selectedProject || !this.data.projects || this.data.projects.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 80px 20px; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; align-items: center;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--brand-orange-subtle); color: var(--brand-orange); display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          </div>
          <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Nenhum diretório espelhado</h2>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.5;">Cole o link de uma pasta do Google Drive para gerar o link de entrega para seus clientes.</p>
          <button class="btn-primary" id="btnEmptyAddDir" style="padding: 10px 20px; font-size: 14px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Adicionar Primeiro Diretório
          </button>
        </div>
      `;
      document.getElementById('btnEmptyAddDir')?.addEventListener('click', () => {
        this.openAddDirectoryModal();
      });
      return;
    }

    const proj = this.selectedProject;
    const clientUrl = `${window.location.origin}/entrega/${proj.slug}`;
    const customDisplayUrl = `https://${this.data.settings.baseDomain || 'giffu.com.br'}/entrega/${proj.slug}`;

    const allItems = proj.videos || [];
    const videoCount = allItems.filter(v => v.type !== 'image').length;
    const imageCount = allItems.filter(v => v.type === 'image').length;
    const hasBoth = videoCount > 0 && imageCount > 0;

    const filteredItems = allItems.filter(item => {
      if (this.mediaFilter === 'video') return item.type !== 'image';
      if (this.mediaFilter === 'image') return item.type === 'image';
      return true;
    });

    const isAllSelected = filteredItems.length > 0 && filteredItems.every(i => this.selectedMediaIds.has(i.id));
    const selectedCount = this.selectedMediaIds.size;

    container.innerHTML = `
      <!-- Header Row with Link & Edit Icons (As shown in wireframe!) -->
      <div class="content-header-row">
        <div class="project-title-wrapper">
          <button class="icon-action-btn" id="btnCopyLink" title="Copiar link de entrega: ${customDisplayUrl}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          </button>
          
          ${!this.isClientMode ? `
            <button class="icon-action-btn" id="btnEditProject" title="Editar título e link do Drive espelhado">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
          ` : ''}

          <h1 class="project-heading">${proj.name}</h1>
          ${(() => {
            const unresolvedInProj = this.getUnresolvedCommentsCountForProject(proj.id);
            return unresolvedInProj > 0 ? `
              <span class="dir-unresolved-badge header-dir-badge" title="${unresolvedInProj} comentário${unresolvedInProj > 1 ? 's' : ''} a resolver neste diretório">
                ${unresolvedInProj}
              </span>
            ` : '';
          })()}
        </div>

        <div class="project-actions-right">
          <!-- Botão Selecionar -->
          <button class="btn-secondary ${this.isSelectionMode ? 'active-select-btn' : ''}" id="btnToggleSelectionMode" title="Ativar ou desativar caixas de seleção">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            <span>${this.isSelectionMode ? 'Cancelar' : 'Selecionar'}</span>
          </button>

          <!-- Botão Baixar em Lote (disponível para autor e cliente) -->
          <button class="btn-primary" id="btnBatchDownload" title="Baixar arquivos em lote (.zip ou individuais)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            <span>${selectedCount > 0 ? `Baixar em Lote (${selectedCount})` : 'Baixar em Lote'}</span>
          </button>

          <!-- Atualizar do Drive (Modo Autor) -->
          ${!this.isClientMode ? `
            <button class="btn-secondary" id="btnSyncDrive" title="Espelhar e atualizar da pasta do Drive">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
              Atualizar do Drive
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Barra de Controle de Seleção (quando ativa) -->
      ${this.isSelectionMode ? `
        <div class="selection-control-bar">
          <div class="selection-control-left">
            <button class="btn-secondary btn-sm" id="btnSelectAllMedia">
              ${isAllSelected ? 'Desmarcar Todos' : `Selecionar Todos (${filteredItems.length})`}
            </button>
            <span class="selection-count-text">
              <strong>${selectedCount}</strong> de ${filteredItems.length} selecionado${filteredItems.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div class="selection-control-right">
            <button class="btn-primary btn-sm" id="btnBatchDownloadFromBar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              Baixar ${selectedCount > 0 ? `(${selectedCount})` : 'Tudo'}
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Banner if Archived -->
      ${proj.archived ? `
        <div class="archive-banner">
          <div class="archive-banner-text">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>
            <span>Este diretório está arquivado e oculto dos diretórios ativos.</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn-secondary" id="btnRestoreFromBanner" style="font-size: 12px; padding: 6px 14px; font-weight: 600;">
              Restaurar Diretório
            </button>
            <button class="btn-danger-outline" id="btnDeleteFromBanner" style="font-size: 12px; padding: 6px 14px; font-weight: 600;" title="Excluir este diretório do sistema de entrega (mantém no Google Drive)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              Excluir da Entrega
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Media Filter Tabs & Grid or Empty State -->
      ${(() => {
        if (allItems.length === 0) {
          return `
            <div style="text-align: center; padding: 60px 20px; max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; align-items: center;">
              <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Nenhum arquivo neste diretório</h3>
              <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">Adicione vídeos ou fotos na pasta do Google Drive deste diretório e clique em Atualizar.</p>
              ${!this.isClientMode ? `
                <div style="display: flex; gap: 10px;">
                  <button class="btn-primary" id="btnEmptySync">Atualizar do Drive</button>
                </div>
              ` : ''}
            </div>
          `;
        }

        return `
          ${hasBoth ? `
            <div class="gallery-filter-bar">
              <button class="filter-tab-btn ${this.mediaFilter === 'all' ? 'active' : ''}" data-filter="all">
                Todos <span class="filter-tab-count">${allItems.length}</span>
              </button>
              <button class="filter-tab-btn ${this.mediaFilter === 'video' ? 'active' : ''}" data-filter="video">
                Vídeos <span class="filter-tab-count">${videoCount}</span>
              </button>
              <button class="filter-tab-btn ${this.mediaFilter === 'image' ? 'active' : ''}" data-filter="image">
                Fotos <span class="filter-tab-count">${imageCount}</span>
              </button>
            </div>
          ` : ''}

          <div class="video-grid" id="videoGrid">
            ${filteredItems.map(item => {
              const isImage = item.type === 'image';
              const unresolvedCount = this.getUnresolvedCommentsCount(item.id);
              const aspectClass = {
                '9:16': 'aspect-9-16',
                '3:2': 'aspect-3-2',
                '4:3': 'aspect-4-3',
                '1:1': 'aspect-1-1',
                '2:3': 'aspect-2-3',
                '3:4': 'aspect-3-4'
              }[item.aspectRatio] || (isImage ? 'aspect-3-2' : (item.aspectRatio === '9:16' ? 'aspect-9-16' : 'aspect-16-9'));

              const isSelected = this.isSelectionMode && this.selectedMediaIds.has(item.id);

              return `
                <div class="video-card ${isImage ? 'photo-card' : ''} ${isSelected ? 'selected-for-batch' : ''}" data-video-id="${item.id}" data-type="${isImage ? 'image' : 'video'}">
                  <div class="card-media-wrapper ${aspectClass}">
                    ${this.isSelectionMode ? `
                      <div class="media-checkbox-container ${isSelected ? 'checked' : ''}" data-id="${item.id}" title="${isSelected ? 'Desmarcar' : 'Selecionar'}">
                        ${isSelected ? `
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                        ` : ''}
                      </div>
                    ` : ''}

                    ${unresolvedCount > 0 ? `
                      <div class="card-unresolved-badge" title="${unresolvedCount} comentário${unresolvedCount > 1 ? 's' : ''} não resolvido${unresolvedCount > 1 ? 's' : ''}">
                        <span class="unresolved-num">${unresolvedCount}</span>
                      </div>
                    ` : ''}

                    ${isImage ? `
                      <img class="card-preview-image" src="${item.url}" alt="${item.title}" loading="lazy" onload="if (this.naturalWidth && !this.closest('.video-card').querySelector('.card-photo-res')?.textContent?.includes('x')) { const el = this.closest('.video-card').querySelector('.card-photo-res'); if (el) el.textContent = this.naturalWidth + 'x' + this.naturalHeight; }" />
                      
                      <span class="card-media-type-pill photo-pill">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                        FOTO
                      </span>

                      <div class="card-play-overlay">
                        <div class="play-icon-circle" title="Visualizar foto">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                        </div>
                      </div>
                    ` : `
                      <video class="video-preview-element" preload="metadata" muted playsinline src="${item.url}"></video>
                      
                      ${imageCount > 0 ? `
                        <span class="card-media-type-pill video-pill">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          VÍDEO
                        </span>
                      ` : ''}

                      <div class="card-play-overlay">
                        <div class="play-icon-circle">
                          <svg width="24" height="24" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    `}
                  </div>

                  <div class="card-info">
                    <span class="card-title">${item.title}</span>
                    <div class="card-meta">
                      <span class="badge-aspect">${item.aspectRatio || (isImage ? '3:2' : '16:9')}</span>
                      ${isImage ? `
                        <span class="card-photo-res">${item.dimensions || (item.resolution && item.resolution.includes('x') ? item.resolution : 'Original')}</span>
                      ` : `
                        <span>${item.duration || '00:10'}</span>
                        <span>• ${window.classifyResolution ? window.classifyResolution(item.resolution) : 'FHD'}</span>
                      `}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      })()}
    `;

    // Event Bindings
    document.getElementById('btnCopyLink')?.addEventListener('click', () => {
      navigator.clipboard.writeText(clientUrl);
      window.showToast(`Link copiado: ${customDisplayUrl}`);
    });

    document.getElementById('btnEditProject')?.addEventListener('click', () => {
      this.openEditProjectModal(proj);
    });

    document.getElementById('btnRestoreFromBanner')?.addEventListener('click', async () => {
      try {
        await window.API.unarchiveProject(proj.id);
        await this.fetchData();
        this.selectedProject = this.data.projects.find(p => p.id === proj.id);
        window.showToast('Projeto restaurado aos diretórios ativos');
        this.render();
      } catch (e) {
        alert('Erro ao restaurar projeto');
      }
    });

    document.getElementById('btnDeleteFromBanner')?.addEventListener('click', () => {
      this.promptDeleteProject(proj);
    });

    document.getElementById('btnSyncDrive')?.addEventListener('click', async () => {
      window.showToast('Espelhando pasta do Google Drive...');
      try {
        const res = await window.API.syncDrive(proj.id, proj.driveLink);
        if (res.error) {
          alert(res.error);
          return;
        }
        window.showToast(res.message || 'Drive sincronizado com sucesso!');
        await this.fetchData();
        this.selectedProject = this.data.projects.find(p => p.id === proj.id);
        this.render();
      } catch (e) {
        window.showToast('Erro ao espelhar Drive');
      }
    });

    document.getElementById('btnEmptySync')?.addEventListener('click', () => {
      document.getElementById('btnSyncDrive')?.click();
    });

    // Selection Mode Toggle
    document.getElementById('btnToggleSelectionMode')?.addEventListener('click', () => {
      this.isSelectionMode = !this.isSelectionMode;
      if (!this.isSelectionMode) {
        this.selectedMediaIds.clear();
      }
      this.renderGalleryView(container);
    });

    // Select / Deselect All
    document.getElementById('btnSelectAllMedia')?.addEventListener('click', () => {
      if (isAllSelected) {
        this.selectedMediaIds.clear();
      } else {
        filteredItems.forEach(i => this.selectedMediaIds.add(i.id));
      }
      this.renderGalleryView(container);
    });

    // Batch Download Trigger
    document.getElementById('btnBatchDownload')?.addEventListener('click', () => {
      this.openBatchDownloadModal(proj, filteredItems);
    });

    document.getElementById('btnBatchDownloadFromBar')?.addEventListener('click', () => {
      this.openBatchDownloadModal(proj, filteredItems);
    });

    // Filter Tabs
    container.querySelectorAll('.filter-tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        this.mediaFilter = tab.getAttribute('data-filter') || 'all';
        this.render();
      });
    });

    // Card Clicks -> Open dedicated player or toggle selection
    container.querySelectorAll('.video-card').forEach(card => {
      card.addEventListener('click', () => {
        const vidId = card.getAttribute('data-video-id');
        if (this.isSelectionMode) {
          if (this.selectedMediaIds.has(vidId)) {
            this.selectedMediaIds.delete(vidId);
          } else {
            this.selectedMediaIds.add(vidId);
          }
          this.renderGalleryView(container);
          return;
        }

        const vid = proj.videos.find(v => v.id === vidId);
        if (vid) {
          this.selectedVideo = vid;
          this.currentView = 'client_player';
          const targetUrl = this.isClientMode 
            ? `/entrega/${proj.slug}/${vid.id}`
            : `/author?project=${proj.id}&video=${vid.id}`;
          window.history.pushState({}, '', targetUrl);
          this.render();
        }
      });
    });
  }

  renderPlayerDetailView(container) {
    if (this.playerInstance) {
      this.playerInstance.destroy();
      this.playerInstance = null;
    }
    this.cleanupPhotoFullscreen();

    if (!this.selectedProject || !this.selectedVideo) {
      this.currentView = this.isClientMode ? 'client_gallery' : 'author';
      this.render();
      return;
    }

    const proj = this.selectedProject;
    const vid = this.selectedVideo;
    const isImage = vid.type === 'image';
    const mediaLabel = isImage ? 'foto' : 'vídeo';
    const clientUrl = `${window.location.origin}/entrega/${proj.slug}/${vid.id}`;
    const customDisplayUrl = `https://${this.data.settings.baseDomain || 'giffu.com.br'}/entrega/${proj.slug}/${vid.id}`;

    container.innerHTML = `
      <!-- Breadcrumb Header Row (Sketch 3) -->
      <div class="content-header-row">
        <div class="project-title-wrapper">
          <button class="icon-action-btn" id="btnCopyVideoLink" title="Copiar link direto d${isImage ? 'a foto' : 'o vídeo'}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          </button>

          <nav class="project-breadcrumb">
            <a class="breadcrumb-link" id="breadcrumbBackProject" title="Voltar à galeria de entregas">${proj.name}</a>
            <span class="breadcrumb-separator">&gt;</span>
            <span class="breadcrumb-current">${vid.title}</span>
          </nav>
        </div>

        <div style="display: flex; gap: 10px; align-items: center;">
          ${proj.allowComments !== false ? `
          <button class="btn-secondary toggle-comments-btn" id="btnToggleComments" title="Mostrar ou ocultar seção de comentários">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
            <span id="btnToggleCommentsText">Comentários</span>
            <span class="comments-badge" id="btnToggleCommentsBadge" style="display: none;">0</span>
          </button>
          ` : ''}
          <a class="btn-primary header-download-btn" id="btnHeaderDownloadMedia" href="${vid.url}${vid.url.includes('?') ? '&' : '?'}download=1" download="${vid.fileName || `${vid.title}.${isImage ? 'jpg' : 'mp4'}`}" title="Baixar este arquivo original">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            <span>Baixar</span>
          </a>
          <button class="btn-secondary" id="btnBackToGrid">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            Voltar para Galeria
          </button>
        </div>
      </div>

      <!-- Split Layout: Media Viewer (Left) + Comments (Right) -->
      <div class="detail-view-container comments-hidden">
        <!-- Main Column: Dedicated Custom Player or Photo Viewer -->
        <div class="player-main-column">
          <div id="customPlayerMount"></div>
        </div>

        <!-- Comments Column -->
        <div class="comments-panel" id="commentsMount"></div>
      </div>
    `;

    const playerMount = document.getElementById('customPlayerMount');

    if (isImage) {
      const photos = (proj && proj.videos) ? proj.videos.filter(v => v.type === 'image') : [];
      const photoIndex = photos.findIndex(p => p.id === vid.id);
      const hasMultiplePhotos = photos.length > 1;
      const initialDims = vid.dimensions || (vid.resolution && vid.resolution.includes('x') ? vid.resolution : '');

      // Photo Lightbox & Viewer
      playerMount.innerHTML = `
        <div class="custom-image-wrapper" id="customImageWrapper">
          <div class="player-top-badge" id="photoTopBadge" style="opacity: 1; visibility: visible; display: flex; gap: 8px; align-items: center;">
            ${hasMultiplePhotos ? `<span id="photoIndexBadge" class="photo-index-pill">${photoIndex >= 0 ? photoIndex + 1 : 1} / ${photos.length}</span>` : ''}
            <span id="photoQualityLabel">${initialDims}</span>
          </div>

          ${hasMultiplePhotos ? `
          <button class="photo-nav-btn prev-photo-btn" id="btnPrevPhoto" title="Foto anterior (Seta para a esquerda)" aria-label="Foto anterior">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button class="photo-nav-btn next-photo-btn" id="btnNextPhoto" title="Próxima foto (Seta para a direita)" aria-label="Próxima foto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          ` : ''}

          <img class="custom-image-element" id="mainPhotoElement" src="${vid.url}" alt="${vid.title}">
          <div class="image-overlay-controls custom-image-toolbar">
            ${proj.allowComments !== false ? `
            <button class="btn-image-action" id="btnPhotoToggleComments" title="Mostrar ou ocultar comentários">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
              <span id="btnPhotoToggleCommentsText">Comentários</span>
            </button>
            ` : ''}
            <a class="btn-image-action" id="btnDownloadPhotoAction" href="${vid.url}&download=1" download="${vid.title}" title="Baixar foto original em alta resolução">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              <span id="btnDownloadPhotoText">Baixar Original ${initialDims ? `(${initialDims})` : ''}</span>
            </a>
            <button class="btn-image-action" id="btnFullscreenPhoto" title="Visualizar em Tela Cheia">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
              Tela Cheia
            </button>
          </div>
        </div>
      `;

      const mainPhoto = document.getElementById('mainPhotoElement');
      if (mainPhoto) {
        const updateDims = () => {
          if (!mainPhoto.naturalWidth) return;
          const dims = `${mainPhoto.naturalWidth}x${mainPhoto.naturalHeight}`;
          const badgeLabel = document.getElementById('photoQualityLabel');
          if (badgeLabel && (!vid.dimensions || !badgeLabel.textContent.includes('x'))) {
            badgeLabel.textContent = dims;
          }
          const dlText = document.getElementById('btnDownloadPhotoText');
          if (dlText && (!vid.dimensions || !dlText.textContent.includes('x'))) {
            dlText.textContent = `Baixar Original (${dims})`;
          }
        };
        if (mainPhoto.complete) updateDims();
        else mainPhoto.addEventListener('load', updateDims);
      }

      const imgWrapper = document.getElementById('customImageWrapper');
      const btnFs = document.getElementById('btnFullscreenPhoto');
      if (btnFs && imgWrapper) {
        const isPhotoFs = () => !!(
          (document.fullscreenElement && (document.fullscreenElement === imgWrapper || imgWrapper.contains(document.fullscreenElement))) ||
          (document.webkitFullscreenElement && (document.webkitFullscreenElement === imgWrapper || imgWrapper.contains(document.webkitFullscreenElement))) ||
          imgWrapper.classList.contains('is-fullscreen')
        );

        const togglePhotoFs = () => {
          if (!isPhotoFs()) {
            if (imgWrapper.requestFullscreen) {
              imgWrapper.requestFullscreen().catch(() => {});
            } else if (imgWrapper.webkitRequestFullscreen) {
              imgWrapper.webkitRequestFullscreen();
            } else {
              imgWrapper.classList.add('is-fullscreen');
            }
          } else {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
              if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
              } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
              }
            }
            imgWrapper.classList.remove('is-fullscreen');
          }
        };

        btnFs.addEventListener('click', togglePhotoFs);

        const onPhotoFsChange = () => {
          const isCurrentFs = !!(
            (document.fullscreenElement && (document.fullscreenElement === imgWrapper || imgWrapper.contains(document.fullscreenElement))) ||
            (document.webkitFullscreenElement && (document.webkitFullscreenElement === imgWrapper || imgWrapper.contains(document.webkitFullscreenElement)))
          );
          if (!isCurrentFs) {
            imgWrapper.classList.remove('is-fullscreen');
          } else {
            imgWrapper.classList.add('is-fullscreen');
          }
        };

        document.addEventListener('fullscreenchange', onPhotoFsChange);
        document.addEventListener('webkitfullscreenchange', onPhotoFsChange);

        const photoKeyHandler = (e) => {
          if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
          if (e.code === 'KeyF') {
            togglePhotoFs();
          } else if (e.code === 'Escape' || e.key === 'Escape' || e.keyCode === 27) {
            if (isPhotoFs()) {
              if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) {
                  document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                  document.webkitExitFullscreen();
                }
              }
              imgWrapper.classList.remove('is-fullscreen');
            }
          } else if (e.key === 'ArrowLeft' || e.code === 'ArrowLeft') {
            e.preventDefault();
            this.navigatePhoto(-1);
          } else if (e.key === 'ArrowRight' || e.code === 'ArrowRight') {
            e.preventDefault();
            this.navigatePhoto(1);
          }
        };

        window.addEventListener('keydown', photoKeyHandler);
        this.photoKeyHandler = photoKeyHandler;
        this.photoFsHandler = onPhotoFsChange;
      }

      // Hook up UI arrow click events
      if (hasMultiplePhotos) {
        document.getElementById('btnPrevPhoto')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.navigatePhoto(-1);
        });
        document.getElementById('btnNextPhoto')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.navigatePhoto(1);
        });

        // Touch swipe support for mobile/tablet
        if (imgWrapper) {
          let touchStartX = 0;
          let touchStartY = 0;
          imgWrapper.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length === 1) {
              touchStartX = e.touches[0].clientX;
              touchStartY = e.touches[0].clientY;
            }
          }, { passive: true });

          imgWrapper.addEventListener('touchend', (e) => {
            if (e.changedTouches && e.changedTouches.length === 1) {
              const diffX = e.changedTouches[0].clientX - touchStartX;
              const diffY = e.changedTouches[0].clientY - touchStartY;
              if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.4) {
                if (diffX > 0) {
                  this.navigatePhoto(-1);
                } else {
                  this.navigatePhoto(1);
                }
              }
            }
          }, { passive: true });
        }
      }

      this.playerInstance = null;
    } else {
      // Initialize Video Player
      this.playerInstance = new window.CustomVideoPlayer(playerMount, vid, {
        onTimeUpdate: (cur, dur) => {
          if (this.commentsController) {
            this.commentsController.updateVideoTime(cur);
          }
        },
        onToggleComments: () => {
          this.toggleComments();
        }
      });
    }

    // Initialize Comments Controller
    const commentsMount = document.getElementById('commentsMount');
    this.commentsController = new window.CommentsController(commentsMount, proj, vid, this.playerInstance, {
      onCountChange: (count, unresolvedCount) => {
        this.updateCommentsCount(count, unresolvedCount);
      },
      onCommentsUpdated: (comments) => {
        if (comments) this.data.comments = comments;
        this.renderSidebar();
      },
      onClose: () => {
        this.setCommentsVisibility(false);
      }
    });

    // Hidden by default as requested to provide maximum space for video player
    this.setCommentsVisibility(false);

    // Event Bindings
    document.getElementById('btnToggleComments')?.addEventListener('click', () => {
      this.toggleComments();
    });

    document.getElementById('btnPhotoToggleComments')?.addEventListener('click', () => {
      this.toggleComments();
    });

    document.getElementById('btnCopyVideoLink')?.addEventListener('click', () => {
      const curVid = this.selectedVideo || vid;
      const curClientUrl = `${window.location.origin}/entrega/${proj.slug}/${curVid.id}`;
      const curDisplayUrl = `https://${this.data.settings.baseDomain || 'giffu.com.br'}/entrega/${proj.slug}/${curVid.id}`;
      navigator.clipboard.writeText(curClientUrl);
      window.showToast(`Link d${curVid.type === 'image' ? 'a foto' : 'o vídeo'} copiado: ${curDisplayUrl}`);
    });

    const goBack = () => {
      if (this.playerInstance) {
        this.playerInstance.destroy();
        this.playerInstance = null;
      }
      this.cleanupPhotoFullscreen();
      this.selectedVideo = null;
      this.currentView = this.isClientMode ? 'client_gallery' : 'author';
      const backUrl = this.isClientMode ? `/entrega/${proj.slug}` : '/author';
      window.history.pushState({}, '', backUrl);
      this.render();
    };

    document.getElementById('breadcrumbBackProject')?.addEventListener('click', goBack);
    document.getElementById('btnBackToGrid')?.addEventListener('click', goBack);
  }

  cleanupPhotoFullscreen() {
    if (this.photoKeyHandler) {
      window.removeEventListener('keydown', this.photoKeyHandler);
      this.photoKeyHandler = null;
    }
    if (this.photoFsHandler) {
      document.removeEventListener('fullscreenchange', this.photoFsHandler);
      document.removeEventListener('webkitfullscreenchange', this.photoFsHandler);
      this.photoFsHandler = null;
    }
  }

  navigatePhoto(direction) {
    const proj = this.selectedProject;
    if (!proj || !proj.videos) return;
    const photos = proj.videos.filter(v => v.type === 'image');
    if (photos.length <= 1) return;

    const currentVid = this.selectedVideo;
    const currentIndex = photos.findIndex(p => p.id === currentVid?.id);
    if (currentIndex === -1) return;

    const targetIndex = (currentIndex + direction + photos.length) % photos.length;
    const targetPhoto = photos[targetIndex];
    this.switchPhoto(targetPhoto, targetIndex, photos.length);
  }

  switchPhoto(targetPhoto, targetIndex, totalPhotos) {
    this.selectedVideo = targetPhoto;
    const proj = this.selectedProject;

    // Update document title
    this.updateDocumentTitle();

    // Update history URL without reloading or breaking fullscreen state
    const targetUrl = this.isClientMode 
      ? `/entrega/${proj.slug}/${targetPhoto.id}`
      : `/author?project=${proj.id}&video=${targetPhoto.id}`;
    window.history.replaceState({}, '', targetUrl);

    // If imgWrapper is not present in DOM, fallback to full render
    const imgWrapper = document.getElementById('customImageWrapper');
    if (!imgWrapper) {
      const mainContainer = document.getElementById('mainContentArea');
      if (mainContainer) this.renderPlayerDetailView(mainContainer);
      return;
    }

    // Update Breadcrumb header current title
    const breadcrumbCurrent = document.querySelector('.breadcrumb-current');
    if (breadcrumbCurrent) breadcrumbCurrent.textContent = targetPhoto.title;

    // Update Header download button
    const headerDl = document.getElementById('btnHeaderDownloadMedia');
    if (headerDl) {
      headerDl.href = `${targetPhoto.url}${targetPhoto.url.includes('?') ? '&' : '?'}download=1`;
      headerDl.download = targetPhoto.fileName || `${targetPhoto.title}.jpg`;
    }

    // Update Photo Index Badge
    const indexBadge = document.getElementById('photoIndexBadge');
    if (indexBadge) {
      indexBadge.textContent = `${targetIndex + 1} / ${totalPhotos}`;
    }

    // Update Dimensions / Quality Badge
    const initialDims = targetPhoto.dimensions || (targetPhoto.resolution && targetPhoto.resolution.includes('x') ? targetPhoto.resolution : '');
    const badgeLabel = document.getElementById('photoQualityLabel');
    if (badgeLabel) badgeLabel.textContent = initialDims;

    // Update Toolbar download button
    const dlAction = document.getElementById('btnDownloadPhotoAction');
    if (dlAction) {
      dlAction.href = `${targetPhoto.url}&download=1`;
      dlAction.download = targetPhoto.title;
    }
    const dlText = document.getElementById('btnDownloadPhotoText');
    if (dlText) {
      dlText.textContent = `Baixar Original ${initialDims ? `(${initialDims})` : ''}`;
    }

    // Update Main Photo Element smoothly
    const mainPhoto = document.getElementById('mainPhotoElement');
    if (mainPhoto) {
      mainPhoto.style.opacity = '0.7';
      mainPhoto.alt = targetPhoto.title;
      mainPhoto.src = targetPhoto.url;
      const updateDims = () => {
        mainPhoto.style.opacity = '1';
        if (!mainPhoto.naturalWidth) return;
        const dims = `${mainPhoto.naturalWidth}x${mainPhoto.naturalHeight}`;
        if (badgeLabel && (!targetPhoto.dimensions || !badgeLabel.textContent.includes('x'))) {
          badgeLabel.textContent = dims;
        }
        if (dlText && (!targetPhoto.dimensions || !dlText.textContent.includes('x'))) {
          dlText.textContent = `Baixar Original (${dims})`;
        }
      };
      if (mainPhoto.complete && mainPhoto.naturalWidth) {
        updateDims();
      } else {
        mainPhoto.onload = updateDims;
      }
    }

    // Update comments controller for the newly active photo
    if (this.commentsController && typeof this.commentsController.setVideo === 'function') {
      this.commentsController.setVideo(targetPhoto);
    }
  }

  setCommentsVisibility(visible) {
    this.commentsVisible = !!visible;
    const container = document.querySelector('.detail-view-container');
    const commentsMount = document.getElementById('commentsMount');
    const btnToggle = document.getElementById('btnToggleComments');
    const btnToggleText = document.getElementById('btnToggleCommentsText');
    const btnPhotoToggle = document.getElementById('btnPhotoToggleComments');
    const btnPhotoText = document.getElementById('btnPhotoToggleCommentsText');

    if (!container || !commentsMount) return;

    if (this.commentsVisible) {
      container.classList.remove('comments-hidden');
      container.classList.add('comments-visible');
      if (btnToggle) {
        btnToggle.classList.add('is-active');
        btnToggle.title = 'Ocultar comentários (expandir player)';
      }
      if (btnToggleText) {
        btnToggleText.textContent = 'Ocultar Comentários';
      }
      if (btnPhotoToggle) {
        btnPhotoToggle.classList.add('is-active');
      }
      if (btnPhotoText) {
        btnPhotoText.textContent = 'Ocultar Comentários';
      }
      if (this.playerInstance) {
        this.playerInstance.setCommentsActive(true);
      }
      // On mobile view, smooth scroll to comments when opened
      if (window.innerWidth <= 1080) {
        setTimeout(() => {
          commentsMount.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
    } else {
      container.classList.add('comments-hidden');
      container.classList.remove('comments-visible');
      if (btnToggle) {
        btnToggle.classList.remove('is-active');
        btnToggle.title = 'Mostrar comentários';
      }
      if (btnToggleText) {
        btnToggleText.textContent = 'Comentários';
      }
      if (btnPhotoToggle) {
        btnPhotoToggle.classList.remove('is-active');
      }
      if (btnPhotoText) {
        btnPhotoText.textContent = 'Comentários';
      }
      if (this.playerInstance) {
        this.playerInstance.setCommentsActive(false);
      }
    }
  }

  toggleComments() {
    this.setCommentsVisibility(!this.commentsVisible);
  }

  updateCommentsCount(count, unresolvedCount = 0) {
    const badge = document.getElementById('btnToggleCommentsBadge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
        if (unresolvedCount > 0) {
          badge.classList.add('has-unresolved');
          badge.title = `${unresolvedCount} comentário${unresolvedCount > 1 ? 's' : ''} a resolver`;
        } else {
          badge.classList.remove('has-unresolved');
          badge.title = `${count} comentário${count > 1 ? 's' : ''}`;
        }
      } else {
        badge.style.display = 'none';
        badge.classList.remove('has-unresolved');
      }
    }
  }

  renderPasswordGate() {
    const container = document.getElementById('mainContentArea');
    if (!container) return;

    container.innerHTML = `
      <div class="password-gate-container">
        <div class="password-card">
          <div class="lock-icon-wrapper">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          </div>
          <h2 class="password-card-title">Entrega Protegida</h2>
          <p class="password-card-desc">Digite a senha fornecida pelo autor para desbloquear os vídeos deste projeto.</p>
          
          <form id="passwordForm" style="display: flex; flex-direction: column; gap: 14px;">
            <input type="password" id="inputPassword" class="form-input" placeholder="Digite a senha de acesso" required autofocus>
            <div id="passwordError" style="color: var(--danger); font-size: 12px; display: none;">Senha incorreta. Tente novamente.</div>
            <button type="submit" class="btn-primary" style="justify-content: center; padding: 12px;">Desbloquear Entrega</button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = document.getElementById('inputPassword').value.trim();
      const res = await window.API.verifyPassword(this.selectedProject.slug, pwd);
      if (res.verified) {
        this.unlockedSlugs.add(this.selectedProject.slug);
        if (!this.unlockedPasswords) this.unlockedPasswords = {};
        this.unlockedPasswords[this.selectedProject.slug] = pwd;
        this.render();
      } else {
        const errEl = document.getElementById('passwordError');
        if (errEl) errEl.style.display = 'block';
      }
    });
  }

  // Batch Download Flow
  openBatchDownloadModal(proj, allItems) {
    const modal = document.getElementById('modalBatchDownload');
    if (!modal) return;

    let targetItems = [];
    if (this.selectedMediaIds && this.selectedMediaIds.size > 0) {
      targetItems = (allItems || []).filter(item => this.selectedMediaIds.has(item.id));
    } else {
      targetItems = allItems || [];
    }

    if (targetItems.length === 0) {
      window.showToast('Nenhum arquivo disponível para download');
      return;
    }

    const subtitleEl = document.getElementById('batchModalSubtitle');
    if (subtitleEl) subtitleEl.textContent = proj.name;

    const infoEl = document.getElementById('batchSelectionInfo');
    if (infoEl) {
      if (this.selectedMediaIds && this.selectedMediaIds.size > 0 && this.selectedMediaIds.size < (allItems || []).length) {
        infoEl.innerHTML = `Preparando download de <strong>${targetItems.length} arquivo${targetItems.length > 1 ? 's' : ''} selecionado${targetItems.length > 1 ? 's' : ''}</strong> de um total de ${allItems.length} no diretório.`;
      } else {
        infoEl.innerHTML = `Preparando download de <strong>todos os ${targetItems.length} arquivos</strong> deste diretório.`;
      }
    }

    // Reset progress area
    const progressEl = document.getElementById('batchDownloadProgress');
    const fillEl = document.getElementById('batchProgressFill');
    const statusEl = document.getElementById('batchProgressStatus');
    if (progressEl) progressEl.style.display = 'none';
    if (fillEl) fillEl.style.width = '0%';
    if (statusEl) statusEl.textContent = 'Iniciando...';

    modal.classList.add('open');

    // Option 1: .ZIP Download
    const btnZip = document.getElementById('btnOptionDownloadZip');
    if (btnZip) {
      btnZip.onclick = () => {
        if (typeof JSZip !== 'undefined') {
          this.downloadClientZip(proj, targetItems, modal);
          return;
        }

        let zipUrl = `/api/projects/${proj.id}/download-zip`;
        const params = [];
        if (this.selectedMediaIds && this.selectedMediaIds.size > 0 && this.selectedMediaIds.size < (allItems || []).length) {
          params.push(`items=${Array.from(this.selectedMediaIds).join(',')}`);
        }
        const pwd = proj.password || (this.unlockedPasswords && this.unlockedPasswords[proj.slug]) || '';
        if (pwd) {
          params.push(`pwd=${encodeURIComponent(pwd)}`);
        }
        if (params.length > 0) {
          zipUrl += `?${params.join('&')}`;
        }

        if (progressEl) progressEl.style.display = 'block';
        if (fillEl) fillEl.style.width = '100%';
        if (statusEl) statusEl.textContent = 'Compactando arquivos em .ZIP... O download iniciará automaticamente.';
        window.showToast('Compactando e iniciando download do .zip...');

        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = `${proj.name}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
          if (statusEl) statusEl.textContent = 'Arquivo .ZIP enviado ao navegador! Verifique o gerenciador de downloads.';
        }, 3000);
      };
    }

    // Option 2: Loose Files (direct save to photos on mobile / sequential download on PC/Mac)
    const btnLoose = document.getElementById('btnOptionDownloadLoose');
    if (btnLoose) {
      btnLoose.onclick = () => {
        this.downloadLooseFiles(proj, targetItems, modal);
      };
    }
  }

  async downloadClientZip(proj, targetItems, modal) {
    const progressEl = document.getElementById('batchDownloadProgress');
    const fillEl = document.getElementById('batchProgressFill');
    const statusEl = document.getElementById('batchProgressStatus');

    if (progressEl) progressEl.style.display = 'block';
    const total = targetItems.length;
    const zip = new JSZip();

    try {
      window.showToast('Compactando arquivos para .ZIP no navegador...');
      for (let i = 0; i < total; i++) {
        const item = targetItems[i];
        const fileName = item.fileName || `${item.title}.${item.type === 'image' ? 'jpg' : 'mp4'}`;
        if (statusEl) statusEl.textContent = `Carregando item (${i + 1}/${total}): ${fileName}...`;
        if (fillEl) fillEl.style.width = `${Math.round(((i + 1) / total) * 70)}%`;

        const downloadUrl = item.downloadUrl || item.url;
        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error(`Falha ao obter ${fileName}`);
        const blob = await res.blob();
        zip.file(fileName, blob);
      }

      if (statusEl) statusEl.textContent = 'Compactando arquivo .ZIP final...';
      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        if (fillEl) fillEl.style.width = `${70 + Math.round(metadata.percent * 0.3)}%`;
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${proj.name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      if (fillEl) fillEl.style.width = '100%';
      if (statusEl) statusEl.textContent = 'Download do .ZIP concluído!';
      window.showToast('Download do .zip concluído!');
      setTimeout(() => { if (modal) modal.classList.remove('open'); }, 2000);
    } catch (err) {
      console.warn('Erro ao gerar ZIP no navegador, alternando para arquivos soltos:', err);
      if (statusEl) statusEl.textContent = 'Alternando para download de arquivos individuais...';
      this.downloadLooseFiles(proj, targetItems, modal);
    }
  }

  async downloadLooseFiles(proj, targetItems, modal) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const progressEl = document.getElementById('batchDownloadProgress');
    const fillEl = document.getElementById('batchProgressFill');
    const statusEl = document.getElementById('batchProgressStatus');

    if (progressEl) progressEl.style.display = 'block';

    const total = targetItems.length;

    // Mobile Web Share API option for saving directly to Photos / Gallery without confirmation
    if (isMobile && navigator.canShare && typeof navigator.share === 'function') {
      try {
        if (statusEl) statusEl.textContent = 'Preparando arquivos para salvar no Fotos/Galeria...';
        const fileObjects = [];
        for (let i = 0; i < total; i++) {
          const item = targetItems[i];
          const streamUrl = item.downloadUrl || (item.url ? `${item.url}${item.url.includes('?') ? '&' : '?'}download=1` : '');
          if (fillEl) fillEl.style.width = `${Math.round(((i + 1) / total) * 60)}%`;
          if (statusEl) statusEl.textContent = `Carregando ${i + 1} de ${total}: ${item.fileName || item.title}...`;

          const response = await fetch(streamUrl);
          if (!response.ok) throw new Error(`Falha ao obter arquivo ${item.title}`);
          const blob = await response.blob();
          const fileName = item.fileName || `${item.title}.${item.type === 'image' ? 'jpg' : 'mp4'}`;
          fileObjects.push(new File([blob], fileName, { type: blob.type || (item.type === 'image' ? 'image/jpeg' : 'video/mp4') }));
        }

        if (navigator.canShare({ files: fileObjects })) {
          if (fillEl) fillEl.style.width = '100%';
          if (statusEl) statusEl.textContent = 'Toque em "Salvar Imagens / Vídeos" na folha para salvar no Fotos/Galeria!';
          await navigator.share({
            files: fileObjects,
            title: proj.name
          });
          window.showToast('Salvo com sucesso no Fotos/Galeria!');
          if (modal) {
            setTimeout(() => modal.classList.remove('open'), 1500);
          }
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          if (statusEl) statusEl.textContent = 'Ação cancelada pelo usuário.';
          return;
        }
        console.warn('Web Share API não concluiu, usando download direto:', err);
      }
    }

    // Direct sequential downloads (PC, Mac, and Mobile fallback)
    for (let i = 0; i < total; i++) {
      const item = targetItems[i];
      const streamUrl = item.downloadUrl || (item.url ? `${item.url}${item.url.includes('?') ? '&' : '?'}download=1` : '');
      const fileName = item.fileName || `${item.title}.${item.type === 'image' ? 'jpg' : 'mp4'}`;

      if (fillEl) fillEl.style.width = `${Math.round(((i + 1) / total) * 100)}%`;
      if (statusEl) statusEl.textContent = `Baixando ${i + 1} de ${total}: ${fileName}...`;

      try {
        const res = await fetch(streamUrl);
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } else {
          const link = document.createElement('a');
          link.href = streamUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (err) {
        const link = document.createElement('a');
        link.href = streamUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    if (fillEl) fillEl.style.width = '100%';
    if (statusEl) statusEl.textContent = `Download de ${total} arquivo${total > 1 ? 's' : ''} concluído!`;
    window.showToast(`${total} arquivo${total > 1 ? 's' : ''} baixado${total > 1 ? 's' : ''}!`);
    setTimeout(() => {
      if (modal) modal.classList.remove('open');
    }, 2000);
  }

  // Modals & User Actions
  openAddDirectoryModal() {
    const modal = document.getElementById('modalAddDirectory');
    if (!modal) return;

    const inputName = document.getElementById('newProjName');
    const inputClient = document.getElementById('newProjClient');
    const inputDrive = document.getElementById('newProjDrive');
    const inputPassword = document.getElementById('newProjPassword');
    const checkComments = document.getElementById('newProjAllowComments');
    const checkHideBrand = document.getElementById('newProjHideBrand');
    if (checkHideBrand) checkHideBrand.checked = true;
    const previewUrl = document.getElementById('newProjSlugPreview');

    const updatePreview = () => {
      const slug = (inputName.value || 'novo_projeto')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '')
        .replace(/_+/g, '_');
      previewUrl.textContent = `https://${this.data.settings.baseDomain || 'giffu.com.br'}/entrega/${slug}`;
    };

    inputName.oninput = updatePreview;
    updatePreview();

    modal.classList.add('open');
  }

  openEditProjectModal(proj) {
    const modal = document.getElementById('modalEditProject');
    if (!modal) return;

    document.getElementById('editProjName').value = proj.name;
    document.getElementById('editProjClient').value = proj.clientName || '';
    document.getElementById('editProjDrive').value = proj.driveLink || '';
    document.getElementById('editProjPassword').value = proj.password || '';
    document.getElementById('editProjAllowComments').checked = proj.allowComments !== false;
    const checkEditHideBrand = document.getElementById('editProjHideBrand');
    if (checkEditHideBrand) checkEditHideBrand.checked = proj.hideBrandName !== false;
    const catSelect = document.getElementById('editProjCategory');
    if (catSelect) catSelect.value = proj.category || 'Eventos';

    // Configure Archive button in Edit Modal
    const btnArchive = document.getElementById('btnToggleArchiveProject');
    const labelArchive = document.getElementById('labelToggleArchiveProject');
    const btnDeleteArchived = document.getElementById('btnDeleteArchivedProject');

    if (btnArchive && labelArchive) {
      if (proj.archived) {
        labelArchive.textContent = 'Restaurar do Arquivo';
        btnArchive.className = 'btn-secondary';
        btnArchive.title = 'Restaurar este projeto para os diretórios ativos';
      } else {
        labelArchive.textContent = 'Mover para Arquivo';
        btnArchive.className = 'btn-danger-outline';
        btnArchive.title = 'Mover este projeto para o Arquivo';
      }

      btnArchive.onclick = async () => {
        try {
          if (proj.archived) {
            await window.API.unarchiveProject(proj.id);
            window.showToast('Projeto restaurado aos diretórios ativos');
          } else {
            await window.API.archiveProject(proj.id);
            window.showToast('Projeto movido para o Arquivo');
          }
          await this.fetchData();
          this.selectedProject = this.data.projects.find(p => p.id === proj.id);
          modal.classList.remove('open');
          this.render();
        } catch (err) {
          alert('Erro ao alterar status do projeto');
        }
      };
    }

    if (btnDeleteArchived) {
      if (proj.archived) {
        btnDeleteArchived.style.display = 'inline-flex';
        btnDeleteArchived.onclick = () => {
          this.promptDeleteProject(proj);
        };
      } else {
        btnDeleteArchived.style.display = 'none';
      }
    }

    modal.classList.add('open');
  }

  promptDeleteProject(proj) {
    const modal = document.getElementById('modalConfirmDeleteProject');
    const nameEl = document.getElementById('confirmDeleteProjectName');
    const btnSubmit = document.getElementById('btnConfirmDeleteProjectSubmit');
    if (!modal) return;

    if (nameEl) nameEl.textContent = `"${proj.name}"`;
    modal.classList.add('open');

    btnSubmit.onclick = async () => {
      try {
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Excluindo...';
        await window.API.deleteProject(proj.id);
        modal.classList.remove('open');
        document.getElementById('modalEditProject')?.classList.remove('open');
        window.showToast(`Diretório "${proj.name}" removido da entrega (mantido no Google Drive)`);
        await this.fetchData();
        const activeProjects = (this.data.projects || []).filter(p => !p.archived);
        this.selectedProject = activeProjects.length > 0 ? activeProjects[0] : ((this.data.projects || [])[0] || null);
        this.render();
      } catch (err) {
        alert('Erro ao excluir diretório: ' + err.message);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Excluir da Entrega';
      }
    };
  }



  bindGlobalEvents() {
    // Floating theme toggle button
    document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // Add Directory button (+) in Sidebar
    document.getElementById('btnAddDirectory')?.addEventListener('click', () => {
      this.openAddDirectoryModal();
    });

    // Close buttons on all modals
    document.querySelectorAll('.modal-close-btn, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
      });
    });

    // Form Add Directory Submit
    document.getElementById('formAddDirectory')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newProjName').value.trim();
      const clientName = document.getElementById('newProjClient').value.trim();
      const category = document.getElementById('newProjCategory')?.value || 'Eventos';
      const driveLink = document.getElementById('newProjDrive').value.trim();
      const password = document.getElementById('newProjPassword').value.trim();
      const allowComments = document.getElementById('newProjAllowComments').checked;
      const hideBrandName = document.getElementById('newProjHideBrand')
        ? document.getElementById('newProjHideBrand').checked
        : true;
      const currentYear = new Date().getFullYear().toString();

      try {
        const newProj = await window.API.createProject({
          name,
          clientName,
          category,
          driveLink,
          password,
          allowComments,
          hideBrandName,
          year: currentYear
        });

        await this.fetchData();
        this.selectedProject = newProj;
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
        window.showToast('Novo diretório de entrega criado com sucesso!');
        if (newProj.syncError) alert(`Diretório criado, mas o espelhamento do Drive falhou:\n${newProj.syncError}`);
        this.render();
      } catch (err) {
        alert(err.message || 'Erro ao criar diretório');
      }
    });

    // Form Edit Project Submit
    document.getElementById('formEditProject')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!this.selectedProject) return;

      const name = document.getElementById('editProjName').value.trim();
      const clientName = document.getElementById('editProjClient').value.trim();
      const category = document.getElementById('editProjCategory')?.value || 'Eventos';
      const driveLink = document.getElementById('editProjDrive').value.trim();
      const password = document.getElementById('editProjPassword').value.trim();
      const allowComments = document.getElementById('editProjAllowComments').checked;
      const hideBrandName = document.getElementById('editProjHideBrand')
        ? document.getElementById('editProjHideBrand').checked
        : true;

      try {
        const updated = await window.API.updateProject(this.selectedProject.id, {
          name,
          clientName,
          category,
          driveLink,
          password,
          allowComments,
          hideBrandName
        });

        await this.fetchData();
        this.selectedProject = updated;
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
        window.showToast('Diretório e configurações atualizados!');
        if (updated.syncError) alert(`Atualizado, mas o espelhamento do Drive falhou:\n${updated.syncError}`);
        this.render();
      } catch (err) {
        alert(err.message || 'Erro ao atualizar diretório');
      }
    });



    // Settings Modal
    document.getElementById('btnSidebarSettings')?.addEventListener('click', () => {
      const modal = document.getElementById('modalSettings');
      if (modal) {
        document.getElementById('settingBaseDomain').value = this.data.settings.baseDomain || 'giffu.com.br';
        document.getElementById('settingAuthorName').value = this.data.settings.authorName || 'Giffú Autor';
        modal.classList.add('open');
      }
    });

    document.getElementById('formSettings')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const baseDomain = document.getElementById('settingBaseDomain').value.trim();
      const authorName = document.getElementById('settingAuthorName').value.trim();

      await window.API.saveSettings({ baseDomain, authorName });
      await this.fetchData();
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
      window.showToast('Configurações salvas!');
      this.render();
    });

    // Browser navigation (back/forward)
    window.addEventListener('popstate', () => {
      this.detectRoute();
    });
  }
}

// Global Toast helper
window.showToast = function (message) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#10b981"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
};


document.addEventListener('DOMContentLoaded', () => {
  window.app = new EntregaApp();
});
