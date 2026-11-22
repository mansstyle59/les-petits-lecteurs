"""Régénère sw.js (cache hors connexion). À lancer après toute modification des fichiers web ou audio."""
import json, pathlib, hashlib
R = pathlib.Path(__file__).resolve().parent.parent
files = ["./", "index.html", "app/", "app/index.html", "app/app.css", "app/app.js", "app/voice.js", "logos/icone.svg", "app/fonts/nunito-latin-700-normal.woff2", "app/fonts/nunito-latin-800-normal.woff2", "app/fonts/nunito-latin-900-normal.woff2", "contenu/cours.json", "contenu/histoires.json", "contenu/voix.json",
         "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]
files += sorted(str(p.relative_to(R)) for p in R.glob("audio/**/*.mp3"))
h = hashlib.sha1()
for f in files:
    p = R / f
    if p.is_file(): h.update(p.read_bytes())
ver = h.hexdigest()[:10]
# Version visible par l'application (vérifiée à chaque ouverture) + marquage des fichiers
import re, datetime
(R / "version.json").write_text(json.dumps({"version": ver, "date": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ")}) + "\n", encoding="utf-8")
idx = R / "app" / "index.html"
h = idx.read_text(encoding="utf-8")
h = re.sub(r'app\.css\?v=[^"]*', "app.css?v=" + ver, h)
h = re.sub(r'app\.js\?v=[^"]*', "app.js?v=" + ver, h)
idx.write_text(h, encoding="utf-8")

(R / "sw.js").write_text(f"""/* Généré par tools/build_sw.py : cache hors connexion */
const VERSION = "{ver}";
const CACHE = "lpl-" + VERSION;
const CACHE_MODELES = "lpl-modeles-v1";   // modèle vocal et moteur : gardés d'une version à l'autre
const FILES = {json.dumps([f for f in files if not f.startswith("audio/")], ensure_ascii=False)};
self.addEventListener("install", e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
}});
self.addEventListener("activate", e => {{
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== CACHE_MODELES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener("fetch", e => {{
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // synchronisation : jamais en cache
  if (url.pathname.endsWith("/version.json")) return;   // toujours la version du serveur
  const modele = /\\/app\\/(models|vendor)\\//.test(url.pathname);
  const fixe = modele || /\\/(audio|app\\/fonts)\\//.test(url.pathname) || /\\.(png|svg)$/.test(url.pathname);
  if (fixe) {{
    // Fichiers lourds : cache d'abord. Les voix portent « ?v=version » : une nouvelle version = nouveaux sons.
    const nom = modele ? CACHE_MODELES : CACHE;
    e.respondWith(caches.open(nom).then(c => c.match(req, {{ ignoreSearch: modele }}).then(r => r || fetch(req).then(res => {{
      if (res.ok) c.put(req, res.clone()); return res;
    }}))));
  }} else {{
    // Code, pages et leçons : toujours la dernière version quand il y a du réseau.
    e.respondWith(fetch(req, {{ cache: "no-cache" }}).then(res => {{
      if (res.ok) {{ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }}
      return res;
    }}).catch(() => caches.match(req, {{ ignoreSearch: true }})));
  }}
}});
""", encoding="utf-8")
print("sw.js :", len(files), "fichiers, version", ver)
