import sys
import os
sys.stderr = open(os.devnull, 'w')
os.environ['NO_COLOR'] = '1'
os.environ['FORCE_COLOR'] = '0'
os.environ['TERM'] = 'dumb'
os.environ['OMP_NUM_THREADS'] = '4'
os.environ['MKL_NUM_THREADS'] = '4'

from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image
import io
import logging
import threading
import numpy as np
import torch

sys.stderr = sys.__stderr__
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
log = logging.getLogger(__name__)

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 34568
remover = None
loading_lock = threading.Lock()

def get_model_path():
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, '..', 'models', 'ckpt_base.pth')

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path == '/remove':
            length = int(self.headers.get('Content-Length', 0))
            data = self.rfile.read(length)
            try:
                img = Image.open(io.BytesIO(data)).convert("RGB")
                w, h = img.size
                log.info(f'Procesando {w}x{h}...')
                with torch.no_grad():
                    result = remover.process(img)
                buf = io.BytesIO()
                result.save(buf, format='PNG')
                buf.seek(0)
                self.send_response(200)
                self._cors()
                self.send_header('Content-Type', 'image/png')
                self.send_header('Content-Length', str(len(buf.getvalue())))
                self.end_headers()
                self.wfile.write(buf.getvalue())
            except Exception as e:
                log.error(f'Error: {e}')
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self._cors()
                self.end_headers()
                self.wfile.write(str(e).encode())

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'OK')

    def log_message(self, format, *args):
        pass

def load_model():
    global remover
    with loading_lock:
        if remover is None:
            model_path = get_model_path()
            log.info(f'Modelo: {model_path}')
            log.info(f'Existe: {os.path.isfile(model_path)}')
            from transparent_background import Remover
            remover = Remover(mode='base', ckpt=model_path)
            torch.set_num_threads(4)
            log.info('Modelo cargado')

if __name__ == '__main__':
    load_model()
    print(f'READY:{PORT}', flush=True)
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    server.serve_forever()