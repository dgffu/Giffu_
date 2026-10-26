const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');
const { execSync } = require('child_process');
const { ZipArchive } = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/entrega', express.static(__dirname));

// Database helpers
function readDB() {
  const currentYear = new Date().getFullYear().toString();
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { settings: {}, years: [currentYear], projects: [], comments: [] };
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.years || !Array.isArray(data.years)) {
      data.years = [currentYear];
    }
    if (!data.years.includes(currentYear)) {
      data.years.unshift(currentYear);
      data.years.sort((a, b) => b.localeCompare(a));
    }
    return data;
  } catch (err) {
    console.error('Error reading db.json:', err);
    return { settings: {}, years: [currentYear], projects: [], comments: [] };
  }
}

function writeDB(data) {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing db.json:', err);
    return false;
  }
}

function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/\s+/g, '_')                              // replace spaces with _
    .replace(/[^a-z0-9_-]/g, '')                       // remove invalid chars
    .replace(/_+/g, '_');                              // collapse multiple _
}

function classifyResolution(input, height) {
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

// Google Drive Local Folder Resolver (REAL & SECURE)
function resolveGoogleDriveFolder(linkOrName, projectName = '') {
  if (!linkOrName && !projectName) return null;

  const rawInput = (linkOrName || '').trim();
  const home = process.env.HOME || '/Users/dilangiffu';
  const driveFSDir = path.join(home, 'Library/Application Support/Google/DriveFS');
  const cloudStorageDir = path.join(home, 'Library/CloudStorage');

  // 1. Direct local path on disk
  if (rawInput.startsWith('/') && fs.existsSync(rawInput)) {
    try {
      if (fs.statSync(rawInput).isDirectory()) return rawInput;
    } catch (e) {}
  }

  // 2. Extract Google Drive item ID from URL
  const idMatch = rawInput.match(/id=([a-zA-Z0-9_-]+)/) ||
                  rawInput.match(/folders\/([a-zA-Z0-9_-]+)/) ||
                  rawInput.match(/file\/d\/([a-zA-Z0-9_-]+)/);
  const driveId = idMatch ? idMatch[1] : null;

  if (driveId && fs.existsSync(driveFSDir)) {
    try {
      const entries = fs.readdirSync(driveFSDir);
      for (const entry of entries) {
        const dbPath = path.join(driveFSDir, entry, 'mirror_metadata_sqlite.db');
        if (fs.existsSync(dbPath)) {
          try {
            const sql = `WITH RECURSIVE path_builder(stable_id, id, local_title, is_folder) AS (SELECT stable_id, id, local_title, is_folder FROM items WHERE id='${driveId}' UNION ALL SELECT p.stable_id, p.id, p.local_title, p.is_folder FROM items p JOIN stable_parents sp ON sp.parent_stable_id = p.stable_id JOIN path_builder c ON c.stable_id = sp.item_stable_id) SELECT local_title FROM path_builder;`;
            const output = execSync(`sqlite3 "${dbPath}" "${sql}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
            if (output) {
              const parts = output.split('\n').map(s => s.trim()).filter(Boolean);
              parts.reverse();

              const myDriveSymlink = path.join(driveFSDir, entry, 'my-drive');
              let myDriveTarget = null;
              if (fs.existsSync(myDriveSymlink)) {
                myDriveTarget = fs.realpathSync(myDriveSymlink);
              }
              if (myDriveTarget) {
                const fullPath = path.join(myDriveTarget, ...parts);
                if (fs.existsSync(fullPath)) return fullPath;
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // 3. Search via mdfind in CloudStorage by project name or folder name
  const candidateNames = [
    projectName,
    rawInput.replace(/https?:\/\/[^\/]+\//, '').replace(/[^a-zA-Z0-9_.-]/g, '')
  ].filter(n => n && n.length > 2);

  for (const name of candidateNames) {
    try {
      const cleanName = path.basename(name).replace(/["'\\]/g, '');
      const mdCmd = `mdfind -onlyin "${cloudStorageDir}" "kMDItemFSName == '${cleanName}' && kMDItemContentType == 'public.folder'"`;
      const mdOut = execSync(mdCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      const lines = mdOut.split('\n').filter(Boolean);
      for (const line of lines) {
        if (fs.existsSync(line)) return line;
      }
    } catch (e) {}
  }

  return null;
}

// Scan folder for real video and photo deliverables and extract real metadata using macOS mdls
function scanFolderForVideos(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) return [];

  const videoExts = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.heic', '.heif', '.bmp', '.gif']);
  const candidateFiles = [];

  function collectFromDir(dir, depth = 0) {
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.startsWith('.') || f.startsWith('~')) continue;
        const full = path.join(dir, f);
        try {
          const stat = fs.statSync(full);
          if (stat.isFile()) {
            const ext = path.extname(f).toLowerCase();
            if (videoExts.has(ext) || imageExts.has(ext)) {
              candidateFiles.push(full);
            }
          } else if (stat.isDirectory() && depth === 0) {
            // Also scan standard export / final delivery subfolders (videos and photos)
            const lower = f.toLowerCase();
            if (['05-export', 'export', 'exports', 'final', 'entrega', 'video', 'videos', 'foto', 'fotos', 'photo', 'photos', 'imagem', 'imagens'].some(kw => lower.includes(kw))) {
              collectFromDir(full, depth + 1);
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  collectFromDir(folderPath);

  const media = [];
  for (const filePath of candidateFiles) {
    try {
      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const isImg = imageExts.has(ext);

      let width = isImg ? 3840 : 1920;
      let height = isImg ? 2160 : 1080;
      let durationSec = isImg ? 0 : 10;
      let sizeBytes = stat.size;

      // Extract real metadata via macOS native mdls
      try {
        const mdOut = execSync(`mdls -name kMDItemPixelWidth -name kMDItemPixelHeight -name kMDItemDurationSeconds -name kMDItemFSSize "${filePath}"`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        const wMatch = mdOut.match(/kMDItemPixelWidth\s*=\s*(\d+)/);
        const hMatch = mdOut.match(/kMDItemPixelHeight\s*=\s*(\d+)/);
        const dMatch = mdOut.match(/kMDItemDurationSeconds\s*=\s*([\d.]+)/);
        const sMatch = mdOut.match(/kMDItemFSSize\s*=\s*(\d+)/);

        if (wMatch) width = parseInt(wMatch[1], 10);
        if (hMatch) height = parseInt(hMatch[1], 10);
        if (dMatch) durationSec = parseFloat(dMatch[1]);
        if (sMatch) sizeBytes = parseInt(sMatch[1], 10);
      } catch (e) {}

      // Format duration: MM:SS or H:MM:SS
      let durationFormatted = '00:00';
      if (!isImg && !isNaN(durationSec) && durationSec > 0) {
        const totalSecs = Math.floor(durationSec);
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        if (h > 0) {
          durationFormatted = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        } else {
          durationFormatted = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
      }

      // Format size: GB or MB
      let sizeFormatted = 'Original';
      if (sizeBytes >= 1073741824) {
        sizeFormatted = `${(sizeBytes / 1073741824).toFixed(2)} GB`;
      } else if (sizeBytes >= 1048576) {
        sizeFormatted = `${(sizeBytes / 1048576).toFixed(1)} MB`;
      }

      let aspectRatio = '16:9';
      if (width > 0 && height > 0) {
        const ratio = width / height;
        if (Math.abs(ratio - 1) < 0.05) aspectRatio = '1:1';
        else if (Math.abs(ratio - 4/3) < 0.08) aspectRatio = '4:3';
        else if (Math.abs(ratio - 3/4) < 0.08) aspectRatio = '3:4';
        else if (Math.abs(ratio - 3/2) < 0.08) aspectRatio = '3:2';
        else if (Math.abs(ratio - 2/3) < 0.08) aspectRatio = '2:3';
        else if (Math.abs(ratio - 16/9) < 0.08) aspectRatio = '16:9';
        else if (Math.abs(ratio - 9/16) < 0.08) aspectRatio = '9:16';
        else aspectRatio = width < height ? '9:16' : '16:9';
      }

      const resolution = classifyResolution(width, height);
      const title = path.basename(filePath, path.extname(filePath));

      media.push({
        id: (isImg ? 'img-' : 'vid-') + Buffer.from(filePath).toString('hex').slice(0, 16),
        type: isImg ? 'image' : 'video',
        title,
        aspectRatio,
        url: `/api/stream?path=${encodeURIComponent(filePath)}`,
        localPath: filePath,
        fileName: path.basename(filePath),
        resolution: isImg ? (width > 0 && height > 0 ? `${width}x${height}` : 'Foto') : resolution,
        dimensions: isImg && width > 0 && height > 0 ? `${width}x${height}` : undefined,
        duration: isImg ? undefined : durationFormatted,
        size: sizeFormatted
      });
    } catch (e) {}
  }

  return media;
}

// Authentication (real Google login + signed sessions)
const { createAuth } = require('./auth');
const auth = createAuth(readDB);
const { requireAuthor, requireUser } = auth;
auth.register(app);

// Google Drive API (espelhamento + streaming)
const google = require('./google');
const driveApi = require('./drive');

// Espelha a pasta do projeto: API oficial do Drive quando conectada; senão, pasta local do Drive for Desktop
async function mirrorProject(project) {
  const tokens = google.readTokens();
  if (tokens && tokens.refresh_token) {
    const r = await driveApi.mirrorFolder(readDB, project.driveLink, classifyResolution);
    project.driveFolderId = r.folderId;
    project.driveFolderName = r.folderName;
    delete project.resolvedDrivePath;
    project.videos = r.videos;
    project.lastSyncedAt = new Date().toISOString();
    return { source: 'api', resolvedFolder: r.folderName, detected: r.videos.length };
  }

  const resolved = resolveGoogleDriveFolder(project.driveLink, project.name);
  if (resolved) {
    project.resolvedDrivePath = resolved;
    const detected = scanFolderForVideos(resolved);
    if (detected.length > 0) {
      project.videos = detected;
      project.lastSyncedAt = new Date().toISOString();
    }
    return { source: 'local', resolvedFolder: resolved, detected: detected.length };
  }
  return { source: 'none', resolvedFolder: null, detected: 0 };
}

function applyMirror(target, draft) {
  target.driveLink = draft.driveLink;
  target.videos = draft.videos || [];
  delete target.removedDriveFileIds;
  ['resolvedDrivePath', 'driveFolderId', 'driveFolderName', 'lastSyncedAt'].forEach(k => {
    if (draft[k] === undefined) delete target[k];
    else target[k] = draft[k];
  });
}

function mirrorErrorStatus(err) {
  if ([400, 403, 404].includes(err.status)) return err.status;
  if (err.code === 'DRIVE_NOT_CONNECTED') return 409; // não é falha de sessão do usuário
  return 502;
}

// REST APIs

// 1. Get initial data
app.get('/api/data', (req, res) => {
  const db = readDB();
  if (Array.isArray(db.projects)) {
    db.projects.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
  }
  res.json(db);
});

// 2. Create project
app.post('/api/projects', requireAuthor, async (req, res) => {
  const { name, year, clientName, driveLink, password, allowComments, hideBrandName, category } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Nome do projeto é obrigatório' });
  }

  const currentYear = new Date().getFullYear().toString();
  const projYear = (year && String(year).trim()) || currentYear;
  const projCategory = (category && String(category).trim()) || 'Eventos';
  const slug = generateSlug(name);
  const id = 'proj-' + Date.now();

  const newProject = {
    id,
    year: projYear,
    category: projCategory,
    name: name.trim(),
    slug,
    clientName: (clientName || 'Cliente').trim(),
    driveLink: (driveLink || '').trim(),
    password: (password || '').trim(),
    allowComments: allowComments !== undefined ? Boolean(allowComments) : true,
    hideBrandName: hideBrandName !== undefined ? Boolean(hideBrandName) : true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    videos: []
  };

  // Espelhamento real do Google Drive na criação (falha não impede criar o projeto)
  let syncError = null;
  if (newProject.driveLink) {
    try {
      await mirrorProject(newProject);
    } catch (err) {
      syncError = err.message;
    }
  }

  // Lê o banco só agora (depois das chamadas de rede) para não sobrescrever alterações concorrentes
  const db = readDB();
  if (!db.years.includes(projYear)) {
    db.years.unshift(projYear);
    db.years.sort((a, b) => b.localeCompare(a));
  }
  db.projects.unshift(newProject);
  writeDB(db);

  res.status(201).json(syncError ? { ...newProject, syncError } : newProject);
});

// 3. Update project
app.put('/api/projects/:id', requireAuthor, async (req, res) => {
  const probe = readDB().projects.find(p => p.id === req.params.id);
  if (!probe) {
    return res.status(400).json({ error: 'Projeto não encontrado' });
  }

  const { name, clientName, driveLink, password, allowComments, hideBrandName, year, category } = req.body;

  // Espelha primeiro, sobre uma cópia (a chamada de rede pode demorar)
  const draft = JSON.parse(JSON.stringify(probe));
  let syncError = null;
  if (driveLink !== undefined) {
    draft.driveLink = driveLink.trim();
    if (draft.driveLink) {
      try {
        await mirrorProject(draft);
      } catch (err) {
        syncError = err.message;
      }
    }
  }

  const db = readDB();
  const index = db.projects.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(400).json({ error: 'Projeto não encontrado' });
  }

  const existing = db.projects[index];

  if (name && name !== existing.name) {
    existing.name = name.trim();
    existing.slug = generateSlug(name);
  }
  if (clientName !== undefined) existing.clientName = clientName.trim();
  if (driveLink !== undefined) applyMirror(existing, draft);
  if (password !== undefined) existing.password = password.trim();
  if (allowComments !== undefined) existing.allowComments = Boolean(allowComments);
  if (hideBrandName !== undefined) existing.hideBrandName = Boolean(hideBrandName);
  if (year !== undefined) existing.year = String(year).trim();
  if (category !== undefined) existing.category = String(category).trim();

  existing.updatedAt = new Date().toISOString();
  db.projects[index] = existing;
  writeDB(db);

  res.json(syncError ? { ...existing, syncError } : existing);
});

// 3.1 Quick update project category (for drag & drop)
app.post('/api/projects/:id/category', requireAuthor, (req, res) => {
  const db = readDB();
  const project = db.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  const { category } = req.body;
  if (!category) return res.status(400).json({ error: 'Categoria é obrigatória' });
  project.category = String(category).trim();
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(project);
});

// 4. Archive project
app.post('/api/projects/:id/archive', requireAuthor, (req, res) => {
  const db = readDB();
  const project = db.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  project.archived = true;
  project.archivedAt = new Date().toISOString();
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(project);
});

// 5. Unarchive project (restore)
app.post('/api/projects/:id/unarchive', requireAuthor, (req, res) => {
  const db = readDB();
  const project = db.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  project.archived = false;
  delete project.archivedAt;
  project.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(project);
});

// 6. Delete project
app.delete('/api/projects/:id', requireAuthor, (req, res) => {
  const db = readDB();
  db.projects = db.projects.filter(p => p.id !== req.params.id);
  db.comments = db.comments.filter(c => c.projectId !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// 5. Add Video to project
app.post('/api/projects/:id/videos', requireAuthor, (req, res) => {
  const db = readDB();
  const project = db.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });

  const { title, aspectRatio, url, resolution, duration, size } = req.body;
  const newVideo = {
    id: 'vid-' + Date.now(),
    title: (title || `${project.name}-VIDEO`).toUpperCase().trim(),
    aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
    url: url || (aspectRatio === '9:16' ? '/assets/sample-9x16.mp4' : '/assets/sample-16x9.mp4'),
    resolution: classifyResolution(resolution),
    duration: duration || '00:10',
    size: 'Original'
  };

  project.videos.push(newVideo);
  project.updatedAt = new Date().toISOString();
  writeDB(db);

  res.status(201).json(newVideo);
});

// 6. Delete Video from project (removes from delivery system only, leaves Google Drive untouched)
app.delete('/api/projects/:id/videos/:videoId', requireAuthor, (req, res) => {
  const db = readDB();
  const project = db.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });

  const vid = (project.videos || []).find(v => v.id === req.params.videoId);
  if (vid) {
    project.removedDriveFileIds = project.removedDriveFileIds || [];
    if (vid.driveFileId && !project.removedDriveFileIds.includes(vid.driveFileId)) {
      project.removedDriveFileIds.push(vid.driveFileId);
    }
    if (vid.fileName && !project.removedDriveFileIds.includes(vid.fileName)) {
      project.removedDriveFileIds.push(vid.fileName);
    }
  }

  project.videos = (project.videos || []).filter(v => v.id !== req.params.videoId);
  db.comments = (db.comments || []).filter(c => c.videoId !== req.params.videoId);
  writeDB(db);

  res.json({
    success: true,
    message: 'Vídeo removido da entrega com sucesso (arquivo mantido intacto no Google Drive)'
  });
});

// 7. Verify project password
app.post('/api/projects/verify-password', (req, res) => {
  const db = readDB();
  const { slug, password } = req.body;
  const project = db.projects.find(p => p.slug === slug);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });

  if (!project.password || project.password === password) {
    return res.json({ verified: true });
  }
  return res.status(401).json({ verified: false, error: 'Senha incorreta' });
});

// 8. Add comment
app.post('/api/comments', requireUser, (req, res) => {
  const db = readDB();
  const { projectId, videoId, timecode, timecodeFormatted, content } = req.body;

  if (!projectId || !videoId || !content) {
    return res.status(400).json({ error: 'Parâmetros incompletos' });
  }

  // Identidade vem da sessão Google verificada (nunca do corpo da requisição)
  const newComment = {
    id: 'comm-' + Date.now(),
    projectId,
    videoId,
    authorName: req.user.name,
    authorEmail: req.user.email,
    authorAvatar: req.user.avatar,
    isAuthor: req.user.isAuthor,
    timecode: Number(timecode) || 0,
    timecodeFormatted: timecodeFormatted || '00:00',
    content: content.trim(),
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date().toISOString(),
    replies: []
  };

  db.comments.push(newComment);
  writeDB(db);

  res.status(201).json(newComment);
});

// 9. Reply to comment
app.post('/api/comments/:id/reply', requireUser, (req, res) => {
  const db = readDB();
  const comment = db.comments.find(c => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado' });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Conteúdo vazio' });

  const reply = {
    id: 'rep-' + Date.now(),
    authorName: req.user.name,
    authorEmail: req.user.email,
    authorAvatar: req.user.avatar,
    isAuthor: req.user.isAuthor,
    content: content.trim(),
    createdAt: new Date().toISOString()
  };

  comment.replies.push(reply);
  writeDB(db);

  res.status(201).json(reply);
});

// Quem pode editar/excluir: o dono do conteúdo (e-mail Google verificado) ou o Autor
function canModify(user, ownerEmail) {
  return Boolean(user && (user.isAuthor || (ownerEmail && user.email === String(ownerEmail).toLowerCase())));
}

// Edit comment
app.put('/api/comments/:id', requireUser, (req, res) => {
  const db = readDB();
  const comment = db.comments.find(c => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado' });
  if (!canModify(req.user, comment.authorEmail)) return res.status(403).json({ error: 'Sem permissão' });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Conteúdo vazio' });

  comment.content = content.trim();
  comment.updatedAt = new Date().toISOString();
  writeDB(db);

  res.json(comment);
});

// Delete comment
app.delete('/api/comments/:id', requireUser, (req, res) => {
  const db = readDB();
  const comment = db.comments.find(c => c.id === req.params.id);
  if (comment && !canModify(req.user, comment.authorEmail)) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  db.comments = db.comments.filter(c => c.id !== req.params.id);
  writeDB(db);

  res.json({ success: true });
});

// Toggle Resolve comment
app.post('/api/comments/:id/toggle-resolve', requireUser, (req, res) => {
  const db = readDB();
  const comment = db.comments.find(c => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado' });

  const shouldResolve = typeof req.body.resolved === 'boolean' ? req.body.resolved : !comment.resolved;
  comment.resolved = shouldResolve;
  comment.resolvedAt = shouldResolve ? new Date().toISOString() : null;
  comment.resolvedBy = shouldResolve ? {
    name: req.user.name,
    email: req.user.email,
    isAuthor: req.user.isAuthor
  } : null;

  writeDB(db);
  res.json(comment);
});

// Edit reply
app.put('/api/comments/:id/reply/:replyId', requireUser, (req, res) => {
  const db = readDB();
  const comment = db.comments.find(c => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado' });

  const reply = (comment.replies || []).find(r => r.id === req.params.replyId);
  if (!reply) return res.status(404).json({ error: 'Resposta não encontrada' });
  if (!canModify(req.user, reply.authorEmail)) return res.status(403).json({ error: 'Sem permissão' });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Conteúdo vazio' });

  reply.content = content.trim();
  reply.updatedAt = new Date().toISOString();
  writeDB(db);

  res.json(reply);
});

// Delete reply
app.delete('/api/comments/:id/reply/:replyId', requireUser, (req, res) => {
  const db = readDB();
  const comment = db.comments.find(c => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comentário não encontrado' });

  const target = (comment.replies || []).find(r => r.id === req.params.replyId);
  if (target && !canModify(req.user, target.authorEmail)) {
    return res.status(403).json({ error: 'Sem permissão' });
  }

  comment.replies = (comment.replies || []).filter(r => r.id !== req.params.replyId);
  writeDB(db);

  res.json({ success: true });
});

// 10. Sync from Google Drive link (REAL & SECURE)
app.post('/api/drive/sync', requireAuthor, async (req, res) => {
  const { driveLink, projectId } = req.body;
  const probe = readDB().projects.find(p => p.id === projectId);
  if (!probe) return res.status(404).json({ error: 'Projeto não encontrado' });

  const linkToSync = (driveLink || probe.driveLink || '').trim();
  if (!linkToSync) {
    return res.status(400).json({ error: 'Link do Google Drive não fornecido' });
  }

  const draft = JSON.parse(JSON.stringify(probe));
  draft.driveLink = linkToSync;

  let result;
  try {
    result = await mirrorProject(draft);
  } catch (err) {
    console.error('Falha ao espelhar pasta:', err.message);
    return res.status(mirrorErrorStatus(err)).json({ error: err.message, code: err.code });
  }

  const db = readDB();
  const project = db.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });

  applyMirror(project, draft);
  project.updatedAt = new Date().toISOString();
  writeDB(db);

  const count = project.videos.length;
  const videoCount = (project.videos || []).filter(v => v.type !== 'image').length;
  const imageCount = (project.videos || []).filter(v => v.type === 'image').length;
  let breakdown = '';
  if (videoCount > 0 && imageCount > 0) {
    breakdown = ` (${videoCount} vídeo${videoCount > 1 ? 's' : ''}, ${imageCount} foto${imageCount > 1 ? 's' : ''})`;
  } else if (imageCount > 0) {
    breakdown = ` (${imageCount} foto${imageCount > 1 ? 's' : ''})`;
  } else if (videoCount > 0) {
    breakdown = ` (${videoCount} vídeo${videoCount > 1 ? 's' : ''})`;
  }

  let message;
  if (result.source === 'api') {
    message = count > 0
      ? `${count} arquivo(s)${breakdown} espelhado(s) da pasta "${result.resolvedFolder}" pela API do Google Drive.`
      : `Pasta "${result.resolvedFolder}" encontrada, mas nenhum vídeo ou foto foi localizado nela.`;
  } else if (result.source === 'local') {
    message = count > 0
      ? `${count} arquivo(s)${breakdown} espelhado(s) da pasta local do Drive.`
      : 'Pasta localizada, mas nenhum arquivo de vídeo ou foto foi encontrado nela.';
  } else {
    message = 'Pasta vinculada. Faça login com Google como Autor para espelhar pela API do Drive.';
  }

  res.json({
    success: true,
    source: result.source,
    resolvedFolder: result.resolvedFolder,
    detectedFiles: count,
    message
  });
});

// 10.5. Batch Zip Download (para autor e clientes)
async function handleDownloadZip(req, res) {
  const db = readDB();
  const projectId = req.params.id;
  const project = (db.projects || []).find(p => p.id === projectId || p.slug === projectId);
  if (!project) return res.status(404).send('Diretório não encontrado');

  // Verificar senha do projeto se aplicável
  const isAuthor = Boolean(req.user && req.user.isAuthor && req.user.email === 'novelfilmes@gmail.com');
  if (project.password && !isAuthor) {
    const providedPwd = req.query.pwd || req.body?.password;
    if (project.password !== providedPwd) {
      return res.status(401).send('Acesso bloqueado: senha incorreta');
    }
  }

  let targetVideos = project.videos || [];
  const itemsParam = req.query.items || req.body?.items;
  if (itemsParam && itemsParam !== 'all') {
    const ids = Array.isArray(itemsParam) ? itemsParam : String(itemsParam).split(',');
    const idSet = new Set(ids.map(s => String(s).trim()));
    const filtered = targetVideos.filter(v => idSet.has(v.id));
    if (filtered.length > 0) {
      targetVideos = filtered;
    }
  }

  if (targetVideos.length === 0) {
    return res.status(400).send('Nenhum arquivo disponível para compactação');
  }

  const safeProjectName = (project.name || 'Entrega').replace(/[/\\?%*:|"<>]/g, '_').trim();
  const zipFileName = `${safeProjectName}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipFileName)}`);

  const archive = new ZipArchive({
    zlib: { level: 0 } // Velocidade máxima sem recompactar JPEGs/MP4s já comprimidos
  });

  archive.on('warning', (err) => {
    console.warn('Aviso no ZipArchive:', err);
  });

  archive.on('error', (err) => {
    console.error('Erro no ZipArchive:', err);
    if (!res.headersSent) res.status(500).send('Erro ao gerar arquivo compactado');
    else res.destroy();
  });

  res.on('close', () => {
    archive.destroy();
  });

  archive.pipe(res);

  const usedNames = new Set();

  for (const v of targetVideos) {
    let fileName = v.fileName || `${v.title || 'arquivo'}.${v.type === 'image' ? 'jpg' : 'mp4'}`;
    fileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
    const ext = path.extname(fileName) || (v.type === 'image' ? '.jpg' : '.mp4');
    const baseName = path.basename(fileName, ext);
    let finalName = `${baseName}${ext}`;
    let counter = 1;
    while (usedNames.has(finalName.toLowerCase())) {
      finalName = `${baseName} (${counter})${ext}`;
      counter++;
    }
    usedNames.add(finalName.toLowerCase());

    try {
      let stream = null;
      if (v.driveFileId) {
        stream = await driveApi.getFileStream(readDB, v.driveFileId);
      } else if (v.localPath && fs.existsSync(v.localPath)) {
        stream = fs.createReadStream(v.localPath);
      } else if (v.url && v.url.startsWith('/assets/')) {
        const assetPath = path.join(__dirname, v.url);
        if (fs.existsSync(assetPath)) {
          stream = fs.createReadStream(assetPath);
        }
      } else if (v.url && v.url.includes('drive=')) {
        const match = v.url.match(/drive=([a-zA-Z0-9_-]+)/);
        if (match) {
          stream = await driveApi.getFileStream(readDB, match[1]);
        }
      }

      if (stream) {
        await new Promise((resolve) => {
          let resolved = false;
          const finish = () => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };
          stream.on('error', (err) => {
            console.error(`Erro ao transmitir ${finalName}:`, err.message);
            finish();
          });
          archive.once('entry', finish);
          archive.append(stream, { name: finalName });
        });
      }
    } catch (err) {
      console.error(`Erro ao processar ${finalName} no zip:`, err.message);
    }
  }

  await archive.finalize();
}

app.get('/api/projects/:id/download-zip', handleDownloadZip);
app.post('/api/projects/:id/download-zip', handleDownloadZip);

// 11. High Quality Secure Video Stream with HTTP 206 Partial Content
app.get('/api/stream', (req, res) => {
  // Vídeos espelhados pela API do Drive: só serve arquivos cadastrados em algum projeto
  if (req.query.drive) {
    const fileId = String(req.query.drive);
    let registeredVideo = null;
    (readDB().projects || []).forEach(p => (p.videos || []).forEach(v => {
      if (v.driveFileId === fileId) registeredVideo = v;
    }));
    if (!registeredVideo) return res.status(403).send('Acesso não autorizado');

    return driveApi.streamFile(req, res, readDB, fileId, {
      download: req.query.download === '1',
      fileName: registeredVideo.fileName || `${registeredVideo.title}.mp4`
    }).catch(() => {
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
  }

  const target = req.query.path || req.query.url;
  if (!target) return res.status(400).send('Caminho ou URL do vídeo ausente');

  let resolvedFilePath = null;
  if (target.startsWith('/assets/')) {
    resolvedFilePath = path.join(__dirname, target);
  } else {
    try {
      resolvedFilePath = path.resolve(decodeURIComponent(target));
    } catch (e) {
      resolvedFilePath = path.resolve(target);
    }
  }

  // Security Check: somente vídeos cadastrados em projetos (ou assets públicos) podem ser transmitidos
  const isUnder = (file, root) => file === root || file.startsWith(root + path.sep);
  const registered = new Set();
  (readDB().projects || []).forEach(p => (p.videos || []).forEach(v => {
    if (v.localPath) registered.add(path.resolve(v.localPath));
    if (typeof v.url === 'string' && v.url.startsWith('/api/stream?')) {
      try {
        const q = new URL(v.url, 'http://localhost').searchParams.get('path');
        if (q) registered.add(path.resolve(q));
      } catch (e) {}
    }
  }));

  const isAllowed = isUnder(resolvedFilePath, path.join(__dirname, 'assets')) ||
    registered.has(resolvedFilePath);
  if (!isAllowed) {
    return res.status(403).send('Acesso não autorizado');
  }

  if (!fs.existsSync(resolvedFilePath)) {
    return res.status(404).send('Arquivo de vídeo não encontrado');
  }

  let stat;
  try {
    stat = fs.statSync(resolvedFilePath);
    if (!stat.isFile()) {
      return res.status(400).send('O caminho solicitado não é um arquivo');
    }
  } catch (err) {
    return res.status(500).send('Erro ao ler o arquivo');
  }

  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(resolvedFilePath).toLowerCase();
  let contentType = 'video/mp4';
  if (ext === '.mov') contentType = 'video/quicktime';
  else if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.mkv') contentType = 'video/x-matroska';
  else if (ext === '.m4v') contentType = 'video/x-m4v';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.gif') contentType = 'image/gif';
  else if (ext === '.tiff' || ext === '.tif') contentType = 'image/tiff';
  else if (ext === '.heic' || ext === '.heif') contentType = 'image/heic';

  const isDownload = req.query.download === '1';
  const fileName = path.basename(resolvedFilePath);
  const disposition = isDownload ? `attachment; filename="${encodeURIComponent(fileName)}"` : 'inline';

  // Erros de leitura (ex.: timeout do Google Drive) não podem derrubar o servidor
  const onStreamError = (file) => file.on('error', (err) => {
    console.error('Erro ao ler vídeo:', err.code || err.message);
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    let start;
    let end;
    if (parts[0] === '') {
      // Suffix range: bytes=-N (últimos N bytes)
      const suffix = parseInt(parts[1], 10);
      start = Number.isNaN(suffix) ? NaN : Math.max(fileSize - suffix, 0);
      end = fileSize - 1;
    } else {
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (end >= fileSize) end = fileSize - 1;
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= fileSize || end < start) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`
      });
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(resolvedFilePath, { start, end });
    onStreamError(file);

    // Prevent file descriptor leak if client aborts/seeks
    req.on('close', () => file.destroy());

    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Content-Disposition': disposition
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': disposition
    };
    res.writeHead(200, head);
    const file = fs.createReadStream(resolvedFilePath);
    onStreamError(file);
    req.on('close', () => file.destroy());
    file.pipe(res);
  }
});

// 12. Save Settings
app.post('/api/settings', requireAuthor, (req, res) => {
  const db = readDB();
  // Apenas campos de apresentação: e-mails autorizados e Client ID não são alteráveis pela API
  const allowed = ['baseDomain', 'authorName', 'authorAvatar', 'appName', 'theme'];
  const updates = {};
  allowed.forEach(key => {
    if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim();
  });
  db.settings = { ...db.settings, ...updates };
  writeDB(db);
  res.json(db.settings);
});

function sendHtmlWithTitle(res, pageTitle) {
  try {
    const htmlPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    const safeTitle = (pageTitle || 'Giffú Entrega')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = html.replace(/<title>.*?<\/title>/i, `<title>${safeTitle}</title>`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
}

// Routing for front-end
app.get('/entrega/:slug', (req, res) => {
  const db = readDB();
  const proj = (db.projects || []).find(p => p.slug === req.params.slug);
  const hideGiffu = proj ? (proj.hideBrandName !== false) : true;
  const defaultTitle = hideGiffu ? 'Entrega' : 'Giffú Entrega';
  const title = proj ? proj.name : defaultTitle;
  sendHtmlWithTitle(res, title);
});

app.get('/entrega/:slug/:videoId', (req, res) => {
  const db = readDB();
  const proj = (db.projects || []).find(p => p.slug === req.params.slug);
  const hideGiffu = proj ? (proj.hideBrandName !== false) : true;
  const defaultTitle = hideGiffu ? 'Entrega' : 'Giffú Entrega';
  const video = proj && (proj.videos || []).find(v => v.id === req.params.videoId);
  const title = video ? video.title : (proj ? proj.name : defaultTitle);
  sendHtmlWithTitle(res, title);
});

app.get('/:year/:slug', (req, res, next) => {
  if (/^\d{4}$/.test(req.params.year)) {
    const db = readDB();
    const proj = (db.projects || []).find(p => p.slug === req.params.slug);
    const hideGiffu = proj ? (proj.hideBrandName !== false) : true;
    const defaultTitle = hideGiffu ? 'Entrega' : 'Giffú Entrega';
    const title = proj ? proj.name : defaultTitle;
    return sendHtmlWithTitle(res, title);
  }
  next();
});

app.get('/:year/:slug/:videoId', (req, res, next) => {
  if (/^\d{4}$/.test(req.params.year)) {
    const db = readDB();
    const proj = (db.projects || []).find(p => p.slug === req.params.slug);
    const hideGiffu = proj ? (proj.hideBrandName !== false) : true;
    const defaultTitle = hideGiffu ? 'Entrega' : 'Giffú Entrega';
    const video = proj && (proj.videos || []).find(v => v.id === req.params.videoId);
    const title = video ? video.title : (proj ? proj.name : defaultTitle);
    return sendHtmlWithTitle(res, title);
  }
  next();
});

app.get(['/privacidade', '/privacy'], (req, res) => {
  res.sendFile(path.join(__dirname, 'privacidade.html'));
});

app.get(['/termos', '/terms'], (req, res) => {
  res.sendFile(path.join(__dirname, 'termos.html'));
});

app.get('/author', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const HOST = '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  const lanIp = getLanIp();
  console.log(`\n======================================================`);
  console.log(`🚀 Giffú Entrega rodando:`);
  console.log(`💻 Local:        http://localhost:${PORT}`);
  console.log(`📱 Rede LAN:     http://${lanIp}:${PORT}`);
  console.log(`📁 Modo Autor:   http://${lanIp}:${PORT}/author`);
  console.log(`======================================================\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Porta ${PORT} já está em uso.`);
  } else {
    console.error('Erro no servidor:', err);
  }
});
