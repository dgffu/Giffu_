/**
 * Giffú Drop - Configuration & Cloud Storage Settings
 * Can be hosted locally on localhost:8000 or in production at giffu.com.br/drop
 */

const DEFAULT_CONFIG = {
  appName: 'Giffú Drop',
  version: '1.0.0',
  
  // Limite estrito de 1 GB por arquivo
  maxFileSizeBytes: 1024 * 1024 * 1024, // 1 GB (1,073,741,824 bytes)
  maxFileSizeFormatted: '1 GB',

  // Modo de Armazenamento: 'cloud' como padrão de produção
  storageMode: 'cloud', // 'local' | 'cloud'

  // Servidor Local / API Endpoint padrão
  localApiUrl: '', // vazio usa relative path (/api/drop/...)

  // Configuração para Nuvem Pré-Configurada (Supabase Storage)
  cloud: {
    provider: 'supabase', // 'supabase' | 'r2' | 'custom_api'
    supabaseUrl: 'https://bvrqfpzbhaqiokvhjnan.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2cnFmcHpiaGFxaW9rdmhqbmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwODExOTksImV4cCI6MjEwNjY1NzE5OX0.ppYszcfTeJhOdGVTqjxOy7v2nMfNLRM4EzujBpZz2zc',
    bucketName: 'giffu-drop',
    customApiUrl: ''
  }
};

// Funções utilitárias de higienização do Supabase
function sanitizeSupabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim().replace(/^['"]+|['"]+$/g, '').trim();
  if (!url) return '';

  // Se o usuário colou o link do dashboard do Supabase (ex: https://supabase.com/dashboard/project/xxxx)
  const dashboardMatch = url.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_-]+)/i);
  if (dashboardMatch && dashboardMatch[1]) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  // Garantir protocolo https://
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    const parsed = new URL(url);
    // Retorna estritamente o origin: "https://[ref].supabase.co", eliminando /rest/v1, /storage/v1 ou barras extras
    return parsed.origin;
  } catch (e) {
    return url.replace(/\/+$/, '').replace(/\/rest(\/v\d+)?\/?$/, '').replace(/\/storage(\/v\d+)?\/?$/, '');
  }
}

function sanitizeBucketName(rawBucket) {
  if (!rawBucket || typeof rawBucket !== 'string') return 'giffu-drop';
  let b = rawBucket.trim().replace(/^['"]+|['"]+$/g, '').trim();
  b = b.replace(/^\/+|\/+$/g, '');
  if (b.includes('/')) {
    const parts = b.split('/');
    b = parts[parts.length - 1];
  }
  return b.trim().toLowerCase() || 'giffu-drop';
}

// Carrega configurações personalizadas do localStorage, se existirem
function getAppConfig() {
  try {
    const saved = localStorage.getItem('giffu_drop_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      const cfg = {
        ...DEFAULT_CONFIG,
        ...parsed,
        cloud: {
          ...DEFAULT_CONFIG.cloud,
          ...(parsed.cloud || {})
        }
      };

      if (!cfg.cloud.supabaseUrl || cfg.cloud.supabaseUrl.trim() === '') {
        cfg.cloud.supabaseUrl = DEFAULT_CONFIG.cloud.supabaseUrl;
      }
      if (!cfg.cloud.supabaseAnonKey || cfg.cloud.supabaseAnonKey.trim() === '') {
        cfg.cloud.supabaseAnonKey = DEFAULT_CONFIG.cloud.supabaseAnonKey;
      }
      if (!cfg.cloud.bucketName || cfg.cloud.bucketName.trim() === '') {
        cfg.cloud.bucketName = DEFAULT_CONFIG.cloud.bucketName;
      }

      if (cfg.cloud.supabaseUrl) {
        cfg.cloud.supabaseUrl = sanitizeSupabaseUrl(cfg.cloud.supabaseUrl);
      }
      if (cfg.cloud.bucketName) {
        cfg.cloud.bucketName = sanitizeBucketName(cfg.cloud.bucketName);
      }

      // Sincroniza o localStorage com os novos valores higienizados
      try {
        localStorage.setItem('giffu_drop_config', JSON.stringify(cfg));
      } catch (e) {}

      return cfg;
    }
  } catch (e) {
    console.warn('Erro ao carregar configurações salvas:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveAppConfig(newConfig) {
  try {
    const sanitized = { ...newConfig };
    if (sanitized.cloud) {
      sanitized.cloud = {
        ...sanitized.cloud,
        supabaseUrl: sanitizeSupabaseUrl(sanitized.cloud.supabaseUrl),
        bucketName: sanitizeBucketName(sanitized.cloud.bucketName)
      };
    }
    localStorage.setItem('giffu_drop_config', JSON.stringify(sanitized));
    window.GIFFU_DROP_CONFIG = sanitized;
    return true;
  } catch (e) {
    console.error('Erro ao salvar configurações:', e);
    return false;
  }
}

window.sanitizeSupabaseUrl = sanitizeSupabaseUrl;
window.sanitizeBucketName = sanitizeBucketName;
window.GIFFU_DROP_CONFIG = getAppConfig();
window.saveAppConfig = saveAppConfig;

