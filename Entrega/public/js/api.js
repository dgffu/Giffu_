// API Client for Giffú Entrega

function apiFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.headers || {})
    }
  });
}

const API = {
  async getData() {
    const res = await apiFetch('/api/data');
    if (!res.ok) throw new Error('Falha ao carregar dados');
    return await res.json();
  },

  async createProject(projectData) {
    const res = await apiFetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao criar projeto');
    }
    return await res.json();
  },

  async updateProject(id, projectData) {
    const res = await apiFetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao atualizar projeto');
    }
    return await res.json();
  },

  async updateProjectCategory(id, category) {
    const res = await apiFetch(`/api/projects/${id}/category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao alterar categoria');
    }
    return await res.json();
  },

  async archiveProject(id) {
    const res = await apiFetch(`/api/projects/${id}/archive`, { method: 'POST' });
    if (!res.ok) throw new Error('Erro ao arquivar projeto');
    return await res.json();
  },

  async unarchiveProject(id) {
    const res = await apiFetch(`/api/projects/${id}/unarchive`, { method: 'POST' });
    if (!res.ok) throw new Error('Erro ao restaurar projeto');
    return await res.json();
  },

  async deleteProject(id) {
    const res = await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao excluir projeto');
    return await res.json();
  },

  async addVideo(projectId, videoData) {
    const res = await apiFetch(`/api/projects/${projectId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(videoData)
    });
    if (!res.ok) throw new Error('Erro ao adicionar vídeo');
    return await res.json();
  },

  async deleteVideo(projectId, videoId) {
    const res = await apiFetch(`/api/projects/${projectId}/videos/${videoId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao remover vídeo');
    return await res.json();
  },

  async verifyPassword(slug, password) {
    const res = await apiFetch('/api/projects/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, password })
    });
    return await res.json();
  },

  async addComment(commentData) {
    const res = await apiFetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commentData)
    });
    if (!res.ok) throw new Error('Erro ao enviar comentário');
    return await res.json();
  },

  async updateComment(commentId, content) {
    const res = await apiFetch(`/api/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error('Erro ao editar comentário');
    return await res.json();
  },

  async deleteComment(commentId) {
    const res = await apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao excluir comentário');
    return await res.json();
  },

  async toggleResolveComment(commentId, resolved) {
    const res = await apiFetch(`/api/comments/${commentId}/toggle-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(typeof resolved === 'boolean' ? { resolved } : {})
    });
    if (!res.ok) throw new Error('Erro ao alterar status do comentário');
    return await res.json();
  },

  async replyComment(commentId, replyData) {
    const res = await apiFetch(`/api/comments/${commentId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(replyData)
    });
    if (!res.ok) throw new Error('Erro ao responder comentário');
    return await res.json();
  },

  async updateReply(commentId, replyId, content) {
    const res = await apiFetch(`/api/comments/${commentId}/reply/${replyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error('Erro ao editar resposta');
    return await res.json();
  },

  async deleteReply(commentId, replyId) {
    const res = await apiFetch(`/api/comments/${commentId}/reply/${replyId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erro ao excluir resposta');
    return await res.json();
  },

  async syncDrive(projectId, driveLink) {
    const res = await apiFetch('/api/drive/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, driveLink })
    });
    return await res.json();
  },

  async saveSettings(settings) {
    const res = await apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return await res.json();
  }
};

window.API = API;
