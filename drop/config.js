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

  // Modo de Armazenamento: 'local' (localhost:8000 ou servidor python) ou 'cloud' (Supabase, R2, S3 ou Cloud Server)
  storageMode: 'local', // 'local' | 'cloud'

  // Servidor Local / API Endpoint padrão
  localApiUrl: '', // vazio usa relative path (/api/drop/...)

  // Configuração para Nuvem (Supabase Storage, Cloudflare R2 ou API externa)
  cloud: {
    provider: 'supabase', // 'supabase' | 'r2' | 'custom_api'
    supabaseUrl: '',
    supabaseAnonKey: '',
    bucketName: 'giffu-drop',
    customApiUrl: ''
  }
};

// Carrega configurações personalizadas do localStorage, se existirem
function getAppConfig() {
  try {
    const saved = localStorage.getItem('giffu_drop_config');
    if (saved) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Erro ao carregar configurações salvas:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveAppConfig(newConfig) {
  try {
    localStorage.setItem('giffu_drop_config', JSON.stringify(newConfig));
    window.GIFFU_DROP_CONFIG = newConfig;
    return true;
  } catch (e) {
    console.error('Erro ao salvar configurações:', e);
    return false;
  }
}

window.GIFFU_DROP_CONFIG = getAppConfig();
window.saveAppConfig = saveAppConfig;
