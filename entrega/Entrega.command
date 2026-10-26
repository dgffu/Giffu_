#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Guarantee Node.js and Homebrew binaries are in PATH
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

echo "=================================================="
echo "         GIFFÚ ENTREGA                            "
echo "=================================================="
echo ""

# Verify Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js não foi encontrado no sistema."
    echo "Por favor instale o Node.js em: https://nodejs.org"
    echo ""
    read -p "Pressione Enter para sair..."
    exit 1
fi

# Install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo "Instalando dependências do projeto..."
    npm install
fi

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

# If server is already running on port 3000, simply open the browser
EXISTING_PID=$(lsof -ti:3000 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
    echo "O servidor já está ativo (PID: $EXISTING_PID)."
    echo "📱 Acesse pelo celular (mesmo Wi-Fi): http://${LAN_IP}:3000"
    echo "Abrindo painel do autor no navegador..."
    open "http://localhost:3000/author"
    exit 0
fi

echo "Iniciando servidor em http://localhost:3000 ..."
echo "📱 Celular (LAN): http://${LAN_IP}:3000"
(sleep 1 && open "http://localhost:3000/author") &

node server.js
