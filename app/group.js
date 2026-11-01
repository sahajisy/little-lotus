/* Play together: one quiz for a whole room, on one big screen.
   Players can answer on their own phones, in teams with printed letter cards, or both at once:
   - Phones: the Android app opens a small room on the local Wi-Fi or the phone's hotspot
     (see GameServer.java). Players scan a code and answer in their phone's browser; faster
     right answers score more. Nothing leaves the room.
   - Card teams: teams hold up A, B, C or D, and the host taps which teams were right.
   Everyone shares one scoreboard. Questions are the same captioned sentences as the solo
   quiz, shown unchanged. */
(function () {
  "use strict";
  const C = window.CQ;
  const { el, vtt, optionsFor, store, AGES, OPTION_COUNT } = C;

  const LETTERS = "ABCD";
  const COUNTS = [5, 10, 15, 20];
  const SECONDS = [30, 30, 25, 20, 20]; // time to answer, by age group
  const TEAM_POINTS = 750; // a right card answer: the middle of what a phone earns (500 slow to 1,000 instant)
  const TEAM_NAMES = ["Lotus", "Jasmine", "Marigold", "Rose", "Lily", "Champa"];
  const TEAM_COLORS = ["var(--c-heart)", "var(--c-swadishthan)", "var(--c-nabhi)", "var(--c-vishuddhi)", "var(--c-sahasrara)", "var(--c-mooladhara)"];
  const canHost = () => !!(window.Android && window.Android.hostStart);

  let game = null; // the game in progress, kept while the host looks at other pages
  let ctx = null, main = null, lastError = "";
  const onGame = () => location.hash === "#/group/play";
  const ordinal = n => n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "th");
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // Android's WebView shows no confirm() dialogs, so ending a game asks on the button itself.
  function twoStep(label, sure, action) {
    let armed = false, t = null;
    const b = el("button", { class: "btn ghost small", onclick: () => {
      if (armed) { clearTimeout(t); action(); return; }
      armed = true; b.textContent = sure; b.classList.add("armed");
      t = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove("armed"); }, 4000);
    } }, label);
    return b;
  }

  /* -------------------------------------------------------------- settings */
  function settings() {
    const s = store.get("group", {});
    const names = Array.isArray(s.names) ? s.names.slice(0, 6) : [];
    while (names.length < 6) names.push(TEAM_NAMES[names.length]);
    return {
      count: COUNTS.includes(s.count) ? s.count : 10,
      phones: canHost() && s.phones !== false,
      teams: Number.isInteger(s.teams) ? Math.max(0, Math.min(6, s.teams)) : (canHost() ? 0 : 2),
      names
    };
  }
  const saveSettings = cfg => store.set("group", { count: cfg.count, phones: cfg.phones, teams: cfg.teams, names: cfg.names });

  /* ------------------------------------------------------------ questions */
  function makeItems(n) {
    const tier = ctx.state.tier;
    return C.pickRound(ctx.state.topic, tier, q => q.type !== "order", n).map(q => {
      const opts = optionsFor(q, tier);
      return { q, opts, right: opts.indexOf(q.a) };
    });
  }
  const shownText = q => q.type === "blank" ? q.q : q.s;
  const tileColor = (it, k) => it.q.type === "blank" && it.q.g === "chakra" && C.CHAKRA_COLOR[it.opts[k]] ? C.CHAKRA_COLOR[it.opts[k]] : C.TILE_COLORS[k % 4];

  // The answer tiles as the room sees them. After the answer: the right one marked, and how many phones chose each.
  function tiles(it, revealed, counts) {
    return el("div", { class: "answers stage-tiles" + (it.opts.length === 2 ? " two" : "") },
      it.opts.map((o, k) => el("div", {
        class: "answer" + (revealed ? (k === it.right ? " right" : " dim") : ""), style: "--tile:" + tileColor(it, k)
      }, el("span", { class: "key" }, LETTERS[k]), el("span", {}, o),
        counts ? el("span", { class: "tally nums", "aria-label": counts[k] + " phones chose this" }, counts[k]) : null)));
  }

  function questionCard(it, n, of, extra) {
    const q = it.q;
    return el("section", { class: "card stage" },
      el("div", { class: "quizbar nums" }, el("span", {}, `Question ${n} of ${of}`), extra || null),
      el("div", { class: "progress", "aria-hidden": "true" }, el("i", { style: `width:${(n - 1) / of * 100}%` })),
      el("p", { class: "prompt" }, C.TYPE_PROMPT[q.type]),
      el("blockquote", { class: "saying big", lang: q.l || "en" }, C.blankedNode(shownText(q))));
  }

  /* ----------------------------------------------------------- setup page */
  function renderSetup() {
    const redraw = renderSetup;
    const cfg = settings();
    const set = (k, v) => { cfg[k] = v; saveSettings(cfg); redraw(); };
    const mcCount = ctx.poolFor(ctx.state.topic, ctx.state.tier).filter(q => q.type !== "order").length;
    const enough = mcCount >= 4;
    const running = game && game.phase !== "end";
    const n = OPTION_COUNT[ctx.state.tier];

    const phonesBox = el("div", { class: "how" },
      el("div", { class: "spread" },
        el("div", {}, el("h3", {}, "On their own phones"),
          el("p", { class: "muted" }, "Players scan a code and answer in their phone's browser; no app needed on their phones. Faster right answers score more.")),
        canHost() ? el("div", { class: "seg", role: "group", "aria-label": "Players on phones" },
          el("button", { "aria-pressed": String(cfg.phones), onclick: () => set("phones", true) }, "Yes"),
          el("button", { "aria-pressed": String(!cfg.phones), onclick: () => set("phones", false) }, "No")) : null),
      canHost()
        ? (cfg.phones ? el("p", { class: "muted small" }, "This phone and the players must be on the same Wi-Fi. No Wi-Fi? Turn on this phone's hotspot and let the players join it.") : null)
        : el("p", { class: "notice" }, "Phones can join when the host uses the Little Lotus Android app. Here, play with card teams."));

    const names = el("div", { class: "team-names" }, cfg.names.slice(0, cfg.teams).map((name, k) => el("label", { class: "field team-field" },
      el("span", {}, el("span", { class: "dot", style: "--dot:" + TEAM_COLORS[k] }), `Team ${k + 1}`),
      el("input", { type: "text", value: name, maxlength: "18", "aria-label": `Name of team ${k + 1}`, oninput: e => { cfg.names[k] = e.target.value; saveSettings(cfg); } }))));
    const teamsBox = el("div", { class: "how" },
      el("div", { class: "spread" },
        el("div", {}, el("h3", {}, "In teams, with answer cards"),
          el("p", { class: "muted" }, `Each team holds up the letter of its answer and you tap which teams were right. No phones needed; good for little ones. A right answer scores ${TEAM_POINTS} points.`)),
        el("div", { class: "seg", role: "group", "aria-label": "Number of card teams" },
          [0, 1, 2, 3, 4, 5, 6].map(t => el("button", { "aria-pressed": String(t === cfg.teams), onclick: () => set("teams", t) }, t === 0 ? "None" : t)))),
      cfg.teams ? names : null,
      cfg.teams ? el("div", { class: "row" },
        el("button", { class: "btn ghost small", onclick: () => printCards(cfg.names.slice(0, cfg.teams), n) }, "Print answer cards"),
        el("span", { class: "muted small" }, `For ages ${AGES[ctx.state.tier]}: ${LETTERS.slice(0, n).split("").join(", ")} for each team.`)) : null);

    const ready = enough && (cfg.phones || cfg.teams > 0);
    const why = !enough ? "Choose a topic with more questions." : !ready ? (canHost() ? "Choose phones, card teams, or both." : "Add at least one card team.") : null;
    main.replaceChildren(...[
      el("section", { class: "intro" },
        el("p", { class: "label" }, "Play together"),
        el("h1", {}, "One quiz for the whole room"),
        el("p", {}, "For a class, a family or a collective. The questions are Shri Mataji's sentences, exactly as captioned, on one big screen. Players answer on their phones, in teams with cards, or both, and everyone shares one scoreboard.")),
      running ? el("section", { class: "card" },
        el("div", { class: "spread" },
          el("p", {}, el("b", {}, "A game is in progress.")),
          el("div", { class: "row" },
            el("a", { class: "btn accent small", href: "#/group/play" }, "Back to the game"),
            el("button", { class: "btn ghost small", onclick: () => { endGame(); redraw(); } }, "End it")))) : null,
      ctx.langPicker(redraw),
      el("section", { class: "card" },
        el("div", { class: "spread" }, el("h2", {}, "Who is playing?"), el("span", { class: "muted" }, "Age group")),
        ctx.agePicker(redraw)),
      ctx.topicPicker(redraw),
      el("section", { class: "card" },
        el("div", { class: "spread" },
          el("div", {}, el("h3", {}, "How many questions?"), el("p", { class: "muted nums" }, `${mcCount.toLocaleString()} questions in ${ctx.state.topic.name} for ages ${AGES[ctx.state.tier]}`)),
          el("div", { class: "seg", role: "group", "aria-label": "Number of questions" },
            COUNTS.map(c => el("button", { "aria-pressed": String(c === cfg.count), onclick: () => set("count", c) }, c))))),
      el("section", { class: "card" },
        el("h2", {}, "How will they answer?"),
        phonesBox, teamsBox,
        lastError ? el("p", { class: "notice warn", role: "alert" }, lastError) : null,
        el("div", { class: "row" },
          el("button", { class: "btn accent", disabled: !ready || null, onclick: start }, cfg.phones ? "Open the room" : "Start the quiz"),
          why ? el("span", { class: "muted" }, why) : null))
    ].filter(Boolean));
  }

  /* ---------------------------------------------------------- answer cards */
  function printCards(names, n) {
    const ink = ["#FF8A6B", "#FFD45C", "#5ED39A", "#6FB8FF"];
    const halves = [];
    names.forEach((team, t) => LETTERS.slice(0, n).split("").forEach((L, k) => halves.push(
      `<div class="ac" style="--ac:${ink[k]}"><b>${L}</b><span>${esc(team.trim() || TEAM_NAMES[t])}</span></div>`)));
    if (halves.length % 2) halves.push('<div class="ac blank"></div>');
    let html = "";
    for (let i = 0; i < halves.length; i += 2) html += `<section class="ac-page">${halves[i]}${halves[i + 1]}</section>`;
    document.getElementById("sheet").innerHTML = html;
    if (window.Android && window.Android.print) window.Android.print();
    else window.print();
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ------------------------------------------------------------------ game */
  const ERRORS = {
    network: "This phone isn't on a Wi-Fi network. Connect it to Wi-Fi, or turn on its hotspot, then try again.",
    port: "The room couldn't be opened. Close other apps that might be using the network and try again."
  };

  function start() {
    const cfg = settings();
    const tier = ctx.state.tier;
    game = {
      room: null, players: new Map(), items: [], i: -1, phase: "lobby", answers: new Map(), got: new Set(),
      teams: cfg.names.slice(0, cfg.teams).map((name, k) => ({ id: "t" + k, name: name.trim() || TEAM_NAMES[k], color: TEAM_COLORS[k], score: 0, gain: null, team: true })),
      tier, n: cfg.count, secs: SECONDS[tier], topic: ctx.state.topic.name, start: 0, deadline: 0
    };
    if (cfg.phones) {
      const room = String(1000 + Math.floor(Math.random() * 9000));
      let res;
      try { res = JSON.parse(window.Android.hostStart(room)); } catch (e) { res = { ok: false, error: "port" }; }
      if (!res.ok) { game = null; lastError = ERRORS[res.error] || ERRORS.port; renderSetup(); return; }
      Object.assign(game, { room, port: res.port, addrs: res.addrs, addr: res.addrs[0] });
    }
    lastError = "";
    game.tick = setInterval(tick, 250);
    if (game.room) push();
    else { game.items = makeItems(game.n); ask(); }
    location.hash = "#/group/play";
  }

  function endGame() {
    if (!game) return;
    clearInterval(game.tick);
    if (game.room) { try { window.Android.hostStop(); } catch (e) { /* already closed */ } }
    game = null;
  }

  const everyone = g => [...g.players.values(), ...g.teams];
  const standings = g => everyone(g).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  function places(g) {
    const out = {}; let place = 0, prev = null;
    standings(g).forEach((p, k) => { if (p.score !== prev) { place = k + 1; prev = p.score; } out[p.id] = place; });
    return out;
  }

  // What the players' phones show, sent to the room.
  function publicState(g) {
    const base = { age: g.tier, players: everyone(g).length };
    if (g.phase === "lobby") return Object.assign(base, { ph: "lobby" });
    const pl = places(g), res = {};
    if (g.phase === "end") {
      g.players.forEach(p => { res[p.id] = { total: p.score, rank: pl[p.id] }; });
      return Object.assign(base, { ph: "end", res, top: standings(g).slice(0, 3).map(p => ({ name: p.name, total: p.score })) });
    }
    const it = g.items[g.i], q = it.q;
    const common = { n: g.i + 1, of: g.items.length, q: g.i, prompt: C.TYPE_PROMPT[q.type], lang: q.l || "en", opts: it.opts.map(vtt) };
    if (g.phase === "q") return Object.assign(base, common, { ph: "q", text: vtt(shownText(q)), secs: g.secs, left: Math.max(1, Math.round((g.deadline - Date.now()) / 1000)) });
    g.players.forEach(p => { res[p.id] = { ok: !!p.ok, pts: p.gain || 0, total: p.score, rank: pl[p.id], ans: p.answered }; });
    return Object.assign(base, common, { ph: "r", text: vtt(q.s), right: it.right, res });
  }
  function push() {
    if (!game.room) return Date.now();
    return Number(window.Android.hostState(JSON.stringify(publicState(game)))) || Date.now();
  }

  function tick() {
    const g = game;
    if (!g) return;
    let joined = false;
    if (g.room) {
      let events = [];
      try { events = JSON.parse(window.Android.hostEvents()); } catch (e) { events = []; }
      for (const e of events) {
        if (e.e === "join" && !g.players.has(e.id)) {
          g.players.set(e.id, { id: e.id, name: e.name, score: 0, gain: null, ok: false, answered: false });
          joined = true;
        } else if (e.e === "answer" && g.phase === "q" && e.q === g.i && g.players.has(e.id) && !g.answers.has(e.id) && e.a < g.items[g.i].opts.length) {
          g.answers.set(e.id, { a: e.a, t: e.t });
        }
      }
      if (joined && g.phase !== "q") push(); // phones show how many are playing
    }
    if (g.phase === "q") {
      const left = Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000));
      if (g.ui && g.ui.left) g.ui.left.textContent = left;
      if (g.ui && g.ui.count) g.ui.count.textContent = `${g.answers.size} of ${plural(g.players.size, "phone", "phones")} answered`;
      // Card teams answer aloud, so with teams playing only the timer or the host ends a question.
      const allIn = !g.teams.length && g.players.size && g.answers.size >= g.players.size;
      if (left <= 0 || allIn) reveal();
    } else if (joined) draw();
  }

  function ask() {
    const g = game;
    g.i++;
    if (g.i >= g.items.length) { g.phase = "end"; push(); return draw(); }
    g.phase = "q"; g.answers = new Map(); g.got = new Set();
    everyone(g).forEach(p => { p.gain = null; p.ok = false; p.answered = false; });
    g.deadline = Date.now() + g.secs * 1000;
    g.start = push();
    draw();
  }

  function reveal() {
    const g = game, it = g.items[g.i];
    g.players.forEach(p => {
      const a = g.answers.get(p.id);
      p.answered = !!a;
      p.ok = !!a && a.a === it.right;
      const used = a ? Math.max(0, a.t - g.start) / (g.secs * 1000) : 1;
      p.gain = p.ok ? Math.round(500 + 500 * Math.max(0, 1 - used)) : 0;
      p.score += p.gain;
    });
    g.phase = "r";
    push();
    draw();
  }

  function showScores() {
    const g = game;
    g.teams.forEach((t, k) => { t.ok = g.got.has(k); t.gain = t.ok ? TEAM_POINTS : 0; t.score += t.gain; });
    g.phase = "board";
    push(); // phones' places now count the teams too
    draw();
  }

  function playAgain() {
    const g = game;
    everyone(g).forEach(p => { p.score = 0; p.gain = null; });
    g.i = -1;
    if (g.room) { g.phase = "lobby"; push(); draw(); }
    else { g.items = makeItems(g.n); ask(); }
  }

  /* ---------------------------------------------------------------- screens */
  function draw() {
    const g = game;
    if (!g || !onGame()) return; // the game carries on while the host looks at another page
    g.ui = null;
    const end = el("div", { class: "row" }, twoStep(g.room ? "Close the room" : "End game", g.room ? "Tap again: everyone leaves" : "Tap again to end", () => { endGame(); location.hash = "#/group"; }));
    if (g.phase === "lobby") return main.replaceChildren(lobby(g), end);
    if (g.phase === "end") return main.replaceChildren(finalBoard(g), end);
    const it = g.items[g.i];
    if (g.phase === "q") {
      const left = el("span", { class: "timer nums", "aria-live": "off" }, Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000)));
      const count = g.room ? el("span", { class: "muted nums" }, `${g.answers.size} of ${plural(g.players.size, "phone", "phones")} answered`) : el("span");
      g.ui = { left, count };
      const card = questionCard(it, g.i + 1, g.items.length, left);
      card.append(tiles(it, false), el("div", { class: "spread" }, count,
        el("div", { class: "row" },
          C.canSpeak() ? el("button", { class: "btn ghost small", onclick: () => C.speak(shownText(it.q), it.q.l) }, "🔊 Read aloud") : null,
          el("button", { class: "btn accent small", onclick: reveal }, "Show the answer"))));
      return main.replaceChildren(card, end);
    }
    const last = g.i + 1 >= g.items.length;
    if (g.phase === "board") {
      return main.replaceChildren(el("section", { class: "card stage" },
        el("div", { class: "quizbar nums" }, el("span", {}, `After question ${g.i + 1} of ${g.items.length}`)),
        el("h2", {}, "Scores"),
        board(standings(g), 8),
        el("div", { class: "row" }, el("button", { class: "btn accent", onclick: ask }, last ? "Final results" : "Next question"))), end);
    }
    // The answer
    const counts = it.opts.map(() => 0);
    g.answers.forEach(a => counts[a.a]++);
    const card = questionCard(it, g.i + 1, g.items.length, g.room ? el("span", { class: "muted nums" }, `${g.answers.size} of ${plural(g.players.size, "phone", "phones")} answered`) : null);
    if (it.q.type === "blank") card.querySelector(".saying").replaceChildren(C.blankedNode(it.q.q, it.q.a));
    const right = [...g.players.values()].filter(p => p.ok).length;
    card.append(tiles(it, true, g.room ? counts : null), el("div", { class: "reveal" },
      el("div", { class: "verdict ok" }, `The answer is ${LETTERS[it.right]}: “${it.q.a}”`),
      g.room && g.players.size ? el("p", { class: "muted nums" }, `${right} of ${plural(g.players.size, "phone", "phones")} got it right`) : null,
      el("blockquote", { class: "quote", lang: it.q.l || "en" }, it.q.s),
      C.sourceBlock(it.q)));
    if (g.teams.length) {
      card.append(el("h3", {}, "Which teams held up the right card?"),
        el("div", { class: "team-toggles", role: "group", "aria-label": "Teams that got it right" },
          g.teams.map((t, k) => el("button", {
            class: "team-toggle", style: "--team:" + t.color, "aria-pressed": String(g.got.has(k)),
            onclick: e => { g.got.has(k) ? g.got.delete(k) : g.got.add(k); e.currentTarget.setAttribute("aria-pressed", String(g.got.has(k))); }
          }, t.name))));
    }
    card.append(el("div", { class: "row" }, el("button", { class: "btn accent", onclick: showScores }, "Show the scores")));
    main.replaceChildren(card, end);
  }

  // Ranked list of phones and teams; equal scores share a place.
  function board(rows, limit, gains = true) {
    let place = 0, prev = null;
    const ranked = rows.map((r, k) => { if (r.score !== prev) { place = k + 1; prev = r.score; } return { r, place }; });
    return el("ol", { class: "board" }, ranked.slice(0, limit || ranked.length).map(({ r, place }) => el("li", {
      class: "nums" + (place === 1 ? " first" : ""), style: r.color ? "--team:" + r.color : null
    },
      el("span", { class: "place" }, ordinal(place)),
      el("span", { class: "who" }, r.name, r.team ? el("small", { class: "tag" }, " team") : null),
      el("span", { class: "gain" }, gains && r.gain ? "+" + r.gain.toLocaleString() : ""),
      el("b", {}, r.score.toLocaleString(), el("small", {}, " points")))));
  }

  function lobby(g) {
    const url = `http://${g.addr}:${g.port}/?r=${g.room}`;
    const addrSeg = g.addrs.length > 1 ? el("div", { class: "row" }, el("span", { class: "muted" }, "Players can't open it? Try another address:"),
      el("div", { class: "seg", role: "group", "aria-label": "Address" }, g.addrs.map(a => el("button", { "aria-pressed": String(a === g.addr), onclick: () => { g.addr = a; draw(); } }, a)))) : null;
    const names = [...g.players.values()];
    return el("section", { class: "card stage" },
      el("p", { class: "label" }, `${g.topic} · ages ${AGES[g.tier]} · ${g.n} questions`),
      el("div", { class: "lobby" },
        el("div", { class: "qr-big", html: window.QR.svg(url, { size: 260 }) }),
        el("div", { class: "join-steps" },
          el("h1", {}, "Join the game"),
          el("ol", {},
            el("li", {}, "Join the same Wi-Fi as this phone, or this phone's hotspot."),
            el("li", {}, "Scan the code with your phone's camera, or open ", el("b", { class: "nums url" }, `${g.addr}:${g.port}`), " in its browser."),
            el("li", {}, "Type your name. Room code ", el("b", { class: "nums room" }, g.room), ".")))),
      addrSeg,
      el("h3", { class: "nums" }, names.length ? `${plural(names.length, "player", "players")} on phones` : "Waiting for players…"),
      el("div", { class: "chips players" }, names.map(p => el("span", { class: "chip" }, p.name))),
      g.teams.length ? el("p", { class: "muted" }, "Card teams: ", g.teams.map(t => t.name).join(", ")) : null,
      el("div", { class: "row" },
        el("button", { class: "btn accent", disabled: !(names.length || g.teams.length) || null, onclick: () => { g.items = makeItems(g.n); g.i = -1; ask(); } }, "Start the quiz")));
  }

  function finalBoard(g) {
    const s = standings(g);
    return el("section", { class: "card stage", style: "justify-items:center;text-align:center" },
      el("p", { class: "label" }, `${g.items.length} questions · ages ${AGES[g.tier]}`),
      el("h1", {}, !s.length ? "Thank you for playing" : s[1] && s[1].score === s[0].score ? "A tie at the top!" : `${s[0].name} ${s[0].team ? "team " : ""}wins!`),
      el("div", { class: "podium" }, s.slice(0, 3).map((p, k) => el("div", { class: "step s" + (k + 1) }, el("b", {}, p.name), el("span", { class: "nums" }, p.score.toLocaleString()), el("i", {}, ordinal(k + 1))))),
      board(s, 0, false),
      el("div", { class: "row", style: "justify-content:center" },
        el("button", { class: "btn accent", onclick: playAgain }, g.room ? "Play again with this room" : "Play again"),
        el("button", { class: "btn ghost", onclick: () => { endGame(); location.hash = "#/group"; } }, "Change topic")));
  }

  /* ---------------------------------------------------------------- entry */
  function render(m, sub, c) {
    main = m; ctx = c;
    if (sub === "play" && game) return draw();
    renderSetup();
  }

  window.CQGroup = { render };
})();
