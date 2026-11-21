/* Les Petits Lecteurs — application (téléphone, ordinateur, télévision)
   Profils (prénom, âge, animal), chemin de leçons, découverte, jeux d'écoute,
   parole au micro (téléphone), reprise d'une leçon en cours, trophées,
   série de jours, confettis, synchronisation entre appareils (code famille). */
(function () {
  "use strict";

  // ================= Mode d'affichage =================
  var params = new URLSearchParams(location.search);
  var forced = params.get("mode");
  var ua = navigator.userAgent || "";
  var isTV = forced === "tv" || (!forced && /Android TV|GoogleTV|AFT[A-Z]|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S/i.test(ua));
  var isApp = location.hostname === "appassets.androidplatform.net" || params.get("app") === "android";
  if (isTV) document.body.classList.add("mode-tv");
  var coarse = !!(window.matchMedia && matchMedia("(pointer:coarse)").matches);
  var reducedMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches);

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  var canSpeak = !isTV && coarse && (!!SR || canRecord);

  var app = document.getElementById("app");
  var btnBack = document.getElementById("btn-back");
  var titleEl = document.getElementById("topbar-title");
  var starsEl = document.getElementById("topbar-stars");
  var toastEl = document.getElementById("toast");

  var AVATARS = ["🦊", "🐼", "🐯", "🐰", "🦁", "🐸", "🐧", "🦄", "🐶", "🐱", "🐵", "🐻"];
  var AGES = [3, 4, 5, 6, 7, 8];
  var AUDIO_BASE = "../audio/";

  // ================= Synchronisation (Supabase) =================
  var SYNC_URL = "https://vfxblubjsxwseacmslnu.supabase.co/rest/v1/rpc/";
  var SYNC_KEY = "sb_publishable_HojETqgwpBMQ_cjDzMNaAg_WGCFMaED";

  // Cadeaux proposés par défaut (modifiables dans l'Espace parents)
  var DEFAULT_REWARDS = [
    { id: "histoire", ico: "📚", titre: "Choisir l'histoire du soir", cout: 6 },
    { id: "jeu", ico: "🎲", titre: "Un jeu de société avec papa ou maman", cout: 12 },
    { id: "dessert", ico: "🍦", titre: "Choisir le dessert", cout: 18 },
    { id: "parc", ico: "🛝", titre: "Une sortie au parc", cout: 30 }
  ];
  var LIMITS = [0, 10, 20, 30, 45];

  // ================= Stockage local =================
  var STORE_KEY = "lpl.v1";
  var memoryStore = null;
  function normProfile(p) {
    p.stars = p.stars || {}; p.trophies = p.trophies || {}; p.days = Array.isArray(p.days) ? p.days : [];
    p.errs = p.errs || {}; p.usage = p.usage || {}; p.claimed = Array.isArray(p.claimed) ? p.claimed : [];
    if (!Array.isArray(p.rewards)) p.rewards = DEFAULT_REWARDS.map(function (r) { return { id: r.id, titre: r.titre, ico: r.ico, cout: r.cout }; });
    if (typeof p.limit !== "number") p.limit = 20;
    p.updated = p.updated || 1;
    return p;
  }
  function loadState() {
    var s = null;
    try { var raw = localStorage.getItem(STORE_KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = memoryStore; }
    s = s || {};
    s.profiles = Array.isArray(s.profiles) ? s.profiles : [];
    s.profiles.forEach(normProfile);
    return s;
  }
  var state = loadState();
  function persist() {
    memoryStore = state;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
  }
  function saveState(touchProfile) {
    if (touchProfile) touchProfile.updated = Date.now();
    persist();
    scheduleSync();
  }
  function liveProfiles() { return state.profiles.filter(function (p) { return !p.deleted; }); }
  function profile() {
    for (var i = 0; i < state.profiles.length; i++) {
      var p = state.profiles[i];
      if (p.id === state.current && !p.deleted) return p;
    }
    return null;
  }

  // ================= Audio =================
  var player = new Audio();
  player.preload = "auto";
  var queue = [];
  var unlocked = false;
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    try {
      player.muted = true;
      player.src = AUDIO_BASE + "ui/ecoute.mp3";
      var p = player.play();
      if (p && p.then) p.then(function () { player.pause(); player.muted = false; }).catch(function () { player.muted = false; });
      else player.muted = false;
    } catch (e) { player.muted = false; }
  }
  document.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
  document.addEventListener("keydown", unlockAudio, { once: true, capture: true });

  function speakTTS(text, done) {
    var finished = false;
    function end() { if (!finished) { finished = true; done(); } }
    try {
      if (!("speechSynthesis" in window)) return end();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR"; u.rate = 0.9;
      var voices = speechSynthesis.getVoices().filter(function (v) { return /^fr(-|_)FR/i.test(v.lang); });
      if (voices.length) u.voice = voices[0];
      u.onend = end; u.onerror = end;
      speechSynthesis.speak(u);
      setTimeout(end, 2500);
    } catch (e) { end(); }
  }
  function play(paths, onEnd) {
    stopAudio();
    queue = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    playNext(onEnd);
  }
  function playNext(onEnd) {
    if (!queue.length) { if (onEnd) onEnd(); return; }
    var p = queue.shift();
    if (p.indexOf("tts:") === 0) { speakTTS(p.slice(4), function () { playNext(onEnd); }); return; }
    player.onended = function () { setTimeout(function () { playNext(onEnd); }, 160); };
    player.onerror = function () { playNext(onEnd); };
    player.muted = false;
    player.src = AUDIO_BASE + p;
    var pr = player.play();
    if (pr && pr.catch) pr.catch(function () { playNext(onEnd); });
  }
  function stopAudio() {
    queue = []; player.onended = null; player.onerror = null;
    try { player.pause(); } catch (e) {}
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  }
  var PRENOMS_ENREGISTRES = ["maelo"];
  function slug(t) { return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, ""); }
  function nameAudio(p) {
    if (!p) return [];
    var k = slug(p.name);
    return PRENOMS_ENREGISTRES.indexOf(k) >= 0 ? ["prenoms/" + k + ".mp3"] : ["tts:" + p.name];
  }

  // ================= Utilitaires =================
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }
  function totalStars(p) { var t = 0; for (var k in p.stars) t += p.stars[k]; return t; }
  function starsText(n, max) { var s = ""; for (var i = 0; i < max; i++) s += i < n ? "★" : "☆"; return s; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function streak(p) {
    if (!p.days.length) return 0;
    var set = {}; p.days.forEach(function (d) { set[d] = 1; });
    var d = new Date(), n = 0;
    if (!set[today()]) d.setDate(d.getDate() - 1); // la série tient jusqu'à la fin de la journée
    for (;;) {
      var key = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
      if (!set[key]) break;
      n++; d.setDate(d.getDate() - 1);
    }
    return n;
  }
  function markToday(p) {
    var t = today();
    if (p.days.indexOf(t) < 0) { p.days.push(t); p.days = p.days.slice(-60); }
  }

  // ================= Temps de jeu par jour =================
  var PLAY_SCREENS = { discover: 1, game: 1, speak: 1 };
  function usedToday(p) { return (p.usage[today()] || 0); }
  function timeLeft(p) { return p.limit ? Math.max(0, p.limit * 60 - usedToday(p)) : Infinity; }
  function timeUp(p) { return p.limit > 0 && timeLeft(p) <= 0; }
  setInterval(function () {
    var top = stack[stack.length - 1], p = profile();
    if (!p || !top || !PLAY_SCREENS[top.screen] || document.visibilityState !== "visible") return;
    var t = today();
    p.usage[t] = (p.usage[t] || 0) + 10;
    var keys = Object.keys(p.usage).sort(); while (keys.length > 14) delete p.usage[keys.shift()];
    persist();
  }, 10000);

  // ================= Confettis =================
  function confetti(amount) {
    if (reducedMotion) return;
    var c = document.createElement("canvas");
    c.className = "confetti"; c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    var ctx = c.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = c.width = innerWidth * dpr, H = c.height = innerHeight * dpr;
    var colors = ["#58cc02", "#1cb0f6", "#ffc800", "#ff4b4b", "#ce82ff", "#ff9600"];
    var parts = [];
    for (var i = 0; i < (amount || 140); i++) {
      parts.push({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 22 * dpr, vy: (-Math.random() * 18 - 6) * dpr,
        s: (6 + Math.random() * 8) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[i % colors.length], shape: i % 3 });
    }
    var t0 = performance.now();
    (function frame(t) {
      var el = t - t0;
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vy += .55 * dpr; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - el / 2600);
        if (p.shape === 0) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.6, 0, 6.3); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(0, -p.s / 2); ctx.lineTo(p.s / 2, p.s / 2); ctx.lineTo(-p.s / 2, p.s / 2); ctx.fill(); }
        ctx.restore();
      });
      if (el < 2600) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // ================= Contenu =================
  var cours = null, lessonIndex = {}, allLessons = [];
  function findLesson(id) { return lessonIndex[id]; }
  function moduleOf(id) {
    for (var i = 0; i < cours.modules.length; i++) {
      if (cours.modules[i].lecons.some(function (l) { return l.id === id; })) return cours.modules[i];
    }
    return null;
  }
  function itemAudio(it, lessonId, idx) {
    if (it.lettre_minuscule) return ["lettres/nom-" + it.lettre_minuscule + ".mp3", "lettres/son-" + it.lettre_minuscule + ".mp3", "ui/comme-dans.mp3", "mots/" + it.exemple + ".mp3"];
    if (it.syllabe_tts) return ["syllabes/" + it.syllabe_tts + ".mp3"];
    if (it.mot) return ["mots/" + it.mot + ".mp3"];
    return ["phrases/" + (it._lid || lessonId) + "-" + ((it._idx !== undefined ? it._idx : idx) + 1) + ".mp3"];
  }
  function questionAudio(it, lessonId, idx) {
    if (it.lettre_minuscule) return ["lettres/son-" + it.lettre_minuscule + ".mp3", "ui/comme-dans.mp3", "mots/" + it.exemple + ".mp3"];
    return itemAudio(it, lessonId, idx);
  }
  function itemKey(it) { return it.lettre_minuscule || it.syllabe_tts || it.mot || it.phrase; }
  function nextLessonFor(p) {
    if (p.resume && lessonIndex[p.resume.id]) return p.resume.id;
    for (var i = 0; i < allLessons.length; i++) if (!p.stars[allLessons[i]]) return allLessons[i];
    return allLessons[0];
  }
  function isUnlocked(p, id) {
    var i = allLessons.indexOf(id);
    if (i <= 0) return true;
    if (p.stars[id] || (p.resume && p.resume.id === id)) return true;
    return !!p.stars[allLessons[i - 1]];
  }
  function nextLesson(id) {
    var i = allLessons.indexOf(id);
    return i >= 0 && i < allLessons.length - 1 ? allLessons[i + 1] : null;
  }
  function lessonIcon(l) {
    return { son_vers_lettre: "🔤", assemblage_syllabe: "🧩", image_vers_mot: "📖", lecture_phrase: "💬" }[l.type_jeu] || "⭐";
  }

  // ================= Révisions et cadeaux =================
  function starsLeft(p) {
    var spent = 0; p.claimed.forEach(function (c) { spent += c.cout || 0; });
    return Math.max(0, totalStars(p) - spent);
  }
  function findItem(key) {
    for (var i = 0; i < allLessons.length; i++) {
      var l = lessonIndex[allLessons[i]];
      for (var j = 0; j < l.items.length; j++) if (itemKey(l.items[j]) === key) return l.items[j];
    }
    return null;
  }
  // Leçon virtuelle de révision : les erreurs du type le plus fréquent
  function reviewLesson(p) {
    var groups = {};
    Object.keys(p.errs).forEach(function (k) {
      var it = findItem(k); if (!it) { delete p.errs[k]; return; }
      var l = lessonIndex[it._lid];
      (groups[l.type_jeu] = groups[l.type_jeu] || { l: l, items: [] }).items.push(it);
    });
    var best = null;
    Object.keys(groups).forEach(function (t) { if (!best || groups[t].items.length > best.items.length) best = groups[t]; });
    if (!best) return null;
    var pool = [];
    allLessons.forEach(function (id) { var l = lessonIndex[id]; if (l.type_jeu === best.l.type_jeu) pool = pool.concat(l.items); });
    lessonIndex.REV = { id: "REV", titre: "Révisions", type_jeu: best.l.type_jeu, consigne: best.l.consigne, items: best.items, pool: pool, objectif: "Revoir les erreurs." };
    return lessonIndex.REV;
  }

  // ================= Trophées =================
  function doneCount(p) { return Object.keys(p.stars).filter(function (k) { return p.stars[k] > 0; }).length; }
  function moduleDone(p, mid) {
    var m = cours.modules.filter(function (x) { return x.id === mid; })[0];
    return m && m.lecons.every(function (l) { return p.stars[l.id] > 0; });
  }
  var TROPHIES = [
    { id: "premiere", ico: "🥇", titre: "Première leçon", desc: "Tu as fini ta première leçon.", test: function (p) { return doneCount(p) >= 1; } },
    { id: "parfait", ico: "💎", titre: "Sans faute", desc: "Une leçon avec 3 étoiles.", test: function (p) { return Object.keys(p.stars).some(function (k) { return p.stars[k] === 3; }); } },
    { id: "trois", ico: "🏅", titre: "Bien parti", desc: "3 leçons réussies.", test: function (p) { return doneCount(p) >= 3; } },
    { id: "micro", ico: "🎤", titre: "Petit orateur", desc: "Tu as parlé au micro.", test: function (p) { return !!p.spoke; } },
    { id: "serie3", ico: "🔥", titre: "3 jours de suite", desc: "Tu as joué 3 jours d'affilée.", test: function (p) { return streak(p) >= 3; } },
    { id: "M1", ico: "🔤", titre: "Toutes les lettres", desc: "Tu connais les 26 lettres.", test: function (p) { return moduleDone(p, "M1"); } },
    { id: "etoiles20", ico: "🌟", titre: "20 étoiles", desc: "Tu as gagné 20 étoiles.", test: function (p) { return totalStars(p) >= 20; } },
    { id: "M2", ico: "🧩", titre: "Roi des syllabes", desc: "Toutes les syllabes réussies.", test: function (p) { return moduleDone(p, "M2"); } },
    { id: "serie7", ico: "📅", titre: "Une semaine", desc: "7 jours de suite !", test: function (p) { return streak(p) >= 7; } },
    { id: "M3", ico: "📖", titre: "Lecteur de mots", desc: "Tous les premiers mots lus.", test: function (p) { return moduleDone(p, "M3"); } },
    { id: "M4", ico: "🏆", titre: "Je sais lire !", desc: "Tu lis tes premières phrases.", test: function (p) { return moduleDone(p, "M4"); } },
    { id: "couronne", ico: "👑", titre: "Champion", desc: "3 étoiles partout.", test: function (p) { return allLessons.every(function (id) { return p.stars[id] === 3; }); } }
  ];
  function checkTrophies(p) {
    var fresh = [];
    TROPHIES.forEach(function (t) { if (!p.trophies[t.id] && t.test(p)) { p.trophies[t.id] = Date.now(); fresh.push(t); } });
    return fresh;
  }

  // ================= Mascotte (dessin original : un livre souriant) =================
  function mascot(mood) {
    var mouth = mood === "think" ? '<path d="M48 70 L72 68" stroke="#3c3c3c" stroke-width="5" stroke-linecap="round"/>'
      : '<path d="M44 66 Q60 80 76 66" stroke="#3c3c3c" stroke-width="5" fill="#fff" stroke-linecap="round"/>';
    return '<svg class="mascot ' + (mood || "") + '" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
      '<ellipse cx="60" cy="113" rx="34" ry="5" fill="rgba(0,0,0,.08)"/>' +
      '<path d="M18 30 Q60 18 102 30 L102 96 Q60 84 18 96 Z" fill="#58cc02"/>' +
      '<path d="M18 96 Q60 84 102 96 L102 103 Q60 91 18 103 Z" fill="#58a700"/>' +
      '<path d="M60 24 L60 90" stroke="#58a700" stroke-width="4"/>' +
      '<circle cx="44" cy="50" r="11" fill="#fff"/><circle cx="76" cy="50" r="11" fill="#fff"/>' +
      '<circle cx="46" cy="52" r="5.5" fill="#3c3c3c"/><circle cx="78" cy="52" r="5.5" fill="#3c3c3c"/>' +
      '<circle cx="48" cy="49" r="2" fill="#fff"/><circle cx="80" cy="49" r="2" fill="#fff"/>' + mouth +
      '<circle cx="30" cy="66" r="6" fill="#ff9aa2" opacity=".7"/><circle cx="90" cy="66" r="6" fill="#ff9aa2" opacity=".7"/></svg>';
  }
  function bubble(text, mood) {
    return '<div class="speech">' + mascot(mood) + '<div class="speech-bubble">' + esc(text) + "</div></div>";
  }

  // ================= Navigation entre écrans =================
  var stack = [];
  var leaveHook = null;
  function runLeave() { if (leaveHook) { var h = leaveHook; leaveHook = null; h(); } }
  function go(screen, args, replace) {
    runLeave(); stopAudio();
    if (replace) stack.pop();
    stack.push({ screen: screen, args: args || {} });
    render();
  }
  function back() {
    if (stack.length <= 1) return false;
    runLeave(); stopAudio();
    stack.pop();
    render();
    return true;
  }
  function resetTo(screen, args) {
    runLeave(); stopAudio();
    stack = [{ screen: "profiles", args: {} }];
    if (screen !== "profiles") stack.push({ screen: screen, args: args || {} });
    render();
  }
  window.lplBack = back; // bouton Retour d'Android
  btnBack.addEventListener("click", back);

  function setTop(title, showBack) {
    titleEl.textContent = title;
    btnBack.hidden = !showBack;
    var p = profile(), html = "";
    if (p) {
      var st = streak(p);
      html += '<span class="chip fire" title="Jours de suite"><span aria-hidden="true">🔥</span> ' + st + "</span>";
      html += '<span class="chip gold" title="Étoiles"><span class="star-ico" aria-hidden="true">★</span> ' + totalStars(p) + "</span>";
    }
    starsEl.innerHTML = html + syncChip();
  }
  function syncChip() {
    if (!state.code) return "";
    var label = syncStatus === "ok" ? "Synchronisé" : syncStatus === "err" ? "Hors ligne" : "Synchronisation…";
    return '<span class="chip sync ' + syncStatus + '" title="' + label + '" aria-label="' + label + '">☁</span>';
  }
  function render() {
    var top = stack[stack.length - 1];
    app.className = "screen screen-" + top.screen;
    SCREENS[top.screen](top.args);
    window.scrollTo(0, 0);
    if (isTV) focusFirst();
  }

  // ================= Écrans =================
  var SCREENS = {};

  SCREENS.profiles = function () {
    setTop("Les Petits Lecteurs", false);
    var list = liveProfiles();
    var html = bubble(list.length ? "Qui joue aujourd'hui ?" : "Bonjour ! Crée ton profil pour commencer.", "happy") + "<div class='profiles'>";
    list.forEach(function (p) {
      html += '<button class="profile focusable" type="button" data-id="' + esc(p.id) + '"><span class="avatar" aria-hidden="true">' + p.avatar +
        '</span><span class="pname">' + esc(p.name) + '</span><span class="pstars"><span class="star-ico" aria-hidden="true">★</span> ' + totalStars(p) + "</span></button>";
    });
    html += '<button class="profile add focusable" type="button" id="add-profile"><span class="avatar" aria-hidden="true">＋</span><span class="pname">Nouveau</span></button></div>';
    html += '<div class="actions center"><button class="btn ghost focusable" type="button" id="to-parents">Espace parents</button></div>';
    app.innerHTML = html;
    app.querySelectorAll(".profile[data-id]").forEach(function (b) {
      b.addEventListener("click", function () { state.current = b.dataset.id; persist(); go("home"); });
    });
    document.getElementById("add-profile").addEventListener("click", function () { go("newProfile"); });
    document.getElementById("to-parents").addEventListener("click", function () { go("parentsGate"); });
    play(list.length ? "ui/qui-joue.mp3" : "ui/bienvenue.mp3");
  };

  // Inscription avec un adulte : à la voix (« Je m'appelle Maëlo, j'ai 6 ans ») ou au clavier
  var AGE_WORDS = { trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8 };
  var KNOWN_NAMES = { maelo: "Maëlo", mailo: "Maëlo", maylo: "Maëlo", mayelo: "Maëlo", maelos: "Maëlo", maeloh: "Maëlo" };
  function parseIntro(text) {
    var t = String(text).trim(), res = { name: null, age: null };
    var mAge = t.match(/(\d{1,2})\s*ans?/i) || t.match(/\b(\d)\b/);
    if (mAge) res.age = +mAge[1];
    else { var w = plain(t).split(" "); for (var i = 0; i < w.length; i++) if (AGE_WORDS[w[i]]) res.age = AGE_WORDS[w[i]]; }
    var mName = t.match(/(?:je m'?\s?appelle|moi c'?est|mon prénom c'?est|mon prenom c'?est|c'?est)\s+([A-Za-zÀ-ÿ'-]+)/i);
    var name = mName ? mName[1] : null;
    if (!name) {
      var words = t.replace(/[0-9]+.*$/, "").split(/[\s,.]+/).filter(function (x) { return x && !/^(je|m|appelle|j|ai|ans?|et|moi|c|est|bonjour|salut)$/i.test(x.replace(/'/g, "")); });
      name = words[0] || null;
    }
    if (name) {
      var k = slug(name);
      name = KNOWN_NAMES[k] || (name.charAt(0).toUpperCase() + name.slice(1).toLowerCase());
    }
    res.name = name;
    if (res.age && (res.age < 3 || res.age > 12)) res.age = null;
    return res;
  }
  SCREENS.newProfile = function () {
    setTop("Inscription", true);
    var chosen = AVATARS[0], age = 6, step = 1;
    var micOK = !!SR && !isApp && !isTV;
    function draw() {
      var html = '<div class="adult-note"><span aria-hidden="true">👨‍👩‍👦</span> À faire avec un adulte</div>' +
        '<form class="form card-panel" id="pf" autocomplete="off" novalidate>';
      html += bubble(micOK ? "Appuie sur le micro et dis : « Je m'appelle…, j'ai … ans »" : "Comment tu t'appelles ? Quel âge as-tu ?", "happy");
      if (micOK) html += '<div class="intro-mic"><button class="mic focusable" type="button" id="intro-mic" aria-label="Dire mon prénom et mon âge"><span aria-hidden="true">🎤</span></button><p class="hint" id="intro-hint">Appuie, puis parle.</p></div>';
      html += '<label for="pname">Prénom</label><input id="pname" type="text" maxlength="20" autocapitalize="words" spellcheck="false" class="focusable" placeholder="Par exemple : Maëlo">' +
        '<span class="label">Âge</span><div class="ages" role="group" aria-label="Âge">';
      AGES.forEach(function (a) { html += '<button type="button" class="pick age-choice focusable" aria-pressed="' + (a === age) + '" data-age="' + a + '">' + a + " ans</button>"; });
      html += '</div><span class="label">Choisis ton animal</span><div class="avatars" role="group" aria-label="Animal">';
      AVATARS.forEach(function (a) { html += '<button type="button" class="pick avatar-choice focusable" aria-pressed="' + (a === chosen) + '" data-a="' + a + '" aria-label="Animal ' + a + '">' + a + "</button>"; });
      html += '</div><button class="btn big wide focusable" type="submit">C\'est parti !</button></form>';
      app.innerHTML = html;
      app.querySelectorAll(".avatar-choice").forEach(function (b) {
        b.addEventListener("click", function () { chosen = b.dataset.a; app.querySelectorAll(".avatar-choice").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); });
      });
      app.querySelectorAll(".age-choice").forEach(function (b) {
        b.addEventListener("click", function () { setAge(+b.dataset.age); if (step === 1) { step = 2; play("ui/animal.mp3"); } });
      });
      var mic = document.getElementById("intro-mic");
      if (mic) mic.addEventListener("click", listenIntro);
      document.getElementById("pf").addEventListener("submit", submit);
    }
    function setAge(a) { age = a; app.querySelectorAll(".age-choice").forEach(function (x) { x.setAttribute("aria-pressed", String(+x.dataset.age === a)); }); }
    var rec = null;
    leaveHook = function () { try { if (rec) { rec.onresult = rec.onerror = rec.onend = null; rec.abort(); } } catch (e) {} };
    function listenIntro() {
      stopAudio();
      var mic = document.getElementById("intro-mic"), hint = document.getElementById("intro-hint");
      try {
        rec = new SR(); rec.lang = "fr-FR"; rec.interimResults = false; rec.maxAlternatives = 3;
        var got = false;
        rec.onresult = function (e) {
          got = true; mic.classList.remove("listening");
          var r = parseIntro(e.results[0][0].transcript);
          if (r.name) document.getElementById("pname").value = r.name;
          if (r.age) setAge(r.age);
          if (r.name) { hint.textContent = "J'ai compris : " + r.name + (r.age ? ", " + r.age + " ans" : "") + ". Un adulte vérifie, puis choisis ton animal."; play(["ui/compris.mp3", "ui/animal.mp3"]); }
          else { hint.textContent = "Je n'ai pas bien compris. Réessaie, ou un adulte écrit le prénom."; play("ui/pas-compris.mp3"); }
        };
        rec.onerror = function () { got = true; mic.classList.remove("listening"); hint.textContent = "Le micro n'est pas disponible : un adulte peut écrire le prénom."; play("ui/pas-compris.mp3"); };
        rec.onend = function () { mic.classList.remove("listening"); if (!got) { hint.textContent = "Je n'ai rien entendu. Appuie et parle bien fort."; } };
        rec.start(); mic.classList.add("listening"); hint.textContent = "Je t'écoute…";
      } catch (e) { hint.textContent = "Le micro n'est pas disponible : un adulte peut écrire le prénom."; }
    }
    function submit(e) {
      e.preventDefault();
      var name = document.getElementById("pname").value.trim().replace(/\s+/g, " ").slice(0, 20);
      if (!name) { toast("Écris d'abord le prénom."); document.getElementById("pname").focus(); return; }
      var k = slug(name); if (KNOWN_NAMES[k]) name = KNOWN_NAMES[k];
      var p = normProfile({ id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, age: age, avatar: chosen });
      state.profiles.push(p); state.current = p.id; saveState(p);
      confetti(80);
      resetTo("home");
    }
    draw();
    play(micOK ? ["ui/inscription.mp3"] : ["ui/inscription-ecrit.mp3"]);
  };

  SCREENS.home = function () {
    var p = profile();
    if (!p) return resetTo("profiles");
    setTop("Bonjour " + p.name + " !", true);
    var nextId = nextLessonFor(p), nextL = findLesson(nextId);
    var resuming = !!(p.resume && p.resume.id === nextId);
    var nbTro = Object.keys(p.trophies).length;
    var nbErr = Object.keys(p.errs).length;
    var html = '<section class="hero-continue">' + bubble(resuming ? "On reprend où tu t'es arrêté ?" : "Prêt pour la suite, " + p.name + " ?", "happy") +
      '<button class="btn big wide pulse focusable" type="button" id="continue">▶ ' + (resuming ? "Continuer" : "Jouer") +
      '<span class="btn-sub">' + esc(nextL.titre) + '</span></button>' +
      '<div class="home-tiles">' +
      '<button class="tile focusable" type="button" id="trophies"><span class="tile-ico" aria-hidden="true">🏆</span><span>Trophées</span><span class="badge">' + nbTro + "/" + TROPHIES.length + '</span></button>' +
      '<button class="tile focusable" type="button" id="gifts"><span class="tile-ico" aria-hidden="true">🎁</span><span>Cadeaux</span><span class="badge">' + starsLeft(p) + ' ★</span></button>' +
      (nbErr ? '<button class="tile focusable" type="button" id="review"><span class="tile-ico" aria-hidden="true">🔁</span><span>Révisions</span><span class="badge">' + nbErr + "</span></button>" : "") +
      "</div>" + (p.limit ? '<div class="time-left" aria-live="polite">⏱ ' + (timeUp(p) ? "Temps de jeu terminé pour aujourd'hui" : "Encore " + Math.ceil(timeLeft(p) / 60) + " min de jeu aujourd'hui") + "</div>" : "") + "</section>";
    html += '<div class="path">';
    var n = 0;
    cours.modules.forEach(function (m, mi) {
      var got = 0, max = m.lecons.length * 3;
      m.lecons.forEach(function (l) { got += p.stars[l.id] || 0; });
      html += '<section class="unit unit-' + (mi % 4) + '"><div class="unit-head"><span class="unit-step">Étape ' + (mi + 1) + "</span><h2>" + esc(m.titre) +
        '</h2><span class="unit-progress"><span class="star-ico" aria-hidden="true">★</span> ' + got + " / " + max + '</span></div><div class="nodes">';
      m.lecons.forEach(function (l) {
        var s = p.stars[l.id] || 0, open = isUnlocked(p, l.id), current = l.id === nextId;
        var cls = "node focusable" + (s ? " done" : "") + (current ? " current" : "") + (open ? "" : " locked");
        var off = ["0px", "44px", "66px", "44px", "0px", "-44px", "-66px", "-44px"][n % 8];
        html += '<div class="node-wrap" style="--offset:' + off + '">' + (current ? '<span class="node-tag">' + (resuming ? "En cours" : "Commencer") + "</span>" : "") +
          '<button class="' + cls + '" type="button" data-l="' + l.id + '" aria-label="' + esc(l.titre) + (open ? ", " + s + " étoiles sur 3" : ", verrouillée") + '">' +
          '<span class="node-ico" aria-hidden="true">' + (open ? (s === 3 ? "👑" : s ? "★" : lessonIcon(l)) : "🔒") + "</span></button>" +
          '<span class="node-label">' + esc(l.titre) + '</span><span class="node-stars" aria-hidden="true">' + starsText(s, 3) + "</span></div>";
        n++;
      });
      html += "</div></section>";
    });
    html += "</div>";
    app.innerHTML = html;
    document.getElementById("continue").addEventListener("click", function () { openLesson(nextId); });
    document.getElementById("trophies").addEventListener("click", function () { go("trophies"); });
    document.getElementById("gifts").addEventListener("click", function () { go("gifts"); });
    var rv = document.getElementById("review");
    if (rv) rv.addEventListener("click", function () { if (timeUp(p)) return go("pause"); var r = reviewLesson(p); if (r) go("game", { id: "REV", review: true }); });
    app.querySelectorAll(".node").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.classList.contains("locked")) { toast("Finis d'abord la leçon d'avant !"); return; }
        openLesson(b.dataset.l);
      });
    });
    var homeVoice = ["ui/bonjour.mp3"].concat(nameAudio(p));
    if (timeUp(p)) homeVoice.push("ui/pause.mp3");
    else if (p.limit && timeLeft(p) < 4 * 60) homeVoice.push("ui/presque-fini.mp3");
    else homeVoice.push("ui/choisis-lecon.mp3");
    play(homeVoice);
  };
  function openLesson(id) {
    var p = profile();
    if (timeUp(p)) return go("pause");
    if (p.resume && p.resume.id === id && p.resume.phase === "game") go("game", { id: id, resume: true });
    else go("discover", { id: id });
  }

  SCREENS.trophies = function () {
    var p = profile();
    setTop("Mes trophées", true);
    var html = bubble(Object.keys(p.trophies).length ? "Bravo pour tes trophées !" : "Gagne ton premier trophée en finissant une leçon !", "happy") + '<div class="trophies">';
    TROPHIES.forEach(function (t) {
      var got = !!p.trophies[t.id];
      html += '<div class="trophy' + (got ? " got" : "") + '"><span class="trophy-ico" aria-hidden="true">' + (got ? t.ico : "🔒") + '</span><strong>' + esc(t.titre) + "</strong><span>" + esc(t.desc) + "</span></div>";
    });
    app.innerHTML = html + "</div>";
  };

  SCREENS.discover = function (a) {
    var l = findLesson(a.id), p = profile();
    setTop(l.titre, true);
    var html = bubble("Touche chaque carte pour écouter.", "happy") + "<h1>" + esc(l.titre) + "</h1><div class='cards'>";
    l.items.forEach(function (it, i) { html += cardHTML(it, i); });
    html += '</div><div class="actions sticky-actions"><button class="btn big wide focusable" type="button" id="start">À toi de jouer !</button></div>';
    app.innerHTML = html;
    app.querySelectorAll(".card").forEach(function (b) {
      b.addEventListener("click", function () {
        app.querySelectorAll(".card.playing").forEach(function (x) { x.classList.remove("playing"); });
        b.classList.add("playing"); b.classList.add("heard");
        var i = +b.dataset.i;
        play(itemAudio(l.items[i], l.id, i), function () { b.classList.remove("playing"); });
      });
    });
    document.getElementById("start").addEventListener("click", function () { go("game", { id: l.id }, true); });
    play(nameAudio(p).concat(["titres/" + l.id + ".mp3", "ui/decouvre.mp3"]));
  };

  function cardHTML(it, i) {
    if (it.lettre_minuscule) {
      return '<button class="card focusable" data-i="' + i + '" type="button" aria-label="Lettre ' + esc(it.lettre_majuscule) + ', écouter">' +
        '<span class="glyph">' + esc(it.lettre_majuscule) + " " + esc(it.lettre_minuscule) + "</span>" +
        '<span class="emoji" aria-hidden="true">' + it.illustration + '</span><span class="caption">' + esc(it.exemple) + '</span><span class="play-ico" aria-hidden="true">🔊</span></button>';
    }
    if (it.syllabe_tts) {
      return '<button class="card focusable" data-i="' + i + '" type="button" aria-label="Syllabe ' + esc(it.affiche) + ', écouter"><span class="glyph">' + esc(it.affiche) + '</span><span class="play-ico" aria-hidden="true">🔊</span></button>';
    }
    if (it.mot) {
      return '<button class="card focusable" data-i="' + i + '" type="button" aria-label="Mot ' + esc(it.mot) + ', écouter"><span class="emoji" aria-hidden="true">' + it.illustration + "</span>" +
        '<span class="glyph word">' + esc(it.mot) + '</span><span class="caption">' + esc(it.decoupage) + '</span><span class="play-ico" aria-hidden="true">🔊</span></button>';
    }
    return '<button class="card wide focusable" data-i="' + i + '" type="button" aria-label="Phrase : ' + esc(it.phrase) + ', écouter"><span class="emoji" aria-hidden="true">' + it.illustration + "</span>" +
      '<span class="glyph phrase">' + esc(it.phrase) + '</span><span class="play-ico" aria-hidden="true">🔊</span></button>';
  }
  function choiceHTML(it, type) {
    var key = esc(itemKey(it));
    if (type === "son_vers_lettre") return '<button class="choice focusable" type="button" data-key="' + key + '" aria-label="Lettre ' + esc(it.lettre_majuscule) + '">' + esc(it.lettre_majuscule) + " " + esc(it.lettre_minuscule) + "</button>";
    if (type === "assemblage_syllabe") return '<button class="choice focusable" type="button" data-key="' + key + '" aria-label="Syllabe ' + esc(it.affiche) + '">' + esc(it.affiche) + "</button>";
    return '<button class="choice focusable" type="button" data-key="' + key + '" aria-label="Image"><span class="emoji" aria-hidden="true">' + it.illustration + "</span></button>";
  }
  function poolFor(l) {
    if (l.pool) return l.pool;
    var pool = l.items.slice();
    if (pool.length < 3) moduleOf(l.id).lecons.forEach(function (x) { if (x !== l) pool = pool.concat(x.items); });
    return pool;
  }

  SCREENS.game = function (a) {
    var p = profile();
    var l = a.review ? (lessonIndex.REV || reviewLesson(p)) : findLesson(a.id);
    if (!l) return back();
    setTop(l.titre, true);
    var pool = poolFor(l);
    var order, step = 0, errors = 0, locked = false;
    if (a.resume && p.resume && p.resume.id === l.id && Array.isArray(p.resume.order) && p.resume.order.length) {
      order = p.resume.order.filter(function (i) { return i < l.items.length; });
      step = Math.min(p.resume.step || 0, order.length - 1); errors = p.resume.errors || 0;
    } else {
      var idxs = l.items.map(function (_, i) { return i; });
      order = shuffle(idxs);
      while (order.length < 5) order = order.concat(shuffle(idxs));
      order = order.slice(0, Math.min(order.length, 6));
    }
    function saveResume() {
      if (a.review) { saveState(p); return; }
      p.resume = { id: l.id, phase: "game", order: order, step: step, errors: errors, t: Date.now() };
      saveState(p);
    }
    saveResume();

    function ask() {
      locked = false;
      var idx = order[step], it = l.items[idx];
      var others = shuffle(pool.filter(function (x) {
        if (itemKey(x) === itemKey(it)) return false;
        if (it.son_tts !== undefined && x.son_tts === it.son_tts) return false; // c, k et q font tous « ke »
        return true;
      })).slice(0, 2);
      var opts = shuffle([it].concat(others));
      var showText = l.type_jeu === "image_vers_mot" ? esc(it.mot) : l.type_jeu === "lecture_phrase" ? esc(it.phrase) : "";
      var html = '<div class="game"><div class="progressbar" role="progressbar" aria-valuemin="0" aria-valuemax="' + order.length + '" aria-valuenow="' + step + '"><span style="width:' + Math.max(4, step / order.length * 100) + '%"></span></div>' +
        '<div class="question">' + mascot("think") + (showText ? '<div class="target">' + showText + "</div>" : "") +
        '<button class="listen focusable" type="button" id="listen" aria-label="Réécouter">🔊</button><p class="hint">' + esc(l.consigne) + "</p></div>" +
        '<div class="choices">';
      opts.forEach(function (o) { html += choiceHTML(o, l.type_jeu); });
      html += '</div></div><div class="footer-feedback" id="fb" aria-live="assertive"></div>';
      app.innerHTML = html;
      var qa = questionAudio(it, l.id, idx);
      document.getElementById("listen").addEventListener("click", function () { play(qa); });
      app.querySelectorAll(".choice").forEach(function (b) {
        b.addEventListener("click", function () {
          if (locked) return;
          var fb = document.getElementById("fb");
          if (b.dataset.key === itemKey(it)) {
            locked = true;
            if (a.review && p.errs[itemKey(it)]) { delete p.errs[itemKey(it)]; }
            b.classList.add("good");
            fb.className = "footer-feedback show good";
            fb.innerHTML = "<strong>Bravo " + esc(p.name) + " !</strong>";
            play([Math.random() < .5 ? "ui/bravo.mp3" : "ui/super.mp3"], function () {
              step++;
              if (step >= order.length) finishGame(); else { saveResume(); ask(); }
            });
          } else {
            errors++;
            p.errs[itemKey(it)] = (p.errs[itemKey(it)] || 0) + 1;
            b.classList.add("bad"); b.disabled = true;
            fb.className = "footer-feedback show bad"; fb.innerHTML = "<strong>Essaie encore !</strong>";
            var nextChoice = app.querySelector(".choice:not([disabled])");
            if (nextChoice && isTV) nextChoice.focus();
            saveResume();
            play(["ui/encore.mp3"].concat(qa));
          }
        });
      });
      if (isTV) focusFirst(".choice");
      var intro = a.review ? ["ui/revision.mp3"] : ["consignes/" + l.id + ".mp3"];
      play(step === 0 ? nameAudio(p).concat(intro).concat(qa) : qa);
    }

    function finishGame() {
      if (a.review) {
        markToday(p); saveState(p); confetti(120);
        app.innerHTML = '<div class="result">' + mascot("happy") + "<h1>Révisions terminées !</h1><p class='hint'>" +
          (Object.keys(p.errs).length ? "Il reste " + Object.keys(p.errs).length + " petite(s) erreur(s) à revoir une autre fois." : "Toutes tes erreurs sont corrigées. Bravo !") +
          '</p><div class="actions column"><button class="btn big wide focusable" type="button" id="menu">Mon chemin</button></div></div>';
        document.getElementById("menu").addEventListener("click", back);
        if (isTV) focusFirst();
        return play(nameAudio(p).concat(["ui/revision-fin.mp3"]));
      }
      var stars = errors === 0 ? 3 : errors <= 2 ? 2 : 1;
      p.stars[l.id] = Math.max(p.stars[l.id] || 0, stars);
      p.resume = null;
      markToday(p);
      saveState(p);
      if (canSpeak) go("speak", { id: l.id, stars: stars, errors: errors }, true);
      else go("result", { id: l.id, stars: stars, errors: errors }, true);
    }
    ask();
  };

  // ---- Parole au micro (téléphone uniquement) ----
  // Règle : on ne dit JAMAIS « faux » à cause du micro. Si la reconnaissance
  // n'est pas sûre : « Je n'ai pas bien entendu », réessayer, ou un adulte valide.
  var LETTER_SAYS = {
    a: ["a", "ah", "as", "ha"], b: ["b", "be", "bee", "bey", "baie", "bai"], c: ["c", "ce", "ces", "ses", "cest", "sait", "sais", "set"],
    d: ["d", "de", "des", "dee"], e: ["e", "euh", "eux", "eu", "oeufs"], f: ["f", "effe", "ef", "eff"], g: ["g", "ge", "jai", "geai", "jet"],
    h: ["h", "hache", "ache", "hash"], i: ["i", "y", "hi", "il", "ie"], j: ["j", "ji", "gi", "jy"], k: ["k", "ka", "ca", "cas", "kah"],
    l: ["l", "elle", "aile", "el", "ell"], m: ["m", "aime", "em", "emme", "hem", "aim"], n: ["n", "haine", "aine", "enne", "en"],
    o: ["o", "oh", "eau", "au", "haut", "aux"], p: ["p", "pe", "pet", "paix", "pai"], q: ["q", "cu", "ku", "qu"],
    r: ["r", "air", "aire", "erre", "ere", "hair"], s: ["s", "esse", "es", "ess"], t: ["t", "te", "the", "tes", "tait"],
    u: ["u", "hu", "hue", "eu"], v: ["v", "ve", "vais", "vet"], w: ["w", "double v", "doublev", "double ve"],
    x: ["x", "ixe", "iks", "ix"], y: ["y", "i grec", "igrec", "grec"], z: ["z", "zed", "zede", "zedd"]
  };
  function plain(t) {
    return String(t).toLowerCase().replace(/ç/g, "s").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function phonWord(w) {
    return w.replace(/ch/g, "§").replace(/eau|au/g, "o").replace(/ph/g, "f").replace(/qu/g, "k")
      .replace(/gu(?=[ei])/g, "g").replace(/g(?=[eiy])/g, "j").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k")
      .replace(/h/g, "").replace(/ou/g, "@").replace(/ai|ei|ay/g, "e").replace(/y/g, "i")
      .replace(/(er|ez|et)$/, "e").replace(/(ent|es|s|t|ts|x|d|ds|p)$/, "").replace(/e$/, "")
      .replace(/(.)\1+/g, "$1");
  }
  function phonTokens(t) { return plain(t).split(" ").filter(Boolean).map(phonWord).filter(Boolean); }
  function matchesItem(it, transcripts) {
    for (var i = 0; i < transcripts.length; i++) {
      var raw = plain(transcripts[i]);
      if (!raw) continue;
      if (it.lettre_minuscule) {
        var says = LETTER_SAYS[it.lettre_minuscule].map(plain), words = raw.split(" ");
        if (says.indexOf(raw) >= 0) return true;
        if (words.length <= 3 && words.some(function (w) { return says.indexOf(w) >= 0; })) return true;
        continue;
      }
      var target = phonTokens(it.syllabe_tts || it.mot || it.phrase), got = phonTokens(raw);
      if (!target.length || !got.length) continue;
      if (target.length === 1) { if (got.indexOf(target[0]) >= 0 || got.join("") === target[0]) return true; continue; }
      var hit = 0, j = 0;
      target.forEach(function (tw) { var k = got.indexOf(tw, j); if (k >= 0) { hit++; j = k + 1; } });
      if (hit === target.length || (target.length >= 4 && hit >= target.length - 1)) return true;
    }
    return false;
  }
  window.__lplMatch = matchesItem; // pour les tests automatiques
  window.__lplIntro = function (t) { return parseIntro(t); };
  function speakPrompt(it) {
    if (it.lettre_minuscule) return "ui/q-lettre-nom.mp3";
    if (it.syllabe_tts) return "ui/q-syllabe.mp3";
    if (it.mot) return "ui/q-mot.mp3";
    return "ui/q-phrase.mp3";
  }
  function speakDisplay(it) {
    if (it.lettre_minuscule) return '<div class="target big">' + esc(it.lettre_majuscule) + " " + esc(it.lettre_minuscule) + "</div>";
    if (it.syllabe_tts) return '<div class="target big">' + esc(it.affiche) + "</div>";
    if (it.mot) return '<div class="target">' + esc(it.mot) + "</div>";
    return '<div class="target phrase">' + esc(it.phrase) + "</div>";
  }

  SCREENS.speak = function (a) {
    var l = findLesson(a.id), p = profile();
    setTop("À toi de parler", true);
    var items = shuffle(l.items).slice(0, Math.min(3, l.items.length));
    var k = 0, rec = null, mediaRec = null, stream = null, timer = null, recordedUrl = null, alive = true;
    var useSR = !!SR && !isApp;

    function cleanup() {
      clearTimeout(timer);
      try { if (rec) { rec.onend = null; rec.onresult = null; rec.onerror = null; rec.abort(); } } catch (e) {}
      try { if (mediaRec && mediaRec.state !== "inactive") { mediaRec.onstop = null; mediaRec.stop(); } } catch (e) {}
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null; rec = null; mediaRec = null;
    }
    leaveHook = function () { alive = false; cleanup(); if (recordedUrl) URL.revokeObjectURL(recordedUrl); };

    function done() { go("result", { id: l.id, stars: a.stars, errors: a.errors }, true); }
    function showItem() {
      if (!alive) return;
      var it = items[k], idx = l.items.indexOf(it);
      app.innerHTML = '<div class="speak"><div class="progressbar"><span style="width:' + Math.max(4, k / items.length * 100) + '%"></span></div>' +
        bubble(p.name + ", à toi de le dire !", "happy") + speakDisplay(it) +
        '<button class="btn secondary focusable" type="button" id="model">🔊 Écouter le modèle</button>' +
        '<button class="mic focusable" type="button" id="mic" aria-label="Appuie et parle"><span class="mic-ico" aria-hidden="true">🎤</span></button>' +
        '<p class="hint" id="mic-hint">Appuie sur le micro, puis parle.</p><div class="speak-actions" id="speak-actions"></div>' +
        '<div class="actions center"><button class="btn ghost focusable" type="button" id="skip">Passer</button></div></div>' +
        '<div class="footer-feedback" id="fb" aria-live="assertive"></div>';
      document.getElementById("model").addEventListener("click", function () { play(itemAudio(it, l.id, idx)); });
      document.getElementById("mic").addEventListener("click", function () { listen(it); });
      document.getElementById("skip").addEventListener("click", nextItem);
      play(nameAudio(p).concat([speakPrompt(it)]).concat(it.lettre_minuscule ? [] : itemAudio(it, l.id, idx)).concat(["ui/a-toi-micro.mp3"]));
    }
    function nextItem() { cleanup(); k++; if (k >= items.length) done(); else showItem(); }
    function success(it) {
      if (!alive) return;
      p.spoke = true; saveState(p);
      var fb = document.getElementById("fb");
      fb.className = "footer-feedback show good"; fb.innerHTML = "<strong>Bien dit, " + esc(p.name) + " !</strong>";
      setMic("idle"); confetti(60);
      var extra = it.lettre_minuscule ? ["ui/q-lettre-son.mp3", "lettres/son-" + it.lettre_minuscule + ".mp3"] : [];
      play(["ui/bien-dit.mp3"].concat(extra), function () { setTimeout(nextItem, 300); });
    }
    function notSure(it, playbackUrl) {
      if (!alive) return;
      var fb = document.getElementById("fb");
      fb.className = "footer-feedback show info"; fb.innerHTML = "<strong>Je n'ai pas bien entendu.</strong>";
      setMic("idle");
      var box = document.getElementById("speak-actions");
      box.innerHTML = (playbackUrl ? '<button class="btn secondary focusable" type="button" id="me">🔁 Écouter ma voix</button>' : "") +
        '<button class="btn secondary focusable" type="button" id="again">↻ Réessayer</button>' +
        '<button class="btn focusable" type="button" id="adult">✓ Un adulte valide</button>';
      if (playbackUrl) document.getElementById("me").addEventListener("click", function () { new Audio(playbackUrl).play().catch(function () {}); });
      document.getElementById("again").addEventListener("click", function () { box.innerHTML = ""; fb.className = "footer-feedback"; listen(it); });
      document.getElementById("adult").addEventListener("click", function () { box.innerHTML = ""; success(it); });
      play(["ui/pas-entendu.mp3"]);
    }
    function setMic(st) {
      var m = document.getElementById("mic"), h = document.getElementById("mic-hint");
      if (!m) return;
      m.classList.toggle("listening", st === "listening");
      if (h) h.textContent = st === "listening" ? (useSR ? "Je t'écoute…" : "Je t'enregistre… appuie pour arrêter.") : "Appuie sur le micro, puis parle.";
    }
    function listen(it) { stopAudio(); if (useSR) listenSR(it); else if (canRecord) listenRecord(it); else notSure(it, null); }
    function listenSR(it) {
      try {
        cleanup();
        rec = new SR();
        rec.lang = "fr-FR"; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 5;
        var got = false;
        rec.onresult = function (e) {
          got = true;
          var alts = [];
          for (var r = 0; r < e.results.length; r++) for (var j = 0; j < e.results[r].length; j++) alts.push(e.results[r][j].transcript);
          if (matchesItem(it, alts)) success(it); else notSure(it, null);
        };
        rec.onerror = function (e) {
          got = true;
          if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            useSR = false;
            if (canRecord) listenRecord(it); else { toast("Le micro n'est pas autorisé. Un adulte peut valider."); notSure(it, null); }
          } else notSure(it, null);
        };
        rec.onend = function () { clearTimeout(timer); if (!got) notSure(it, null); };
        rec.start();
        setMic("listening");
        timer = setTimeout(function () { try { rec && rec.stop(); } catch (e) {} }, 7000);
      } catch (e) { useSR = false; if (canRecord) listenRecord(it); else notSure(it, null); }
    }
    function listenRecord(it) {
      if (mediaRec && mediaRec.state === "recording") { mediaRec.stop(); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        if (!alive) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s;
        var chunks = [];
        mediaRec = new MediaRecorder(s);
        mediaRec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mediaRec.onstop = function () {
          clearTimeout(timer);
          if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
          stream = null;
          var blob = new Blob(chunks, { type: (mediaRec && mediaRec.mimeType) || "audio/webm" });
          if (recordedUrl) URL.revokeObjectURL(recordedUrl);
          recordedUrl = URL.createObjectURL(blob);
          setMic("idle");
          var fb = document.getElementById("fb");
          if (fb) { fb.className = "footer-feedback show info"; fb.innerHTML = "<strong>Écoute ta voix !</strong>"; }
          var au = new Audio(recordedUrl);
          au.onended = function () { askAdult(it, recordedUrl); };
          au.play().catch(function () { askAdult(it, recordedUrl); });
        };
        mediaRec.start();
        setMic("listening");
        timer = setTimeout(function () { if (mediaRec && mediaRec.state === "recording") mediaRec.stop(); }, 4000);
      }).catch(function () { toast("Le micro n'est pas autorisé. Un adulte peut valider."); notSure(it, null); });
    }
    function askAdult(it, url) {
      var box = document.getElementById("speak-actions");
      if (!box || !alive) return;
      box.innerHTML = '<button class="btn secondary focusable" type="button" id="me">🔁 Écouter ma voix</button>' +
        '<button class="btn secondary focusable" type="button" id="again">↻ Recommencer</button>' +
        '<button class="btn focusable" type="button" id="adult">✓ C\'est bien dit</button>';
      document.getElementById("me").addEventListener("click", function () { new Audio(url).play().catch(function () {}); });
      document.getElementById("again").addEventListener("click", function () { box.innerHTML = ""; listen(it); });
      document.getElementById("adult").addEventListener("click", function () { box.innerHTML = ""; success(it); });
    }

    app.innerHTML = '<div class="speak intro">' + bubble("Maintenant, à toi de parler !", "happy") +
      '<button class="btn big wide focusable" type="button" id="go-speak">🎤 C\'est parti</button>' +
      '<div class="actions center"><button class="btn ghost focusable" type="button" id="skip-all">Plus tard</button></div></div>';
    document.getElementById("go-speak").addEventListener("click", showItem);
    document.getElementById("skip-all").addEventListener("click", done);
    play(nameAudio(p).concat(["ui/parlons.mp3"]));
  };

  // ---- Résultat : étoiles, confettis, trophées, leçon suivante ----
  SCREENS.result = function (a) {
    var l = findLesson(a.id), p = profile();
    setTop(l.titre, true);
    var fresh = checkTrophies(p);
    if (fresh.length) saveState(p);
    var next = nextLesson(l.id), nextL = next && findLesson(next);
    var html = '<div class="result">' + mascot("happy") + "<h1>Super " + esc(p.name) + " !</h1>" +
      '<div class="big-stars" aria-label="' + a.stars + ' étoiles sur 3">' +
      [0, 1, 2].map(function (i) { return '<span class="bstar' + (i < a.stars ? " on" : "") + '" style="animation-delay:' + (i * .25) + 's">★</span>'; }).join("") + "</div>" +
      "<p class='hint'>" + (a.errors === 0 ? "Aucune erreur, parfait !" : "Tu as réussi « " + esc(l.titre) + " ». Continue comme ça !") + "</p>";
    fresh.forEach(function (t) {
      html += '<div class="trophy-won"><span class="trophy-ico" aria-hidden="true">' + t.ico + '</span><div><strong>Nouveau trophée : ' + esc(t.titre) + "</strong><span>" + esc(t.desc) + "</span></div></div>";
    });
    html += '<div class="actions column">' + (next ? '<button class="btn big wide focusable" type="button" id="next">Leçon suivante<span class="btn-sub">' + esc(nextL.titre) + "</span></button>" : "") +
      '<button class="btn secondary wide focusable" type="button" id="again">Rejouer</button>' +
      '<button class="btn secondary wide focusable" type="button" id="menu">Mon chemin</button></div></div>';
    app.innerHTML = html;
    if (next) document.getElementById("next").addEventListener("click", function () { go("discover", { id: next }, true); });
    document.getElementById("again").addEventListener("click", function () { go("game", { id: l.id }, true); });
    document.getElementById("menu").addEventListener("click", back);
    confetti(fresh.length ? 200 : 140);
    var voice = ["ui/super-prenom.mp3"].concat(nameAudio(p)).concat(["ui/fin.mp3", "ui/etoile.mp3"]);
    if (fresh.length) voice.push("ui/trophee.mp3");
    if (timeUp(p)) {
      voice.push("ui/pause.mp3");
      var nb = document.getElementById("next"); if (nb) nb.outerHTML = '<div class="time-left">⏱ Temps de jeu terminé pour aujourd\'hui. À demain !</div>';
    } else if (next) voice.push("ui/prochaine.mp3");
    play(voice);
  };

  // ---- Cadeaux choisis par les parents ----
  SCREENS.gifts = function () {
    var p = profile();
    setTop("Mes cadeaux", true);
    var left = starsLeft(p);
    var html = bubble("Tu as " + left + " étoile" + (left > 1 ? "s" : "") + " à dépenser !", "happy") + '<div class="gifts">';
    p.rewards.forEach(function (r) {
      var ok = left >= r.cout;
      html += '<button class="gift focusable' + (ok ? " ready" : "") + '" type="button" data-id="' + esc(r.id) + '"' + (ok ? "" : ' aria-disabled="true"') + '>' +
        '<span class="gift-ico" aria-hidden="true">' + esc(r.ico || "🎁") + '</span><strong>' + esc(r.titre) + '</strong>' +
        '<span class="gift-cost"><span class="star-ico" aria-hidden="true">★</span> ' + r.cout + "</span>" +
        '<span class="gift-bar"><span style="width:' + Math.min(100, left / r.cout * 100) + '%"></span></span></button>';
    });
    html += "</div>";
    if (p.claimed.length) {
      html += "<h2>Déjà gagnés</h2><ul class='claimed'>";
      p.claimed.slice(-8).reverse().forEach(function (c) { html += "<li>" + esc(c.ico || "🎁") + " " + esc(c.titre) + "</li>"; });
      html += "</ul>";
    }
    if (!p.rewards.length) html += "<p class='hint'>Demande à papa ou maman d'ajouter des cadeaux dans l'Espace parents.</p>";
    app.innerHTML = html;
    app.querySelectorAll(".gift").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = p.rewards.filter(function (x) { return x.id === b.dataset.id; })[0];
        if (!r) return;
        if (starsLeft(p) < r.cout) { toast("Encore " + (r.cout - starsLeft(p)) + " étoile(s) à gagner !"); return; }
        if (!confirmTwice(b, "Touche encore pour le prendre")) return;
        p.claimed.push({ id: r.id, titre: r.titre, ico: r.ico, cout: r.cout, t: Date.now() });
        saveState(p); confetti(200);
        render(); play(nameAudio(p).concat(["ui/cadeau.mp3"]));
      });
    });
    play("ui/cadeaux.mp3");
  };

  SCREENS.pause = function () {
    var p = profile();
    setTop("C'est la pause", true);
    app.innerHTML = '<div class="result">' + mascot("happy") + "<h1>Bravo " + esc(p.name) + " !</h1><p class='hint'>Tu as bien travaillé aujourd'hui. On se retrouve demain pour la suite !</p>" +
      '<div class="actions column"><button class="btn secondary wide focusable" type="button" id="gifts2">🎁 Voir mes cadeaux</button><button class="btn secondary wide focusable" type="button" id="menu">Mon chemin</button></div></div>';
    document.getElementById("gifts2").addEventListener("click", function () { go("gifts", {}, true); });
    document.getElementById("menu").addEventListener("click", back);
    play(nameAudio(p).concat(["ui/pause.mp3"]));
  };

  // ---- Espace parents ----
  SCREENS.parentsGate = function () {
    setTop("Espace parents", true);
    var x = 3 + Math.floor(Math.random() * 6), y = 4 + Math.floor(Math.random() * 5);
    var answers = shuffle([x + y, x + y + 2, x + y - 1]);
    var html = "<h1>Espace parents</h1><p class='hint'>Pour entrer, combien font " + x + " + " + y + " ?</p><div class='choices'>";
    answers.forEach(function (n) { html += '<button class="choice focusable" type="button" data-n="' + n + '">' + n + "</button>"; });
    app.innerHTML = html + "</div>";
    app.querySelectorAll(".choice").forEach(function (b) {
      b.addEventListener("click", function () {
        if (+b.dataset.n === x + y) go("parents", {}, true); else { toast("Ce n'est pas la bonne réponse."); back(); }
      });
    });
  };

  SCREENS.parents = function () {
    setTop("Espace parents", true);
    var html = "<h1>Espace parents</h1><section class='card-panel'><h2>Continuer sur un autre appareil</h2>";
    if (state.code) {
      html += "<p>Code famille :</p><p class='family-code'>" + fmtCode(state.code) + "</p>" +
        "<p class='hint'>Sur la TV ou un autre téléphone : Espace parents → « J'ai déjà un code ». Les étoiles, les trophées et la leçon en cours suivent votre enfant d'un appareil à l'autre.</p>" +
        '<div class="actions"><button class="btn secondary focusable" type="button" id="sync-now">Synchroniser maintenant</button><button class="btn ghost focusable" type="button" id="unlink">Délier cet appareil</button></div>';
    } else {
      html += "<p class='hint'>Créez un code famille sur un premier appareil, puis entrez-le sur les autres. Seuls le prénom, l'âge, l'animal et les progrès sont enregistrés.</p>" +
        '<div class="actions"><button class="btn focusable" type="button" id="create-code">Créer un code famille</button></div>' +
        '<form class="form" id="join" autocomplete="off"><label for="code-in">J\'ai déjà un code</label>' +
        '<input id="code-in" class="focusable" type="text" inputmode="numeric" pattern="[0-9 ]*" maxlength="14" placeholder="0000 0000 0000">' +
        '<button class="btn secondary focusable" type="submit">Relier cet appareil</button></form>';
    }
    html += "</section>";
    var list = liveProfiles();
    html += "<h2>Suivi des enfants</h2>";
    if (!list.length) html += "<p class='hint'>Aucun profil pour le moment.</p>";
    list.forEach(function (pp) {
      var cur = pp.resume && findLesson(pp.resume.id);
      html += '<section class="card-panel"><h3>' + pp.avatar + " " + esc(pp.name) + (pp.age ? " · " + pp.age + " ans" : "") + "</h3>" +
        "<p class='hint'>★ " + totalStars(pp) + " étoiles · 🏆 " + Object.keys(pp.trophies).length + " trophées · 🔥 " + streak(pp) + " jour(s) de suite · ⏱ " + Math.round(usedToday(pp) / 60) + " min aujourd'hui" + (cur ? " · Leçon en cours : " + esc(cur.titre) : "") + "</p>" +
        '<span class="label">Temps de jeu par jour</span><div class="ages" role="group" aria-label="Temps de jeu par jour">' +
        LIMITS.map(function (m) { return '<button type="button" class="pick focusable" data-limit="' + m + '" data-pid="' + esc(pp.id) + '" aria-pressed="' + (pp.limit === m) + '">' + (m ? m + " min" : "Illimité") + "</button>"; }).join("") + "</div>" +
        (timeUp(pp) ? '<div class="actions"><button class="btn secondary focusable" type="button" data-extra="' + esc(pp.id) + '">+10 minutes aujourd\'hui</button></div>' : "") +
        '<span class="label">Cadeaux (coût en étoiles)</span><ul class="reward-list">' +
        pp.rewards.map(function (r) { return "<li><span>" + esc(r.ico || "🎁") + " " + esc(r.titre) + " · ★ " + r.cout + '</span><button class="btn ghost focusable" type="button" data-delrw="' + esc(r.id) + '" data-pid="' + esc(pp.id) + '">Retirer</button></li>'; }).join("") +
        '</ul><form class="form reward-form" data-pid="' + esc(pp.id) + '" autocomplete="off"><input type="text" class="focusable" maxlength="50" placeholder="Nouveau cadeau, ex. : choisir le film" aria-label="Nouveau cadeau">' +
        '<div class="ages">' + [5, 10, 20, 30].map(function (c, i) { return '<button type="button" class="pick focusable rw-cost" data-cost="' + c + '" aria-pressed="' + (i === 1) + '">★ ' + c + "</button>"; }).join("") +
        '</div><button class="btn secondary focusable" type="submit">Ajouter le cadeau</button></form>' +
        '<div class="table-wrap"><table class="parent-table"><thead><tr><th>Leçon</th><th>Étoiles</th></tr></thead><tbody>';
      allLessons.forEach(function (id) { html += "<tr><td>" + id + " · " + esc(findLesson(id).titre) + "</td><td>" + starsText(pp.stars[id] || 0, 3) + "</td></tr>"; });
      html += '</tbody></table></div><div class="actions"><button class="btn secondary focusable" type="button" data-reset="' + esc(pp.id) + '">Remettre à zéro</button><button class="btn danger focusable" type="button" data-del="' + esc(pp.id) + '">Supprimer le profil</button></div></section>';
    });
    html += "<h2>À savoir</h2><p class='hint'>Aucune publicité, aucun achat. Le micro sert uniquement pendant l'exercice de parole ; la voix n'est jamais envoyée ni conservée.</p>";
    app.innerHTML = html;

    var cc = document.getElementById("create-code");
    if (cc) cc.addEventListener("click", function () {
      var arr = new Uint32Array(12), c = "";
      window.crypto.getRandomValues(arr);
      for (var i = 0; i < 12; i++) c += String(arr[i] % 10);
      if (c[0] === "0") c = "7" + c.slice(1);
      state.code = c; persist();
      syncNow(true).then(function () { toast(syncStatus === "ok" ? "Code créé et enregistré." : "Code créé. Il sera envoyé dès que possible."); render(); });
      render();
    });
    var jf = document.getElementById("join");
    if (jf) jf.addEventListener("submit", function (e) {
      e.preventDefault();
      var c = document.getElementById("code-in").value.replace(/\D/g, "");
      if (c.length !== 12) { toast("Le code contient 12 chiffres."); return; }
      lire(c).then(function (remote) {
        if (!remote) { toast("Code introuvable. Vérifiez les chiffres."); return; }
        state.code = c; merge(remote); persist(); toast("Appareil relié !"); syncNow(); render();
      }).catch(function () { toast("Pas de connexion. Réessayez."); });
    });
    var sn = document.getElementById("sync-now");
    if (sn) sn.addEventListener("click", function () { syncNow().then(function () { toast(syncStatus === "ok" ? "Synchronisé." : "Pas de connexion."); render(); }); });
    var ul = document.getElementById("unlink");
    if (ul) ul.addEventListener("click", function () {
      if (!confirmTwice(ul, "Confirmer : délier")) return;
      state.code = null; persist(); toast("Appareil délié."); render();
    });
    function pById(id) { return state.profiles.filter(function (x) { return x.id === id; })[0]; }
    app.querySelectorAll("[data-limit]").forEach(function (b) {
      b.addEventListener("click", function () { var pp = pById(b.dataset.pid); pp.limit = +b.dataset.limit; saveState(pp); render(); });
    });
    app.querySelectorAll("[data-extra]").forEach(function (b) {
      b.addEventListener("click", function () { var pp = pById(b.dataset.extra); pp.usage[today()] = Math.max(0, usedToday(pp) - 600); saveState(pp); toast("10 minutes ajoutées."); render(); });
    });
    app.querySelectorAll("[data-delrw]").forEach(function (b) {
      b.addEventListener("click", function () { var pp = pById(b.dataset.pid); pp.rewards = pp.rewards.filter(function (r) { return r.id !== b.dataset.delrw; }); saveState(pp); render(); });
    });
    app.querySelectorAll(".reward-form").forEach(function (f) {
      f.querySelectorAll(".rw-cost").forEach(function (b) { b.addEventListener("click", function () { f.querySelectorAll(".rw-cost").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); }); });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var t = f.querySelector("input").value.trim().slice(0, 50);
        if (!t) { toast("Écrivez le cadeau."); return; }
        var c = +(f.querySelector('.rw-cost[aria-pressed="true"]') || {}).dataset.cost || 10;
        var pp = pById(f.dataset.pid);
        pp.rewards.push({ id: "r" + Date.now().toString(36), titre: t, ico: "🎁", cout: c }); saveState(pp); toast("Cadeau ajouté."); render();
      });
    });
    app.querySelectorAll("[data-reset]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirmTwice(b, "Confirmer la remise à zéro")) return;
        state.profiles.forEach(function (pp) { if (pp.id === b.dataset.reset) { pp.stars = {}; pp.trophies = {}; pp.resume = null; pp.reset = Date.now(); saveState(pp); } });
        toast("Progrès remis à zéro."); render();
      });
    });
    app.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirmTwice(b, "Confirmer la suppression")) return;
        state.profiles.forEach(function (pp) { if (pp.id === b.dataset.del) { pp.deleted = true; pp.stars = {}; pp.trophies = {}; pp.resume = null; saveState(pp); } });
        if (state.current === b.dataset.del) state.current = null;
        persist(); toast("Profil supprimé."); render();
      });
    });
  };
  function fmtCode(c) { return c.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3"); }
  function confirmTwice(btn, label) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = "1"; btn.textContent = label;
    setTimeout(function () { if (btn.isConnected) delete btn.dataset.armed; }, 4000);
    return false;
  }

  // ================= Synchronisation =================
  var syncStatus = "idle", syncTimer = null, syncing = null;
  function rpc(fn, body) {
    return fetch(SYNC_URL + fn, {
      method: "POST", headers: { "apikey": SYNC_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function lire(code) { return rpc("lpl_lire", { p_code: code }); }
  function ecrire(code, data) { return rpc("lpl_ecrire", { p_code: code, p_data: data }); }

  // Fusion : meilleur score par leçon, trophées et jours cumulés, infos les plus récentes.
  function merge(remote) {
    if (!remote || !Array.isArray(remote.profiles)) return;
    remote.profiles.forEach(function (r) {
      if (!r || !r.id) return;
      normProfile(r);
      var l = null;
      for (var i = 0; i < state.profiles.length; i++) if (state.profiles[i].id === r.id) l = state.profiles[i];
      if (!l) { state.profiles.push(r); return; }
      var newer = r.updated > l.updated ? r : l;
      var lastReset = Math.max(l.reset || 0, r.reset || 0);
      var srcs = [l, r].filter(function (s) { return !lastReset || s.updated >= lastReset; });
      var stars = {}, trophies = {}, days = {};
      srcs.forEach(function (s) {
        for (var k in s.stars) stars[k] = Math.max(stars[k] || 0, s.stars[k]);
        for (var t in s.trophies) trophies[t] = trophies[t] || s.trophies[t];
      });
      [l, r].forEach(function (s) { s.days.forEach(function (d) { days[d] = 1; }); });
      l.name = newer.name; l.age = newer.age; l.avatar = newer.avatar;
      l.limit = newer.limit; l.rewards = newer.rewards; l.errs = newer.errs || {};
      var claimed = {}; [l, r].forEach(function (s) { s.claimed.forEach(function (c) { claimed[c.id + "@" + c.t] = c; }); });
      l.claimed = Object.keys(claimed).map(function (k) { return claimed[k]; }).sort(function (x, y) { return x.t - y.t; });
      var usage = {}; [l, r].forEach(function (s) { for (var d in s.usage) usage[d] = Math.max(usage[d] || 0, s.usage[d]); });
      l.usage = usage;
      l.deleted = !!(l.deleted || r.deleted);
      l.spoke = !!(l.spoke || r.spoke);
      l.resume = newer.resume || null;
      if (l.resume && stars[l.resume.id] && srcs.some(function (s) { return s.stars[l.resume.id] && s.updated > (l.resume.t || 0); })) l.resume = null;
      if (lastReset) l.reset = lastReset;
      l.stars = l.deleted ? {} : stars;
      l.trophies = l.deleted ? {} : trophies;
      l.days = Object.keys(days).sort().slice(-60);
      l.updated = Math.max(l.updated, r.updated);
    });
  }
  function syncNow(pushOnly) {
    if (!state.code) return Promise.resolve();
    if (syncing) return syncing;
    syncStatus = "busy"; refreshChip();
    var code = state.code;
    syncing = (pushOnly ? Promise.resolve(null) : lire(code)).then(function (remote) {
      if (remote) merge(remote);
      persist();
      return ecrire(code, { v: 1, profiles: state.profiles });
    }).then(function () { syncStatus = "ok"; }).catch(function () { syncStatus = "err"; })
      .then(function () { syncing = null; refreshChip(); });
    return syncing;
  }
  function scheduleSync() {
    if (!state.code) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncNow(); }, 1200);
  }
  function refreshChip() {
    var c = starsEl.querySelector(".sync");
    if (c) c.outerHTML = syncChip(); else if (state.code) starsEl.insertAdjacentHTML("beforeend", syncChip());
  }
  function pullAndRefresh() {
    if (!state.code) return;
    var top = stack[stack.length - 1];
    syncNow().then(function () {
      if (top && (top.screen === "home" || top.screen === "profiles") && stack[stack.length - 1] === top) render();
    });
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") pullAndRefresh(); });
  setInterval(function () { if (document.visibilityState === "visible" && state.code) syncNow(); }, 60000);

  // ================= Télécommande (TV) : navigation spatiale =================
  function focusables() {
    return Array.prototype.filter.call(document.querySelectorAll("button:not([disabled]):not([hidden]), input, a.focusable"), function (el) {
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest("[hidden]");
    });
  }
  function focusFirst(sel) {
    setTimeout(function () {
      var el = (sel && app.querySelector(sel)) || app.querySelector("#continue, #go-speak, #next, .btn.big, .profile, .card, .choice, button") || btnBack;
      if (el) el.focus({ preventScroll: false });
    }, 40);
  }
  function moveFocus(dir) {
    var list = focusables(), cur = document.activeElement;
    if (list.indexOf(cur) < 0) { if (list[0]) list[0].focus(); return; }
    var a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    var best = null, bestScore = Infinity;
    list.forEach(function (el) {
      if (el === cur) return;
      var b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      var dx = bx - ax, dy = by - ay, main, cross;
      if (dir === "ArrowRight") { if (dx <= 4) return; main = dx; cross = Math.abs(dy); }
      else if (dir === "ArrowLeft") { if (dx >= -4) return; main = -dx; cross = Math.abs(dy); }
      else if (dir === "ArrowDown") { if (dy <= 4) return; main = dy; cross = Math.abs(dx); }
      else { if (dy >= -4) return; main = -dy; cross = Math.abs(dx); }
      var score = main + cross * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) { best.focus(); best.scrollIntoView({ block: "center", inline: "nearest", behavior: reducedMotion ? "auto" : "smooth" }); }
  }
  document.addEventListener("keydown", function (e) {
    var k = e.key, typing = document.activeElement && document.activeElement.tagName === "INPUT";
    if (/^Arrow/.test(k)) {
      if (typing && (k === "ArrowLeft" || k === "ArrowRight")) return;
      e.preventDefault(); moveFocus(k);
    } else if (k === "Escape" || k === "GoBack" || k === "BrowserBack" || (k === "Backspace" && !typing)) {
      if (back()) e.preventDefault();
    }
  });

  // ================= Démarrage =================
  function start() {
    fetch("../contenu/cours.json").then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (data) {
      cours = data;
      cours.modules.forEach(function (m) { m.lecons.forEach(function (l) {
        lessonIndex[l.id] = l; allLessons.push(l.id);
        l.items.forEach(function (it, i) { it._lid = l.id; it._idx = i; });
      }); });
      stack = [{ screen: "profiles", args: {} }];
      if (profile()) stack.push({ screen: "home", args: {} });
      render();
      pullAndRefresh();
    }).catch(function () {
      app.innerHTML = bubble("Oups ! Les leçons n'ont pas pu être chargées.", "think") + "<div class='actions center'><button class='btn focusable' type='button' id='reload'>Réessayer</button></div>";
      document.getElementById("reload").addEventListener("click", function () { location.reload(); });
    });
  }
  if ("serviceWorker" in navigator && location.protocol === "https:" && location.hostname !== "appassets.androidplatform.net") {
    navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(function () {});
  }
  start();
})();
