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

  // Micro : reconnaissance vocale intégrée (Whisper sur l'appareil), identique sur tous les supports
  var hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.WebAssembly && (window.AudioContext || window.webkitAudioContext));
  var canSpeak = false;   // exercice au micro retiré à la demande des parents
  var voiceMod = null;
  function voice() { return voiceMod || (voiceMod = import("./voice.js" + (typeof Q === "string" ? Q : ""))); }

  var app = document.getElementById("app");
  var btnBack = document.getElementById("btn-back");
  var titleEl = document.getElementById("topbar-title");
  var starsEl = document.getElementById("topbar-stars");
  var toastEl = document.getElementById("toast");

  var AVATARS = ["🦊", "🐼", "🐯", "🐰", "🦁", "🐸", "🐧", "🦄", "🐶", "🐱", "🐵", "🐻"];
  var AGES = [3, 4, 5, 6, 7, 8];
  var AUDIO_BASE = "../audio/";
  // Version de l'application (ajoutée automatiquement aux fichiers) : évite toute ancienne copie en cache
  var APP_VER = (function () { try { return new URL(document.currentScript.src).searchParams.get("v") || "dev"; } catch (e) { return "dev"; } })();
  var Q = "?v=" + APP_VER;

  // ================= Synchronisation (Supabase) =================
  var SYNC_URL = "https://vfxblubjsxwseacmslnu.supabase.co/rest/v1/rpc/";
  var SYNC_KEY = "sb_publishable_HojETqgwpBMQ_cjDzMNaAg_WGCFMaED";

  // Cadeaux proposés par défaut (modifiables dans l'Espace parents)
  var DEFAULT_REWARDS = [
    { id: "chanson", ico: "🎵", titre: "La chanson de l'alphabet", cout: 2, action: "chanson" },
    { id: "calin", ico: "🤗", titre: "Un gros câlin", cout: 3 },
    { id: "livre", ico: "📖", titre: "Une histoire racontée", cout: 4, action: "livre" },
    { id: "minutes5", ico: "⏱️", titre: "5 minutes de jeu en plus", cout: 4, action: "temps" },
    { id: "bisou", ico: "😘", titre: "Un gros bisou", cout: 3 },
    { id: "autocollant", ico: "⭐", titre: "Un autocollant", cout: 5 },
    { id: "histoire", ico: "📚", titre: "Choisir l'histoire du soir", cout: 6 },
    { id: "dessin-anime", ico: "📺", titre: "Choisir le dessin animé", cout: 9 },
    { id: "jeu", ico: "🎲", titre: "Un jeu de société avec papa ou maman", cout: 12 },
    { id: "glace", ico: "🍦", titre: "Manger une glace", cout: 15 },
    { id: "dessert", ico: "🍰", titre: "Choisir le dessert", cout: 18 },
    { id: "cuisine", ico: "🧁", titre: "Faire un gâteau ensemble", cout: 24 },
    { id: "parc", ico: "🛝", titre: "Une sortie au parc", cout: 30 },
    { id: "cinema", ico: "🎬", titre: "Une soirée cinéma à la maison", cout: 40 }
  ];
  var LIMITS = [0, 10, 20, 30, 45];

  // ================= Stockage local =================
  var STORE_KEY = "lpl.v1";
  var memoryStore = null;
  function normProfile(p) {
    p.stars = p.stars || {}; p.trophies = p.trophies || {}; p.days = Array.isArray(p.days) ? p.days : [];
    p.errs = p.errs || {}; p.bonus = p.bonus || {}; p.usage = p.usage || {}; p.claimed = Array.isArray(p.claimed) ? p.claimed : [];
    if (!Array.isArray(p.rewards)) p.rewards = DEFAULT_REWARDS.map(function (r) { return { id: r.id, titre: r.titre, ico: r.ico, cout: r.cout }; });
    if (typeof p.limit !== "number") p.limit = 20;
    if (typeof p.gameLimit !== "number") p.gameLimit = 10;   // temps des jeux, séparé du temps des leçons
    p.gameUsage = p.gameUsage || {};
    p.rewards.forEach(function (r) { DEFAULT_REWARDS.forEach(function (d) { if (d.id === r.id && d.action) r.action = d.action; }); });
    if (!p.rewardsV3) {   // ajoute les nouveaux cadeaux proposés sans toucher à ceux des parents
      var have = {}; p.rewards.forEach(function (r) { have[r.id] = 1; });
      DEFAULT_REWARDS.forEach(function (r) { if (!have[r.id]) p.rewards.push({ id: r.id, titre: r.titre, ico: r.ico, cout: r.cout, action: r.action }); });
      p.rewards.sort(function (x, y) { return x.cout - y.cout; });
      p.rewardsV3 = true;
    }
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
      player.src = AUDIO_BASE + "ui/ecoute.mp3" + Q;
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
      u.lang = "fr-FR"; u.rate = 1.0;
      var voices = speechSynthesis.getVoices().filter(function (v) { return /^fr(-|_)FR/i.test(v.lang); });
      if (voices.length) u.voice = voices[0];
      u.onend = end; u.onerror = end;
      speechSynthesis.speak(u);
      setTimeout(end, 2500);
    } catch (e) { end(); }
  }
  // Vitesse de la voix (un peu plus rapide, même hauteur de voix)
  var VOICE_RATE = 1.12;
  // Pendant une explication, l'enfant ne peut pas toucher les cartes : une barre défile.
  var LOCK_SCREENS = { discover: 1, game: 1, speak: 1 };
  var busy = false, busyTotal = 0, busyDone = 0, busyTimer = null, rafId = 0;
  var voiceBar = document.getElementById("voice-bar"), voiceFill = document.getElementById("voice-fill");
  function setBusy(on, total) {
    var top = stack[stack.length - 1];
    on = on && top && LOCK_SCREENS[top.screen];
    busy = !!on;
    document.body.classList.toggle("voice-busy", busy);
    if (voiceBar) voiceBar.hidden = !busy;
    clearTimeout(busyTimer);
    if (busy) {
      busyTotal = total || 1; busyDone = 0;
      busyTimer = setTimeout(function () { setBusy(false); }, 20000); // sécurité
      cancelAnimationFrame(rafId);
      (function tick() {
        if (!busy) return;
        var frac = player.duration ? Math.min(1, player.currentTime / player.duration) : 0;
        if (voiceFill) voiceFill.style.width = Math.min(100, (busyDone + frac) / busyTotal * 100) + "%";
        rafId = requestAnimationFrame(tick);
      })();
    }
  }
  document.addEventListener("click", function (e) {
    if (busy && app.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  function play(paths, onEnd) {
    stopAudio();
    queue = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
    setBusy(queue.length > 0, queue.length);
    playNext(function () { setBusy(false); if (onEnd) onEnd(); });
  }
  function playNext(onEnd) {
    if (!queue.length) { if (onEnd) onEnd(); return; }
    var p = queue.shift();
    if (p.indexOf("tts:") === 0) { speakTTS(p.slice(4), function () { playNext(onEnd); }); return; }
    player.onended = function () { busyDone++; setTimeout(function () { playNext(onEnd); }, 140); };
    player.onerror = function () { playNext(onEnd); };
    player.muted = false;
    player.src = AUDIO_BASE + p + Q;
    player.preservesPitch = true; player.webkitPreservesPitch = true;
    player.playbackRate = VOICE_RATE; player.defaultPlaybackRate = VOICE_RATE;
    var pr = player.play();
    if (pr && pr.catch) pr.catch(function () { playNext(onEnd); });
  }
  function stopAudio() {
    queue = []; player.onended = null; player.onerror = null;
    if (typeof setBusy === "function" && busy) setBusy(false);
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
  function totalStars(p) { var t = 0; for (var k in p.stars) t += p.stars[k]; for (var b in (p.bonus || {})) t += p.bonus[b]; return t; }
  // Barème des révisions et des jeux : 0 faute = 3 étoiles · 1 faute = 2 · 2 ou 3 fautes = 1 · plus = 0
  function bonusFor(errors) { return errors === 0 ? 3 : errors === 1 ? 2 : errors <= 3 ? 1 : 0; }
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
  var PLAY_SCREENS = { discover: 1, game: 1, speak: 1, memory: 1, snake: 1, fish: 1 };
  function usedToday(p) { return (p.usage[today()] || 0); }
  function timeLeft(p) { return p.limit ? Math.max(0, p.limit * 60 - usedToday(p)) : Infinity; }
  // Une phrase « répétitive » (pause, presque fini…) n'est dite qu'une fois par jour et par enfant
  function onceToday(p, what) {
    var k = "lpl.dit." + p.id + "." + what, d = today();
    try { if (localStorage.getItem(k) === d) return false; localStorage.setItem(k, d); return true; }
    catch (e) { if (window[k] === d) return false; window[k] = d; return true; }
  }
  function timeUp(p) { return p.limit > 0 && timeLeft(p) <= 0; }
  function gameUsed(p) { return (p.gameUsage[today()] || 0); }
  function gameLeft(p) { return p.gameLimit ? Math.max(0, p.gameLimit * 60 - gameUsed(p)) : Infinity; }
  function gameTimeUp(p) { return p.gameLimit > 0 && gameLeft(p) <= 0; }
  setInterval(function () {
    var top = stack[stack.length - 1], p = profile();
    if (!p || !top || !PLAY_SCREENS[top.screen] || document.visibilityState !== "visible") return;
    var t = today(), bucket = top.args && top.args.arcade ? p.gameUsage : p.usage;   // jeux et leçons comptés à part
    bucket[t] = (bucket[t] || 0) + 10;
    if (bucket === p.gameUsage && gameTimeUp(p) && !window.__lplGameEnd) { window.__lplGameEnd = 1; toast("Le temps des jeux est fini pour aujourd'hui !"); setTimeout(function () { window.__lplGameEnd = 0; resetTo("home"); }, 1500); }
    var keys = Object.keys(bucket).sort(); while (keys.length > 14) delete bucket[keys.shift()];
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
    if (it.lettre_minuscule) return ["lettres/phrase-" + it.lettre_minuscule + (it.exemple_bis ? "-2" : "") + ".mp3"];   // « La lettre A fait le son a, comme dans avion. »
    if (it.syllabe_tts) return ["syllabes/" + it.syllabe_tts + ".mp3"];
    if (it.mot) return ["mots/" + it.mot + ".mp3"];
    return ["phrases/" + (it._lid || lessonId) + "-" + ((it._idx !== undefined ? it._idx : idx) + 1) + ".mp3"];
  }
  function questionAudio(it, lessonId, idx) {
    if (it.lettre_minuscule) return ["lettres/question-" + it.lettre_minuscule + (it.exemple_bis ? "-2" : "") + ".mp3"];  // « Écoute le son : a, comme dans avion. »
    return itemAudio(it, lessonId, idx);
  }
  // Mauvaise réponse : « Oups ! Tu t'es trompé. Tu as touché… la lettre H. Ce n'est pas le bon son. Réécoute bien : … »
  function wrongVoice(it, again) {
    var said = it && it.lettre_minuscule ? ["lettres/nom-" + it.lettre_minuscule + ".mp3"] : it && it.syllabe_tts ? ["syllabes/" + it.syllabe_tts + ".mp3"] : it && it.mot ? ["mots/" + it.mot + ".mp3"] : null;
    return said ? ["ui/touche.mp3"].concat(said, ["ui/pas-bon.mp3"], again) : ["ui/encore.mp3"].concat(again);
  }
  function itemKey(it) { return it.lettre_minuscule || it.syllabe_tts || it.mot || it.phrase; }
  function nextLessonFor(p) {
    // « Jouer » mène toujours à la leçon la plus avancée pas encore réussie (jamais à une leçon déjà faite)
    for (var i = 0; i < allLessons.length; i++) if (!(p.stars[allLessons[i]] > 0)) return allLessons[i];
    return allLessons[allLessons.length - 1];
  }
  function isUnlocked(p, id) {
    var i = allLessons.indexOf(id);
    if (i <= 0) return true;
    if (p.stars[id] || (p.resume && p.resume.id === id)) return true;
    if ((p.stars[allLessons[i - 1]] || 0) >= 1) return true;
    // Première leçon d'une étape : ouverte dès que l'étape d'avant est finie ou que son coffre est ouvert
    var m = moduleOf(id), mi = cours.modules.indexOf(m);
    if (m && m.lecons[0].id === id && mi > 0) { var prev = cours.modules[mi - 1]; return moduleDone(p, prev.id) || !!(p.bonus && p.bonus["coffre-" + prev.id]); }
    return false;
  }
  function nextLesson(id) {
    var i = allLessons.indexOf(id);
    return i >= 0 && i < allLessons.length - 1 ? allLessons[i + 1] : null;
  }
  function lessonIcon(l) {
    return l.icone || { son_vers_lettre: "🔤", assemblage_syllabe: "🧩", image_vers_mot: "📖", lecture_phrase: "💬" }[l.type_jeu] || "⭐";
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
  // Barème : 0 faute = 3 étoiles · 1 ou 2 fautes = 2 étoiles · 3 ou 4 fautes = 1 étoile · 5 fautes ou plus = 0 (on recommence).
  // Une leçon est réussie (et ouvre la suivante) dès 1 étoile.
  function starsFor(errors) { return errors === 0 ? 3 : errors <= 2 ? 2 : errors <= 4 ? 1 : 0; }
  function doneCount(p) { return Object.keys(p.stars).filter(function (k) { return p.stars[k] > 0; }).length; }
  function moduleDone(p, mid) {
    var m = cours.modules.filter(function (x) { return x.id === mid; })[0];
    return m && m.lecons.every(function (l) { return (p.stars[l.id] || 0) >= 1; });
  }
  var TROPHIES = [
    { id: "premiere", ico: "🥇", titre: "Première leçon", desc: "Tu as fini ta première leçon.", test: function (p) { return doneCount(p) >= 1; } },
    { id: "parfait", ico: "💎", titre: "Sans faute", desc: "Une leçon avec 3 étoiles.", test: function (p) { return Object.keys(p.stars).some(function (k) { return p.stars[k] === 3; }); } },
    { id: "trois", ico: "🏅", titre: "Bien parti", desc: "3 leçons réussies.", test: function (p) { return doneCount(p) >= 3; } },
    { id: "serie3", ico: "🔥", titre: "3 jours de suite", desc: "Tu as joué 3 jours d'affilée.", test: function (p) { return streak(p) >= 3; } },
    { id: "M1", ico: "🔤", titre: "Toutes les lettres", desc: "Tu connais les 26 lettres.", test: function (p) { return moduleDone(p, "M1"); } },
    { id: "etoiles20", ico: "🌟", titre: "20 étoiles", desc: "Tu as gagné 20 étoiles.", test: function (p) { return totalStars(p) >= 20; } },
    { id: "etoiles50", ico: "🌠", titre: "50 étoiles", desc: "Tu as gagné 50 étoiles.", test: function (p) { return totalStars(p) >= 50; } },
    { id: "M2", ico: "🧩", titre: "Roi des syllabes", desc: "Toutes les syllabes réussies.", test: function (p) { return moduleDone(p, "M2"); } },
    { id: "serie7", ico: "📅", titre: "Une semaine", desc: "7 jours de suite !", test: function (p) { return streak(p) >= 7; } },
    { id: "M3", ico: "📖", titre: "Lecteur de mots", desc: "Tous les premiers mots lus.", test: function (p) { return moduleDone(p, "M3"); } },
    { id: "M4", ico: "💬", titre: "Premières phrases", desc: "Tu lis tes premières phrases.", test: function (p) { return moduleDone(p, "M4"); } },
    { id: "M5", ico: "🪄", titre: "Sons magiques", desc: "Tu connais ou, on, an, in, oi, ch…", test: function (p) { return moduleDone(p, "M5"); } },
    { id: "M6", ico: "🏆", titre: "Je sais lire !", desc: "Tu lis de petites histoires.", test: function (p) { return moduleDone(p, "M6"); } },
    { id: "M9", ico: "🔠", titre: "As de l'alphabet", desc: "Toutes les lettres révisées.", test: function (p) { return moduleDone(p, "M9"); } },
    { id: "M10", ico: "🧱", titre: "Bâtisseur de syllabes", desc: "Les syllabes en a, i, o, u, e.", test: function (p) { return moduleDone(p, "M10"); } },
    { id: "coffre", ico: "🧰", titre: "Chasseur de coffres", desc: "Tu as ouvert un coffre bonus.", test: function (p) { return Object.keys(p.bonus || {}).some(function (k) { return k.indexOf("coffre-") === 0; }); } },
    { id: "joueur", ico: "🎮", titre: "Champion des jeux", desc: "Une partie de jeu sans faute.", test: function (p) { return Object.keys(p.bonus || {}).some(function (k) { return k.indexOf("jeu-") === 0 && p.bonus[k] === 3; }); } },
    { id: "M7", ico: "🧠", titre: "Sons difficiles", desc: "é, eu, gn, ill, ph : bravo !", test: function (p) { return moduleDone(p, "M7"); } },
    { id: "M8", ico: "📚", titre: "Grand lecteur", desc: "Tu lis de longues histoires.", test: function (p) { return moduleDone(p, "M8"); } },
    { id: "dix", ico: "🎖️", titre: "10 leçons", desc: "10 leçons réussies sans faute.", test: function (p) { return doneCount(p) >= 10; } },
    { id: "vingt", ico: "🏵️", titre: "20 leçons", desc: "20 leçons réussies sans faute.", test: function (p) { return doneCount(p) >= 20; } },
    { id: "etoiles100", ico: "💫", titre: "100 étoiles", desc: "Tu as gagné 100 étoiles.", test: function (p) { return totalStars(p) >= 100; } },
    { id: "serie14", ico: "🗓️", titre: "Deux semaines", desc: "14 jours de suite !", test: function (p) { return streak(p) >= 14; } },
    { id: "cadeau", ico: "🎁", titre: "Premier cadeau", desc: "Tu as choisi ton premier cadeau.", test: function (p) { return p.claimed.length >= 1; } },
    { id: "chanteur", ico: "🎤", titre: "Petit chanteur", desc: "Tu as chanté l'alphabet.", test: function (p) { return !!p.sang; } },
    { id: "conteur", ico: "📕", titre: "Ami des livres", desc: "Tu as écouté une histoire.", test: function (p) { return !!p.book; } },
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
      html += '<span class="chip gold" title="Étoiles à dépenser"><span class="star-ico" aria-hidden="true">★</span> ' + starsLeft(p) + "</span>";
    }
    starsEl.innerHTML = html + syncChip();
  }
  function syncChip() {
    if (!state.code) return "";
    var label = syncStatus === "ok" ? "Synchronisé" : syncStatus === "err" ? "Hors ligne" : "Synchronisation…";
    return '<span class="chip sync ' + syncStatus + '" title="' + label + '" aria-label="' + label + '">☁' + (syncStatus === "ok" ? "✓" : syncStatus === "err" ? "✕" : "…") + "</span>";
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
        '</span><span class="pname">' + esc(p.name) + '</span><span class="pstars"><span class="star-ico" aria-hidden="true">★</span> ' + starsLeft(p) + "</span></button>";
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
  var KNOWN_NAMES = { maelo: "Maëlo", mailo: "Maëlo", maylo: "Maëlo", mayelo: "Maëlo", maelos: "Maëlo", maeloh: "Maëlo",
    maelau: "Maëlo", maelot: "Maëlo", maeleau: "Maëlo", maillo: "Maëlo", maillot: "Maëlo", maelaut: "Maëlo", maelaux: "Maëlo", mayelau: "Maëlo" };
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
    var micOK = false;   // inscription au clavier (micro retiré)
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
    var ictrl = null, alive = true;
    leaveHook = function () { alive = false; if (ictrl) ictrl.abort(); voice().then(function (V) { V.releaseMic(); }).catch(function () {}); };
    function listenIntro() {
      stopAudio();
      var mic = document.getElementById("intro-mic"), hint = document.getElementById("intro-hint");
      mic.disabled = true;
      hint.textContent = "Préparation du micro…";
      voice().then(function (V) {
        return V.warmup(function (x) { hint.textContent = "Préparation du micro… " + Math.round(x * 100) + " %"; }).then(function () {
          mic.classList.add("listening"); hint.textContent = "Je t'écoute…";
          ictrl = new AbortController();
          return V.record({ signal: ictrl.signal, maxMs: 7000, silenceMs: 1100 });
        }).then(function (r) {
          mic.classList.remove("listening");
          if (!alive) return;
          if (!r.speech) { mic.disabled = false; hint.textContent = "Je n'ai rien entendu. Appuie et parle bien fort."; play("ui/pas-compris.mp3"); return; }
          hint.textContent = "Je réfléchis…";
          return V.transcribeText(r.audio).then(function (txt) {
            mic.disabled = false;
            var res = parseIntro(txt);
            if (res.name) document.getElementById("pname").value = res.name;
            if (res.age) setAge(res.age);
            if (res.name) { hint.textContent = "J'ai compris : " + res.name + (res.age ? ", " + res.age + " ans" : "") + ". Un adulte vérifie, puis choisis ton animal."; play(["ui/compris.mp3", "ui/animal.mp3"]); }
            else { hint.textContent = "Je n'ai pas bien compris. Réessaie, ou un adulte écrit le prénom."; play("ui/pas-compris.mp3"); }
          });
        });
      }).catch(function () { mic.disabled = false; mic.classList.remove("listening"); hint.textContent = "Le micro n'est pas autorisé : autorise-le dans les réglages, ou un adulte écrit le prénom."; });
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

  SCREENS.surprise = function () {
    var p = profile(), g = (p.gifted || []).filter(function (x) { return !x.opened; })[0];
    if (!g) return back();
    setTop("Surprise !", true);
    app.innerHTML = '<div class="result surprise"><span class="surprise-box" aria-hidden="true">🎁</span><h1>Un cadeau pour toi, ' + esc(p.name) + " !</h1><p class='hint'>Papa ou maman t'offre un cadeau. Touche le paquet pour l'ouvrir !</p>" +
      '<div class="actions column"><button class="btn big wide focusable" type="button" id="open-gift">Ouvrir le cadeau</button></div></div>';
    document.getElementById("open-gift").addEventListener("click", function () {
      g.opened = true;
      p.claimed.push({ id: g.id, titre: g.titre, ico: g.ico, cout: 0, t: Date.now() });
      saveState(p); confetti(260);
      app.querySelector(".surprise-box").textContent = g.ico;
      app.querySelector("h1").textContent = g.titre;
      app.querySelector(".hint").textContent = "C'est un cadeau de papa ou maman. Va lui faire un câlin !";
      var b = document.getElementById("open-gift"); b.textContent = "Merci !"; b.onclick = function () { back(); };
      play(["ui/cadeau.mp3"]);
    }, { once: true });
    focusFirst("#open-gift");
  };

  SCREENS.home = function () {
    var p = profile();
    if (!p) return resetTo("profiles");
    if ((p.gifted || []).some(function (x) { return !x.opened; })) return go("surprise");
    setTop("Bonjour " + p.name + " !", true);
    var nextId = nextLessonFor(p), nextL = findLesson(nextId);
    var resuming = !!(p.resume && p.resume.id === nextId);
    var nbTro = Object.keys(p.trophies).length;
    var nbErr = Object.keys(p.errs).length;
    var html = '<section class="hero-continue">' + bubble(resuming ? "On reprend où tu t'es arrêté ?" : "Prêt, " + p.name + " ?", "happy") +
      '<button class="btn big wide pulse focusable" type="button" id="continue">▶ ' + (resuming ? "Continuer" : "Jouer") +
      '<span class="btn-sub">' + esc(nextL.titre) + '</span></button>' +
      '<div class="home-tiles">' +
      '<button class="tile focusable" type="button" id="trophies"><span class="tile-ico" aria-hidden="true">🏆</span><span>Trophées</span><span class="badge">' + nbTro + "/" + TROPHIES.length + '</span></button>' +
      '<button class="tile focusable" type="button" id="arcade"><span class="tile-ico" aria-hidden="true">🎮</span><span>Jeux</span><span class="badge">' + Object.keys(ARCADE).filter(function (k) { return arcadePool(p, ARCADE[k].kind).length >= 4; }).length + "/" + Object.keys(ARCADE).length + '</span></button>' +
      '<button class="tile focusable" type="button" id="progress"><span class="tile-ico" aria-hidden="true">📈</span><span>Progrès</span><span class="badge">' + doneCount(p) + "/" + allLessons.length + '</span></button>' +
      '<button class="tile focusable" type="button" id="gifts"><span class="tile-ico" aria-hidden="true">🎁</span><span>Cadeaux</span><span class="badge">' + starsLeft(p) + ' ★</span></button>' +
      (nbErr ? '<button class="tile focusable" type="button" id="review"><span class="tile-ico" aria-hidden="true">🔁</span><span>Révisions</span><span class="badge">' + nbErr + "</span></button>" : "") +
      "</div>" + '<div class="actions center"><button class="btn ghost small focusable" type="button" id="home-parents">👪 Espace parents</button></div>' + ((p.limit || p.gameLimit) ? '<div class="time-left" aria-live="polite">' +
        (p.limit ? "📚 " + (timeUp(p) ? "Leçons finies pour aujourd'hui" : "Leçons : encore " + Math.ceil(timeLeft(p) / 60) + " min") : "📚 Leçons sans limite") + " · " +
        (p.gameLimit ? "🎮 " + (gameTimeUp(p) ? "Jeux finis" : "Jeux : " + Math.ceil(gameLeft(p) / 60) + " min") : "🎮 Jeux sans limite") + "</div>" : "") + "</section>";
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
          '<span class="node-ico" aria-hidden="true">' + (open ? (s === 3 ? "👑" : lessonIcon(l)) : "🔒") + "</span></button>" +
          '<span class="node-label">' + esc(l.titre) + '</span><span class="node-stars" aria-hidden="true">' + starsText(s, 3) + "</span></div>";
        n++;
      });
      var chestKey = "coffre-" + m.id, chestDone = !!p.bonus[chestKey], chestOpen = moduleDone(p, m.id);
      html += '<div class="node-wrap chest-wrap" style="--offset:0px"><button class="node chest focusable' + (chestDone ? " done" : chestOpen ? " current" : " locked") + '" type="button" data-chest="' + m.id + '" aria-label="Coffre bonus de l\'étape ' + (mi + 1) + '">' +
        '<span class="node-ico" aria-hidden="true">' + (chestDone ? "✨" : chestOpen ? "🎁" : "🧰") + "</span></button>" +
        '<span class="node-label">' + (chestDone ? "Coffre ouvert" : "Coffre bonus +3 ★") + "</span></div>";
      html += "</div></section>";
    });
    html += "</div>";
    app.innerHTML = html;
    drawRoad(); setTimeout(drawRoad, 250);
    app.querySelectorAll("[data-chest]").forEach(function (b) {
      b.addEventListener("click", function () {
        var key = "coffre-" + b.dataset.chest;
        if (p.bonus[key]) { toast("Tu as déjà ouvert ce coffre !"); return; }
        if (!moduleDone(p, b.dataset.chest)) { toast("Finis toutes les leçons de l'étape pour ouvrir le coffre !"); return; }
        p.bonus[key] = 3; saveState(p); checkTrophies(p); confetti(220); toast("Coffre ouvert : +3 étoiles !");
        play(["ui/super-prenom.mp3"].concat(nameAudio(p)).concat(["ui/etoile.mp3"]));
        setTimeout(render, 900);
      });
    });
    document.getElementById("continue").addEventListener("click", function () { openLesson(nextId); });
    document.getElementById("trophies").addEventListener("click", function () { go("trophies"); });
    document.getElementById("gifts").addEventListener("click", function () { go("gifts"); });
    document.getElementById("progress").addEventListener("click", function () { go("progress"); });
    document.getElementById("arcade").addEventListener("click", function () { go("arcade"); });
    var hp = document.getElementById("home-parents"); if (hp) hp.addEventListener("click", function () { go("parentsGate"); });
    var rv = document.getElementById("review");
    if (rv) rv.addEventListener("click", function () { var r = reviewLesson(p); if (r) go("game", { id: "REV", review: true }); });
    app.querySelectorAll(".node").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.classList.contains("locked")) { toast("Cette leçon s'ouvrira quand tu auras fini la leçon d'avant (même avec 1 étoile) !"); return; }
        openLesson(b.dataset.l);
      });
    });
    var homeVoice = ["ui/bonjour.mp3"].concat(nameAudio(p));
    if (timeUp(p)) { if (onceToday(p, "pause")) homeVoice.push("ui/pause.mp3"); }
    else if (p.limit && timeLeft(p) < 4 * 60) { if (onceToday(p, "presque")) homeVoice.push("ui/presque-fini.mp3"); }
    else homeVoice.push("ui/choisis-lecon.mp3");
    var helloKey = "lpl.hello." + p.id, saidToday = false;
    try { saidToday = localStorage.getItem(helloKey) === today(); } catch (e) { saidToday = !!window["__lplSaid" + p.id]; }
    if (!saidToday && !window["__lplSaid" + p.id]) {
      window["__lplSaid" + p.id] = true;
      try { localStorage.setItem(helloKey, today()); } catch (e) {}
      play(homeVoice);
    } else if (timeUp(p) && onceToday(p, "pause")) play(["ui/pause.mp3"]);   // au retour sur l'accueil : rien n'est répété
  };
  // Route qui serpente d'une leçon à l'autre (dessinée d'après la position réelle des leçons)
  function drawRoad() {
    var path = app.querySelector(".path");
    if (!path) return;
    var old = path.querySelector(".road"); if (old) old.remove();
    var pr = path.getBoundingClientRect();
    var nodes = Array.prototype.slice.call(path.querySelectorAll(".node"));
    if (nodes.length < 2) return;
    var pts = nodes.map(function (n) { var r = n.getBoundingClientRect(); return [r.left - pr.left + r.width / 2, r.top - pr.top + r.height / 2]; });
    var w = Math.max(8, Math.round(nodes[0].getBoundingClientRect().width * 0.42));
    function d(list) {
      var s = "M" + list[0][0] + " " + list[0][1];
      for (var i = 1; i < list.length; i++) {
        var a = list[i - 1], b = list[i], my = (b[1] - a[1]) / 2;
        s += " C" + a[0] + " " + (a[1] + my) + " " + b[0] + " " + (b[1] - my) + " " + b[0] + " " + b[1];
      }
      return s;
    }
    var cur = nodes.findIndex ? nodes.findIndex(function (n) { return n.classList.contains("current"); }) : -1;
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "road"); svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", path.offsetWidth); svg.setAttribute("height", path.scrollHeight);
    function add(cls, list, width) {
      var p = document.createElementNS(ns, "path"); p.setAttribute("class", cls); p.setAttribute("d", d(list)); p.setAttribute("stroke-width", width); svg.appendChild(p);
    }
    add("road-bed", pts, w);
    if (cur > 0) add("road-done", pts.slice(0, cur + 1), w);
    add("road-line", pts, Math.max(3, w / 7));
    path.insertBefore(svg, path.firstChild);
  }
  var roadTimer = null;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawRoad(); });
  window.addEventListener("resize", function () { clearTimeout(roadTimer); roadTimer = setTimeout(drawRoad, 150); });

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
      html += '<div class="trophy focusable' + (got ? " got" : "") + '" tabindex="0"><span class="trophy-ico" aria-hidden="true">' + (got ? t.ico : "🔒") + '</span><strong>' + esc(t.titre) + "</strong><span>" + esc(t.desc) + "</span></div>";
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

  // Compagnons des lettres (personnages originaux) : leur cri rappelle le son de la lettre
  var COMPAGNONS = {
    a: ["🦁", "Le lion bâille : aaa"], e: ["🤔", "Le copain hésite : eee"], i: ["🐭", "La souris : iii !"], o: ["😮", "Le copain surpris : oh !"],
    u: ["🚂", "Le petit train : uuu"], y: ["🐭", "Comme le i : iii !"], m: ["😋", "C'est bon : mmm"], l: ["🎵", "La chanson : lll"],
    r: ["🐶", "Le chien qui grogne : rrr"], s: ["🐍", "Le serpent : sss"], f: ["💨", "Le vent souffle : fff"], v: ["🛩️", "Le petit avion : vvv"],
    w: ["🛩️", "Comme le v : vvv"], z: ["🐝", "L'abeille : zzz"], j: ["🧒", "Le copain qui joue : jjj"], n: ["👃", "Le nez bouché : nnn"],
    p: ["🫧", "La bulle qui éclate : p !"], t: ["⏰", "Le réveil : t, t, t"], b: ["🐟", "Le poisson fait des bulles : b, b"],
    d: ["🥁", "Le tambour : d, d, d"], c: ["🐔", "La poule : k, k, k"], k: ["🐔", "La poule : k, k, k"], q: ["🐔", "La poule : k, k, k"],
    g: ["🐸", "La grenouille : g, g, g"], x: ["🚂", "La locomotive : ks, ks"], h: ["🤫", "Le h ne dit rien : chut !"]
  };
  function cardHTML(it, i) {
    if (it.lettre_minuscule) {
      return '<button class="card focusable" data-i="' + i + '" type="button" aria-label="Lettre ' + esc(it.lettre_majuscule) + ', écouter">' +
        '<span class="glyph">' + esc(it.lettre_majuscule) + " " + esc(it.lettre_minuscule) + "</span>" +
        '<span class="emoji" aria-hidden="true">' + (it.illustration_bis || it.illustration) + '</span><span class="caption">' + esc(it.exemple_bis || it.exemple) + '</span>' +
        (COMPAGNONS[it.lettre_minuscule] ? '<span class="compagnon"><span aria-hidden="true">' + COMPAGNONS[it.lettre_minuscule][0] + "</span> " + esc(COMPAGNONS[it.lettre_minuscule][1]) + "</span>" : "") +
        '<span class="play-ico" aria-hidden="true">🔊</span></button>';
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

  // Carte d'aventure : l'animal de l'enfant avance à chaque bonne réponse et recule à chaque erreur
  var MAP_THEMES = [
    { nom: "Le village", deco: ["🏡", "🌳", "🏠", "🌷", "⛲", "🏘️", "🌳", "🏡"], but: "🏰", cls: "village" },
    { nom: "La ferme", deco: ["🌾", "🐄", "🚜", "🐔", "🌻", "🐖", "🌾", "🐑"], but: "🏚️", cls: "ferme" },
    { nom: "La banquise", deco: ["🧊", "🐧", "❄️", "🏔️", "🦭", "⛄", "🧊", "🐻‍❄️"], but: "🛖", cls: "glace" },
    { nom: "La forêt", deco: ["🌲", "🍄", "🦊", "🌳", "🦔", "🌲", "🐿️", "🍂"], but: "🏕️", cls: "foret" },
    { nom: "La plage", deco: ["🌴", "🐚", "🦀", "🏖️", "⛵", "🌴", "🐠", "🪸"], but: "🏝️", cls: "plage" },
    { nom: "La jungle", deco: ["🌴", "🐒", "🦜", "🌺", "🐊", "🌿", "🦋", "🐘"], but: "🗿", cls: "jungle" },
    { nom: "La montagne", deco: ["⛰️", "🐐", "🌲", "🦅", "🏔️", "🌼", "🪨", "🐻"], but: "🚩", cls: "montagne" },
    { nom: "L'espace", deco: ["⭐", "🌙", "🪐", "☄️", "🛸", "🌟", "🌍", "✨"], but: "🚀", cls: "espace" }
  ];
  function mapTheme(l) {
    for (var i = 0; i < cours.modules.length; i++) if (cours.modules[i].lecons.some(function (x) { return x.id === l.id; })) return MAP_THEMES[i % MAP_THEMES.length];
    return MAP_THEMES[0];
  }
  // Chaque case = une question : vide (?) tant qu'elle n'est pas trouvée, puis l'image (ou la syllabe) de la bonne réponse
  function tileFace(it) {
    if (!it) return "";
    if (it.illustration) return it.illustration_bis || it.illustration;
    return '<b class="map-syl">' + esc(it.syllabe || it.syllabe_tts || itemKey(it)) + "</b>";
  }
  function mapHTML(th, steps, pos, avatar, faces, answered) {
    var h = '<div class="advmap map-' + th.cls + '" role="img" aria-label="' + esc(th.nom) + " : case " + pos + " sur " + steps + '"><div class="map-track">';
    for (var i = 0; i <= steps; i++) {
      var face = i === steps ? th.but : i < answered ? faces[i] : i === answered ? "❓" : "";
      h += '<span class="map-tile' + (i < pos ? " passed" : "") + (i === answered ? " now" : "") + (i === steps ? " goal" : "") + '"><span class="map-deco" aria-hidden="true">' + face + "</span></span>";
    }
    return h + '</div><span class="map-hero" aria-hidden="true" style="--pos:' + pos + ";--steps:" + steps + '">' + avatar + "</span></div>";
  }
  function moveHero(pos, cls) {
    var hero = app.querySelector(".map-hero");
    if (!hero) return;
    hero.style.setProperty("--pos", pos);
    app.querySelectorAll(".map-tile").forEach(function (t, i) { t.classList.toggle("passed", i < pos); });
    if (cls) { hero.classList.remove("hop", "ouch"); void hero.offsetWidth; hero.classList.add(cls); }
  }

  // ================= Mode jeu : le jeu des paires et le serpent des lettres =================
  var ARCADE = {
    memory: { ico: "🃏", titre: "Le jeu des paires", desc: "Retourne les cartes : trouve la lettre et son image.", kind: "lettre" },
    snake: { ico: "🐍", titre: "Le serpent des lettres", desc: "Avec les flèches, mange la lettre qui fait le son.", kind: "lettre" },
    fish: { ico: "🎣", titre: "La pêche aux lettres", desc: "Attrape le poisson qui porte le bon son.", kind: "lettre" }
  };
  function arcadePool(p, kind) {
    var seen = {}, out = [];
    allLessons.forEach(function (id, i) {
      var l = lessonIndex[id];
      if (!isUnlocked(p, id)) return;
      var m = l.type_jeu === "son_vers_lettre" ? "lettre" : l.type_jeu === "assemblage_syllabe" ? (/^C/.test(id) ? "son" : "syllabe") : l.type_jeu === "image_vers_mot" ? "mot" : "";
      if (m !== kind) return;
      l.items.forEach(function (it) { var k = itemKey(it); if (!seen[k]) { seen[k] = 1; out.push(it); } });
    });
    return out;
  }
  function startArcade(key, replace) {
    var p = profile(), g = ARCADE[key], pool = arcadePool(p, g.kind);
    var src = allLessons.map(findLesson).filter(function (l) { return l.id === g.consigneId; })[0];
    lessonIndex.ARC = { id: "ARC", titre: g.titre, type_jeu: src.type_jeu, consigne: src.consigne, consigneId: g.consigneId, items: pool, pool: pool, theme: g.theme, hero: g.ico };
    go("game", { id: "ARC", arcade: key }, replace);
  }
  function startArcade(key) { go(key, { arcade: key, level: (profile().gameLevels || {})[key] || 1 }); }
  // Récompense d'un niveau de jeu : étoiles bonus, 5 niveaux récompensés par jour
  function gameReward(p, gain) {
    var dayKey = today(), nb = Object.keys(p.bonus).filter(function (k) { return k.indexOf("jeu-" + dayKey) === 0; }).length;
    if (nb >= 5) gain = 0;
    if (gain) p.bonus["jeu-" + dayKey + "-" + Date.now()] = gain;
    checkTrophies(p); saveState(p);
    return { gain: gain, capped: nb >= 5 };
  }
  function gameLevelDone(p, key, level, gain, capped, detail) {
    p.gameLevels = p.gameLevels || {};
    p.gameLevels[key] = Math.max(p.gameLevels[key] || 1, Math.min(level + 1, 8));
    saveState(p);
    var bigS = '<div class="big-stars" aria-label="' + gain + ' étoiles bonus">' + [0, 1, 2].map(function (i) { return '<span class="bstar' + (i < gain ? " on" : "") + '" style="animation-delay:' + (i * .25) + 's">★</span>'; }).join("") + "</div>";
    app.innerHTML = '<div class="result">' + mascot("happy") + "<h1>Niveau " + level + " réussi !</h1>" + bigS +
      "<p class='hint'>" + detail + " " + (gain ? "Tu gagnes " + gain + " étoile" + (gain > 1 ? "s" : "") + " bonus !" : capped ? "Tu as déjà gagné beaucoup d'étoiles en jouant aujourd'hui." : "") + "</p>" +
      '<div class="actions column"><button class="btn big wide focusable" type="button" id="lvl-next">Niveau ' + (level + 1) + " ▶</button>" +
      '<button class="btn secondary wide focusable" type="button" id="lvl-again">↻ Rejouer ce niveau</button>' +
      '<button class="btn secondary wide focusable" type="button" id="lvl-menu">Les jeux</button></div></div>';
    document.getElementById("lvl-next").addEventListener("click", function () { go(key, { arcade: key, level: level + 1 }, true); });
    document.getElementById("lvl-again").addEventListener("click", function () { go(key, { arcade: key, level: level }, true); });
    document.getElementById("lvl-menu").addEventListener("click", back);
    confetti(gain ? 180 : 90);
    play(gain ? ["ui/super-prenom.mp3"].concat(nameAudio(p)).concat(["ui/etoile.mp3"]) : ["ui/bravo.mp3"]);
    focusFirst("#lvl-next");
  }
  function pickDistinct(list, n, keyFn) {
    var seen = {}, out = [];
    shuffle(list.slice()).forEach(function (it) { var k = keyFn(it); if (!seen[k] && out.length < n) { seen[k] = 1; out.push(it); } });
    return out;
  }
  SCREENS.arcade = function () {
    var p = profile();
    setTop("Jeux", true);
    if (gameTimeUp(p)) {
      app.innerHTML = '<div class="result">' + mascot("happy") + "<h1>Les jeux, c'est fini pour aujourd'hui !</h1><p class='hint'>On rejoue demain. Tu peux encore faire tes leçons et tes révisions.</p>" +
        '<div class="actions column"><button class="btn big wide focusable" type="button" id="menu">Mon chemin</button></div></div>';
      document.getElementById("menu").addEventListener("click", back);
      return focusFirst("#menu");
    }
    var lv = p.gameLevels || {};
    var html = bubble("À quoi on joue, " + esc(p.name) + " ?", "happy") + '<div class="gifts arcade">';
    Object.keys(ARCADE).forEach(function (k) {
      var g = ARCADE[k];
      html += '<button class="gift ready focusable" type="button" data-k="' + k + '"><span class="gift-ico" aria-hidden="true">' + g.ico + "</span><strong>" + g.titre + "</strong><span class='hint'>" + g.desc + "</span><span class='gift-tag'>Niveau " + (lv[k] || 1) + "</span></button>";
    });
    app.innerHTML = html + "</div><p class='hint center'>" + (p.gameLimit ? "🎮 Encore " + Math.ceil(gameLeft(p) / 60) + " min de jeux aujourd'hui. " : "") + "Chaque niveau réussi rapporte des étoiles bonus.</p>";
    app.querySelectorAll(".gift").forEach(function (b) { b.addEventListener("click", function () { startArcade(b.dataset.k); }); });
    if (isTV) focusFirst(".gift");
  };

  // ---- Le jeu des paires (memory) : la lettre et son image, puis le mot et son image ----
  SCREENS.memory = function (a) {
    var p = profile(), level = a.level || 1;
    setTop("Le jeu des paires · niveau " + level, true);
    var nPairs = [3, 4, 4, 5, 6, 6, 8, 8][Math.min(level, 8) - 1];
    var mots = arcadePool(p, "mot").filter(function (it) { return it.illustration; });
    // Niveaux : 1-2 lettre + image · 3 majuscule + minuscule · 4-5 mot + image (si les mots sont débloqués) · 6+ mélangé
    var mode = level <= 2 ? "image" : level === 3 ? "casse" : (level <= 5 && mots.length >= nPairs) ? "mot" : (level >= 6 && Math.random() < .5 && mots.length >= nPairs ? "mot" : "image");
    var useWords = mode === "mot";
    var src = useWords ? mots : arcadePool(p, "lettre").filter(function (it) { return it.illustration; });
    var items = pickDistinct(src, nPairs, function (it) { return useWords ? it.mot : it.lettre_minuscule; });
    nPairs = items.length;
    var cards = [];
    items.forEach(function (it, i) {
      if (mode === "casse") {
        cards.push({ i: i, face: esc(it.lettre_majuscule), kind: "txt" });
        cards.push({ i: i, face: esc(it.lettre_minuscule), kind: "txt2" });
      } else {
        cards.push({ i: i, face: useWords ? esc(it.mot) : esc(it.lettre_majuscule + " " + it.lettre_minuscule), kind: "txt" });
        cards.push({ i: i, face: it.illustration, kind: "img" });
      }
    });
    cards = shuffle(cards);
    var cols = cards.length <= 6 ? 3 : 4;
    var consigne = mode === "casse" ? "Trouve la grande lettre et la petite lettre." : useWords ? "Trouve chaque mot avec son image." : "Trouve chaque lettre avec son image.";
    var html = '<p class="hint center">' + consigne + ' <span id="mem-count">0 / ' + nPairs + ' paires</span> · <span id="mem-tries">0 coup</span></p><div class="memory" style="--cols:' + cols + '">';
    cards.forEach(function (c, k) {
      html += '<button class="mem-card focusable" type="button" data-k="' + k + '" data-p="' + c.i + '" aria-label="Carte cachée"><span class="mem-back" aria-hidden="true">❓</span><span class="mem-face ' + c.kind + '" aria-hidden="true">' + c.face + "</span></button>";
    });
    app.innerHTML = html + "</div>";
    var open = [], found = 0, tries = 0, wait = false, peek = level <= 4;
    // Au début des premiers niveaux : toutes les cartes sont montrées quelques secondes pour les mémoriser
    if (peek) {
      app.querySelectorAll(".mem-card").forEach(function (b) { b.classList.add("shown"); });
      setTimeout(function () { app.querySelectorAll(".mem-card").forEach(function (b) { b.classList.remove("shown"); }); peek = false; }, 1500 + nPairs * 600);
    }
    app.querySelectorAll(".mem-card").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = cards[+b.dataset.k];
        if (wait || peek || b.classList.contains("shown") || b.classList.contains("found")) return;
        b.classList.add("shown"); b.setAttribute("aria-label", c.kind === "txt" ? "Carte " + (useWords ? items[c.i].mot : items[c.i].lettre_majuscule) : "Image");
        var it = items[c.i];
        if (c.kind !== "img") play(useWords ? ["mots/" + it.mot + ".mp3"] : [((cours.sons_seuls || []).indexOf(it.lettre_minuscule) >= 0 ? "lettres/son-" : "lettres/question-") + it.lettre_minuscule + ".mp3"]);
        else if (useWords) play(["mots/" + it.mot + ".mp3"]);
        open.push(b);
        if (open.length < 2) return;
        tries++; document.getElementById("mem-tries").textContent = tries + " coup" + (tries > 1 ? "s" : "");
        var c1 = cards[+open[0].dataset.k], c2 = cards[+open[1].dataset.k];
        if (c1.i === c2.i && c1.kind !== c2.kind) {
          open.forEach(function (x) { x.classList.add("found"); });
          open = []; found++;
          document.getElementById("mem-count").textContent = found + " / " + nPairs + " paires";
          confetti(40);
          play(useWords ? ["ui/bravo.mp3", "mots/" + it.mot + ".mp3"] : ["ui/bravo.mp3", "lettres/phrase-" + items[c1.i].lettre_minuscule + ".mp3"], function () {
            if (found === nPairs) {
              var gain = tries <= nPairs + 1 ? 3 : tries <= nPairs * 2 ? 2 : 1, r = gameReward(p, gain);
              gameLevelDone(p, "memory", level, r.gain, r.capped, "Tu as trouvé les " + nPairs + " paires en " + tries + " essais.");
            }
          });
        } else {
          wait = true;
          setTimeout(function () { open.forEach(function (x) { x.classList.remove("shown"); x.setAttribute("aria-label", "Carte cachée"); }); open = []; wait = false; }, 1300);
        }
      });
    });
    play([mode === "casse" ? "ui/memory-casse.mp3" : useWords ? "ui/memory-mots.mp3" : "ui/memory-intro.mp3"]);
    focusFirst(".mem-card");
  };

  // ---- La pêche aux lettres : chaque poisson nage dans son couloir, on touche celui qui porte le bon son ----
  SCREENS.fish = function (a) {
    var p = profile(), level = a.level || 1;
    setTop("La pêche · niveau " + level, true);
    var lanes = [3, 4, 4, 5, 5, 5, 6, 6][Math.min(level, 8) - 1], need = 6, speed = Math.max(5, 11 - level);
    var syl = arcadePool(p, "syllabe"), useSyl = level >= 4 && syl.length >= 8;
    var pool = useSyl ? syl : arcadePool(p, "lettre").filter(function (it) { return it.lettre_minuscule !== "h"; });
    function key(it) { return useSyl ? it.syllabe_tts : (it.son_tts || it.lettre_minuscule); }
    function label(it) { return useSyl ? esc(it.affiche || it.syllabe_tts) : esc(it.lettre_minuscule); }
    function audio(it) { return useSyl ? ["syllabes/" + it.syllabe_tts + ".mp3"] : [((cours.sons_seuls || []).indexOf(it.lettre_minuscule) >= 0 ? "lettres/son-" : "lettres/question-") + it.lettre_minuscule + ".mp3"]; }
    var caught = 0, errors = 0, target, fishes, locked = false;
    var FISH = ["🐟", "🐠", "🐡", "🦈", "🐙", "🦀"];
    function round() {
      fishes = pickDistinct(pool, lanes, key); target = fishes[Math.floor(Math.random() * fishes.length)];
      var h = '<div class="snake-top"><button class="listen focusable small-listen" type="button" id="fish-listen" data-t="' + esc(label(target)) + '" aria-label="Réécouter">🔊</button><span class="snake-score">🪣 ' + caught + " / " + need + '</span></div><div class="pond">';
      fishes.forEach(function (it, i) {
        h += '<button class="lane focusable" type="button" data-i="' + i + '" aria-label="Poisson ' + label(it) + '"><span class="swim" style="animation-duration:' + (speed + i * 0.9) + "s;animation-delay:-" + (i * 1.7) + 's"><span class="fish-ico" aria-hidden="true">' + FISH[i % FISH.length] + '</span><b class="fish-l">' + label(it) + "</b></span></button>";
      });
      app.innerHTML = h + "</div>";
      document.getElementById("fish-listen").addEventListener("click", function () { play(audio(target)); });
      app.querySelectorAll(".lane").forEach(function (b) {
        b.addEventListener("click", function () {
          if (locked) return;
          var it = fishes[+b.dataset.i];
          if (key(it) === key(target)) {
            locked = true; caught++; b.classList.add("caught"); confetti(30);
            play(["ui/bravo.mp3"], function () {
              locked = false;
              if (caught >= need) { var r = gameReward(p, bonusFor(errors)); return gameLevelDone(p, "fish", level, r.gain, r.capped, "Tu as pêché " + need + " poissons" + (errors ? ", avec " + errors + " erreur" + (errors > 1 ? "s" : "") + "." : " sans erreur !")); }
              round(); play(audio(target));
            });
          } else { errors++; b.classList.add("miss"); setTimeout(function () { b.classList.remove("miss"); }, 500); play(wrongVoice(it, audio(target))); }
        });
      });
      focusFirst(".lane");
    }
    round();
    play(["ui/peche-intro.mp3"].concat(audio(target)));
  };

  // ---- Le serpent des lettres : il se déplace case par case avec les flèches ----
  SCREENS.snake = function (a) {
    var p = profile(), level = a.level || 1;
    setTop("Le serpent · niveau " + level, true);
    var size = [5, 5, 6, 6, 7, 7, 8, 8][Math.min(level, 8) - 1], need = 5, onBoard = [3, 3, 4, 4, 4, 5, 5, 5][Math.min(level, 8) - 1];
    var syl = arcadePool(p, "syllabe");
    // Niveaux : 1-2 lettres · 3-4 images (l'image qui commence par le son) · 5-6 syllabes · 7+ images ; rochers dès le niveau 3
    var useSyl = (level === 5 || level === 6) && syl.length >= 8;
    var useImg = !useSyl && level >= 3;
    var pool = useSyl ? syl : arcadePool(p, "lettre").filter(function (it) { return "hxyw".indexOf(it.lettre_minuscule) < 0 && it.illustration; });
    function key(it) { return useSyl ? it.syllabe_tts : (it.son_tts || it.lettre_minuscule); }
    function label(it) { return useSyl ? esc(it.affiche || it.syllabe_tts) : useImg ? '<span class="snk-img">' + it.illustration + "</span>" : esc(it.lettre_minuscule); }
    var nRocks = level >= 3 ? Math.min(6, level - 1) : 0, rocks = [];
    function audio(it) { return useSyl ? ["syllabes/" + it.syllabe_tts + ".mp3"] : [((cours.sons_seuls || []).indexOf(it.lettre_minuscule) >= 0 ? "lettres/son-" : "lettres/question-") + it.lettre_minuscule + ".mp3"]; }
    var mid = Math.floor(size / 2), snake = [{ x: 0, y: mid }], tiles = [], target = null, eaten = 0, errors = 0, done = false;
    function free(x, y) { return !snake.some(function (c) { return c.x === x && c.y === y; }) && !tiles.some(function (t) { return t.x === x && t.y === y; }) && !rocks.some(function (r) { return r.x === x && r.y === y; }); }
    function spawn(it) {
      var cells = [];
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (free(x, y) && Math.abs(x - snake[0].x) + Math.abs(y - snake[0].y) > 1) cells.push({ x: x, y: y });
      if (!cells.length) return;
      var c = cells[Math.floor(Math.random() * cells.length)]; tiles.push({ x: c.x, y: c.y, it: it });
    }
    function fill() {
      var have = {}; tiles.forEach(function (t) { have[key(t.it)] = 1; });
      pickDistinct(pool.filter(function (it) { return !have[key(it)]; }), onBoard - tiles.length, key).forEach(spawn);
    }
    function newTarget() { target = tiles[Math.floor(Math.random() * tiles.length)].it; }
    for (var rk = 0; rk < nRocks; rk++) { var rx = 2 + Math.floor(Math.random() * (size - 2)), ry = Math.floor(Math.random() * size); if (free(rx, ry)) rocks.push({ x: rx, y: ry }); }
    fill(); newTarget();
    function draw() {
      var h = '<div class="snake-top"><button class="listen focusable small-listen" type="button" id="snk-listen" data-t="' + esc(key(target)) + '" aria-label="Réécouter">🔊</button><span class="snake-score">🍎 ' + eaten + " / " + need + "</span></div>" +
        '<div class="snake-grid" style="--n:' + size + '">';
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var si = -1; snake.forEach(function (c, i) { if (c.x === x && c.y === y) si = i; });
        var t = tiles.filter(function (q) { return q.x === x && q.y === y; })[0];
        var rock = rocks.some(function (r) { return r.x === x && r.y === y; });
        h += '<span data-k="' + (t ? esc(key(t.it)) : "") + '" class="snk-cell' + (si === 0 ? " head" : si > 0 ? " body" : "") + (rock ? " rock" : "") + '">' + (si === 0 ? "🐍" : rock ? "🪨" : t ? '<b class="snk-tile">' + label(t.it) + "</b>" : "") + "</span>";
      }
      h += '</div><p class="snake-tv-hint">Utilise les flèches de la télécommande pour guider le serpent.</p><div class="snake-pad" aria-label="Flèches"><button class="pad focusable" type="button" data-d="ArrowUp" aria-label="Haut">⬆️</button>' +
        '<button class="pad focusable" type="button" data-d="ArrowLeft" aria-label="Gauche">⬅️</button><button class="pad focusable" type="button" data-d="ArrowDown" aria-label="Bas">⬇️</button>' +
        '<button class="pad focusable" type="button" data-d="ArrowRight" aria-label="Droite">➡️</button></div>';
      app.innerHTML = h;
      document.getElementById("snk-listen").addEventListener("click", function () { play(audio(target)); });
      app.querySelectorAll(".pad").forEach(function (b) { b.addEventListener("click", function () { move(b.dataset.d); }); });
    }
    function move(d) {
      if (done) return;
      var hd = snake[0], nx = hd.x + (d === "ArrowLeft" ? -1 : d === "ArrowRight" ? 1 : 0), ny = hd.y + (d === "ArrowUp" ? -1 : d === "ArrowDown" ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
      if (snake.slice(0, -1).some(function (c) { return c.x === nx && c.y === ny; })) return;
      if (rocks.some(function (r) { return r.x === nx && r.y === ny; })) return;
      snake.unshift({ x: nx, y: ny });
      var t = tiles.filter(function (q) { return q.x === nx && q.y === ny; })[0];
      if (t && key(t.it) === key(target)) {
        tiles.splice(tiles.indexOf(t), 1); eaten++;
        if (eaten >= need) {
          done = true; draw(); setLeave(null);
          var r = gameReward(p, bonusFor(errors));
          return setTimeout(function () { gameLevelDone(p, "snake", level, r.gain, r.capped, "Ton serpent a mangé " + need + " bonnes réponses" + (errors ? ", avec " + errors + " erreur" + (errors > 1 ? "s" : "") + "." : " sans erreur !")); }, 600);
        }
        fill(); newTarget(); draw(); confetti(30);
        play(["ui/bravo.mp3"].concat(audio(target)));
      } else {
        snake.pop();
        if (t) { errors++; tiles.splice(tiles.indexOf(t), 1); spawn(t.it); draw(); play(wrongVoice(t.it, audio(target))); }
        else draw();
      }
      var hb = document.querySelector(isTV ? "#snk-listen" : '.pad[data-d="' + d + '"]'); if (hb && isTV) hb.focus({ preventScroll: true });
    }
    function setLeave(fn) { window.__lplArrow = fn; }
    setLeave(move);
    leaveHook = function () { setLeave(null); };
    var sx = 0, sy = 0;
    app.addEventListener("touchstart", function (e) { if (!e.target.closest(".snake-grid")) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    app.addEventListener("touchend", function (e) {
      if (!e.target.closest(".snake-grid") || done || stack[stack.length - 1].screen !== "snake") return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : (dy > 0 ? "ArrowDown" : "ArrowUp"));
    }, { passive: true });
    draw();
    play([useImg ? "ui/serpent-images.mp3" : useSyl ? "ui/serpent-syllabes.mp3" : "ui/serpent-intro.mp3"].concat(audio(target)));
    if (isTV) focusFirst("#snk-listen");
  };

  SCREENS.game = function (a) {
    var p = profile();
    var l = a.arcade ? lessonIndex.ARC : a.review ? (lessonIndex.REV || reviewLesson(p)) : findLesson(a.id);
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
      while (order.length < 8) order = order.concat(shuffle(idxs));
      order = order.slice(0, 8);
    }
    function saveResume() {
      if (a.review || a.arcade) { saveState(p); return; }
      p.resume = { id: l.id, phase: "game", order: order, step: step, errors: errors, t: Date.now() };
      saveState(p);
    }
    saveResume();

    function ask() {
      locked = false;
      var idx = order[step], it = l.items[idx];
      // Un peu plus difficile : 3 pièges, choisis de préférence parmi les plus ressemblants
      var cands = pool.filter(function (x) {
        if (itemKey(x) === itemKey(it)) return false;
        if (it.son_tts !== undefined && x.son_tts === it.son_tts) return false; // c, k et q font tous « ke »
        return true;
      });
      var tk = String(itemKey(it));
      function resemble(x) { var k = String(itemKey(x)); return (k[0] === tk[0] ? 2 : 0) + (k.slice(-1) === tk.slice(-1) ? 1 : 0) + Math.random(); }
      var others = cands.sort(function (x, y) { return resemble(y) - resemble(x); }).filter(function (x, i, arr) {
        return arr.findIndex(function (y) { return itemKey(y) === itemKey(x); }) === i;
      }).slice(0, 3);
      var opts = shuffle([it].concat(others));
      var showText = l.type_jeu === "image_vers_mot" ? esc(it.mot) : l.type_jeu === "lecture_phrase" ? esc(it.phrase) : "";
      var faces = order.map(function (k) { return tileFace(l.items[k]); });
      var html = '<div class="game">' + mapHTML(a.arcade ? l.theme : mapTheme(l), order.length, Math.max(0, step - errors), a.arcade ? l.hero : p.avatar, faces, step) +
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
            var nowT = app.querySelector(".map-tile.now .map-deco"); if (nowT) nowT.innerHTML = tileFace(it);
            moveHero(Math.max(0, step + 1 - errors), "hop");
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
            moveHero(Math.max(0, step - errors), "ouch");
            fb.className = "footer-feedback show bad"; fb.innerHTML = "<strong>Essaie encore !</strong>";
            var nextChoice = app.querySelector(".choice:not([disabled])");
            if (nextChoice && isTV) nextChoice.focus();
            saveResume();
            play(wrongVoice(opts.filter(function (o) { return itemKey(o) === b.dataset.key; })[0], qa));
          }
        });
      });
      if (isTV) focusFirst(".choice");
      var intro = a.arcade ? ["consignes/" + l.consigneId + ".mp3"] : a.review ? ["ui/revision.mp3"] : ["consignes/" + l.id + ".mp3"];
      play(step === 0 ? nameAudio(p).concat(intro).concat(qa) : qa);
    }

    function finishGame() {
      if (a.review || a.arcade) {
        var gain = bonusFor(errors), dayKey = today(), nbJeux = Object.keys(p.bonus).filter(function (k) { return k.indexOf("jeu-" + dayKey) === 0; }).length;
        if (a.arcade && nbJeux >= 5) gain = 0;   // 5 jeux récompensés par jour, ensuite on joue pour le plaisir
        if (gain) p.bonus[(a.arcade ? "jeu-" : "rev-") + dayKey + "-" + Date.now()] = gain;
        checkTrophies(p);
        markToday(p); saveState(p); confetti(gain ? 160 : 60);
        var bigS = '<div class="big-stars" aria-label="' + gain + ' étoiles bonus">' + [0, 1, 2].map(function (i) { return '<span class="bstar' + (i < gain ? " on" : "") + '" style="animation-delay:' + (i * .25) + 's">★</span>'; }).join("") + "</div>";
        app.innerHTML = '<div class="result">' + mascot(gain ? "happy" : "think") + "<h1>" + (a.arcade ? "Fin du jeu !" : "Révisions terminées !") + "</h1>" + bigS + "<p class='hint'>" +
          (gain ? "Tu gagnes " + gain + " étoile" + (gain > 1 ? "s" : "") + " bonus" + (errors ? " (" + errors + " faute" + (errors > 1 ? "s" : "") + ")." : " : aucune faute !") : (a.arcade && nbJeux >= 5 ? "Tu as déjà gagné beaucoup d'étoiles en jouant aujourd'hui. Bravo !" : "Trop de fautes pour gagner une étoile. Réessaie !")) + " " +
          (a.review ? (Object.keys(p.errs).length ? "Il reste " + Object.keys(p.errs).length + " petite(s) erreur(s) à revoir." : "Toutes tes erreurs sont corrigées !") : "") +
          '</p><div class="actions column">' + (a.arcade ? '<button class="btn big wide focusable" type="button" id="again-arc">↻ Rejouer</button>' : "") +
          '<button class="btn ' + (a.arcade ? "secondary" : "big") + ' wide focusable" type="button" id="menu">Mon chemin</button></div></div>';
        var ag = document.getElementById("again-arc"); if (ag) ag.addEventListener("click", function () { startArcade(a.arcade, true); });
        if (a.arcade) { document.getElementById("menu").addEventListener("click", function (e) { e.stopImmediatePropagation(); resetTo("home"); }, true); }
        document.getElementById("menu").addEventListener("click", back);
        if (isTV) focusFirst();
        return play(gain ? ["ui/super-prenom.mp3"].concat(nameAudio(p)).concat(["ui/etoile.mp3"]) : nameAudio(p).concat(["ui/rate.mp3"]));
      }
      var stars = starsFor(errors);
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

  // ---- Parole au micro (téléphone / tablette) ----
  // Le modèle compare ce que l'enfant a dit à la bonne réponse ET à des réponses proches
  // (« ma » contre « mi », « mo », « la »…). Règles :
  //  - bonne réponse en tête ou à égalité → « Bien dit ! »
  //  - autre réponse nettement en tête → vraie correction : « J'ai entendu mi. Écoute : ma »
  //  - doute → « Je n'ai pas bien entendu » (jamais « faux » à tort)
  // Les sons isolés (« mmm ») ne sont pas jugés par la machine (pas assez fiable) :
  // l'enfant se réécoute à côté du modèle et un adulte valide.
  var LETTER_NAME_TXT = { a: "A", b: "B", c: "C", d: "D", e: "E", f: "F", g: "G", h: "H", i: "I", j: "J", k: "K", l: "L", m: "M",
    n: "N", o: "O", p: "P", q: "Q", r: "R", s: "S", t: "T", u: "U", v: "V", w: "W", x: "X", y: "Y", z: "Z" };
  function allItems(filter) {
    var out = [];
    allLessons.forEach(function (id) { lessonIndex[id].items.forEach(function (it) { if (filter(it)) out.push(it); }); });
    return out;
  }
  function phonKey(t) { return phonTokens(t).join(""); }
  function candidatesFor(it, l) {
    var target, pool = [];
    if (it.lettre_minuscule) {
      target = LETTER_NAME_TXT[it.lettre_minuscule];
      pool = l.items.filter(function (x) { return x.lettre_minuscule; }).map(function (x) { return LETTER_NAME_TXT[x.lettre_minuscule]; });
      if (pool.length < 4) pool = pool.concat(["A", "M", "L", "O", "S", "R"]);
    } else if (it.syllabe_tts) {
      target = it.affiche;
      var cons = target.replace(/[aeiouéy].*$/, ""), vow = target.slice(cons.length);
      pool = allItems(function (x) { return x.syllabe_tts; }).map(function (x) { return x.affiche; })
        .filter(function (x) { return x !== target && (x.indexOf(cons) === 0 || x.slice(-vow.length) === vow); });
    } else if (it.mot) {
      target = it.mot;
      pool = l.items.filter(function (x) { return x.mot; }).map(function (x) { return x.mot; })
        .concat(allItems(function (x) { return x.mot && x.mot[0] === it.mot[0]; }).map(function (x) { return x.mot; }));
    } else {
      target = it.phrase.replace(/[.!?]$/, "");
      pool = allItems(function (x) { return x.phrase; }).map(function (x) { return x.phrase.replace(/[.!?]$/, ""); });
    }
    var seen = {}, out = [target]; seen[phonKey(target)] = 1;
    shuffle(pool).forEach(function (x) { var k = phonKey(x); if (!seen[k] && out.length < 6) { seen[k] = 1; out.push(x); } });
    return out;
  }
  function audioForCandidate(text, it) {
    if (it.lettre_minuscule) { var L = text.toLowerCase(); return ["lettres/phrase-" + L + ".mp3"]; }
    if (it.syllabe_tts) { var sy = allItems(function (x) { return x.affiche === text; })[0]; return sy ? ["syllabes/" + sy.syllabe_tts + ".mp3"] : ["tts:" + text]; }
    if (it.mot) { var w = allItems(function (x) { return x.mot === text; })[0]; return w ? ["mots/" + w.mot + ".mp3"] : ["tts:" + text]; }
    var ph = allItems(function (x) { return x.phrase && x.phrase.replace(/[.!?]$/, "") === text; })[0];
    return ph ? itemAudio(ph, ph._lid, ph._idx) : ["tts:" + text];
  }
  function judge(scores) {
    var t = scores[0], bestOther = -Infinity, bi = -1;
    for (var i = 1; i < scores.length; i++) if (scores[i] > bestOther) { bestOther = scores[i]; bi = i; }
    // Seuils calculés sur des mesures : aucune bonne réponse n'a été corrigée à tort.
    if (t - bestOther >= 1.0) return { verdict: "ok" };
    if (bestOther - t >= 3.2 && bestOther > -4.5) return { verdict: "autre", index: bi };
    return { verdict: "doute" };
  }
  window.__lplJudge = judge;
  window.__lplTest = { candidatesFor: candidatesFor, judge: judge, lesson: function (id) { return lessonIndex[id]; } };
  function speakPrompt(it) {
    if (it.lettre_minuscule) return "ui/q-lettre-nom.mp3";
    if (it.syllabe_tts) return "ui/q-syllabe.mp3";
    if (it.mot) return "ui/q-mot.mp3";
    return "ui/q-phrase.mp3";
  }
  function speakDisplay(it) {
    if (it.lettre_minuscule) return '<div class="target big">' + esc(it.lettre_majuscule) + " " + esc(it.lettre_minuscule) + "</div>";
    if (it.syllabe_tts) return '<div class="target big">' + esc(it.affiche) + "</div>";
    if (it.mot) return '<div class="target">' + (it.illustration ? '<span class="emoji" aria-hidden="true">' + it.illustration + "</span> " : "") + esc(it.mot) + "</div>";
    return '<div class="target phrase">' + esc(it.phrase) + "</div>";
  }

  SCREENS.speak = function (a) {
    var l = findLesson(a.id), p = profile();
    setTop("À toi de parler", true);
    var items = shuffle(l.items.filter(function (x) { return x.lettre_minuscule !== "h"; })).slice(0, Math.min(3, l.items.length));
    var k = 0, alive = true, ctrl = null, tries = 0;
    leaveHook = function () { alive = false; if (ctrl) ctrl.abort(); voice().then(function (V) { V.releaseMic(); }).catch(function () {}); };
    function done() { go("result", { id: l.id, stars: a.stars, errors: a.errors }, true); }
    function fb(cls, html) { var f = document.getElementById("fb"); if (f) { f.className = "footer-feedback show " + cls; f.innerHTML = html; } }
    function setState(st, txt) {
      var m = document.getElementById("mic"), h = document.getElementById("mic-hint");
      if (m) { m.classList.toggle("listening", st === "listening"); m.classList.toggle("thinking", st === "thinking"); m.disabled = st !== "idle"; }
      if (h) h.textContent = txt;
    }
    function actions(html) { var b = document.getElementById("speak-actions"); if (b) b.innerHTML = html; return b; }

    function showItem() {
      if (!alive) return;
      tries = 0;
      var it = items[k], idx = l.items.indexOf(it);
      app.innerHTML = '<div class="speak"><div class="progressbar"><span style="width:' + Math.max(4, k / items.length * 100) + '%"></span></div>' +
        bubble(it.lettre_minuscule ? p.name + ", c'est quoi cette lettre ?" : p.name + ", à toi de le dire !", "happy") + speakDisplay(it) +
        '<button class="btn secondary focusable" type="button" id="model">🔊 Écouter</button>' +
        '<div class="mic-wrap"><span class="mic-level" id="mic-level"></span><button class="mic focusable" type="button" id="mic" aria-label="Appuie et parle"><span class="mic-ico" aria-hidden="true">🎤</span></button></div>' +
        '<p class="hint" id="mic-hint">Appuie sur le micro, puis parle.</p><div class="speak-actions" id="speak-actions"></div>' +
        '<div class="actions center"><button class="btn ghost focusable" type="button" id="skip">Passer</button></div></div>' +
        '<div class="footer-feedback" id="fb" aria-live="assertive"></div>';
      document.getElementById("model").addEventListener("click", function () { play(itemAudio(it, l.id, idx)); });
      document.getElementById("mic").addEventListener("click", function () { listen(it, idx); });
      document.getElementById("skip").addEventListener("click", nextItem);
      play(nameAudio(p).concat([speakPrompt(it)]).concat(it.lettre_minuscule ? [] : itemAudio(it, l.id, idx)).concat(["ui/a-toi-micro.mp3"]));
    }
    function nextItem() { if (ctrl) ctrl.abort(); k++; if (k >= items.length) done(); else showItem(); }

    function listen(it, idx) {
      stopAudio();
      voice().then(function (V) {
        setState("listening", "Je t'écoute…");
        var lvl = document.getElementById("mic-level");
        ctrl = new AbortController();
        return V.record({ signal: ctrl.signal, onLevel: function (x) { if (lvl) lvl.style.transform = "scale(" + (1 + x * 0.9) + ")"; } }).then(function (r) {
          if (!alive) return;
          if (lvl) lvl.style.transform = "scale(1)";
          if (!r.speech) { setState("idle", "Je n'ai rien entendu. Appuie et parle bien fort."); fb("info", "<strong>Je n'ai rien entendu.</strong>"); play("ui/pas-entendu.mp3"); return; }
          setState("thinking", "Je réfléchis…");
          var cands = candidatesFor(it, l);
          return V.score(r.audio, cands).then(function (scores) {
            if (!alive) return;
            var j = judge(scores);
            tries++;
            if (j.verdict === "ok") return success(it, idx, r.audio);
            if (j.verdict === "autre") return correct(it, idx, cands[j.index], r.audio);
            notSure(it, idx, r.audio);
          });
        });
      }).catch(function (e) {
        setState("idle", "Le micro n'est pas autorisé. Autorise-le dans les réglages, ou un adulte peut valider.");
        actions('<button class="btn focusable" type="button" id="adult">✓ Un adulte valide</button>');
        document.getElementById("adult").addEventListener("click", function () { success(it, idx, null); });
      });
    }
    function success(it, idx, audio) {
      if (!alive) return;
      p.spoke = true; saveState(p);
      setState("idle", "Bravo !"); actions("");
      fb("good", "<strong>Bien dit, " + esc(p.name) + " !</strong>");
      confetti(60);
      if (it.lettre_minuscule) return play(["ui/bien-dit.mp3"], function () { soundStep(it, idx); });
      play(["ui/bien-dit.mp3"], function () { setTimeout(nextItem, 350); });
    }
    function correct(it, idx, heard, audio) {
      if (!alive) return;
      setState("idle", "Écoute bien, puis réessaie.");
      fb("bad", "<strong>J'ai entendu « " + esc(heard) + " ». On dit « " + esc(it.lettre_minuscule ? it.lettre_majuscule : (it.affiche || it.mot || it.phrase)) + " ».</strong>");
      var b = actions('<button class="btn secondary focusable" type="button" id="me">🔁 Ma voix</button><button class="btn focusable" type="button" id="adult">✓ Un adulte valide</button>');
      document.getElementById("me").addEventListener("click", function () { voice().then(function (V) { V.playBack(audio); }); });
      document.getElementById("adult").addEventListener("click", function () { success(it, idx, null); });
      play(["ui/jai-entendu.mp3"].concat(audioForCandidate(heard, it)).concat(["ui/ecoute-bien.mp3"]).concat(itemAudio(it, l.id, idx)).concat(["ui/reessaie.mp3"]));
    }
    function notSure(it, idx, audio) {
      if (!alive) return;
      setState("idle", "Appuie sur le micro et parle bien fort.");
      fb("info", "<strong>Je n'ai pas bien entendu.</strong>");
      actions('<button class="btn secondary focusable" type="button" id="me">🔁 Ma voix</button><button class="btn focusable" type="button" id="adult">✓ Un adulte valide</button>');
      document.getElementById("me").addEventListener("click", function () { voice().then(function (V) { V.playBack(audio); }); });
      document.getElementById("adult").addEventListener("click", function () { success(it, idx, null); });
      play(["ui/pas-entendu.mp3"]);
    }
    // Son de la lettre : l'enfant répète, se réécoute à côté du modèle, un adulte valide.
    function soundStep(it, idx) {
      if (!alive) return;
      var son = ["lettres/question-" + it.lettre_minuscule + ".mp3"];
      setState("idle", "Maintenant le son : écoute, puis répète.");
      fb("info", "<strong>Et le son de la lettre ?</strong>");
      var b = actions('<button class="btn secondary focusable" type="button" id="hear-son">🔊 Le son</button>');
      document.getElementById("hear-son").addEventListener("click", function () { play(son); });
      var mic = document.getElementById("mic");
      var fresh = mic.cloneNode(true); mic.parentNode.replaceChild(fresh, mic);
      fresh.addEventListener("click", function () {
        stopAudio();
        voice().then(function (V) {
          setState("listening", "Je t'écoute…");
          ctrl = new AbortController();
          return V.record({ signal: ctrl.signal, maxMs: 3000, silenceMs: 700 }).then(function (r) {
            if (!alive) return;
            setState("idle", "Écoute ta voix et le modèle.");
            var bb = actions('<button class="btn secondary focusable" type="button" id="me">🔁 Ma voix</button><button class="btn secondary focusable" type="button" id="hear-son2">🔊 Le modèle</button><button class="btn focusable" type="button" id="same">✓ C\'est pareil</button>');
            document.getElementById("me").addEventListener("click", function () { V.playBack(r.audio); });
            document.getElementById("hear-son2").addEventListener("click", function () { play(son); });
            document.getElementById("same").addEventListener("click", function () { fb("good", "<strong>Super !</strong>"); play(["ui/super.mp3"], function () { setTimeout(nextItem, 300); }); });
            V.playBack(r.audio).then(function () { if (alive) play(son); });
          });
        }).catch(function () { setState("idle", "Le micro n'est pas autorisé."); });
      });
      play(son.concat(["ui/repete.mp3"]));
    }

    app.innerHTML = '<div class="speak intro">' + bubble("Maintenant, à toi de parler !", "happy") +
      '<button class="btn big wide focusable" type="button" id="go-speak">🎤 C\'est parti</button>' +
      '<div class="loader" id="loader" hidden><span class="loader-bar"><span id="loader-fill"></span></span><span id="loader-txt">Préparation du micro…</span></div>' +
      '<div class="actions center"><button class="btn ghost focusable" type="button" id="skip-all">Plus tard</button></div></div>';
    document.getElementById("skip-all").addEventListener("click", done);
    document.getElementById("go-speak").addEventListener("click", function () {
      var btn = this; btn.disabled = true;
      var ld = document.getElementById("loader"); ld.hidden = false;
      voice().then(function (V) {
        return V.warmup(function (x) { var f = document.getElementById("loader-fill"), t = document.getElementById("loader-txt"); if (f) f.style.width = Math.round(x * 100) + "%"; if (t) t.textContent = "Préparation du micro… " + Math.round(x * 100) + " %"; });
      }).then(function () { if (alive) showItem(); })
        .catch(function () { if (!alive) return; ld.hidden = true; btn.disabled = false; toast("Le micro n'a pas pu se préparer. Vérifie la connexion."); });
    });
    play(nameAudio(p).concat(["ui/parlons.mp3"]));
    // Préchargement discret du modèle pendant que l'enfant écoute la consigne
    voice().then(function (V) { V.warmup(); }).catch(function () {});
  };

  // ---- Résultat : étoiles, confettis, trophées, leçon suivante ----
  SCREENS.result = function (a) {
    var l = findLesson(a.id), p = profile();
    setTop(l.titre, true);
    var reussi = a.stars >= 1;
    var fresh = reussi ? checkTrophies(p) : [];
    if (fresh.length) saveState(p);
    var next = nextLesson(l.id), nextL = next && findLesson(next);
    var starsHtml = '<div class="big-stars" aria-label="' + a.stars + ' étoiles sur 3">' +
      [0, 1, 2].map(function (i) { return '<span class="bstar' + (i < a.stars ? " on" : "") + '" style="animation-delay:' + (i * .25) + 's">★</span>'; }).join("") + "</div>";
    var html;
    if (reussi) {
      html = '<div class="result">' + mascot("happy") + "<h1>Super " + esc(p.name) + " !</h1>" + starsHtml +
        "<p class='hint'>" + (a.stars === 3 ? "Sans aucune faute : tu gagnes les 3 étoiles !" :
          "Tu as fait " + a.errors + " erreur" + (a.errors > 1 ? "s" : "") + " : tu gagnes " + a.stars + " étoile" + (a.stars > 1 ? "s" : "") + " et tu passes à la suite. Rejoue sans faute pour avoir les 3 étoiles !") + "</p>";
      fresh.forEach(function (t) {
        html += '<div class="trophy-won"><span class="trophy-ico" aria-hidden="true">' + t.ico + '</span><div><strong>Nouveau trophée : ' + esc(t.titre) + "</strong><span>" + esc(t.desc) + "</span></div></div>";
      });
      html += '<div class="actions column">' + (next ? '<button class="btn big wide focusable" type="button" id="next">Leçon suivante<span class="btn-sub">' + esc(nextL.titre) + "</span></button>" : "") +
        '<button class="btn secondary wide focusable" type="button" id="again">Rejouer</button>' +
        '<button class="btn secondary wide focusable" type="button" id="menu">Mon chemin</button></div></div>';
    } else {
      // Des erreurs : pas d'étoile. On le dit clairement, puis on encourage à recommencer.
      html = '<div class="result">' + mascot("think") + "<h1>Pas encore, " + esc(p.name) + " !</h1>" + starsHtml +
        "<p class='hint'>Tu as fait " + a.errors + " erreurs. C'est un peu trop : pas d'étoile cette fois. " +
        "Pour passer à la suite, il faut 4 erreurs au maximum. Écoute bien et recommence !</p>" +
        '<div class="actions column"><button class="btn big wide focusable" type="button" id="again">↻ Recommencer</button>' +
        '<button class="btn secondary wide focusable" type="button" id="review-lesson">Revoir les cartes</button>' +
        '<button class="btn secondary wide focusable" type="button" id="menu">Mon chemin</button></div></div>';
    }
    app.innerHTML = html;
    var nb0 = document.getElementById("next");
    if (nb0) nb0.addEventListener("click", function () { go("discover", { id: next }, true); });
    document.getElementById("again").addEventListener("click", function () { go("game", { id: l.id }, true); });
    var rl = document.getElementById("review-lesson");
    if (rl) rl.addEventListener("click", function () { go("discover", { id: l.id }, true); });
    document.getElementById("menu").addEventListener("click", back);
    var voice;
    if (reussi) {
      confetti(fresh.length ? 200 : 140);
      voice = ["ui/super-prenom.mp3"].concat(nameAudio(p)).concat(["ui/fin.mp3", "ui/etoile.mp3"]);
      if (fresh.length) voice.push("ui/trophee.mp3");
      if (timeUp(p)) {
        if (onceToday(p, "pause")) voice.push("ui/pause.mp3");
        var nb = document.getElementById("next"); if (nb) nb.outerHTML = '<div class="time-left">⏱ Temps de jeu terminé pour aujourd\'hui. À demain !</div>';
      } else if (next) voice.push("ui/prochaine.mp3");
    } else {
      voice = nameAudio(p).concat(["ui/rate.mp3"]);
      if (timeUp(p) && onceToday(p, "pause")) voice.push("ui/pause.mp3");
    }
    play(voice);
  };

  // ---- Mes progrès ----
  SCREENS.progress = function () {
    var p = profile();
    setTop("Mes progrès", true);
    var reussies = allLessons.filter(function (id) { return (p.stars[id] || 0) >= 1; }).length;
    var lettres = 0;
    allLessons.forEach(function (id) { var l = lessonIndex[id]; if ((p.stars[id] || 0) >= 1) lettres += l.items.filter(function (x) { return x.lettre_minuscule; }).length; });
    var jours = p.days.length, serie = streak(p), aReviser = Object.keys(p.errs).length;
    var html = bubble(reussies ? "Regarde tout ce que tu as appris !" : "Fais ta première leçon pour voir tes progrès !", "happy") +
      '<div class="stats">' +
      '<div class="stat focusable" tabindex="0"><span class="stat-ico" aria-hidden="true">✅</span><strong>' + reussies + " / " + allLessons.length + "</strong><span>leçons réussies</span></div>" +
      '<div class="stat focusable" tabindex="0"><span class="stat-ico" aria-hidden="true">🔤</span><strong>' + lettres + " / 26</strong><span>lettres connues</span></div>" +
      '<div class="stat focusable" tabindex="0"><span class="stat-ico" aria-hidden="true">⭐</span><strong>' + totalStars(p) + "</strong><span>étoiles gagnées</span></div>" +
      '<div class="stat focusable" tabindex="0"><span class="stat-ico" aria-hidden="true">🔥</span><strong>' + serie + "</strong><span>jour" + (serie > 1 ? "s" : "") + " de suite</span></div>" +
      '<div class="stat focusable" tabindex="0"><span class="stat-ico" aria-hidden="true">📅</span><strong>' + jours + "</strong><span>jour" + (jours > 1 ? "s" : "") + " de lecture</span></div>" +
      '<div class="stat focusable" tabindex="0"><span class="stat-ico" aria-hidden="true">🔁</span><strong>' + aReviser + "</strong><span>à réviser</span></div></div><h2>Mes étapes</h2><div class='steps-progress'>";
    cours.modules.forEach(function (m, mi) {
      var ok = m.lecons.filter(function (l) { return (p.stars[l.id] || 0) >= 1; }).length;
      html += '<div tabindex="0" class="step-row focusable unit-' + (mi % 4) + '"><span class="step-name">Étape ' + (mi + 1) + " · " + esc(m.titre) + '</span><span class="step-bar"><span style="width:' + (ok / m.lecons.length * 100) + '%"></span></span><span class="step-count">' + ok + "/" + m.lecons.length + "</span></div>";
    });
    app.innerHTML = html + "</div>";
  };

  // ---- Cadeaux choisis par les parents ----
  SCREENS.gifts = function () {
    var p = profile();
    setTop("Mes cadeaux", true);
    var left = starsLeft(p);
    var CATS = [["appli", "🎮 Dans l'appli", ["chanson", "livre", "minutes5"]], ["calins", "🤗 Câlins et petits plaisirs", ["calin", "bisou", "autocollant"]],
      ["maison", "🏠 À la maison", ["histoire", "dessin-anime", "jeu", "glace", "dessert", "cuisine"]], ["sorties", "🌳 Les sorties", ["parc", "cinema"]]];
    var known = {}; CATS.forEach(function (c) { c[2].forEach(function (id) { known[id] = c[0]; }); });
    var next = p.rewards.filter(function (r) { return r.cout > left; }).sort(function (x, y) { return x.cout - y.cout; })[0];
    var html = bubble(left ? "Tu as " + left + " étoile" + (left > 1 ? "s" : "") + " à dépenser !" : "Gagne des étoiles pour choisir un cadeau !", "happy") +
      '<div class="wallet"><span class="wallet-star" aria-hidden="true">★</span><strong>' + left + "</strong><span>étoiles</span>" +
      (next ? '<span class="wallet-next">Prochain cadeau : ' + esc(next.ico || "🎁") + " " + esc(next.titre) + " · plus que " + (next.cout - left) + " ★</span>" : "") + "</div>";
    CATS.concat([["perso", "💝 Cadeaux de papa et maman", null]]).forEach(function (c) {
      var list = p.rewards.filter(function (r) { return c[2] ? known[r.id] === c[0] : !known[r.id]; });
      if (!list.length) return;
      html += "<h2 class='gift-cat'>" + c[1] + "</h2><div class=\"gifts\">";
      list.forEach(function (r) {
        var ok = left >= r.cout;
        html += '<button class="gift focusable' + (ok ? " ready" : "") + '" type="button" data-id="' + esc(r.id) + '"' + (ok ? "" : ' aria-disabled="true"') + '>' +
          '<span class="gift-ico" aria-hidden="true">' + esc(r.ico || "🎁") + '</span><strong>' + esc(r.titre) + '</strong>' +
          (r.action ? '<span class="gift-tag">Dans l\'appli</span>' : "") +
          '<span class="gift-cost"><span class="star-ico" aria-hidden="true">★</span> ' + r.cout + "</span>" +
          (ok ? '<span class="gift-ok">Je peux le prendre !</span>' : '<span class="gift-bar"><span style="width:' + Math.min(100, left / r.cout * 100) + '%"></span></span><span class="gift-left">Encore ' + (r.cout - left) + " ★</span>") + "</button>";
      });
      html += "</div>";
    });
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
        if (r.action === "temps") p.usage[today()] = Math.max(0, usedToday(p) - 300);
        saveState(p); confetti(200);
        if (r.action === "chanson") return go("song");
        if (r.action === "livre") return go("book");
        render(); play(nameAudio(p).concat(["ui/cadeau.mp3"]));
        if (r.action === "temps") toast("5 minutes de plus pour aujourd'hui !");
      });
    });
    play("ui/cadeaux.mp3");
  };

  // ---- Cadeau : la chanson de l'alphabet ----
  // Air traditionnel « Ah ! vous dirai-je, maman » (1761, domaine public). La voix dit chaque lettre sur la musique ;
  // la lettre s'allume d'après la position réelle de la musique, donc toujours en rythme.
  var SONG_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
  var SONG_TIMES = [1.24, 1.86, 2.48, 3.1, 3.72, 4.34, 4.96, 6.2, 6.82, 7.44, 8.06, 8.68, 8.99, 9.3, 9.61, 9.92, 11.16, 11.78, 12.4, 13.64, 14.26, 14.88, 16.12, 16.74, 17.36, 18.6];
  var songAudio = null, songRaf = 0;
  SCREENS.song = function () {
    var p = profile();
    setTop("La chanson", true);
    var html = bubble("Chante avec moi, " + esc(p.name) + " ! Suis la lettre qui s'allume.", "happy") + '<div class="song-grid">';
    SONG_LETTERS.forEach(function (L, i) { html += '<span class="song-l" data-i="' + i + '">' + L.toUpperCase() + "</span>"; });
    html += '</div><div class="actions center"><button class="btn big focusable" type="button" id="sing">🎵 Chanter</button></div>';
    app.innerHTML = html;
    var btn = document.getElementById("sing"), cells = app.querySelectorAll(".song-l");
    btn.addEventListener("click", function () {
      stopSong(); stopAudio();
      songAudio = new Audio(AUDIO_BASE + "chanson/alphabet.mp3" + Q);
      cells.forEach(function (c) { c.classList.remove("on", "done"); });
      btn.textContent = "🎵 On chante…";
      var last = -1;
      (function tick() {
        if (!songAudio) return;
        var t = songAudio.currentTime, cur = -1;
        for (var k = 0; k < SONG_TIMES.length; k++) if (t >= SONG_TIMES[k] - 0.03) cur = k;
        if (cur !== last) {
          if (last >= 0 && cells[last]) cells[last].classList.remove("on");
          if (cur >= 0 && cells[cur]) cells[cur].classList.add("on", "done");
          last = cur;
        }
        songRaf = requestAnimationFrame(tick);
      })();
      songAudio.onended = function () {
        cancelAnimationFrame(songRaf);
        cells.forEach(function (c) { c.classList.remove("on"); });
        if (!p.sang) { p.sang = true; saveState(p); checkTrophies(p); }
        confetti(120); toast("Bravo, tu connais l'alphabet !");
        btn.textContent = "🎵 Encore une fois";
        songAudio = null;
      };
      songAudio.play().catch(function () { btn.textContent = "🎵 Chanter"; });
    });
    leaveHook = stopSong;
    focusFirst("#sing");
  };
  function stopSong() {
    cancelAnimationFrame(songRaf);
    if (songAudio) { try { songAudio.pause(); } catch (e) {} songAudio = null; }
  }

  // ---- Cadeau : une histoire racontée (histoires originales de 10 pages, voix vérifiée) ----
  var HISTOIRES = null;
  function loadStories(cb) {
    if (HISTOIRES) return cb(HISTOIRES);
    fetch("../contenu/histoires.json" + Q).then(function (r) { return r.json(); }).then(function (d) { HISTOIRES = d.histoires; cb(HISTOIRES); })
      .catch(function () { toast("Les histoires ne sont pas disponibles pour le moment."); back(); });
  }
  SCREENS.book = function (args) {
    var p = profile();
    loadStories(function (stories) {
      if (stack[stack.length - 1].screen !== "book") return;
      if (!args.id) {
        setTop("Le livre", true);
        var html = bubble("Choisis une histoire, je te la raconte !", "happy") + '<div class="gifts">';
        stories.forEach(function (h) {
          html += '<button class="gift ready focusable" type="button" data-id="' + h.id + '"><span class="gift-ico" aria-hidden="true">' + h.icone + "</span><strong>" + esc(h.titre) + "</strong><span class='gift-tag'>" + h.pages.length + " pages</span></button>";
        });
        app.innerHTML = html + "</div>";
        app.querySelectorAll(".gift").forEach(function (b) { b.addEventListener("click", function () { go("book", { id: b.dataset.id, page: 0 }); }); });
        play(["ui/cadeaux.mp3"].slice(0, 0));
        return focusFirst(".gift");
      }
      var h = stories.filter(function (x) { return x.id === args.id; })[0], page = args.page || 0, pg = h.pages[page];
      setTop(h.titre, true);
      app.innerHTML = '<div class="book-page"><span class="book-pic" aria-hidden="true">' + pg[1] + '</span><p class="book-text">' + esc(pg[0]) + "</p>" +
        '<div class="book-dots" aria-hidden="true">' + h.pages.map(function (_, k) { return '<span class="' + (k <= page ? "on" : "") + '"></span>'; }).join("") + "</div>" +
        '<p class="hint">Page ' + (page + 1) + " / " + h.pages.length + '</p></div><div class="actions center">' +
        (page ? '<button class="btn secondary focusable" type="button" id="prev-page">◀</button>' : "") +
        '<button class="btn secondary focusable" type="button" id="again">🔊 Réécouter</button>' +
        '<button class="btn focusable" type="button" id="next-page">' + (page + 1 < h.pages.length ? "Page suivante ▶" : "Fin de l'histoire ✓") + "</button></div>";
      var aud = (page === 0 ? ["histoires/" + h.id + "-titre.mp3"] : []).concat(["histoires/" + h.id + "-" + (page + 1) + ".mp3"]);
      document.getElementById("again").addEventListener("click", function () { play(["histoires/" + h.id + "-" + (page + 1) + ".mp3"]); });
      var pv = document.getElementById("prev-page"); if (pv) pv.addEventListener("click", function () { go("book", { id: h.id, page: page - 1 }, true); });
      document.getElementById("next-page").addEventListener("click", function () {
        if (page + 1 < h.pages.length) return go("book", { id: h.id, page: page + 1 }, true);
        if (!p.book) { p.book = true; saveState(p); checkTrophies(p); }
        confetti(140); back();
      });
      play(aud);
      focusFirst("#next-page");
    });
  };

  SCREENS.pause = function () {
    var p = profile();
    setTop("C'est la pause", true);
    app.innerHTML = '<div class="result">' + mascot("happy") + "<h1>Bravo " + esc(p.name) + " !</h1><p class='hint'>Tu as bien travaillé aujourd'hui. On se retrouve demain pour la suite !</p>" +
      '<div class="actions column">' + (Object.keys(p.errs).length ? '<button class="btn wide focusable" type="button" id="rev2">🔁 Faire mes révisions (sans limite)</button>' : "") + '<button class="btn secondary wide focusable" type="button" id="gifts2">🎁 Voir mes cadeaux</button><button class="btn secondary wide focusable" type="button" id="menu">Mon chemin</button></div></div>';
    document.getElementById("gifts2").addEventListener("click", function () { go("gifts", {}, true); });
    var r2 = document.getElementById("rev2"); if (r2) r2.addEventListener("click", function () { if (reviewLesson(p)) go("game", { id: "REV", review: true }, true); });
    document.getElementById("menu").addEventListener("click", back);
    if (onceToday(p, "pause")) play(nameAudio(p).concat(["ui/pause.mp3"]));
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

  SCREENS.parents = function (args) {
    setTop("Espace parents", true);
    var tab = args.tab || "suivi";
    var TABS = [["suivi", "📊 Suivi"], ["cadeaux", "🎁 Cadeaux"], ["appareils", "🔄 Appareils"]];
    var html = '<div class="ptabs" role="tablist">' + TABS.map(function (t) {
      return '<button type="button" role="tab" class="ptab focusable" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + "</button>";
    }).join("") + "</div>";
    if (tab === "appareils") {
    html += "<section class='card-panel'><h2>Continuer sur un autre appareil</h2>";
    if (state.code) {
      html += "<p>Code famille :</p><p class='family-code'>" + fmtCode(state.code) + "</p>" +
        "<p class='hint'>Sur la TV ou un autre téléphone : Espace parents → Appareils → « J'ai déjà un code ». La synchronisation est automatique : après chaque réponse, chaque leçon et chaque cadeau, et toutes les minutes. Le petit nuage ☁ en haut indique son état (vert = à jour).</p>" +
        '<div class="actions"><button class="btn secondary focusable" type="button" id="sync-now">Synchroniser maintenant</button><button class="btn ghost focusable" type="button" id="unlink">Délier cet appareil</button></div>';
    } else {
      html += "<p class='hint'>Créez un code famille sur un premier appareil, puis entrez-le sur les autres. Seuls le prénom, l'âge, l'animal et les progrès sont enregistrés.</p>" +
        '<div class="actions"><button class="btn focusable" type="button" id="create-code">Créer un code famille</button></div>' +
        '<form class="form" id="join" autocomplete="off"><label for="code-in">J\'ai déjà un code</label>' +
        '<input id="code-in" class="focusable" type="text" inputmode="numeric" pattern="[0-9 ]*" maxlength="14" placeholder="0000 0000 0000">' +
        '<button class="btn secondary focusable" type="submit">Relier cet appareil</button></form>';
    }
    html += "</section>";
    }
    var list = tab === "appareils" ? [] : liveProfiles();
    if (tab !== "appareils" && !list.length) html += "<p class='hint'>Aucun profil pour le moment.</p>";
    list.forEach(function (pp) {
      var cur = pp.resume && findLesson(pp.resume.id);
      html += '<section class="card-panel"><h3>' + pp.avatar + " " + esc(pp.name) + (pp.age ? " · " + pp.age + " ans" : "") + "</h3>";
      if (tab === "cadeaux") {
        html += '<div class="offer"><span class="label">🎁 Offrir un cadeau surprise à ' + esc(pp.name) + "</span>" +
          '<form class="form offer-form" data-pid="' + esc(pp.id) + '" autocomplete="off"><input type="text" class="focusable" maxlength="60" placeholder="Ex. : une sortie à la piscine" aria-label="Cadeau à offrir">' +
          '<div class="ages">' + ["🎁", "🍦", "🧸", "🎈", "🍫", "🎨", "⚽", "🎬"].map(function (e, i) { return '<button type="button" class="pick focusable of-ico" data-ico="' + e + '" aria-pressed="' + (i === 0) + '">' + e + "</button>"; }).join("") +
          '</div><button class="btn focusable" type="submit">Offrir ce cadeau</button></form>' +
          '<div class="actions"><button class="btn secondary focusable" type="button" data-givestars="3" data-pid="' + esc(pp.id) + '">Offrir 3 ★</button><button class="btn secondary focusable" type="button" data-givestars="5" data-pid="' + esc(pp.id) + '">Offrir 5 ★</button></div>' +
          "<p class='hint'>" + esc(pp.name) + " le découvrira en ouvrant l'appli, avec des confettis.</p></div>";
        html += '<span class="label">Cadeaux (coût en étoiles) · ★ ' + starsLeft(pp) + " disponibles</span><ul class=\"reward-list\">" +
        pp.rewards.map(function (r) { return "<li><span>" + esc(r.ico || "🎁") + " " + esc(r.titre) + " · ★ " + r.cout + '</span><button class="btn ghost focusable" type="button" data-delrw="' + esc(r.id) + '" data-pid="' + esc(pp.id) + '">Retirer</button></li>'; }).join("") +
        '</ul><form class="form reward-form" data-pid="' + esc(pp.id) + '" autocomplete="off"><input type="text" class="focusable" maxlength="50" placeholder="Nouveau cadeau, ex. : choisir le film" aria-label="Nouveau cadeau">' +
        '<div class="ages">' + [5, 10, 20, 30].map(function (c, i) { return '<button type="button" class="pick focusable rw-cost" data-cost="' + c + '" aria-pressed="' + (i === 1) + '">★ ' + c + "</button>"; }).join("") +
        '</div><button class="btn secondary focusable" type="submit">Ajouter le cadeau</button></form>' +
        (pp.claimed.length ? "<span class='label'>Derniers cadeaux pris</span><ul class='claimed'>" + pp.claimed.slice(-6).reverse().map(function (c) { return "<li>" + esc(c.ico || "🎁") + " " + esc(c.titre) + " · " + new Date(c.t).toLocaleDateString("fr-FR") + "</li>"; }).join("") + "</ul>" : "") + "</section>";
        return;
      }
      html +=
        "<p class='hint'>★ " + totalStars(pp) + " étoiles · 🏆 " + Object.keys(pp.trophies).length + " trophées · 🔥 " + streak(pp) + " jour(s) de suite · ⏱ " + Math.round(usedToday(pp) / 60) + " min aujourd'hui" + (cur ? " · Leçon en cours : " + esc(cur.titre) : "") + "</p>" +
        '<span class="label">📚 Temps des leçons par jour</span><div class="ages" role="group" aria-label="Temps des leçons par jour">' +
        LIMITS.map(function (m) { return '<button type="button" class="pick focusable" data-limit="' + m + '" data-pid="' + esc(pp.id) + '" aria-pressed="' + (pp.limit === m) + '">' + (m ? m + " min" : "Illimité") + "</button>"; }).join("") + "</div>" +
        '<span class="label">🎮 Temps des jeux par jour (en plus des leçons)</span><div class="ages" role="group" aria-label="Temps des jeux par jour">' +
        [0, 10, 20, 30].map(function (m) { return '<button type="button" class="pick focusable" data-glimit="' + m + '" data-pid="' + esc(pp.id) + '" aria-pressed="' + (pp.gameLimit === m) + '">' + (m ? m + " min" : "Illimité") + "</button>"; }).join("") + "</div>" +
        "<p class='hint'>Total possible aujourd'hui : " + (pp.limit && pp.gameLimit ? (pp.limit + pp.gameLimit) + " min" : "illimité") + " · jeux utilisés : " + Math.round(gameUsed(pp) / 60) + " min. Les révisions restent toujours possibles.</p>" +
        (timeUp(pp) ? '<div class="actions"><button class="btn secondary focusable" type="button" data-extra="' + esc(pp.id) + '">+10 minutes aujourd\'hui</button></div>' : "") +
        '<div class="table-wrap"><table class="parent-table"><thead><tr><th>Leçon</th><th>Étoiles</th></tr></thead><tbody>';
      allLessons.forEach(function (id) { html += "<tr><td>" + id + " · " + esc(findLesson(id).titre) + "</td><td>" + starsText(pp.stars[id] || 0, 3) + "</td></tr>"; });
      html += '</tbody></table></div><div class="actions"><button class="btn secondary focusable" type="button" data-resetgames="' + esc(pp.id) + '">Remettre les jeux au niveau 1</button><button class="btn secondary focusable" type="button" data-reset="' + esc(pp.id) + '">Remettre à zéro</button><button class="btn danger focusable" type="button" data-del="' + esc(pp.id) + '">Supprimer le profil</button></div></section>';
    });
    if (tab === "appareils") html += "<h2>À savoir</h2><p class='hint'>Aucune publicité, aucun achat, aucun micro. Les progrès restent sur l'appareil (et sur votre code famille si vous l'avez créé).</p>";
    app.innerHTML = html;
    app.querySelectorAll(".ptab").forEach(function (b) { b.addEventListener("click", function () { go("parents", { tab: b.dataset.tab }, true); }); });

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
    app.querySelectorAll(".offer-form").forEach(function (f) {
      f.querySelectorAll(".of-ico").forEach(function (b) { b.addEventListener("click", function () { f.querySelectorAll(".of-ico").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); }); });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var t = f.querySelector("input").value.trim().slice(0, 60);
        if (!t) { toast("Écrivez le cadeau à offrir."); return; }
        var pp = pById(f.dataset.pid), ico = (f.querySelector('.of-ico[aria-pressed="true"]') || {}).dataset.ico || "🎁";
        pp.gifted = pp.gifted || []; pp.gifted.push({ id: "g" + Date.now().toString(36), titre: t, ico: ico, t: Date.now(), opened: false });
        saveState(pp); toast("Cadeau offert ! " + pp.name + " le verra à l'accueil."); render();
      });
    });
    app.querySelectorAll("[data-givestars]").forEach(function (b) {
      b.addEventListener("click", function () {
        var pp = pById(b.dataset.pid), n = +b.dataset.givestars;
        pp.bonus["parent-" + Date.now()] = n; pp.gifted = pp.gifted || [];
        pp.gifted.push({ id: "s" + Date.now().toString(36), titre: n + " étoiles de la part de papa ou maman", ico: "⭐", t: Date.now(), opened: false });
        saveState(pp); toast(n + " étoiles offertes !"); render();
      });
    });
    app.querySelectorAll("[data-resetgames]").forEach(function (b) {
      b.addEventListener("click", function () { var pp = pById(b.dataset.resetgames); pp.gameLevels = {}; saveState(pp); toast("Niveaux des jeux remis au niveau 1."); render(); });
    });
    app.querySelectorAll("[data-glimit]").forEach(function (b) {
      b.addEventListener("click", function () { var pp = pById(b.dataset.pid); pp.gameLimit = +b.dataset.glimit; saveState(pp); render(); });
    });
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
      l.limit = newer.limit; l.gameLimit = newer.gameLimit;
      var gf = {}; [l, r].forEach(function (s) { (s.gifted || []).forEach(function (g) { var o = gf[g.id]; gf[g.id] = o ? { id: g.id, titre: g.titre, ico: g.ico, t: g.t, opened: o.opened || g.opened } : g; }); });
      l.gifted = Object.keys(gf).map(function (k) { return gf[k]; });
      var gl = {}; [l, r].forEach(function (s) { for (var g in (s.gameLevels || {})) gl[g] = Math.max(gl[g] || 0, s.gameLevels[g]); }); l.gameLevels = gl;
      var gu = {}; [l, r].forEach(function (s) { for (var d in (s.gameUsage || {})) gu[d] = Math.max(gu[d] || 0, s.gameUsage[d]); }); l.gameUsage = gu; l.rewards = newer.rewards; l.errs = newer.errs || {};
      var claimed = {}; [l, r].forEach(function (s) { s.claimed.forEach(function (c) { claimed[c.id + "@" + c.t] = c; }); });
      l.claimed = Object.keys(claimed).map(function (k) { return claimed[k]; }).sort(function (x, y) { return x.t - y.t; });
      var bonus = {}; [l, r].forEach(function (s) { for (var b in (s.bonus || {})) bonus[b] = Math.max(bonus[b] || 0, s.bonus[b]); });
      l.bonus = bonus;
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
    return Array.prototype.filter.call(document.querySelectorAll("button:not([disabled]):not([hidden]), input, a.focusable, [tabindex='0'].focusable"), function (el) {
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
    if (busy && (k === "Enter" || k === " ") && app.contains(document.activeElement)) { e.preventDefault(); return; }
    if (/^Arrow/.test(k) && window.__lplArrow && stack[stack.length - 1] && stack[stack.length - 1].screen === "snake") { e.preventDefault(); window.__lplArrow(k); return; }
    if (/^Arrow/.test(k)) {
      if (typing && (k === "ArrowLeft" || k === "ArrowRight")) return;
      e.preventDefault(); moveFocus(k);
    } else if (k === "Escape" || k === "GoBack" || k === "BrowserBack" || (k === "Backspace" && !typing)) {
      if (back()) e.preventDefault();
    }
  });

  // ================= Démarrage =================
  // À l'ouverture : vérifie s'il existe une version plus récente et l'installe aussitôt.
  function checkUpdate() {
    var ctrl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
    return fetch("../version.json?t=" + Date.now(), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        clearTimeout(to);
        if (!v || !v.version || APP_VER === "dev" || v.version === APP_VER) return false;
        // Une version plus récente existe : on recharge (une seule fois) sans aucun cache.
        var key = "lpl.reloadFor";
        var already = null; try { already = sessionStorage.getItem(key); } catch (e) {}
        if (already === v.version) return false;
        try { sessionStorage.setItem(key, v.version); } catch (e) {}
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
          navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update(); });
        }
        var u = new URL(location.href); u.searchParams.set("maj", v.version);
        location.replace(u.toString());
        return true;
      }).catch(function () { clearTimeout(to); return false; });
  }
  function splashDone() {
    var sp = document.getElementById("splash");
    if (!sp) return;
    sp.classList.add("hide");
    setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 450);
    // « Mise à jour installée » quand la version a changé depuis la dernière ouverture
    var last = null; try { last = localStorage.getItem("lpl.version"); } catch (e) {}
    if (last && last !== APP_VER && APP_VER !== "dev") toast("✨ Application mise à jour : nouveautés et corrections installées.");
    try { localStorage.setItem("lpl.version", APP_VER); } catch (e) {}
  }
  // Retour dans l'application après une longue absence : nouvelle vérification
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000) {
      var top = stack[stack.length - 1];
      if (top && (top.screen === "home" || top.screen === "profiles")) checkUpdate();
    }
  });

  function start() {
    fetch("../contenu/cours.json" + Q, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (data) {
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
  var t0 = Date.now();
  checkUpdate().then(function (reloading) {
    if (reloading) return;
    start();
    setTimeout(splashDone, Math.max(0, 900 - (Date.now() - t0)));
  });
})();
