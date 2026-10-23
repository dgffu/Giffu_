# Giffú Entrega 🎬

Plataforma minimalista, elegante e de alta performance para entrega e aprovação de vídeos audiovisuais em alta qualidade (16:9 e 9:16).

---

## ⚡ Como Usar (Ações Necessárias)

1. **Abrir o Aplicativo**:
   - Dê **2 cliques** no arquivo [`Entrega.command`](file:///Users/dilangiffu/Library/CloudStorage/GoogleDrive-novelfilmes@gmail.com/My%20Drive/09%20Sistemas/Apps/Entrega/Entrega.command) no Finder, **ou** execute no terminal:
     ```bash
     npm start
     ```
   - O sistema abrirá automaticamente no seu navegador em: `http://localhost:3000/author`

2. **Espelhar uma Pasta do Google Drive**:
   - Na barra lateral do Autor, clique no botão **`+`** ao lado de **Diretórios**.
   - Cole o link da pasta do Google Drive (seja do seu drive ou pasta compartilhada com você por terceiros).
   - Digite o nome do projeto (ex: `261023-SIGEM-NOME DO OUTRO PROJETO`) e o nome do cliente.
   - O link de entrega é gerado na hora (ex: `giffu.com.br/entrega/261023-sigem-nome_do_outro_projeto`), convertendo maiúsculas para minúsculas e espaços em `_`.
   - Se desejar, defina uma senha ou desative os comentários.
   - O espelhamento usa a **API oficial do Google Drive** com a conta do Autor (veja "Login Google + API do Drive" abaixo).

3. **Copiar ou Editar**:
   - Clique no ícone de corrente (**🔗**) ao lado do título para copiar o link do cliente.
   - Clique no lápis (**✏️**) para alterar o título ou o link do Drive espelhado a qualquer momento.

4. **Player Próprio em Alta Qualidade (Original Bitrate)**:
   - Suporte nativo para vídeos 16:9 e 9:16 (Verticais / Reels / Shorts).
   - O botão de Play aparece **exclusivamente no hover do cursor**, conforme as ordens do esboço.
   - Avanço e recuo frame a frame (Shift + ←/→) para revisão técnica precisa.
   - Controle de velocidade (0.5x até 2.0x), Picture-in-Picture e download do arquivo mestre original.

5. **Comentários Vinculados ao Tempo**:
   - Cliente e Autor podem comentar após conectar sua conta Google em 1 clique.
   - Comentários salvam a minutagem exata do vídeo (ex: `⏱ 00:02`).
   - Clicar no marcador de tempo posiciona o player imediatamente no trecho comentado.
   - Suporte a respostas encadeadas.

6. **Modo Claro / Escuro**:
   - Alternador no canto inferior esquerdo (ícone da lua `🌙`).


---

## 🔐 Login Google + API do Drive (configuração única)

O login é **real** (OAuth 2.0 com PKCE, validado no servidor) e é o mesmo acesso que permite ao app ler suas pastas pela **API do Google Drive** (somente leitura). Os vídeos são listados e transmitidos direto do Drive, sem depender da pasta sincronizada no Mac.

### 1. Criar as credenciais
1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie/selecione um projeto.
2. **APIs e serviços → Biblioteca →** ative a **Google Drive API**.
3. **Tela de consentimento OAuth:** tipo *Externo*; adicione os escopos `openid`, `email`, `profile` e `.../auth/drive.readonly`. Em modo "Teste", adicione `novelfilmes@gmail.com` como usuário de teste.
4. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
   - **URIs de redirecionamento autorizados:** `http://localhost:3000/api/auth/google/callback` (e `https://SEU-DOMINIO/api/auth/google/callback` se publicar).
5. Clique em **Baixar JSON**.

### 2. Informar ao app (o segredo NUNCA fica na pasta do app)
Salve o JSON baixado como:

```
~/.giffu-entrega/google_oauth.json
```

(ou use as variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`). Atrás de proxy/domínio próprio, defina também `PUBLIC_URL=https://SEU-DOMINIO`.

### 3. Entrar
Reinicie o servidor e clique em **Fazer login com Google** no painel do Autor. Na primeira vez o Google pede permissão de leitura do Drive; depois disso o app renova o acesso sozinho. A partir daí, cole o link de qualquer pasta que sua conta enxerga (inclusive compartilhadas) e os vídeos são espelhados com resolução, duração e tamanho reais.

**Quem é Autor?** `settings.authorEmail` (padrão `novelfilmes@gmail.com`), mais e-mails opcionais em `settings.authorizedEmails` (lista) ou na variável `AUTHOR_EMAILS`. Decisão feita só no servidor. Clientes entram só para comentar (sem acesso ao Drive).

### Segurança aplicada
- Fluxo *authorization code + PKCE* com `state` em cookie assinado; Client Secret e tokens nunca chegam ao navegador.
- Refresh token do Drive em `~/.giffu-entrega/drive_tokens.json` (modo 600, fora do Google Drive); renovação automática.
- Todas as rotas de gerenciamento exigem sessão de Autor; comentários usam a identidade verificada do Google.
- O streaming só serve vídeos cadastrados em projetos (Drive ou assets); escritas vindas de outros sites são bloqueadas (anti-CSRF).
- Para revogar: `POST /api/drive/disconnect` (Autor) ou [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
