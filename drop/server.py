#!/usr/bin/env python3
"""
Giffú Drop - Personal Original-Quality Drop Server
Runs on http://localhost:8000
Supports:
- Streaming uploads up to 1GB per file
- Original binary preservation (0% compression)
- Text messages / notes
- Thumbnails for videos and photos
- Range requests for video and large file streaming/downloading
- Batch ZIP downloading support
"""

import http.server
import socketserver
import json
import os
import sys
import time
import urllib.parse
import mimetypes
import uuid
import base64

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, '..'))
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
THUMBS_DIR = os.path.join(UPLOADS_DIR, 'thumbs')
DATA_DIR = os.path.join(BASE_DIR, 'data')
ITEMS_FILE = os.path.join(DATA_DIR, 'items.json')

MAX_FILE_SIZE = 1024 * 1024 * 1024  # 1 GB in bytes

# Ensure directories exist
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(THUMBS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

if not os.path.exists(ITEMS_FILE):
    with open(ITEMS_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f, ensure_ascii=False, indent=2)


def load_items():
    try:
        with open(ITEMS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[DROP] Erro ao ler items.json: {e}")
        return []


def save_items(items):
    try:
        with open(ITEMS_FILE, 'w', encoding='utf-8') as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[DROP] Erro ao salvar items.json: {e}")
        return False


def format_bytes(size):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}" if unit != 'B' else f"{int(size)} B"
        size /= 1024.0
    return f"{size:.1f} PB"


class GiffuDropHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def send_json(self, status_code, data, extra_headers=None):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-File-Name, X-File-Type, X-Batch-Id, X-Thumbnail-Data, X-Batch-Count, X-Caption')
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-File-Name, X-File-Type, X-Batch-Id, X-Thumbnail-Data, X-Batch-Count, X-Caption')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Root redirect or direct drop page
        if path in ['/', '/index.html']:
            self.send_response(302)
            self.send_header('Location', '/drop/')
            self.end_headers()
            return

        if path in ['/drop', '/drop/']:
            drop_index = os.path.join(BASE_DIR, 'index.html')
            if os.path.exists(drop_index):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                with open(drop_index, 'rb') as f:
                    self.wfile.write(f.read())
                return

        # API: Get Items List
        if path == '/api/drop/items':
            items = load_items()
            return self.send_json(200, {"success": True, "items": items})

        # API: Storage Stats
        if path == '/api/drop/stats':
            items = load_items()
            total_bytes = 0
            file_count = 0
            for item in items:
                if item.get('type') == 'file':
                    total_bytes += item.get('file', {}).get('size', 0)
                    file_count += 1
                elif item.get('type') == 'batch':
                    for f in item.get('files', []):
                        total_bytes += f.get('size', 0)
                        file_count += 1

            return self.send_json(200, {
                "success": True,
                "totalItems": len(items),
                "totalFiles": file_count,
                "totalBytes": total_bytes,
                "formattedTotal": format_bytes(total_bytes),
                "maxFileSize": MAX_FILE_SIZE,
                "maxFileFormatted": "1 GB"
            })

        # Serving files from /drop/uploads/ with Range support and original headers
        if path.startswith('/drop/uploads/'):
            rel_file = urllib.parse.unquote(path[len('/drop/uploads/'):])
            file_path = os.path.join(UPLOADS_DIR, rel_file)
            
            # Security check to prevent directory traversal
            if not os.path.abspath(file_path).startswith(os.path.abspath(UPLOADS_DIR)):
                self.send_error(403, "Acesso proibido")
                return

            if not os.path.exists(file_path) or os.path.isdir(file_path):
                self.send_error(404, "Arquivo não encontrado")
                return

            self.serve_file_with_range(file_path, parsed)
            return

        # Fallback to standard HTTP file server for other assets (e.g. drop/style.css, drop/app.js)
        return super().do_GET()

    def serve_file_with_range(self, file_path, parsed):
        file_size = os.path.getsize(file_path)
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'

        query = urllib.parse.parse_qs(parsed.query)
        is_download = 'download' in query

        filename = os.path.basename(file_path)
        # Check if original filename was passed in query
        if 'originalName' in query:
            filename = query['originalName'][0]

        range_header = self.headers.get('Range')
        if range_header:
            # Handle HTTP 206 Partial Content
            try:
                bytes_range = range_header.strip().split('=')[1]
                start_str, end_str = bytes_range.split('-')
                start = int(start_str) if start_str else 0
                end = int(end_str) if end_str else file_size - 1
                if start >= file_size:
                    self.send_response(416)
                    self.send_header('Content-Range', f'bytes */{file_size}')
                    self.end_headers()
                    return

                length = end - start + 1
                self.send_response(206)
                self.send_header('Content-Type', mime_type)
                self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                self.send_header('Content-Length', str(length))
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()

                with open(file_path, 'rb') as f:
                    f.seek(start)
                    sent = 0
                    while sent < length:
                        chunk_size = min(65536, length - sent)
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        sent += len(chunk)
                return
            except Exception as e:
                print(f"[DROP] Range request error: {e}")

        # Normal 200 response
        self.send_response(200)
        self.send_header('Content-Type', mime_type)
        self.send_header('Content-Length', str(file_size))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Access-Control-Allow-Origin', '*')

        if is_download:
            # Force download as original file
            safe_name = urllib.parse.quote(filename)
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"; filename*=UTF-8\'\'{safe_name}')

        self.end_headers()

        with open(file_path, 'rb') as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    break

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Text Note / Message
        if path == '/api/drop/text':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                text = data.get('text', '').strip()

                if not text:
                    return self.send_json(400, {"error": "Texto não pode ser vazio."})

                item_id = f"item_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
                item = {
                    "id": item_id,
                    "type": "text",
                    "text": text,
                    "createdAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    "timestamp": time.time()
                }

                items = load_items()
                items.insert(0, item)  # Newest first
                save_items(items)

                return self.send_json(200, {"success": True, "item": item})
            except Exception as e:
                return self.send_json(500, {"error": f"Erro ao salvar texto: {str(e)}"})

        # API: Upload File (Streaming binary up to 1GB)
        if path == '/api/drop/upload':
            try:
                content_length = int(self.headers.get('Content-Length', 0))

                # Enforce 1GB Limit
                if content_length > MAX_FILE_SIZE:
                    return self.send_json(413, {
                        "error": f"Arquivo ultrapassa o limite de 1 GB. Tamanho recebido: {format_bytes(content_length)}."
                    })

                raw_filename = self.headers.get('X-File-Name', '')
                if raw_filename:
                    filename = urllib.parse.unquote(raw_filename)
                else:
                    filename = f"file_{int(time.time())}"

                file_type = self.headers.get('X-File-Type', '')
                batch_id = self.headers.get('X-Batch-Id', '')
                batch_count = int(self.headers.get('X-Batch-Count', '1'))
                caption = urllib.parse.unquote(self.headers.get('X-Caption', ''))
                thumb_base64 = self.headers.get('X-Thumbnail-Data', '')

                # Determine media category
                category = 'other'
                if file_type.startswith('image/'):
                    category = 'image'
                elif file_type.startswith('video/'):
                    category = 'video'
                elif file_type.startswith('text/') or filename.endswith(('.txt', '.md', '.json', '.js', '.html', '.css', '.py')):
                    category = 'text'

                # Unique safe file name on disk while preserving original extension
                ext = os.path.splitext(filename)[1].lower()
                clean_name = os.path.splitext(filename)[0]
                # sanitize clean_name
                clean_name = "".join(c for c in clean_name if c.isalnum() or c in (' ', '-', '_')).strip()
                stored_filename = f"{int(time.time())}_{uuid.uuid4().hex[:8]}_{clean_name}{ext}"
                target_path = os.path.join(UPLOADS_DIR, stored_filename)

                # Stream directly to disk in 1MB chunks (Zero Memory Spikes)
                remaining = content_length
                with open(target_path, 'wb') as f:
                    while remaining > 0:
                        chunk_size = min(remaining, 1024 * 1024)
                        chunk = self.rfile.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        remaining -= len(chunk)

                actual_size = os.path.getsize(target_path)

                # Save thumbnail if provided (e.g. for video or high-res photo preview)
                thumb_url = None
                if thumb_base64:
                    try:
                        if ',' in thumb_base64:
                            thumb_base64 = thumb_base64.split(',', 1)[1]
                        thumb_bytes = base64.b64decode(thumb_base64)
                        thumb_filename = f"thumb_{stored_filename}.jpg"
                        thumb_path = os.path.join(THUMBS_DIR, thumb_filename)
                        with open(thumb_path, 'wb') as tf:
                            tf.write(thumb_bytes)
                        thumb_url = f"/drop/uploads/thumbs/{thumb_filename}"
                    except Exception as te:
                        print(f"[DROP] Aviso ao salvar thumbnail: {te}")

                file_info = {
                    "id": f"file_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}",
                    "originalName": filename,
                    "storedName": stored_filename,
                    "url": f"/drop/uploads/{stored_filename}",
                    "downloadUrl": f"/drop/uploads/{stored_filename}?download=1&originalName={urllib.parse.quote(filename)}",
                    "size": actual_size,
                    "formattedSize": format_bytes(actual_size),
                    "mimeType": file_type or mimetypes.guess_type(filename)[0] or 'application/octet-stream',
                    "category": category,
                    "thumbnailUrl": thumb_url
                }

                items = load_items()

                if batch_id and batch_count > 1:
                    # Look for existing batch
                    existing_batch = None
                    for it in items:
                        if it.get('batchId') == batch_id:
                            existing_batch = it
                            break

                    if existing_batch:
                        existing_batch['files'].append(file_info)
                        existing_batch['totalSize'] += actual_size
                        existing_batch['formattedTotalSize'] = format_bytes(existing_batch['totalSize'])
                        save_items(items)
                        return self.send_json(200, {
                            "success": True, 
                            "file": file_info, 
                            "batch": existing_batch,
                            "completed": len(existing_batch['files']) == batch_count
                        })
                    else:
                        batch_item = {
                            "id": f"batch_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}",
                            "type": "batch",
                            "batchId": batch_id,
                            "caption": caption,
                            "totalExpected": batch_count,
                            "files": [file_info],
                            "totalSize": actual_size,
                            "formattedTotalSize": format_bytes(actual_size),
                            "createdAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                            "timestamp": time.time()
                        }
                        items.insert(0, batch_item)
                        save_items(items)
                        return self.send_json(200, {
                            "success": True, 
                            "file": file_info, 
                            "batch": batch_item,
                            "completed": batch_count == 1
                        })
                else:
                    # Single file message
                    single_item = {
                        "id": f"item_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}",
                        "type": "file",
                        "file": file_info,
                        "caption": caption,
                        "createdAt": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                        "timestamp": time.time()
                    }
                    items.insert(0, single_item)
                    save_items(items)
                    return self.send_json(200, {"success": True, "item": single_item})

            except Exception as e:
                print(f"[DROP] Erro no upload: {e}")
                return self.send_json(500, {"error": f"Erro no processamento do upload: {str(e)}"})

        return self.send_json(404, {"error": "Endpoint POST não encontrado."})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Delete Item
        if path.startswith('/api/drop/items/'):
            item_id = path[len('/api/drop/items/'):]
            items = load_items()
            target_idx = None
            for idx, item in enumerate(items):
                if item.get('id') == item_id or item.get('batchId') == item_id:
                    target_idx = idx
                    break

            if target_idx is None:
                return self.send_json(404, {"error": "Item não encontrado."})

            item_to_delete = items.pop(target_idx)
            save_items(items)

            # Clean up files on disk
            def remove_file_safely(stored_name, thumb_url=None):
                if stored_name:
                    p = os.path.join(UPLOADS_DIR, stored_name)
                    if os.path.exists(p):
                        try:
                            os.remove(p)
                        except Exception:
                            pass
                if thumb_url and thumb_url.startswith('/drop/uploads/thumbs/'):
                    tname = os.path.basename(thumb_url)
                    tp = os.path.join(THUMBS_DIR, tname)
                    if os.path.exists(tp):
                        try:
                            os.remove(tp)
                        except Exception:
                            pass

            if item_to_delete.get('type') == 'file':
                f = item_to_delete.get('file', {})
                remove_file_safely(f.get('storedName'), f.get('thumbnailUrl'))
            elif item_to_delete.get('type') == 'batch':
                for f in item_to_delete.get('files', []):
                    remove_file_safely(f.get('storedName'), f.get('thumbnailUrl'))

            return self.send_json(200, {"success": True, "deletedId": item_id})

        return self.send_json(404, {"error": "Endpoint DELETE não encontrado."})


def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    print("=" * 65)
    print("🚀 [GIFFÚ DROP] Servidor de Transferência Original Ativo")
    print(f"👉 Acesse no navegador: http://localhost:{PORT}/drop/")
    print(f"📂 Armazenamento local: {UPLOADS_DIR}")
    print(f"📦 Limite por arquivo: 1 GB (qualidade original 100%)")
    print("=" * 65)
    try:
        with socketserver.TCPServer(("", PORT), GiffuDropHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor finalizado pelo usuário.")
        sys.exit(0)


if __name__ == '__main__':
    run_server()
