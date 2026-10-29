#!/usr/bin/env python3
"""Serve the local static skill library. No database, upload or administration endpoints."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

root = Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        target = (root / path.lstrip('/')).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            self.send_error(404)
            return None
        if path.startswith(('/api/', '/review/')) or path == '/review':
            self.send_error(404)
            return None
        if not (path in ('/', '/index.html', '/landing.css', '/analytics.js', '/installers.js', '/cloud.js', '/backup-download.js') or path.startswith(('/skills/', '/assets/'))):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def do_POST(self):
        self.send_error(404)

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8776)
    args = parser.parse_args()
    http = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(root)))
    print('Local skill library: http://127.0.0.1:' + str(args.port) + '/skills/', flush=True)
    http.serve_forever()
