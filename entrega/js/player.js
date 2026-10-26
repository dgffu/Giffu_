// Custom High-Performance Multi-function Video Player
// Always prioritizes maximum source quality without degradation

class CustomVideoPlayer {
  constructor(containerElement, videoData, options = {}) {
    this.container = containerElement;
    this.videoData = videoData;
    this.options = options;
    this.video = null;
    this.isPlaying = false;
    this.fps = 30; // standard 30fps for frame stepping
    this.playbackSpeeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    this.currentSpeedIndex = 2; // 1.0x

    this.init();
  }

  init() {
    this.render();
    this.setupInactivityTimer();
    this.setupOrientationHandler();
    this.bindEvents();
  }

  setupInactivityTimer() {
    this.inactivityTimer = null;
    this.isInteracting = false;

    this.showHUD = () => {
      this.container.classList.add('user-active');
      this.container.classList.remove('user-inactive');

      clearTimeout(this.inactivityTimer);

      if (!this.isInteracting) {
        this.inactivityTimer = setTimeout(() => {
          if (!this.isInteracting) {
            this.container.classList.remove('user-active');
            this.container.classList.add('user-inactive');
          }
        }, 2000);
      }
    };

    this.hideHUDImmediate = () => {
      clearTimeout(this.inactivityTimer);
      if (!this.isInteracting) {
        this.container.classList.remove('user-active');
        this.container.classList.add('user-inactive');
      }
    };

    this.onActivity = () => {
      this.showHUD();
    };

    this.onMouseLeave = () => {
      this.hideHUDImmediate();
    };

    this.container.addEventListener('mousemove', this.onActivity);
    this.container.addEventListener('mouseenter', this.onActivity);
    this.container.addEventListener('mouseleave', this.onMouseLeave);
    this.container.addEventListener('touchstart', this.onActivity, { passive: true });
    this.container.addEventListener('touchmove', this.onActivity, { passive: true });

    // Exibe inicialmente ao abrir e inicia o timer de 2 segundos
    this.showHUD();
  }

  render() {
    const isVertical = this.videoData.aspectRatio === '9:16';
    this.container.className = `custom-player-wrapper ${isVertical ? 'aspect-9-16' : ''} paused`;

    this.container.innerHTML = `
      <!-- Video Element -->
      <video class="custom-video-element" playsinline preload="metadata" src="${this.videoData.url}" poster="${this.videoData.thumbnailUrl || ''}"></video>

      <!-- Center Play/Pause Overlay - ONLY APPEARS ON HOVER -->
      <div class="player-center-play-overlay">
        <button class="center-play-btn" id="centerPlayBtn" title="Reproduzir (Espaço)">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>

      <!-- Quality Badge (Strictly Resolution Category) -->
      <div class="player-top-badge" id="playerTopBadge">
        <span id="playerQualityLabel">${this.classifyResolution(this.videoData.resolution)}</span>
      </div>

      <!-- Bottom Control Bar -->
      <div class="player-controls-bar">
        <!-- Scrubber Timeline -->
        <div class="player-timeline-wrapper" id="timelineWrapper">
          <div class="player-timeline-track">
            <div class="player-buffer-bar" id="bufferBar"></div>
            <div class="player-progress-bar" id="progressBar"></div>
            <div class="player-scrubber-handle" id="scrubberHandle"></div>
          </div>
          <div class="player-time-tooltip" id="timeTooltip">00:00</div>
        </div>

        <!-- Controls Row -->
        <div class="player-controls-row">
          <div class="player-controls-left">
            <!-- Play/Pause -->
            <button class="player-btn" id="btnPlayPause" title="Reproduzir/Pausar (Espaço)">
              <svg viewBox="0 0 24 24" id="playIcon"><path d="M8 5v14l11-7z"/></svg>
            </button>

            <!-- Frame backward (-1 frame) -->
            <button class="player-btn" id="btnStepBack" title="Voltar 1 frame (Shift + ←)">
              <svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
            </button>

            <!-- Frame forward (+1 frame) -->
            <button class="player-btn" id="btnStepForward" title="Avançar 1 frame (Shift + →)">
              <svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
            </button>

            <!-- Volume / Mute -->
            <div class="volume-group">
              <button class="player-btn" id="btnVolume" title="Mudo (M)">
                <svg viewBox="0 0 24 24" id="volumeIcon"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
              </button>
              <input type="range" class="volume-slider" id="volumeSlider" min="0" max="1" step="0.05" value="1">
            </div>

            <!-- Timecode -->
            <span class="player-timecode" id="timecodeDisplay">00:00 / 00:00</span>
          </div>

          <div class="player-controls-right">
            <!-- Playback Speed -->
            <span class="player-speed-badge" id="btnSpeed" title="Velocidade de Reprodução">1.0x</span>

            <!-- Picture-in-Picture -->
            <button class="player-btn" id="btnPiP" title="Picture in Picture">
              <svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/></svg>
            </button>

            <!-- Direct Download Original High-Res File -->
            <a class="player-btn" id="btnDownload" href="${this.videoData.url}" download="${this.videoData.title}.mp4" title="Baixar Arquivo Original (Alta Qualidade)">
              <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            </a>

            <!-- Toggle Comments -->
            <button class="player-btn" id="btnPlayerToggleComments" title="Mostrar/Ocultar Comentários (C)">
              <svg viewBox="0 0 24 24"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
            </button>

            <!-- Fullscreen -->
            <button class="player-btn" id="btnFullscreen" title="Tela Cheia (F)">
              <svg viewBox="0 0 24 24" id="fullscreenIcon"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    this.video = this.container.querySelector('video');
    this.centerPlayBtn = this.container.querySelector('#centerPlayBtn');
    this.btnPlayPause = this.container.querySelector('#btnPlayPause');
    this.playIcon = this.container.querySelector('#playIcon');
    this.timelineWrapper = this.container.querySelector('#timelineWrapper');
    this.progressBar = this.container.querySelector('#progressBar');
    this.bufferBar = this.container.querySelector('#bufferBar');
    this.scrubberHandle = this.container.querySelector('#scrubberHandle');
    this.timeTooltip = this.container.querySelector('#timeTooltip');
    this.timecodeDisplay = this.container.querySelector('#timecodeDisplay');
    this.btnStepBack = this.container.querySelector('#btnStepBack');
    this.btnStepForward = this.container.querySelector('#btnStepForward');
    this.btnVolume = this.container.querySelector('#btnVolume');
    this.volumeSlider = this.container.querySelector('#volumeSlider');
    this.volumeIcon = this.container.querySelector('#volumeIcon');
    this.btnSpeed = this.container.querySelector('#btnSpeed');
    this.btnPiP = this.container.querySelector('#btnPiP');
    this.btnPlayerToggleComments = this.container.querySelector('#btnPlayerToggleComments');
    this.btnFullscreen = this.container.querySelector('#btnFullscreen');
    this.qualityBadgeText = this.container.querySelector('#playerQualityLabel');
  }

  classifyResolution(input, height) {
    // If width and height numbers provided from actual video file
    if (typeof input === 'number' && typeof height === 'number') {
      const p = Math.min(input, height);
      if (p >= 3841) return 'ULTRA';
      if (p >= 1441) return '4K';
      if (p >= 721) return 'FHD';
      if (p >= 561) return 'HD';
      return 'SD';
    }

    if (typeof input === 'number') {
      const p = input;
      if (p >= 3841) return 'ULTRA';
      if (p >= 1441) return '4K';
      if (p >= 721) return 'FHD';
      if (p >= 561) return 'HD';
      return 'SD';
    }

    const str = String(input || '').toUpperCase();
    if (['ULTRA', '4K', 'FHD', 'HD', 'SD'].includes(str)) return str;

    if (str.includes('8K') || str.includes('4320') || str.includes('ULTRA')) return 'ULTRA';
    if (str.includes('4K') || str.includes('2160') || str.includes('3840') || str.includes('UHD')) return '4K';
    if (str.includes('FHD') || str.includes('1080') || str.includes('1440') || str.includes('FULL HD') || str.includes('2K')) return 'FHD';
    if (str.includes('HD') || str.includes('720')) return 'HD';
    if (str.includes('SD') || str.includes('480') || str.includes('360') || str.includes('540')) return 'SD';

    const match = str.match(/(\d{3,4})P?/);
    if (match) {
      const p = parseInt(match[1], 10);
      if (p >= 3841) return 'ULTRA';
      if (p >= 1441) return '4K';
      if (p >= 721) return 'FHD';
      if (p >= 561) return 'HD';
      return 'SD';
    }

    return 'FHD';
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  togglePlay() {
    if (this.video.paused || this.video.ended) {
      this.video.play();
    } else {
      this.video.pause();
    }
  }

  seekTo(seconds) {
    if (!this.video) return;
    this.video.currentTime = Math.max(0, Math.min(seconds, this.video.duration || 0));
  }

  stepFrame(direction) {
    if (!this.video) return;
    this.video.pause();
    const frameTime = 1 / this.fps;
    this.video.currentTime = Math.max(0, Math.min(this.video.currentTime + direction * frameTime, this.video.duration || 0));
  }

  cycleSpeed() {
    this.currentSpeedIndex = (this.currentSpeedIndex + 1) % this.playbackSpeeds.length;
    const speed = this.playbackSpeeds[this.currentSpeedIndex];
    this.video.playbackRate = speed;
    this.btnSpeed.textContent = `${speed}x`;
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    if (this.video.muted) {
      this.volumeSlider.value = 0;
      this.volumeIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else {
      this.volumeSlider.value = this.video.volume;
      this.volumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
  }

  getOrientationInfo() {
    let angle = 0;
    let type = '';

    if (screen.orientation) {
      angle = screen.orientation.angle || 0;
      type = screen.orientation.type || '';
    } else if (typeof window.orientation !== 'undefined') {
      angle = window.orientation;
    }

    if (angle === -90) angle = 270;

    // Angle 90: counter-clockwise (top of phone is left -> landscape-primary)
    // Angle 270: clockwise (top of phone is right -> landscape-secondary)
    let direction = 'landscape-primary';
    if (angle === 270 || type === 'landscape-secondary') {
      direction = 'landscape-secondary';
    } else if (angle === 90 || type === 'landscape-primary') {
      direction = 'landscape-primary';
    }

    const isLandscape = (angle === 90 || angle === 270 || type.startsWith('landscape') || (window.innerWidth > window.innerHeight && window.innerHeight < 600));

    return { isLandscape, direction, angle, type };
  }

  isFullscreen() {
    const isNative = !!(
      (document.fullscreenElement && (document.fullscreenElement === this.container || this.container.contains(document.fullscreenElement))) ||
      (document.webkitFullscreenElement && (document.webkitFullscreenElement === this.container || this.container.contains(document.webkitFullscreenElement))) ||
      (this.video && this.video.webkitDisplayingFullscreen)
    );
    return isNative || this.container.classList.contains('is-fullscreen');
  }

  enterFullscreen(direction = 'landscape-primary') {
    if (this.isFullscreen()) {
      this.applyOrientationLock(direction);
      return;
    }

    // iPhone Safari check (div requestFullscreen is unsupported on iPhone, but video.webkitEnterFullscreen works natively)
    const isIPhone = /iPhone|iPod/i.test(navigator.userAgent);
    if (isIPhone && this.video && this.video.webkitEnterFullscreen && !this.container.requestFullscreen) {
      try {
        this.video.webkitEnterFullscreen();
      } catch (e) {
        console.warn('webkitEnterFullscreen error:', e);
      }
      return;
    }

    const req = this.container.requestFullscreen ||
                this.container.webkitRequestFullscreen ||
                this.container.mozRequestFullScreen ||
                this.container.msRequestFullscreen;

    if (req) {
      const p = req.call(this.container);
      if (p && p.then) {
        p.then(() => {
          this.applyOrientationLock(direction);
        }).catch(() => {
          if (this.video && this.video.webkitEnterFullscreen) {
            try { this.video.webkitEnterFullscreen(); } catch (e) {}
          }
        });
      } else {
        this.applyOrientationLock(direction);
      }
    } else if (this.video && this.video.webkitEnterFullscreen) {
      try { this.video.webkitEnterFullscreen(); } catch (e) {}
    }
  }

  exitFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    if (this.video && this.video.webkitDisplayingFullscreen) {
      this.video.webkitExitFullscreen();
    }
    this.container.classList.remove('is-fullscreen');
    document.body.classList.remove('video-fullscreen-active');

    if (screen.orientation && screen.orientation.unlock) {
      try { screen.orientation.unlock(); } catch (e) {}
    }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('portrait').catch(() => {});
    }
  }

  toggleFullscreen() {
    if (!this.isFullscreen()) {
      const info = this.getOrientationInfo();
      const targetDir = info.isLandscape ? info.direction : 'landscape-primary';
      this.enterFullscreen(targetDir);
    } else {
      this.exitFullscreen();
    }
  }

  applyOrientationLock(direction) {
    if (screen.orientation && screen.orientation.lock) {
      const targetLock = direction === 'landscape-secondary' ? 'landscape-secondary' : 'landscape-primary';
      screen.orientation.lock(targetLock).catch(() => {
        screen.orientation.lock('landscape').catch(() => {});
      });
    }
  }

  setupOrientationHandler() {
    CustomVideoPlayer.activeInstance = this;

    this.onOrientationChange = () => {
      // Settle time for viewport on mobile rotation
      setTimeout(() => {
        if (!this.video) return;
        const info = this.getOrientationInfo();

        if (info.isLandscape) {
          // "se estiver rodando um vídeo, e a pessoa girar o celular, o vídeo fica em tela cheia e reproduz na direção correspondente ao que o smartphone foi girado"
          const isRunning = this.isPlaying || (!this.video.paused && !this.video.ended);
          if (isRunning) {
            this.enterFullscreen(info.direction);
          }
        } else {
          // Returned to portrait: exit fullscreen
          if (this.isFullscreen()) {
            this.exitFullscreen();
          }
        }
      }, 150);
    };

    window.addEventListener('orientationchange', this.onOrientationChange);
    if (screen.orientation) {
      screen.orientation.addEventListener('change', this.onOrientationChange);
    }

    this.onFullscreenChange = () => {
      const isNative = !!(
        (document.fullscreenElement && (document.fullscreenElement === this.container || this.container.contains(document.fullscreenElement))) ||
        (document.webkitFullscreenElement && (document.webkitFullscreenElement === this.container || this.container.contains(document.webkitFullscreenElement))) ||
        (this.video && this.video.webkitDisplayingFullscreen)
      );

      if (!isNative) {
        // Native fullscreen was exited (e.g. by pressing Esc or browser gesture)
        this.exitFullscreen();
      } else {
        this.container.classList.add('is-fullscreen');
        document.body.classList.add('video-fullscreen-active');
      }
    };

    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.onFullscreenChange);

    this.video.addEventListener('webkitbeginfullscreen', () => {
      document.body.classList.add('video-fullscreen-active');
      this.container.classList.add('is-fullscreen');
    });

    this.video.addEventListener('webkitendfullscreen', () => {
      document.body.classList.remove('video-fullscreen-active');
      this.container.classList.remove('is-fullscreen');
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(() => {});
      }
    });
  }

  bindEvents() {
    // Read real file resolution upon metadata load and update badge
    this.video.addEventListener('loadedmetadata', () => {
      const realWidth = this.video.videoWidth;
      const realHeight = this.video.videoHeight;
      if (realWidth && realHeight) {
        const qualityLabel = this.classifyResolution(realWidth, realHeight);
        if (this.qualityBadgeText) {
          this.qualityBadgeText.textContent = qualityLabel;
        }
      }
    });

    // Play/Pause button clicks
    this.centerPlayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showHUD();
      this.togglePlay();
    });

    this.btnPlayPause.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showHUD();
      this.togglePlay();
    });

    this.video.addEventListener('click', () => {
      this.showHUD();
      this.togglePlay();
    });

    // Playback state updates
    this.video.addEventListener('play', () => {
      this.isPlaying = true;
      this.showHUD();
      this.container.classList.remove('paused');
      this.playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      this.centerPlayBtn.classList.add('paused');
      this.centerPlayBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    });

    this.video.addEventListener('pause', () => {
      this.isPlaying = false;
      this.showHUD();
      this.container.classList.add('paused');
      this.playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      this.centerPlayBtn.classList.remove('paused');
      this.centerPlayBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    });

    // Erro ao carregar vídeo (fallback para Google Drive Player / Download direto)
    this.video.addEventListener('error', (e) => {
      console.warn('Vídeo não pôde ser reproduzido diretamente via HTML5 stream:', e);
      if (this.videoData.driveFileId) {
        const fallbackNotice = document.createElement('div');
        fallbackNotice.className = 'player-stream-fallback';
        fallbackNotice.style.cssText = 'position:absolute;inset:0;background:rgba(13,15,18,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:30;padding:24px;text-align:center;';
        fallbackNotice.innerHTML = `
          <div style="font-size:32px;color:var(--accent-orange,#FF5400)">▶</div>
          <h4 style="font-size:16px;font-weight:700;color:#fff;margin:0;">Reproduzir no Google Drive</h4>
          <p style="font-size:13px;color:#a1a1aa;max-width:320px;line-height:1.4;margin:0;">
            O arquivo original é protegido pelo Google Drive. Você pode assisti-lo em alta qualidade ou baixá-lo na íntegra.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
            <a href="https://drive.google.com/file/d/${this.videoData.driveFileId}/preview" target="_blank" class="btn-primary" style="text-decoration:none;padding:10px 18px;font-size:13px;">
              Assistir Prévia no Drive ↗
            </a>
            <a href="${this.videoData.downloadUrl}" class="btn-secondary" style="text-decoration:none;padding:10px 18px;font-size:13px;">
              Baixar Arquivo Original
            </a>
          </div>
        `;
        this.container.appendChild(fallbackNotice);
      }
    });

    // Time update & Progress bar
    this.video.addEventListener('timeupdate', () => {
      const cur = this.video.currentTime;
      const dur = this.video.duration || 0;
      const percent = dur > 0 ? (cur / dur) * 100 : 0;
      this.progressBar.style.width = `${percent}%`;
      this.scrubberHandle.style.left = `${percent}%`;
      this.timecodeDisplay.textContent = `${this.formatTime(cur)} / ${this.formatTime(dur)}`;

      if (this.options.onTimeUpdate) {
        this.options.onTimeUpdate(cur, dur);
      }
    });

    // Buffer progress
    this.video.addEventListener('progress', () => {
      if (this.video.buffered.length > 0) {
        const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
        const dur = this.video.duration || 0;
        if (dur > 0) {
          this.bufferBar.style.width = `${(bufferedEnd / dur) * 100}%`;
        }
      }
    });

    // Scrubber click & drag
    const handleTimelineSeek = (e) => {
      const rect = this.timelineWrapper.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur = this.video.duration || 0;
      this.video.currentTime = pos * dur;
    };

    let isSeeking = false;
    this.timelineWrapper.addEventListener('mousedown', (e) => {
      isSeeking = true;
      this.isInteracting = true;
      this.showHUD();
      handleTimelineSeek(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (isSeeking) {
        this.showHUD();
        handleTimelineSeek(e);
      }
    });

    window.addEventListener('mouseup', () => {
      if (isSeeking) {
        isSeeking = false;
        this.isInteracting = false;
        this.showHUD();
      }
    });

    // Timeline hover tooltip
    this.timelineWrapper.addEventListener('mousemove', (e) => {
      const rect = this.timelineWrapper.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur = this.video.duration || 0;
      const hoverTime = pos * dur;
      this.timeTooltip.style.left = `${pos * 100}%`;
      this.timeTooltip.textContent = this.formatTime(hoverTime);
    });

    // Frame Stepping
    this.btnStepBack.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stepFrame(-1);
    });

    this.btnStepForward.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stepFrame(1);
    });

    // Volume Slider
    this.volumeSlider.addEventListener('mousedown', () => {
      this.isInteracting = true;
      this.showHUD();
    });
    this.volumeSlider.addEventListener('mouseup', () => {
      this.isInteracting = false;
      this.showHUD();
    });
    this.volumeSlider.addEventListener('input', (e) => {
      this.showHUD();
      const val = parseFloat(e.target.value);
      this.video.volume = val;
      this.video.muted = val === 0;
    });

    this.btnVolume.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showHUD();
      this.toggleMute();
    });

    // Speed Cycle
    this.btnSpeed.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cycleSpeed();
    });

    // PiP
    if (document.pictureInPictureEnabled) {
      this.btnPiP.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else {
            await this.video.requestPictureInPicture();
          }
        } catch (err) {
          console.error('PiP Error:', err);
        }
      });
    } else {
      this.btnPiP.style.display = 'none';
    }

    // Toggle Comments Button
    if (this.btnPlayerToggleComments) {
      this.btnPlayerToggleComments.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof this.options.onToggleComments === 'function') {
          this.options.onToggleComments();
        }
      });
    }

    // Fullscreen
    this.btnFullscreen.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });

    // Keyboard Shortcuts
    this.keyHandler = (e) => {
      // Don't trigger if user is typing in textarea/input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      this.showHUD();

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          this.stepFrame(-1);
        } else {
          this.seekTo(this.video.currentTime - 5);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          this.stepFrame(1);
        } else {
          this.seekTo(this.video.currentTime + 5);
        }
      } else if (e.code === 'KeyM') {
        this.toggleMute();
      } else if (e.code === 'KeyF') {
        this.toggleFullscreen();
      } else if (e.code === 'Escape' || e.key === 'Escape' || e.keyCode === 27) {
        if (this.isFullscreen()) {
          this.exitFullscreen();
        }
      } else if (e.code === 'KeyC') {
        e.preventDefault();
        if (typeof this.options.onToggleComments === 'function') {
          this.options.onToggleComments();
        }
      }
    };

    window.addEventListener('keydown', this.keyHandler);
  }

  setCommentsActive(isActive) {
    if (this.btnPlayerToggleComments) {
      if (isActive) {
        this.btnPlayerToggleComments.classList.add('is-active');
      } else {
        this.btnPlayerToggleComments.classList.remove('is-active');
      }
    }
  }

  destroy() {
    clearTimeout(this.inactivityTimer);
    if (this.onActivity) {
      this.container.removeEventListener('mousemove', this.onActivity);
      this.container.removeEventListener('mouseenter', this.onActivity);
      this.container.removeEventListener('mouseleave', this.onMouseLeave);
      this.container.removeEventListener('touchstart', this.onActivity);
      this.container.removeEventListener('touchmove', this.onActivity);
    }
    if (this.onOrientationChange) {
      window.removeEventListener('orientationchange', this.onOrientationChange);
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', this.onOrientationChange);
      }
    }
    if (this.onFullscreenChange) {
      document.removeEventListener('fullscreenchange', this.onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);
    }
    if (this.isFullscreen()) {
      this.exitFullscreen();
    }
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
    }
    if (this.video) {
      this.video.pause();
      this.video.src = '';
    }
    if (CustomVideoPlayer.activeInstance === this) {
      CustomVideoPlayer.activeInstance = null;
    }
  }
}

window.CustomVideoPlayer = CustomVideoPlayer;
window.classifyResolution = (input, height) => CustomVideoPlayer.prototype.classifyResolution(input, height);
