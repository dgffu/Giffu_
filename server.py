import http.server
import socketserver
import json
import os
import urllib.parse
import hashlib
import secrets
import time
import random
import smtplib
from email.mime.text import MIMEText

PORT = 5173
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

# --- AUTHENTICATION CONFIGURATION & MEMORY STORE ---
ADMIN_USERNAME = "dilan@novel.art.br"
ADMIN_SALT = b"giffu_novel_art_salt_2026"
ADMIN_PASSWORD_HASH = hashlib.pbkdf2_hmac(
    'sha256', 
    b"##ArteNovel26", 
    ADMIN_SALT, 
    100000
).hex()

# In-memory session stores
ACTIVE_SESSIONS = {}       # token -> { "username": str, "expires_at": float }
PENDING_2FA = {}           # challenge_id -> { "username": str, "otp": str, "expires_at": float, "attempts": int }
FAILED_LOGIN_ATTEMPTS = {} # ip -> [timestamps]

def get_client_ip(handler):
    forwarded = handler.headers.get('X-Forwarded-For')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return handler.client_address[0]

def check_rate_limit(ip):
    now = time.time()
    attempts = FAILED_LOGIN_ATTEMPTS.get(ip, [])
    # Keep attempts from the last 15 minutes (900 seconds)
    valid_attempts = [t for t in attempts if now - t < 900]
    FAILED_LOGIN_ATTEMPTS[ip] = valid_attempts
    return len(valid_attempts) < 5

def record_failed_attempt(ip):
    now = time.time()
    if ip not in FAILED_LOGIN_ATTEMPTS:
        FAILED_LOGIN_ATTEMPTS[ip] = []
    FAILED_LOGIN_ATTEMPTS[ip].append(now)

def clear_failed_attempts(ip):
    if ip in FAILED_LOGIN_ATTEMPTS:
        del FAILED_LOGIN_ATTEMPTS[ip]

def parse_cookies(handler):
    cookie_header = handler.headers.get('Cookie', '')
    cookies = {}
    if cookie_header:
        for item in cookie_header.split(';'):
            if '=' in item:
                k, v = item.strip().split('=', 1)
                cookies[k] = v
    return cookies

def get_session_token(handler):
    # Check Authorization header first (Bearer <token>)
    auth_header = handler.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:].strip()
    # Check cookie
    cookies = parse_cookies(handler)
    return cookies.get('giffu_session')

def is_authenticated(handler):
    token = get_session_token(handler)
    if not token or token not in ACTIVE_SESSIONS:
        return False
    session = ACTIVE_SESSIONS[token]
    if time.time() > session['expires_at']:
        del ACTIVE_SESSIONS[token]
        return False
    return True

# --- CONFIG LOADER (email_config.json or .env) ---
def load_email_config():
    config = {}
    config_file = os.path.join(ROOT_DIR, 'email_config.json')
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except Exception as e:
            print(f"[CONFIG] Erro ao carregar email_config.json: {e}")

    # Fallback to os.environ or .env
    env_file = os.path.join(ROOT_DIR, '.env')
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        if k.strip() not in config:
                            config[k.strip()] = v.strip().strip('"\'')
        except Exception:
            pass

    return config

def send_otp_email(recipient_email, otp_code):
    cfg = load_email_config()
    
    print("\n==================================================")
    print("🔒 [AUTENTICAÇÃO GIFFÚ - 2FA CODIGO GERADO]")
    print(f"📧 E-mail do Destinatário: {recipient_email}")
    print(f"🔑 CÓDIGO DE 6 DÍGITOS: 👉  {otp_code}  👈")
    print("⏰ Válido por 5 minutos.")
    print("==================================================")

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background: #0b0b0e; color: #ffffff; padding: 40px 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: #14141b; border: 1px solid rgba(254, 94, 0, 0.3); border-radius: 16px; padding: 32px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <h2 style="color: #fe5e00; margin-top: 0; font-size: 24px;">Painel de Administração Giffú</h2>
          <p style="color: #a0a0ab; font-size: 14px; margin-bottom: 24px;">Seu código de acesso de 6 dígitos para o painel admin é:</p>
          <div style="font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #ffffff; background: linear-gradient(135deg, rgba(254,94,0,0.2), rgba(254,94,0,0.05)); padding: 18px; border-radius: 12px; margin: 20px 0; border: 1px dashed #fe5e00;">
            {otp_code}
          </div>
          <p style="color: #6e6e7a; font-size: 12px; line-height: 1.5; margin-top: 24px;">
            Este código expira em 5 minutos. Se você não solicitou acesso ao painel admin da Giffú, ignore esta mensagem.
          </p>
        </div>
      </body>
    </html>
    """

    # 1. RESEND API (Super fast & reliable REST API)
    resend_api_key = cfg.get('RESEND_API_KEY') or os.environ.get('RESEND_API_KEY')
    if resend_api_key:
        try:
            sender = cfg.get('SENDER_EMAIL') or cfg.get('SMTP_FROM') or 'Giffú Admin <onboarding@resend.dev>'
            payload = json.dumps({
                "from": sender,
                "to": [recipient_email],
                "subject": f"[{otp_code}] Código de Verificação Giffú Admin",
                "html": html_content
            }).encode('utf-8')
            req = urllib.request.Request(
                'https://api.resend.com/emails',
                data=payload,
                headers={
                    'Authorization': f'Bearer {resend_api_key}',
                    'Content-Type': 'application/json',
                    'User-Agent': 'GiffuServer/1.0'
                }
            )
            with urllib.request.urlopen(req, timeout=10) as res:
                if res.status in (200, 201):
                    print(f"✅ [2FA E-MAIL] Enviado com sucesso via Resend API para {recipient_email}!\n")
                    return True
        except Exception as e:
            print(f"⚠️ [2FA E-MAIL] Erro ao enviar via Resend API: {e}")

    # 2. BREVO (Sendinblue) API
    brevo_api_key = cfg.get('BREVO_API_KEY') or os.environ.get('BREVO_API_KEY')
    if brevo_api_key:
        try:
            sender_email = cfg.get('SENDER_EMAIL') or cfg.get('SMTP_FROM') or 'admin@novel.art.br'
            sender_name = cfg.get('SENDER_NAME') or 'Giffú Admin'
            payload = json.dumps({
                "sender": {"name": sender_name, "email": sender_email},
                "to": [{"email": recipient_email}],
                "subject": f"[{otp_code}] Código de Verificação Giffú Admin",
                "htmlContent": html_content
            }).encode('utf-8')
            req = urllib.request.Request(
                'https://api.brevo.com/v3/smtp/email',
                data=payload,
                headers={
                    'api-key': brevo_api_key,
                    'Content-Type': 'application/json'
                }
            )
            with urllib.request.urlopen(req, timeout=10) as res:
                if res.status in (200, 201):
                    print(f"✅ [2FA E-MAIL] Enviado com sucesso via Brevo API para {recipient_email}!\n")
                    return True
        except Exception as e:
            print(f"⚠️ [2FA E-MAIL] Erro ao enviar via Brevo API: {e}")

    # 3. SMTP (Gmail, Google Workspace, Hostinger, Titan, Zoho, etc.)
    smtp_server = cfg.get('SMTP_HOST') or os.environ.get('SMTP_HOST')
    smtp_user = cfg.get('SMTP_USER') or os.environ.get('SMTP_USER')
    smtp_pass = cfg.get('SMTP_PASS') or os.environ.get('SMTP_PASS')
    smtp_port = int(cfg.get('SMTP_PORT') or os.environ.get('SMTP_PORT', 587))
    sender_email = cfg.get('SENDER_EMAIL') or cfg.get('SMTP_FROM') or smtp_user or 'no-reply@novel.art.br'

    if smtp_server and smtp_user and smtp_pass:
        try:
            msg = MIMEText(html_content, "html")
            msg['Subject'] = f"[{otp_code}] Código de Verificação Giffú Admin"
            msg['From'] = sender_email
            msg['To'] = recipient_email

            if smtp_port == 465:
                # SSL Direct
                import ssl
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(smtp_server, smtp_port, context=context, timeout=10) as server:
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            else:
                # STARTTLS (Port 587 / 25)
                with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)

            print(f"✅ [2FA E-MAIL] Código enviado com sucesso via SMTP para {recipient_email}!\n")
            return True
        except Exception as e:
            print(f"⚠️ [2FA E-MAIL] Falha no envio SMTP ({e}).")

    print("ℹ️ [2FA E-MAIL] Nenhuma credencial de e-mail (Resend, Brevo ou SMTP) configurada em email_config.json.")
    print(f"👉 Use o código '{otp_code}' para entrar no admin.\n")
    return False


class GiffuServerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def translate_path(self, path):
        url_path = urllib.parse.urlparse(path).path
        clean_path = url_path.strip('/')
        
        if clean_path and '.' not in clean_path:
            html_candidate = os.path.join(ROOT_DIR, clean_path + '.html')
            if os.path.exists(html_candidate):
                return html_candidate

        return super().translate_path(path)

    def send_json_response(self, status_code, data, extra_headers=None):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.end_headers()

    def do_GET(self):
        url_path = urllib.parse.urlparse(self.path).path
        
        if url_path == '/api/auth/status':
            if is_authenticated(self):
                token = get_session_token(self)
                session = ACTIVE_SESSIONS.get(token, {})
                return self.send_json_response(200, {
                    "authenticated": True, 
                    "user": session.get("username", ADMIN_USERNAME)
                })
            else:
                return self.send_json_response(200, {"authenticated": False})
                
        return super().do_GET()

    def do_POST(self):
        url_path = urllib.parse.urlparse(self.path).path
        client_ip = get_client_ip(self)

        # --- AUTH ENDPOINTS ---
        if url_path == '/api/auth/login':
            if not check_rate_limit(client_ip):
                return self.send_json_response(429, {
                    "error": "Muitas tentativas incorretas. Por segurança, tente novamente em 15 minutos."
                })

            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                username = data.get('username', '').strip().lower()
                password = data.get('password', '')

                # Verify password with PBKDF2 hash
                input_hash = hashlib.pbkdf2_hmac(
                    'sha256', 
                    password.encode('utf-8'), 
                    ADMIN_SALT, 
                    100000
                ).hex()

                if username != ADMIN_USERNAME or secrets.compare_digest(input_hash, ADMIN_PASSWORD_HASH) is False:
                    record_failed_attempt(client_ip)
                    return self.send_json_response(401, {"error": "Usuário ou senha incorretos."})

                # Clear failed attempts on password match
                clear_failed_attempts(client_ip)

                # Generate 6-digit OTP code & challenge ID
                challenge_id = secrets.token_hex(16)
                otp_code = f"{random.randint(100000, 999999)}"
                expires_at = time.time() + 300 # 5 minutes

                PENDING_2FA[challenge_id] = {
                    "username": username,
                    "otp": otp_code,
                    "expires_at": expires_at,
                    "attempts": 0
                }

                # Send Email & Print to Console
                send_otp_email(username, otp_code)

                return self.send_json_response(200, {
                    "success": True,
                    "challengeId": challenge_id,
                    "message": f"Código de 6 dígitos enviado para {username}"
                })
            except Exception as e:
                return self.send_json_response(500, {"error": f"Erro interno ao processar login: {str(e)}"})

        elif url_path == '/api/auth/verify-2fa':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                challenge_id = data.get('challengeId', '')
                submitted_code = str(data.get('code', '')).strip()

                if challenge_id not in PENDING_2FA:
                    return self.send_json_response(400, {"error": "Desafio 2FA expirado ou inválido. Faça login novamente."})

                pending = PENDING_2FA[challenge_id]
                if time.time() > pending['expires_at']:
                    del PENDING_2FA[challenge_id]
                    return self.send_json_response(400, {"error": "O código de 6 dígitos expirou. Solicite um novo login."})

                pending['attempts'] += 1
                if pending['attempts'] > 3:
                    del PENDING_2FA[challenge_id]
                    return self.send_json_response(400, {"error": "Número máximo de tentativas excedido. Faça login novamente."})

                if not secrets.compare_digest(pending['otp'], submitted_code):
                    return self.send_json_response(401, {"error": "Código de verificação incorreto."})

                # Successful 2FA! Create session token
                session_token = secrets.token_hex(32)
                ACTIVE_SESSIONS[session_token] = {
                    "username": pending['username'],
                    "expires_at": time.time() + 86400 # 24 hours
                }
                del PENDING_2FA[challenge_id]

                cookie_val = f"giffu_session={session_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400"

                return self.send_json_response(200, {
                    "success": True,
                    "sessionToken": session_token,
                    "user": pending['username']
                }, extra_headers={"Set-Cookie": cookie_val})
            except Exception as e:
                return self.send_json_response(500, {"error": f"Erro interno na validação 2FA: {str(e)}"})

        elif url_path == '/api/auth/logout':
            token = get_session_token(self)
            if token and token in ACTIVE_SESSIONS:
                del ACTIVE_SESSIONS[token]
            cookie_val = "giffu_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly"
            return self.send_json_response(200, {"success": True}, extra_headers={"Set-Cookie": cookie_val})

        # --- PROTECTED DATA ENDPOINTS ---
        elif url_path == '/api/save-videos':
            if not is_authenticated(self):
                return self.send_json_response(401, {"error": "Acesso não autorizado. Faça login no /admin primeiro."})

            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                file_path = os.path.join(ROOT_DIR, 'videos.json')
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                return self.send_json_response(200, {"success": True, "count": len(data)})
            except Exception as e:
                return self.send_json_response(500, {"error": str(e)})

        elif url_path == '/api/save-downloads':
            if not is_authenticated(self):
                return self.send_json_response(401, {"error": "Acesso não autorizado. Faça login no /admin primeiro."})

            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                file_path = os.path.join(ROOT_DIR, 'downloads.json')
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                return self.send_json_response(200, {"success": True, "count": len(data)})
            except Exception as e:
                return self.send_json_response(500, {"error": str(e)})

        return self.send_json_response(404, {"error": "Endpoint não encontrado"})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), GiffuServerHandler) as httpd:
        print(f"🔒 Giffu Dev Server Autenticado ativo em http://localhost:{PORT}")
        httpd.serve_forever()

