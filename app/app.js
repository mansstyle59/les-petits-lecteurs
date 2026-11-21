/* Les Petits Lecteurs — application (téléphone, ordinateur, télévision) */
(function () {
  "use strict";

  // ---------------- Mode d'affichage ----------------
  var params = new URLSearchParams(location.search);
  var forced = params.get("mode");
  var ua = navigator.userAgent || "";
  var isTV = forced === "tv" || (!forced && /Android TV|GoogleTV|AFT[A-Z]|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S/i.test(ua));
  if (isTV) document.body.classList.add("mode-tv");

  var app = document.getElementById("app");
  var btnBack = document.getElementById("btn-back");
  var titleEl = document.getElementById("topbar-title");
  var starsEl = document.getElementById("topbar-stars");
  var toastEl = document.getElementById("toast");

  var AVATARS = ["🦊", "🐼", "🐯", "🐰", "🦁", "🐸", "🐧", "🦄"];
  var AUDIO_BASE = "../audio/";

  // ---------------- Stockage (tolérant aux erreurs) ----------------
  var STORE_KEY = "lpl.v1";
  var memoryStore = null;
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { if (memoryStore) return memoryStore; }
    return { profiles: [], current: null };
  }
  function saveState() {
    memoryStore = state;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
  }
  var state = loadState();

  // ---------------- Audio ----------------
  var player = new Audio();
  player.preload = "auto";
  var queue = [];
  var unlocked = false;
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    try {
      player.src = AUDIO_BASE + "ui/ecoute.mp3";
      player.volume = 0;
      var p = player.play();
      if (p && p.then) p.then(function () { player.pause(); player.volume = 1; }).catch(function () { player.volume = 1; });
      else player.volume = 1;
    } catch (e) { player.volume = 1; }
  }
  document.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
  document.addEventListener("keydown", unlockAudio, { once: true, capture: true });

  function play(paths, onEnd) {
    queue = (Array.isArray(paths) ? paths : [paths]).slice();
    playNext(onEnd);
  }
  function playNext(onEnd) {
    if (!queue.length) { if (onEnd) onEnd(); return; }
    var p = queue.shift();
    player.onended = function () { setTimeout(function () { playNext(onEnd); }, 180); };
    player.onerror = function () { playNext(onEnd); };
    player.volume = 1;
    player.src = AUDIO_BASE + p;
    var pr = player.play();
    if (pr && pr.catch) pr.catch(function () { /* lecture bloquée : on ignore */ });
  }
  function stopAudio() { queue = []; try { player.pause(); } catch (e) {} }

  // ---------------- Utilitaires ----------------
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
    toast._t = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }
  function profile() {
    for (var i = 0; i < state.profiles.length; i++) if (state.profiles[i].id === state.current) return state.profiles[i];
    return null;
  }
  function totalStars(p) {
    var t = 0; for (var k in p.stars) t += p.stars[k]; return t;
  }
  function starsText(n, max) {
    var s = ""; for (var i = 0; i < max; i++) s += i < n ? "★" : "☆"; return s;
  }

  // ---------------- Contenu ----------------
  var cours = null;
  var lessonIndex = {};
  function findLesson(id) { return lessonIndex[id]; }

  function itemAudio(it, lessonId, idx) {
    if (it.lettre_minuscule) return ["lettres/nom-" + it.lettre_minuscule + ".mp3", "lettres/son-" + it.lettre_minuscule + ".mp3", "mots/" + it.exemple + ".mp3"];
    if (it.syllabe_tts) return ["syllabes/" + it.syllabe_tts + ".mp3"];
    if (it.mot) return ["mots/" + it.mot + ".mp3"];
    return ["phrases/" + lessonId + "-" + (idx + 1) + ".mp3"];
  }
  function questionAudio(it, lessonId, idx) {
    if (it.lettre_minuscule) return ["lettres/son-" + it.lettre_minuscule + ".mp3"];
    return itemAudio(it, lessonId, idx);
  }
  function itemKey(it) { return it.lettre_minuscule || it.syllabe_tts || it.mot || it.phrase; }

  function cardHTML(it, i, lesson) {
    if (it.lettre_minuscule) {
      return '<button class="card focusable" data-i="' + i + '" type="button" aria-label="Lettre ' + esc(it.lettre_majuscule) + ', écouter">' +
        '<span class="glyph">' + esc(it.lettre_majuscule) + " " + esc(it.lettre_minuscule) + "</span>" +
        '<span class="emoji" aria-hidden="true">' + it.illustration + "</span>" +
        '<span class="caption">' + esc(it.exemple) + "</span></button>";
    }
    if (it.syllabe_tts) {
      return '<button class="card focusable" data-i="' + i + '" type="button" aria-label="Syllabe ' + esc(it.affiche) + ', écouter">' +
        '<span class="glyph">' + esc(it.affiche) + "</span></button>";
    }
    if (it.mot) {
      return '<button class="card focusable" data-i="' + i + '" type="button" aria-label="Mot ' + esc(it.mot) + ', écouter">' +
        '<span class="emoji" aria-hidden="true">' + it.illustration + "</span>" +
        '<span class="glyph">' + esc(it.mot) + "</span>" +
        '<span class="caption">' + esc(it.decoupage) + "</span></button>";
    }
    return '<button class="card wide focusable" data-i="' + i + '" type="button" aria-label="Phrase : ' + esc(it.phrase) + ', écouter">' +
      '<span class="emoji" aria-hidden="true">' + it.illustration + "</span>" +
      '<span class="glyph">' + esc(it.phrase) + "</span></button>";
  }

  function choiceHTML(it, type) {
    var key = esc(itemKey(it));
    if (type === "son_vers_lettre") return '<button class="choice focusable" type="button" data-key="' + key + '" aria-label="Lettre ' + esc(it.lettre_majuscule) + '">' + esc(it.lettre_majuscule) + " " + esc(it.lettre_minuscule) + "</button>";
    if (type === "assemblage_syllabe") return '<button class="choice focusable" type="button" data-key="' + key + '" aria-label="Syllabe ' + esc(it.affiche) + '">' + esc(it.affiche) + "</button>";
    return '<button class="choice focusable" type="button" data-key="' + key + '" aria-label="Image"><span class="emoji" aria-hidden="true">' + it.illustration + "</span></button>";
  }

  // ---------------- Navigation entre écrans ----------------
  var stack = [];
  function go(screen, args, replace) {
    stopAudio();
    if (replace) stack.pop();
    stack.push({ screen: screen, args: args || {} });
    render();
  }
  function back() {
    if (stack.length <= 1) return false;
    stopAudio();
    stack.pop();
    render();
    return true;
  }
  window.lplBack = back; // utilisé par l'application Android (bouton Retour)
  btnBack.addEventListener("click", back);

  function setTop(title, showBack) {
    titleEl.textContent = title;
    btnBack.hidden = !showBack;
    var p = profile();
    starsEl.textContent = p ? p.avatar + " ★ " + totalStars(p) : "";
  }

  function render() {
    var top = stack[stack.length - 1];
    app.classList.remove("has-side");
    SCREENS[top.screen](top.args);
    window.scrollTo(0, 0);
    if (isTV) focusFirst();
  }

  // ---------------- Écrans ----------------
  var SCREENS = {};

  SCREENS.profiles = function () {
    setTop("Les Petits Lecteurs", false);
    var html = "<h1>Qui joue aujourd'hui ?</h1><p class='hint'>Choisis ton prénom.</p><div class='profiles'>";
    state.profiles.forEach(function (p) {
      html += '<button class="profile focusable" type="button" data-id="' + esc(p.id) + '"><span class="avatar" aria-hidden="true">' + p.avatar +
        '</span><span class="pname">' + esc(p.name) + '</span><span class="pstars">★ ' + totalStars(p) + "</span></button>";
    });
    html += '<button class="profile add focusable" type="button" id="add-profile"><span class="avatar" aria-hidden="true">＋</span><span class="pname">Ajouter</span></button></div>';
    html += '<div class="actions"><button class="btn ghost focusable" type="button" id="to-parents">Espace parents</button></div>';
    app.innerHTML = html;
    app.querySelectorAll(".profile[data-id]").forEach(function (b) {
      b.addEventListener("click", function () { state.current = b.dataset.id; saveState(); go("home"); });
    });
    document.getElementById("add-profile").addEventListener("click", function () { go("newProfile"); });
    document.getElementById("to-parents").addEventListener("click", function () { go("parentsGate"); });
    if (!state.profiles.length) play("ui/bienvenue.mp3");
  };

  SCREENS.newProfile = function () {
    setTop("Nouveau profil", true);
    var chosen = AVATARS[0];
    var html = '<h1>Nouveau profil</h1><form class="form" id="pf" autocomplete="off">' +
      '<label for="pname">Prénom</label><input id="pname" type="text" maxlength="20" required class="focusable">' +
      '<span style="font-weight:900">Choisis ton animal</span><div class="avatars">';
    AVATARS.forEach(function (a, i) {
      html += '<button type="button" class="avatar-choice focusable" aria-pressed="' + (i === 0) + '" data-a="' + a + '" aria-label="Animal ' + (i + 1) + '">' + a + "</button>";
    });
    html += '</div><div class="actions"><button class="btn big focusable" type="submit">C\'est parti !</button></div></form>';
    app.innerHTML = html;
    app.querySelectorAll(".avatar-choice").forEach(function (b) {
      b.addEventListener("click", function () {
        chosen = b.dataset.a;
        app.querySelectorAll(".avatar-choice").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      });
    });
    document.getElementById("pf").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("pname").value.trim();
      if (!name) { toast("Écris un prénom."); return; }
      var p = { id: "p" + Date.now(), name: name, avatar: chosen, stars: {} };
      state.profiles.push(p); state.current = p.id; saveState();
      stack = [{ screen: "profiles", args: {} }];
      go("home");
    });
    play("ui/ajoute-profil.mp3");
  };

  function sideHTML(activeModule) {
    var p = profile();
    var html = '<nav class="side" aria-label="Modules"><div class="side-who"><span class="avatar" aria-hidden="true">' + p.avatar + "</span>" + esc(p.name) + "</div>";
    cours.modules.forEach(function (m) {
      html += '<a href="#m-' + m.id + '"' + (m.id === activeModule ? ' aria-current="true"' : "") + ">" + esc(m.titre) + "</a>";
    });
    return html + "</nav>";
  }

  SCREENS.home = function () {
    var p = profile();
    if (!p) { stack = [{ screen: "profiles", args: {} }]; return render(); }
    setTop("Bonjour " + p.name + " !", true);
    app.classList.add("has-side");
    var html = sideHTML() + "<div><h1>Choisis une leçon</h1><p class='hint'>Gagne jusqu'à 3 étoiles par leçon.</p><div class='modules'>";
    cours.modules.forEach(function (m) {
      var got = 0, max = m.lecons.length * 3;
      m.lecons.forEach(function (l) { got += p.stars[l.id] || 0; });
      html += '<section class="module" id="m-' + m.id + '"><div class="module-head"><h2>' + esc(m.titre) + '</h2><span class="module-progress">★ ' + got + " / " + max + '</span></div><div class="lessons">';
      m.lecons.forEach(function (l) {
        var s = p.stars[l.id] || 0;
        html += '<button class="lesson focusable' + (s ? " done" : "") + '" type="button" data-l="' + l.id + '"><span class="lesson-badge">' + l.id + '</span><span><span class="lesson-title">' + esc(l.titre) + '</span><span class="lesson-stars" aria-label="' + s + ' étoiles sur 3">' + starsText(s, 3) + "</span></span></button>";
      });
      html += "</div></section>";
    });
    html += "</div></div>";
    app.innerHTML = html;
    app.querySelectorAll(".lesson").forEach(function (b) {
      b.addEventListener("click", function () { go("discover", { id: b.dataset.l }); });
    });
    play("ui/choisis-lecon.mp3");
  };

  SCREENS.discover = function (a) {
    var l = findLesson(a.id);
    setTop(l.titre, true);
    var html = "<h1>" + esc(l.titre) + "</h1><p class='hint'>" + esc(l.objectif) + " Touche une carte pour écouter.</p><div class='cards'>";
    l.items.forEach(function (it, i) { html += cardHTML(it, i, l); });
    html += '</div><div class="actions"><button class="btn big focusable" type="button" id="start">▶ À toi de jouer !</button></div>';
    app.innerHTML = html;
    app.querySelectorAll(".card").forEach(function (b) {
      b.addEventListener("click", function () {
        app.querySelectorAll(".card.playing").forEach(function (x) { x.classList.remove("playing"); });
        b.classList.add("playing");
        var i = +b.dataset.i;
        play(itemAudio(l.items[i], l.id, i), function () { b.classList.remove("playing"); });
      });
    });
    document.getElementById("start").addEventListener("click", function () { go("game", { id: l.id }, true); });
    play(["titres/" + l.id + ".mp3", "ui/decouvre.mp3"]);
  };

  function poolFor(l) {
    // distracteurs : la leçon, complétée si besoin par le module
    var pool = l.items.slice();
    if (pool.length < 3) {
      cours.modules.forEach(function (m) {
        if (m.lecons.indexOf(l) >= 0) m.lecons.forEach(function (x) { if (x !== l) pool = pool.concat(x.items); });
      });
    }
    return pool;
  }

  SCREENS.game = function (a) {
    var l = findLesson(a.id);
    setTop(l.titre, true);
    var pool = poolFor(l);
    var order = shuffle(l.items.map(function (_, i) { return i; }));
    while (order.length < 5) order = order.concat(shuffle(l.items.map(function (_, i) { return i; })));
    order = order.slice(0, Math.max(5, Math.min(order.length, 6)));
    var step = 0, errors = 0, locked = false;

    function ask() {
      locked = false;
      var idx = order[step], it = l.items[idx];
      // Pas de distracteur qui se prononce comme la bonne réponse (ex. : c, k et q font tous « ke »)
      var others = shuffle(pool.filter(function (x) {
        if (itemKey(x) === itemKey(it)) return false;
        if (it.son_tts !== undefined && x.son_tts === it.son_tts) return false;
        return true;
      })).slice(0, 2);
      var opts = shuffle([it].concat(others));
      var showText = l.type_jeu === "image_vers_mot" ? esc(it.mot) : l.type_jeu === "lecture_phrase" ? esc(it.phrase) : "";
      var html = '<div class="game"><div class="progressbar" role="progressbar" aria-valuemin="0" aria-valuemax="' + order.length + '" aria-valuenow="' + step + '"><span style="width:' + (step / order.length * 100) + '%"></span></div>' +
        '<div class="question">' + (showText ? '<div class="target">' + showText + "</div>" : "") +
        '<button class="listen focusable" type="button" id="listen" aria-label="Réécouter">🔊</button><p class="hint">' + esc(l.consigne) + "</p></div>" +
        '<div class="choices">';
      opts.forEach(function (o) { html += choiceHTML(o, l.type_jeu); });
      html += '</div><div class="feedback" id="fb" aria-live="assertive"></div></div>';
      app.innerHTML = html;
      var qa = questionAudio(it, l.id, idx);
      document.getElementById("listen").addEventListener("click", function () { play(qa); });
      app.querySelectorAll(".choice").forEach(function (b) {
        b.addEventListener("click", function () {
          if (locked) return;
          var fb = document.getElementById("fb");
          if (b.dataset.key === itemKey(it)) {
            locked = true;
            b.classList.add("good");
            fb.className = "feedback good"; fb.textContent = "Bravo !";
            play([Math.random() < .5 ? "ui/bravo.mp3" : "ui/super.mp3"], function () {
              step++;
              if (step >= order.length) finish(); else ask();
            });
          } else {
            errors++;
            b.classList.add("bad"); b.disabled = true;
            // Garder le focus sur un choix encore possible (télécommande)
            var nextChoice = app.querySelector(".choice:not([disabled])");
            if (nextChoice && document.activeElement === document.body) nextChoice.focus();
            fb.className = "feedback bad"; fb.textContent = "Essaie encore !";
            play(["ui/encore.mp3"].concat(qa));
          }
        });
      });
      if (isTV) focusFirst(".choice");
      play(step === 0 ? ["consignes/" + l.id + ".mp3"].concat(qa) : qa);
    }

    function finish() {
      var stars = errors === 0 ? 3 : errors <= 2 ? 2 : 1;
      var p = profile();
      var best = Math.max(p.stars[l.id] || 0, stars);
      p.stars[l.id] = best; saveState();
      setTop(l.titre, true);
      var next = nextLesson(l.id);
      app.innerHTML = '<div class="result"><h1>Bravo ' + esc(p.name) + " !</h1>" +
        '<div class="big-stars" aria-label="' + stars + ' étoiles sur 3">' + starsText(stars, 3) + "</div>" +
        "<p class='hint'>" + (errors === 0 ? "Aucune erreur, parfait !" : "Tu as fait " + errors + " erreur" + (errors > 1 ? "s" : "") + ". Continue !") + "</p>" +
        '<div class="actions">' + (next ? '<button class="btn big focusable" type="button" id="next">Leçon suivante →</button>' : "") +
        '<button class="btn secondary focusable" type="button" id="again">Rejouer</button>' +
        '<button class="btn secondary focusable" type="button" id="menu">Toutes les leçons</button></div></div>';
      if (next) document.getElementById("next").addEventListener("click", function () { go("discover", { id: next }, true); });
      document.getElementById("again").addEventListener("click", function () { go("game", { id: l.id }, true); });
      document.getElementById("menu").addEventListener("click", back);
      if (isTV) focusFirst();
      play(["ui/fin.mp3", "ui/etoile.mp3"]);
    }
    ask();
  };

  function nextLesson(id) {
    var all = [];
    cours.modules.forEach(function (m) { m.lecons.forEach(function (l) { all.push(l.id); }); });
    var i = all.indexOf(id);
    return i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  }

  // Espace parents : petite question pour éviter les accès par l'enfant
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
    var html = "<h1>Suivi des enfants</h1>";
    if (!state.profiles.length) html += "<p class='hint'>Aucun profil pour le moment.</p>";
    state.profiles.forEach(function (p) {
      html += "<h2>" + p.avatar + " " + esc(p.name) + " · ★ " + totalStars(p) + '</h2><div class="table-wrap"><table class="parent-table"><thead><tr><th>Leçon</th><th>Étoiles</th></tr></thead><tbody>';
      cours.modules.forEach(function (m) {
        m.lecons.forEach(function (l) { html += "<tr><td>" + l.id + " · " + esc(l.titre) + "</td><td>" + starsText(p.stars[l.id] || 0, 3) + "</td></tr>"; });
      });
      html += '</tbody></table></div><div class="actions"><button class="btn secondary focusable" type="button" data-reset="' + esc(p.id) + '">Remettre à zéro</button><button class="btn danger focusable" type="button" data-del="' + esc(p.id) + '">Supprimer le profil</button></div>';
    });
    html += "<h2>À savoir</h2><p class='hint'>Les progrès sont enregistrés uniquement sur cet appareil. Aucune publicité, aucun achat, aucune donnée envoyée.</p>";
    app.innerHTML = html;
    app.querySelectorAll("[data-reset]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirmTwice(b, "Confirmer la remise à zéro")) return;
        state.profiles.forEach(function (p) { if (p.id === b.dataset.reset) p.stars = {}; });
        saveState(); toast("Progrès remis à zéro."); render();
      });
    });
    app.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirmTwice(b, "Confirmer la suppression")) return;
        state.profiles = state.profiles.filter(function (p) { return p.id !== b.dataset.del; });
        if (state.current === b.dataset.del) state.current = null;
        saveState(); toast("Profil supprimé."); render();
      });
    });
  };
  // Confirmation en deux appuis, sans boîte de dialogue (compatible télécommande)
  function confirmTwice(btn, label) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = "1"; btn.textContent = label;
    setTimeout(function () { if (btn.isConnected) { delete btn.dataset.armed; } }, 4000);
    return false;
  }

  // ---------------- Télécommande (TV) : navigation spatiale ----------------
  function focusables() {
    return Array.prototype.filter.call(document.querySelectorAll("button:not([disabled]):not([hidden]), input, a.focusable"), function (el) {
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest("[hidden]");
    });
  }
  function focusFirst(sel) {
    setTimeout(function () {
      var el = (sel && app.querySelector(sel)) || app.querySelector(".btn.big, .profile, .lesson, .card, .choice, button") || btnBack;
      if (el) el.focus({ preventScroll: false });
    }, 30);
  }
  function moveFocus(dir) {
    var list = focusables();
    var cur = document.activeElement;
    if (list.indexOf(cur) < 0) { if (list[0]) list[0].focus(); return; }
    var a = cur.getBoundingClientRect();
    var ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    var best = null, bestScore = Infinity;
    list.forEach(function (el) {
      if (el === cur) return;
      var b = el.getBoundingClientRect();
      var bx = b.left + b.width / 2, by = b.top + b.height / 2;
      var dx = bx - ax, dy = by - ay, main, cross;
      if (dir === "ArrowRight") { if (dx <= 4) return; main = dx; cross = Math.abs(dy); }
      else if (dir === "ArrowLeft") { if (dx >= -4) return; main = -dx; cross = Math.abs(dy); }
      else if (dir === "ArrowDown") { if (dy <= 4) return; main = dy; cross = Math.abs(dx); }
      else { if (dy >= -4) return; main = -dy; cross = Math.abs(dx); }
      var score = main + cross * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) { best.focus(); best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }
  }
  document.addEventListener("keydown", function (e) {
    var k = e.key;
    var typing = document.activeElement && document.activeElement.tagName === "INPUT";
    if (/^Arrow/.test(k) && !(typing && (k === "ArrowLeft" || k === "ArrowRight"))) {
      if (isTV || !typing) { e.preventDefault(); moveFocus(k); }
    } else if (k === "Escape" || k === "GoBack" || k === "BrowserBack" || (k === "Backspace" && !typing)) {
      if (back()) e.preventDefault();
    }
  });

  // ---------------- Démarrage ----------------
  function start() {
    fetch("../contenu/cours.json").then(function (r) { return r.json(); }).then(function (data) {
      cours = data;
      cours.modules.forEach(function (m) { m.lecons.forEach(function (l) { lessonIndex[l.id] = l; }); });
      stack = [{ screen: "profiles", args: {} }];
      if (profile()) stack.push({ screen: "home", args: {} });
      render();
    }).catch(function () {
      app.innerHTML = "<h1>Oups !</h1><p class='hint'>Les leçons n'ont pas pu être chargées. Vérifie la connexion puis réessaie.</p><div class='actions'><button class='btn focusable' type='button' onclick='location.reload()'>Réessayer</button></div>";
    });
  }

  if ("serviceWorker" in navigator && location.protocol === "https:" && location.hostname !== "appassets.androidplatform.net") {
    navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(function () {});
  }
  start();
})();
