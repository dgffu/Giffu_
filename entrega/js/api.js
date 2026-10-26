// API Client for Giffú Entrega
// Funciona 100% de forma estática no GitHub Pages (giffu.com.br/entrega)
// e preserva compatibilidade com o servidor local (localhost:3000)

const LOCAL_STORAGE_KEY = 'giffu_entrega_db_v3';

function normalizeMediaItem(item) {
  if (!item) return item;
  const clone = { ...item };

  if (clone.driveFileId) {
    if (clone.type === 'image') {
      clone.thumbnailUrl = `https://lh3.googleusercontent.com/d/${clone.driveFileId}=w640`;
      clone.previewUrl = `https://lh3.googleusercontent.com/d/${clone.driveFileId}=w2560`;
      clone.downloadUrl = `https://drive.usercontent.google.com/download?id=${clone.driveFileId}&export=download&confirm=t`;
      clone.url = clone.previewUrl;
    } else {
      clone.thumbnailUrl = `https://lh3.googleusercontent.com/d/${clone.driveFileId}`;
      clone.downloadUrl = `https://drive.usercontent.google.com/download?id=${clone.driveFileId}&export=download&confirm=t`;
      clone.streamUrl = `https://drive.usercontent.google.com/download?id=${clone.driveFileId}&export=download&confirm=t`;
      clone.previewUrl = `https://drive.google.com/file/d/${clone.driveFileId}/preview`;
      if (!clone.url || clone.url.startsWith('/api/stream')) {
        clone.url = clone.streamUrl;
      }
    }
  } else if (clone.url && clone.url.startsWith('/assets/')) {
    clone.url = '/entrega' + clone.url;
    clone.downloadUrl = clone.url;
  } else if (!clone.downloadUrl && clone.url) {
    clone.downloadUrl = clone.url;
  }

  return clone;
}

function normalizeProject(project) {
  if (!project) return project;
  const p = { ...project };
  if (Array.isArray(p.videos)) {
    p.videos = p.videos.map(normalizeMediaItem);
  } else {
    p.videos = [];
  }
  return p;
}

function loadLocalDB() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Erro ao ler DB do localStorage:', e);
  }
  return null;
}

function saveLocalDB(data) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Erro ao salvar DB no localStorage:', e);
  }
}

const API = {
  _cachedData: null,

  async getData() {
    // 1. Tenta carregar do backend local se estiver ativo
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/api/data', { signal: controller.signal, credentials: 'include' });
      clearTimeout(timeoutId);
      if (res.ok) {
        const remoteData = await res.json();
        if (remoteData && remoteData.projects) {
          remoteData.projects = remoteData.projects.map(normalizeProject);
          this._cachedData = remoteData;
          saveLocalDB(remoteData);
          return remoteData;
        }
      }
    } catch (e) {
      // Backend local offline ou ambiente GitHub Pages estático
    }

    // 2. Se temos no localStorage, usamos como base e mesclamos
    let db = loadLocalDB();

    // 3. Se ainda não há cache local, carrega do arquivo estático db.json
    if (!db || !db.projects || db.projects.length === 0) {
      try {
        const staticRes = await fetch('/entrega/data/db.json').catch(() => fetch('./data/db.json'));
        if (staticRes.ok) {
          const staticData = await staticRes.json();
          db = staticData;
        }
      } catch (err) {
        console.warn('Não foi possível carregar db.json estático:', err);
      }
    }

    if (!db) {
      db = {
        settings: {
          appName: "Giffú Entrega",
          baseDomain: "giffu.com.br",
          authorEmail: "novelfilmes@gmail.com",
          authorName: "Giffú",
          authorAvatar: "https://lh3.googleusercontent.com/a/default-user=s96-c",
          theme: "dark"
        },
        years: [new Date().getFullYear().toString()],
        projects: [],
        comments: []
      };
    }

    db.projects = (db.projects || []).map(normalizeProject);
    db.comments = db.comments || [];
    this._cachedData = db;
    saveLocalDB(db);
    return db;
  },

  async createProject(projectData) {
    const db = await this.getData();
    const id = `proj-${Date.now()}`;
    const name = (projectData.name || 'Novo Projeto').trim();
    let slug = projectData.slug || name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Evita duplicidade de slug
    if (db.projects.some(p => p.slug === slug)) {
      slug = `${slug}_${Date.now().toString().slice(-4)}`;
    }

    const newProject = normalizeProject({
      id,
      year: projectData.year || new Date().getFullYear().toString(),
      name,
      slug,
      clientName: (projectData.clientName || '').trim(),
      driveLink: (projectData.driveLink || '').trim(),
      password: projectData.password ? String(projectData.password).trim() : '',
      allowComments: projectData.allowComments !== false,
      category: projectData.category || 'Eventos',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      videos: []
    });

    db.projects.unshift(newProject);
    saveLocalDB(db);
    this._cachedData = db;
    return newProject;
  },

  async updateProject(id, projectData) {
    const db = await this.getData();
    const index = db.projects.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Projeto não encontrado');

    const current = db.projects[index];
    const updated = {
      ...current,
      ...projectData,
      updatedAt: new Date().toISOString()
    };

    db.projects[index] = normalizeProject(updated);
    saveLocalDB(db);
    this._cachedData = db;
    return db.projects[index];
  },

  async updateProjectCategory(id, category) {
    return this.updateProject(id, { category });
  },

  async archiveProject(id) {
    return this.updateProject(id, { archived: true });
  },

  async unarchiveProject(id) {
    return this.updateProject(id, { archived: false });
  },

  async deleteProject(id) {
    const db = await this.getData();
    db.projects = db.projects.filter(p => p.id !== id);
    db.comments = (db.comments || []).filter(c => c.projectId !== id);
    saveLocalDB(db);
    this._cachedData = db;
    return { success: true };
  },

  async addVideo(projectId, videoData) {
    const db = await this.getData();
    const project = db.projects.find(p => p.id === projectId);
    if (!project) throw new Error('Projeto não encontrado');

    const videoId = videoData.id || `vid-${Date.now()}`;
    const newMedia = normalizeMediaItem({
      ...videoData,
      id: videoId
    });

    project.videos.push(newMedia);
    project.updatedAt = new Date().toISOString();
    saveLocalDB(db);
    this._cachedData = db;
    return newMedia;
  },

  async deleteVideo(projectId, videoId) {
    const db = await this.getData();
    const project = db.projects.find(p => p.id === projectId);
    if (!project) throw new Error('Projeto não encontrado');

    project.videos = (project.videos || []).filter(v => v.id !== videoId);
    project.updatedAt = new Date().toISOString();
    db.comments = (db.comments || []).filter(c => c.videoId !== videoId);
    saveLocalDB(db);
    this._cachedData = db;
    return { success: true };
  },

  async verifyPassword(slug, password) {
    const db = await this.getData();
    const project = db.projects.find(p => p.slug === slug);
    if (!project) return { valid: false, error: 'Projeto não encontrado' };
    if (!project.password) return { valid: true };

    const valid = String(project.password).trim() === String(password || '').trim();
    return { valid, error: valid ? null : 'Senha incorreta' };
  },

  async addComment(commentData) {
    const db = await this.getData();
    const commentId = `comm-${Date.now()}`;
    const newComment = {
      id: commentId,
      projectId: commentData.projectId,
      videoId: commentData.videoId,
      timecode: commentData.timecode || 0,
      content: (commentData.content || '').trim(),
      authorName: (commentData.authorName || 'Cliente').trim(),
      authorEmail: (commentData.authorEmail || '').trim(),
      authorAvatar: commentData.authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(commentData.authorName || 'C')}&background=FF5400&color=fff`,
      isAuthor: Boolean(commentData.isAuthor),
      resolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      replies: []
    };

    db.comments.push(newComment);
    saveLocalDB(db);
    this._cachedData = db;
    return newComment;
  },

  async updateComment(commentId, content) {
    const db = await this.getData();
    const comment = db.comments.find(c => c.id === commentId);
    if (!comment) throw new Error('Comentário não encontrado');

    comment.content = content.trim();
    comment.updatedAt = new Date().toISOString();
    saveLocalDB(db);
    this._cachedData = db;
    return comment;
  },

  async deleteComment(commentId) {
    const db = await this.getData();
    db.comments = db.comments.filter(c => c.id !== commentId);
    saveLocalDB(db);
    this._cachedData = db;
    return { success: true };
  },

  async toggleResolveComment(commentId, resolved) {
    const db = await this.getData();
    const comment = db.comments.find(c => c.id === commentId);
    if (!comment) throw new Error('Comentário não encontrado');

    comment.resolved = typeof resolved === 'boolean' ? resolved : !comment.resolved;
    comment.updatedAt = new Date().toISOString();
    saveLocalDB(db);
    this._cachedData = db;
    return comment;
  },

  async replyComment(commentId, replyData) {
    const db = await this.getData();
    const comment = db.comments.find(c => c.id === commentId);
    if (!comment) throw new Error('Comentário não encontrado');

    const replyId = `rep-${Date.now()}`;
    const newReply = {
      id: replyId,
      content: (replyData.content || '').trim(),
      authorName: (replyData.authorName || 'Autor').trim(),
      authorEmail: (replyData.authorEmail || '').trim(),
      authorAvatar: replyData.authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(replyData.authorName || 'A')}&background=FF5400&color=fff`,
      isAuthor: Boolean(replyData.isAuthor),
      createdAt: new Date().toISOString()
    };

    comment.replies = comment.replies || [];
    comment.replies.push(newReply);
    saveLocalDB(db);
    this._cachedData = db;
    return newReply;
  },

  async updateReply(commentId, replyId, content) {
    const db = await this.getData();
    const comment = db.comments.find(c => c.id === commentId);
    if (!comment) throw new Error('Comentário não encontrado');

    const reply = (comment.replies || []).find(r => r.id === replyId);
    if (!reply) throw new Error('Resposta não encontrada');

    reply.content = content.trim();
    reply.updatedAt = new Date().toISOString();
    saveLocalDB(db);
    this._cachedData = db;
    return reply;
  },

  async deleteReply(commentId, replyId) {
    const db = await this.getData();
    const comment = db.comments.find(c => c.id === commentId);
    if (!comment) throw new Error('Comentário não encontrado');

    comment.replies = (comment.replies || []).filter(r => r.id !== replyId);
    saveLocalDB(db);
    this._cachedData = db;
    return { success: true };
  },

  async syncDrive(projectId, driveLink) {
    // Se o backend local estiver ativo, chama a API do Drive
    try {
      const res = await fetch('/api/drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, driveLink }),
        credentials: 'include'
      });
      if (res.ok) {
        const updated = await res.json();
        return updated;
      }
    } catch (e) {}

    // Modo estático no GitHub Pages: salva o link do Drive no projeto
    return this.updateProject(projectId, { driveLink });
  },

  async saveSettings(settings) {
    const db = await this.getData();
    db.settings = { ...(db.settings || {}), ...settings };
    saveLocalDB(db);
    this._cachedData = db;
    return db.settings;
  },

  // Exportar banco de dados atualizado como download
  exportDatabase() {
    const db = this._cachedData || loadLocalDB();
    if (!db) return;
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'db.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
};

window.API = API;
