# server.py - serves RideBridge and resolves short Google Maps links.
# Run with:  python server.py   then open http://localhost:8000

import json
import urllib.request
import urllib.error
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# We only follow links that belong to Google (safety: stops misuse of this helper)
ALLOWED_SUFFIXES = ("goo.gl", "g.co", "google.com", "google.co.in", "google.de", "google.co.uk")


def host_allowed(url):
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    return any(host == s or host.endswith("." + s) for s in ALLOWED_SUFFIXES)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Stops Python from following redirects automatically, so we can check each hop.
    def redirect_request(self, *args, **kwargs):
        return None


def resolve(url):
    opener = urllib.request.build_opener(NoRedirect)
    current = url
    for _ in range(8):  # follow at most 8 redirects
        if not host_allowed(current):
            break
        req = urllib.request.Request(current, headers={"User-Agent": "Mozilla/5.0"})
        try:
            opener.open(req, timeout=8)
            break  # no redirect: we've arrived
        except urllib.error.HTTPError as e:
            location = e.headers.get("Location")
            if e.code in (301, 302, 303, 307, 308) and location:
                current = urllib.parse.urljoin(current, location)
            else:
                break
    return current


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/resolve":
            target = urllib.parse.parse_qs(parsed.query).get("url", [""])[0]
            if not host_allowed(target):
                return self.reply({"error": "Only Google Maps links are supported."}, 400)
            try:
                return self.reply({"finalUrl": resolve(target)})
            except Exception as e:
                return self.reply({"error": str(e)}, 500)
        return super().do_GET()  # everything else: serve your files as usual

    def reply(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("RideBridge running at http://localhost:8000  (press Ctrl+C to stop)")
    ThreadingHTTPServer(("", 8000), Handler).serve_forever()