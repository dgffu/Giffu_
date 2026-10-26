// Espelhamento via API oficial do Google Drive (v3, somente leitura)

const https = require('https');
const google = require('./google');

const EXPORT_FOLDER_KEYWORDS = [
  '05-export', 'export', 'exports', 'final', 'entrega', 'video', 'videos',
  'foto', 'fotos', 'photo', 'photos', 'imagem', 'imagens', 'image', 'images'
];
const MAX_VIDEOS = 300;
const MAX_SUBFOLDERS = 30;
const ID_RE = /^[a-zA-Z0-9_-]{10,}$/;

function makeError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function extractFileId(input) {
  const raw = String(input || '').trim();
  const m = raw.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) ||
            raw.match(/[?&]id=([a-zA-Z0-9_-]{10,})/) ||
            raw.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;
  return null;
}

function translateApiError(res) {
  const apiErr = res.json && res.json.error;
  const reason = apiErr && apiErr.errors && apiErr.errors[0] && apiErr.errors[0].reason;
  if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED') {
    return makeError(
      'A API do Google Drive não está ativada no seu projeto do Google Cloud. Ative em "APIs e serviços → Biblioteca → Google Drive API".',
      'DRIVE_API_DISABLED', 502
    );
  }
  if (res.status === 404) {
    return makeError('Pasta não encontrada, ou sua conta Google não tem acesso a ela.', 'DRIVE_NOT_FOUND', 404);
  }
  if (res.status === 403) {
    return makeError('Sem permissão para acessar esta pasta com a conta conectada.', 'DRIVE_FORBIDDEN', 403);
  }
  if (res.status === 401) {
    return makeError('Sessão do Google Drive expirada. Faça login com Google novamente.', 'DRIVE_NOT_CONNECTED', 401);
  }
  return makeError('Erro ao consultar o Google Drive.', 'DRIVE_ERROR', 502);
}

async function driveGet(readDB, pathAndQuery) {
  const token = await google.getDriveAccessToken(readDB);
  const res = await google.request(`https://www.googleapis.com/drive/v3/${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status !== 200 || !res.json) throw translateApiError(res);
  return res.json;
}

const FILE_FIELDS = 'id,name,mimeType,size,videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation),shortcutDetails(targetId,targetMimeType)';

async function getItem(readDB, id) {
  if (!ID_RE.test(id)) throw makeError('Link do Google Drive inválido.', 'DRIVE_BAD_LINK', 400);
  let item = await driveGet(readDB, `files/${id}?supportsAllDrives=true&fields=${encodeURIComponent(FILE_FIELDS)}`);
  if (item.mimeType === 'application/vnd.google-apps.shortcut' && item.shortcutDetails) {
    item = await driveGet(
      readDB,
      `files/${item.shortcutDetails.targetId}?supportsAllDrives=true&fields=${encodeURIComponent(FILE_FIELDS)}`
    );
  }
  return item;
}

async function listChildren(readDB, folderId) {
  const files = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: '1000',
      orderBy: 'name',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const json = await driveGet(readDB, `files?${params.toString()}`);
    files.push(...(json.files || []));
    pageToken = json.nextPageToken || '';
  } while (pageToken && files.length < 5000);
  return files;
}

function formatDuration(ms) {
  const totalSecs = Math.floor((Number(ms) || 0) / 1000);
  if (totalSecs <= 0) return '00:00';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatSize(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return 'Original';
}

function toVideo(file, classifyResolution) {
  const meta = file.videoMediaMetadata || {};
  const width = Number(meta.width) || 0;
  const height = Number(meta.height) || 0;
  const hasDims = width > 0 && height > 0;

  return {
    id: 'vid-' + file.id,
    type: 'video',
    title: String(file.name || 'Vídeo').replace(/\.[^.]+$/, ''),
    aspectRatio: hasDims && width < height ? '9:16' : '16:9',
    url: `/api/stream?drive=${file.id}`,
    driveFileId: file.id,
    fileName: String(file.name || 'video.mp4'),
    resolution: hasDims ? classifyResolution(width, height) : classifyResolution('FHD'),
    duration: formatDuration(meta.durationMillis),
    size: formatSize(file.size),
    mimeType: file.mimeType || 'video/mp4'
  };
}

function toImage(file, classifyResolution) {
  const meta = file.imageMediaMetadata || {};
  let width = Number(meta.width) || 0;
  let height = Number(meta.height) || 0;
  const rotation = Number(meta.rotation) || 0;
  if (rotation === 90 || rotation === 270) {
    const temp = width;
    width = height;
    height = temp;
  }
  const hasDims = width > 0 && height > 0;

  let aspectRatio = '16:9';
  if (hasDims) {
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

  return {
    id: 'img-' + file.id,
    type: 'image',
    title: String(file.name || 'Foto').replace(/\.[^.]+$/, ''),
    aspectRatio,
    url: `/api/stream?drive=${file.id}`,
    driveFileId: file.id,
    fileName: String(file.name || 'foto.jpg'),
    resolution: hasDims ? `${width}x${height}` : 'Foto',
    dimensions: hasDims ? `${width}x${height}` : '',
    size: formatSize(file.size),
    mimeType: file.mimeType || 'image/jpeg'
  };
}

// Lê a pasta (e subpastas de exportação/fotos/entrega) e devolve vídeos e fotos reais
async function mirrorFolder(readDB, link, classifyResolution) {
  const id = extractFileId(link);
  if (!id) throw makeError('Não encontrei um ID de pasta do Google Drive neste link.', 'DRIVE_BAD_LINK', 400);

  const root = await getItem(readDB, id);
  const media = [];
  const isVideo = (f) => String(f.mimeType || '').startsWith('video/');
  const isImage = (f) => String(f.mimeType || '').startsWith('image/');
  const isMedia = (f) => isVideo(f) || isImage(f);
  const isFolder = (f) => f.mimeType === 'application/vnd.google-apps.folder';
  const toMedia = (f) => isImage(f) ? toImage(f, classifyResolution) : toVideo(f, classifyResolution);

  // O link pode apontar direto para um único vídeo ou foto
  if (isMedia(root)) {
    return { folderId: root.id, folderName: root.name, videos: [toMedia(root)] };
  }
  if (!isFolder(root)) {
    throw makeError('O link precisa ser de uma pasta, vídeo ou foto do Google Drive.', 'DRIVE_BAD_LINK', 400);
  }

  const children = await listChildren(readDB, root.id);
  children.filter(isMedia).forEach(f => media.push(toMedia(f)));

  const exportFolders = children
    .filter(f => isFolder(f) && EXPORT_FOLDER_KEYWORDS.some(kw => String(f.name).toLowerCase().includes(kw)))
    .slice(0, MAX_SUBFOLDERS);

  for (const folder of exportFolders) {
    const sub = await listChildren(readDB, folder.id);
    sub.filter(isMedia).forEach(f => media.push(toMedia(f)));
  }

  return {
    folderId: root.id,
    folderName: root.name,
    videos: media.slice(0, MAX_VIDEOS)
  };
}

// Transmite o arquivo (vídeo ou imagem) do Drive para o navegador com suporte a Range (HTTP 206)
async function streamFile(req, res, readDB, fileId, { download = false, fileName = 'arquivo' } = {}) {
  if (!ID_RE.test(fileId)) return res.status(400).send('ID de arquivo inválido');

  let token;
  try {
    token = await google.getDriveAccessToken(readDB);
  } catch (err) {
    return res.status(503).send(err.message);
  }

  const headers = { Authorization: `Bearer ${token}` };
  if (req.headers.range) headers.Range = req.headers.range;

  const upstream = https.request(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { method: 'GET', headers, timeout: 30000 },
    (ures) => {
      const status = ures.statusCode;

      if (status === 416) {
        res.writeHead(416, { 'Content-Range': ures.headers['content-range'] || 'bytes */*' });
        ures.resume();
        return res.end();
      }
      if (status !== 200 && status !== 206) {
        ures.resume();
        return res.status(status === 404 || status === 403 ? status : 502).send('Não foi possível ler o arquivo no Google Drive');
      }

      const upstreamType = String(ures.headers['content-type'] || '');
      let contentType = 'application/octet-stream';
      if (upstreamType.startsWith('video/') || upstreamType.startsWith('image/')) {
        contentType = upstreamType;
      } else if (fileName.match(/\.(jpg|jpeg)$/i)) {
        contentType = 'image/jpeg';
      } else if (fileName.match(/\.png$/i)) {
        contentType = 'image/png';
      } else if (fileName.match(/\.mp4$/i)) {
        contentType = 'video/mp4';
      }

      const out = {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': download
          ? `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
          : 'inline'
      };
      if (ures.headers['content-length']) out['Content-Length'] = ures.headers['content-length'];
      if (ures.headers['content-range']) out['Content-Range'] = ures.headers['content-range'];

      res.writeHead(status, out);
      ures.pipe(res);
      ures.on('error', () => res.destroy());
    }
  );

  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.on('error', (err) => {
    console.error('Erro no stream do Drive:', err.code || err.message);
    if (!res.headersSent) res.status(502).send('Falha ao ler o arquivo no Google Drive');
    else res.destroy();
  });
  // Cancela o download no Google se o navegador desistir (seek / fechar aba)
  res.on('close', () => upstream.destroy());
  upstream.end();
}

// Obtém um stream legível direto do arquivo no Google Drive para downloads/compactação
async function getFileStream(readDB, fileId) {
  if (!ID_RE.test(fileId)) throw new Error('ID de arquivo inválido: ' + fileId);
  const token = await google.getDriveAccessToken(readDB);
  const headers = { Authorization: `Bearer ${token}` };
  return new Promise((resolve, reject) => {
    const upstream = https.request(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { method: 'GET', headers, timeout: 60000 },
      (ures) => {
        if (ures.statusCode !== 200 && ures.statusCode !== 206) {
          ures.resume();
          return reject(new Error(`Drive stream status ${ures.statusCode}`));
        }
        resolve(ures);
      }
    );
    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', (err) => reject(err));
    upstream.end();
  });
}

module.exports = { extractFileId, mirrorFolder, streamFile, getFileStream };

