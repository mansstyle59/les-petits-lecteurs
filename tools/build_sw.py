"""Régénère sw.js (cache hors connexion). À lancer après toute modification des fichiers web ou audio."""
import json, pathlib, hashlib
R = pathlib.Path(__file__).resolve().parent.parent
files = ["./", "index.html", "app/", "app/index.html", "app/app.css", "app/app.js", "contenu/cours.json",
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
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, {{ ignoreSearch: true }}).then(r => r || fetch(e.request)));
}});
""", encoding="utf-8")
print("sw.js :", len(files), "fichiers, version", ver)
