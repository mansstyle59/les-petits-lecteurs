"""Régénère sw.js (cache hors connexion). À lancer après toute modification des fichiers web ou audio."""
import json, pathlib, hashlib
R = pathlib.Path(__file__).resolve().parent.parent
files = ["./", "index.html", "app/", "app/index.html", "app/app.css", "app/app.js", "app/fonts/nunito-latin-700-normal.woff2", "app/fonts/nunito-latin-800-normal.woff2", "app/fonts/nunito-latin-900-normal.woff2", "contenu/cours.json",
         "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]
files += sorted(str(p.relative_to(R)) for p in R.glob("audio/**/*.mp3"))
h = hashlib.sha1()
for f in files:
    p = R / f
    if p.is_file(): h.update(p.read_bytes())
ver = h.hexdigest()[:10]
(R / "sw.js").write_text(f"""/* Généré par tools/build_sw.py : cache hors connexion */
const CACHE = "lpl-{ver}";
const FILES = {json.dumps(files, ensure_ascii=False)};
self.addEventListener("install", e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
}});
self.addEventListener("activate", e => {{
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener("fetch", e => {{
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // synchronisation : jamais en cache
  // Voix et polices : cache d'abord (rapide). Code, pages et leçons : réseau d'abord (toujours à jour).
  const cacheFirst = /\/(audio|app\/fonts)\//.test(url.pathname) || /\.png$/.test(url.pathname);
  if (cacheFirst) {{
    e.respondWith(caches.match(req, {{ ignoreSearch: true }}).then(r => r || fetch(req).then(res => {{
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    }})));
  }} else {{
    e.respondWith(fetch(req, {{ cache: "no-cache" }}).then(res => {{
      if (res.ok) {{ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }}
      return res;
    }}).catch(() => caches.match(req, {{ ignoreSearch: true }})));
  }}
}});
""", encoding="utf-8")
print("sw.js :", len(files), "fichiers, version", ver)
