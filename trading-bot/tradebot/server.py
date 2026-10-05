"""A tiny web server for the city dashboard (standard library only).

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

  GET  /                 the dashboard (dashboard/index.html)
  GET  /api/state        everything the city draws, refreshed every second
  GET  /api/chart?symbol=QQQ   today's 1-minute chart with the bots' marks
  POST /api/kill         EMERGENCY STOP: close everything, stop trading

It listens on 127.0.0.1 (this computer only) unless you pass --host. The stop
button needs a custom header, so another website open in your browser cannot
press it for you.
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

DASHBOARD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dashboard")
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
         ".png": "image/png", ".ico": "image/x-icon"}


def make_handler(engine, kill, folder=DASHBOARD):
    class Handler(BaseHTTPRequestHandler):
        server_version = "TradingCity/0.1"

        def log_message(self, fmt, *args):  # keep the terminal for the bots
            pass

        def _send(self, code, body, ctype="application/json"):
            data = body if isinstance(body, bytes) else json.dumps(body, default=str).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            url = urlparse(self.path)
            if url.path == "/api/state":
                return self._send(200, engine.snapshot())
            if url.path == "/api/chart":
                sym = (parse_qs(url.query).get("symbol") or [""])[0].upper()
                chart = engine.chart(sym)
                return self._send(200 if chart else 404, chart or {"error": "unknown symbol"})
            name = "index.html" if url.path in ("/", "") else url.path.lstrip("/")
            path = os.path.normpath(os.path.join(folder, name))
            if not path.startswith(os.path.normpath(folder) + os.sep) or not os.path.isfile(path):
                return self._send(404, {"error": "not found"})
            with open(path, "rb") as fh:
                body = fh.read()
            return self._send(200, body, TYPES.get(os.path.splitext(path)[1], "application/octet-stream"))

        def do_POST(self):
            url = urlparse(self.path)
            if url.path != "/api/kill":
                return self._send(404, {"error": "not found"})
            if self.headers.get("X-Trading-City") != "1":
                return self._send(403, {"error": "missing header"})
            threading.Thread(target=kill, args=("emergency stop pressed on the dashboard",), daemon=True).start()
            return self._send(200, {"ok": True})

    return Handler


def serve(engine, kill, host="127.0.0.1", port=8765):
    httpd = ThreadingHTTPServer((host, port), make_handler(engine, kill))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd
