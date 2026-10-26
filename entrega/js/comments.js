// Comments System for Giffú Entrega
// Supports Google Account Authentication, timecode pinned comments, and replies

class CommentsController {
  constructor(containerElement, project, video, playerInstance, options = {}) {
    this.container = containerElement;
    this.project = project;
    this.video = video;
    this.player = playerInstance;
    this.options = options || {};
    this.comments = [];
    this.currentUser = this.loadCurrentUser();
    this.currentTime = 0;

    this.init();
  }

  loadCurrentUser() {
    return (window.Auth && window.Auth.user) || null;
  }

  setCurrentUser(user) {
    this.currentUser = user;
    this.render();
  }

  updateVideoTime(currentTime) {
    this.currentTime = currentTime;
    const pill = this.container.querySelector('#currentTimePill');
    if (pill) {
      pill.textContent = this.formatTime(currentTime);
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async loadComments() {
    try {
      const data = await window.API.getData();
      if (window.app && window.app.data) {
        window.app.data.comments = data.comments || [];
      }
      this.comments = (data.comments || []).filter(c => c.videoId === this.video.id);
      this.render();
      if (this.options && typeof this.options.onCommentsUpdated === 'function') {
        this.options.onCommentsUpdated(data.comments || []);
      }
    } catch (e) {
      console.error('Error loading comments:', e);
    }
  }

  async init() {
    await this.loadComments();
  }

  setVideo(newVideo) {
    this.video = newVideo;
    this.loadComments();
  }

  render() {
    if (!this.project.allowComments) {
      this.container.innerHTML = `
        <div class="comments-panel-header">
          <div class="comments-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
            Comentários
          </div>
          <button class="btn-close-comments-panel" id="btnCloseCommentsPanel" title="Ocultar comentários">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <div class="comments-disabled-notice">
          <p>O espaço para comentários foi desativado pelo autor para este projeto.</p>
        </div>
      `;
      this.container.querySelector('#btnCloseCommentsPanel')?.addEventListener('click', () => {
        if (this.options && typeof this.options.onClose === 'function') this.options.onClose();
      });
      return;
    }

    const commentsCount = this.comments.reduce((acc, c) => acc + 1 + (c.replies ? c.replies.length : 0), 0);
    const unresolvedCount = this.comments.filter(c => !c.resolved).length;
    if (this.options && typeof this.options.onCountChange === 'function') {
      this.options.onCountChange(commentsCount, unresolvedCount);
    }

    this.container.innerHTML = `
      <div class="comments-panel-header">
        <div class="comments-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"/></svg>
          Comentários
          <span class="comments-count-badge ${unresolvedCount > 0 ? 'has-unresolved' : ''}">${commentsCount}</span>
        </div>
        <button class="btn-close-comments-panel" id="btnCloseCommentsPanel" title="Ocultar comentários (expandir player)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      <!-- Google Auth Status Bar -->
      ${this.renderAuthSection()}

      <!-- Comments List -->
      <div class="comments-list" id="commentsList">
        ${this.renderCommentsList()}
      </div>

      <!-- Comment Input Area -->
      ${this.renderInputArea()}
    `;

    this.bindEvents();
  }

  renderAuthSection() {
    if (!this.currentUser) {
      return `
        <div class="comments-auth-banner">
          <button class="btn-google-login" id="btnGoogleAuthPrompt">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            Entrar com Google para Comentar
          </button>
        </div>
      `;
    }

    return `
      <div class="logged-user-bar">
        <div class="logged-user-info">
          <img class="logged-avatar" src="${this.currentUser.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces'}" alt="Avatar">
          <span class="logged-name">${this.currentUser.name} ${this.currentUser.isAuthor ? '(Autor)' : ''}</span>
        </div>
        <button class="btn-auth-switch" id="btnSwitchAccount" title="Trocar conta">Trocar</button>
      </div>
    `;
  }

  renderCommentsList() {
    if (this.comments.length === 0) {
      const isImage = this.video && this.video.type === 'image';
      return `
        <div class="comment-empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p>${isImage ? 'Nenhum comentário ainda.<br>Deixe sua observação ou feedback sobre esta foto!' : 'Nenhum comentário ainda.<br>Clique no player e comente com marcação de tempo!'}</p>
        </div>
      `;
    }

    return this.comments.map(c => {
      const canModifyComment = this.currentUser && (
        this.currentUser.isAuthor || 
        (this.currentUser.email && this.currentUser.email === c.authorEmail)
      );

      const isResolved = Boolean(c.resolved);

      return `
      <div class="comment-item ${isResolved ? 'is-resolved' : ''}" data-id="${c.id}">
        <div class="comment-header">
          <div class="comment-author-info">
            <img class="comment-avatar" src="${c.authorAvatar}" alt="Avatar">
            <span class="comment-author-name">${c.authorName}</span>
            ${c.isAuthor ? '<span class="badge-role-author">AUTOR</span>' : ''}
          </div>
          ${this.video && this.video.type === 'image' ? `
            <span class="comment-timecode-badge" style="cursor: default;" title="Comentário sobre a foto">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
              Foto
            </span>
          ` : `
            <button class="comment-timecode-badge" data-timecode="${c.timecode}" title="Pular para este momento no vídeo">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.48 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>
              ${c.timecodeFormatted || this.formatTime(c.timecode)}
            </button>
          `}
        </div>

        <div class="comment-body-text" id="commentText-${c.id}">${this.escapeHTML(c.content)}</div>

        <!-- Inline Comment Edit Form -->
        <div class="comment-edit-form" id="editCommentForm-${c.id}" style="display: none;">
          <textarea class="comment-textarea edit-comment-textarea" style="height: 56px;">${this.escapeHTML(c.content)}</textarea>
          <div class="comment-edit-actions">
            <button class="btn-secondary btn-cancel-edit-comment" style="padding: 4px 8px; font-size: 11px;" data-comment-id="${c.id}">Cancelar</button>
            <button class="btn-primary btn-save-edit-comment" style="padding: 4px 10px; font-size: 11px;" data-comment-id="${c.id}">Salvar</button>
          </div>
        </div>

        <div class="comment-footer">
          <span>${this.formatDate(c.createdAt)}</span>
          <div class="comment-actions-group">
            <button class="btn-resolve-comment ${isResolved ? 'is-resolved' : ''}" data-comment-id="${c.id}" title="${isResolved ? 'Comentário resolvido (clique para reabrir)' : 'Marcar como resolvido'}" aria-label="${isResolved ? 'Resolvido' : 'Marcar como resolvido'}">
              ${isResolved ? `
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="#10b981"/>
                  <polyline points="8 12 11 15 16 9" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              ` : `
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9.5"/>
                  <polyline points="8 12 11 15 16 9"/>
                </svg>
              `}
            </button>
            <button class="btn-reply-toggle" data-comment-id="${c.id}">Responder</button>
            ${canModifyComment ? `
              <button class="comment-action-link btn-edit-comment" data-comment-id="${c.id}">Editar</button>
              <button class="comment-action-link danger btn-delete-comment" data-comment-id="${c.id}">Excluir</button>
            ` : ''}
          </div>
        </div>

        <!-- Reply Form (Hidden by default) -->
        <div class="reply-form-wrapper" id="replyForm-${c.id}" style="display: none; margin-top: 8px;">
          <textarea class="comment-textarea" style="height: 48px;" placeholder="Escreva uma resposta..."></textarea>
          <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px;">
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="document.getElementById('replyForm-${c.id}').style.display='none'">Cancelar</button>
            <button class="btn-primary btn-submit-reply" style="padding: 4px 10px; font-size: 11px;" data-comment-id="${c.id}">Enviar Resposta</button>
          </div>
        </div>

        <!-- Replies List -->
        ${c.replies && c.replies.length > 0 ? `
          <div class="comment-replies-list">
            ${c.replies.map(r => {
              const canModifyReply = this.currentUser && (
                this.currentUser.isAuthor || 
                (this.currentUser.email && this.currentUser.email === r.authorEmail)
              );
              return `
              <div class="reply-item" data-reply-id="${r.id}">
                <div class="reply-header">
                  <img class="reply-avatar" src="${r.authorAvatar}" alt="Avatar">
                  <span class="reply-author">${r.authorName} ${r.isAuthor ? '<span class="badge-role-author">AUTOR</span>' : ''}</span>
                </div>
                <div class="reply-text" id="replyText-${r.id}">${this.escapeHTML(r.content)}</div>

                <!-- Inline Reply Edit Form -->
                <div class="comment-edit-form" id="editReplyForm-${r.id}" style="display: none; margin-top: 6px;">
                  <textarea class="comment-textarea edit-reply-textarea" style="height: 48px;">${this.escapeHTML(r.content)}</textarea>
                  <div class="comment-edit-actions">
                    <button class="btn-secondary btn-cancel-edit-reply" style="padding: 4px 8px; font-size: 11px;" data-reply-id="${r.id}">Cancelar</button>
                    <button class="btn-primary btn-save-edit-reply" style="padding: 4px 10px; font-size: 11px;" data-comment-id="${c.id}" data-reply-id="${r.id}">Salvar</button>
                  </div>
                </div>

                <div class="reply-footer">
                  <span>${this.formatDate(r.createdAt)}</span>
                  ${canModifyReply ? `
                    <div class="comment-actions-group">
                      <button class="comment-action-link btn-edit-reply" data-reply-id="${r.id}">Editar</button>
                      <button class="comment-action-link danger btn-delete-reply" data-comment-id="${c.id}" data-reply-id="${r.id}">Excluir</button>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `;
    }).join('');
  }

  renderInputArea() {
    const isImage = this.video && this.video.type === 'image';
    const formattedCurrentTime = this.formatTime(this.currentTime);

    return `
      <div class="comments-input-area">
        <textarea class="comment-textarea" id="mainCommentText" placeholder="${isImage ? 'Escreva uma observação sobre esta foto...' : 'Escreva uma observação ou comentário...'}"></textarea>
        <div class="comment-input-controls">
          ${!isImage ? `
            <label class="timecode-checkbox-label">
              <input type="checkbox" id="checkIncludeTimecode" checked>
              <span>Marcar no tempo: <strong class="current-time-pill" id="currentTimePill">${formattedCurrentTime}</strong></span>
            </label>
          ` : `<div></div>`}
          <button class="btn-send-comment" id="btnSubmitComment">Comentar</button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Close / hide comments panel button
    const btnClose = this.container.querySelector('#btnCloseCommentsPanel');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (this.options && typeof this.options.onClose === 'function') {
          this.options.onClose();
        }
      });
    }

    // Google Auth prompt button
    const btnGoogle = this.container.querySelector('#btnGoogleAuthPrompt');
    if (btnGoogle) {
      btnGoogle.addEventListener('click', () => {
        this.openGoogleLoginModal();
      });
    }

    // Switch account
    const btnSwitch = this.container.querySelector('#btnSwitchAccount');
    if (btnSwitch) {
      btnSwitch.addEventListener('click', () => {
        this.openGoogleLoginModal(true);
      });
    }

    // Click timecode to seek video
    const timecodeBadges = this.container.querySelectorAll('.comment-timecode-badge');
    timecodeBadges.forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const time = parseFloat(badge.getAttribute('data-timecode'));
        if (this.player && !isNaN(time)) {
          this.player.seekTo(time);
          window.showToast(`Vídeo posicionado em ${badge.textContent.trim()}`);
        }
      });
    });

    // Toggle resolve comment
    const resolveButtons = this.container.querySelectorAll('.btn-resolve-comment');
    resolveButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        if (!this.currentUser) {
          this.openGoogleLoginModal();
          return;
        }

        try {
          btn.disabled = true;
          const updated = await window.API.toggleResolveComment(commentId);
          await this.loadComments();
          window.showToast(updated.resolved ? 'Comentário marcado como resolvido ✓' : 'Comentário reaberto');
        } catch (err) {
          alert('Erro ao alterar status do comentário');
        } finally {
          btn.disabled = false;
        }
      });
    });

    // Toggle reply forms
    const replyButtons = this.container.querySelectorAll('.btn-reply-toggle');
    replyButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        const form = document.getElementById(`replyForm-${commentId}`);
        if (form) {
          form.style.display = form.style.display === 'none' ? 'block' : 'none';
          if (form.style.display === 'block') {
            form.querySelector('textarea').focus();
          }
        }
      });
    });

    // Edit Comment - toggle form
    const editCommentButtons = this.container.querySelectorAll('.btn-edit-comment');
    editCommentButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        const form = document.getElementById(`editCommentForm-${commentId}`);
        const textEl = document.getElementById(`commentText-${commentId}`);
        if (form) {
          const isHidden = form.style.display === 'none';
          form.style.display = isHidden ? 'flex' : 'none';
          if (textEl) textEl.style.display = isHidden ? 'none' : 'block';
          if (isHidden) {
            const ta = form.querySelector('textarea');
            if (ta) {
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          }
        }
      });
    });

    // Cancel Edit Comment
    const cancelEditCommentButtons = this.container.querySelectorAll('.btn-cancel-edit-comment');
    cancelEditCommentButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        const form = document.getElementById(`editCommentForm-${commentId}`);
        const textEl = document.getElementById(`commentText-${commentId}`);
        if (form) form.style.display = 'none';
        if (textEl) textEl.style.display = 'block';
      });
    });

    // Save Edit Comment
    const saveEditCommentButtons = this.container.querySelectorAll('.btn-save-edit-comment');
    saveEditCommentButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        const form = document.getElementById(`editCommentForm-${commentId}`);
        const textarea = form ? form.querySelector('textarea') : null;
        const content = textarea ? textarea.value.trim() : '';

        if (!content) {
          alert('O comentário não pode ficar vazio.');
          return;
        }

        try {
          await window.API.updateComment(commentId, content);
          await this.loadComments();
          window.showToast('Comentário atualizado');
        } catch (err) {
          alert('Erro ao atualizar comentário');
        }
      });
    });

    // Delete Comment
    const deleteCommentButtons = this.container.querySelectorAll('.btn-delete-comment');
    deleteCommentButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        if (!confirm('Deseja excluir este comentário?')) return;

        try {
          await window.API.deleteComment(commentId);
          await this.loadComments();
          window.showToast('Comentário excluído');
        } catch (err) {
          alert('Erro ao excluir comentário');
        }
      });
    });

    // Edit Reply - toggle form
    const editReplyButtons = this.container.querySelectorAll('.btn-edit-reply');
    editReplyButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const replyId = btn.getAttribute('data-reply-id');
        const form = document.getElementById(`editReplyForm-${replyId}`);
        const textEl = document.getElementById(`replyText-${replyId}`);
        if (form) {
          const isHidden = form.style.display === 'none';
          form.style.display = isHidden ? 'flex' : 'none';
          if (textEl) textEl.style.display = isHidden ? 'none' : 'block';
          if (isHidden) {
            const ta = form.querySelector('textarea');
            if (ta) {
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          }
        }
      });
    });

    // Cancel Edit Reply
    const cancelEditReplyButtons = this.container.querySelectorAll('.btn-cancel-edit-reply');
    cancelEditReplyButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const replyId = btn.getAttribute('data-reply-id');
        const form = document.getElementById(`editReplyForm-${replyId}`);
        const textEl = document.getElementById(`replyText-${replyId}`);
        if (form) form.style.display = 'none';
        if (textEl) textEl.style.display = 'block';
      });
    });

    // Save Edit Reply
    const saveEditReplyButtons = this.container.querySelectorAll('.btn-save-edit-reply');
    saveEditReplyButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        const replyId = btn.getAttribute('data-reply-id');
        const form = document.getElementById(`editReplyForm-${replyId}`);
        const textarea = form ? form.querySelector('textarea') : null;
        const content = textarea ? textarea.value.trim() : '';

        if (!content) {
          alert('A resposta não pode ficar vazia.');
          return;
        }

        try {
          await window.API.updateReply(commentId, replyId, content);
          await this.loadComments();
          window.showToast('Resposta atualizada');
        } catch (err) {
          alert('Erro ao atualizar resposta');
        }
      });
    });

    // Delete Reply
    const deleteReplyButtons = this.container.querySelectorAll('.btn-delete-reply');
    deleteReplyButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        const replyId = btn.getAttribute('data-reply-id');
        if (!confirm('Deseja excluir esta resposta?')) return;

        try {
          await window.API.deleteReply(commentId, replyId);
          await this.loadComments();
          window.showToast('Resposta excluída');
        } catch (err) {
          alert('Erro ao excluir resposta');
        }
      });
    });

    // Submit reply
    const submitReplyButtons = this.container.querySelectorAll('.btn-submit-reply');
    submitReplyButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const commentId = btn.getAttribute('data-comment-id');
        const form = document.getElementById(`replyForm-${commentId}`);
        const textarea = form.querySelector('textarea');
        const content = textarea.value.trim();

        if (!content) return;

        if (!this.currentUser) {
          this.openGoogleLoginModal();
          return;
        }

        try {
          await window.API.replyComment(commentId, {
            authorName: this.currentUser.name,
            authorEmail: this.currentUser.email,
            authorAvatar: this.currentUser.avatar,
            isAuthor: this.currentUser.isAuthor,
            content
          });
          await this.loadComments();
          window.showToast('Resposta enviada com sucesso');
        } catch (err) {
          alert('Erro ao enviar resposta');
        }
      });
    });

    // Submit main comment
    const btnSubmit = this.container.querySelector('#btnSubmitComment');
    const textarea = this.container.querySelector('#mainCommentText');
    const checkboxTimecode = this.container.querySelector('#checkIncludeTimecode');

    if (btnSubmit && textarea) {
      btnSubmit.addEventListener('click', async () => {
        const content = textarea.value.trim();
        if (!content) return;

        if (!this.currentUser) {
          this.openGoogleLoginModal();
          return;
        }

        const isImage = this.video && this.video.type === 'image';
        const includeTime = isImage ? false : (checkboxTimecode ? checkboxTimecode.checked : true);
        const commentTimecode = includeTime ? Math.floor(this.currentTime) : 0;
        const timecodeFormatted = isImage ? 'Foto' : (includeTime ? this.formatTime(this.currentTime) : 'Geral');

        try {
          await window.API.addComment({
            projectId: this.project.id,
            videoId: this.video.id,
            authorName: this.currentUser.name,
            authorEmail: this.currentUser.email,
            authorAvatar: this.currentUser.avatar,
            isAuthor: this.currentUser.isAuthor,
            timecode: commentTimecode,
            timecodeFormatted,
            content
          });

          textarea.value = '';
          await this.loadComments();
          window.showToast('Comentário registrado');
        } catch (err) {
          alert('Erro ao registrar comentário');
        }
      });
    }
  }

  async openGoogleLoginModal(switchAccount = false) {
    try {
      const user = await window.Auth.signIn('client', { switchAccount });
      this.setCurrentUser(user);
      window.showToast(`Conectado como ${user.name}`);
    } catch (err) {
      if (err && err.message && err.message !== 'Login cancelado') alert(err.message);
    }
  }

  escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'agora';
    }
  }
}

window.CommentsController = CommentsController;
