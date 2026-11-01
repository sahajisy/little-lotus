/* Play together: one quiz for a whole room.
   - Teams on one screen: the host's screen shows each question; teams answer by holding up
     printed letter cards, and the host taps which teams were right. Works anywhere.
   - Everyone on their phones: the Android app opens a small room on the local Wi-Fi or the
     phone's hotspot (see GameServer.java). Players scan a code and answer in their phone's
     browser; faster right answers score more. Nothing leaves the room.
   Questions are the same captioned sentences as the solo quiz, shown unchanged. */
(function () {
  "use strict";
  const C = window.CQ;
  const { el, vtt, talk, optionsFor, store, AGES, OPTION_COUNT } = C;

  const LETTERS = "ABCD";
  const COUNTS = [5, 10, 15, 20];
  const SECONDS = [30, 30, 25, 20, 20]; // time to answer on phones, by age group
  const TEAM_NAMES = ["Lotus", "Jasmine", "Marigold", "Rose", "Lily", "Champa"];
  const TEAM_COLORS = ["var(--c-heart)", "var(--c-swadishthan)", "var(--c-nabhi)", "var(--c-vishuddhi)", "var(--c-sahasrara)", "var(--c-mooladhara)"];
  const canHost = () => !!(window.Android && window.Android.hostStart);

  let game = null; // the game in progress, kept while the host looks at other pages
  let ctx = null, main = null;
  const here = sub => location.hash === "#/group/" + sub;
  const ordinal = n => n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "th");

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
  let lastError = "";

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

  // The answer tiles as the room sees them. After the answer: the right one marked, and how many chose each.
  function tiles(it, revealed, counts) {
    return el("div", { class: "answers stage-tiles" + (it.opts.length === 2 ? " two" : "") },
      it.opts.map((o, k) => el("div", {
        class: "answer" + (revealed ? (k === it.right ? " right" : " dim") : ""), style: "--tile:" + tileColor(it, k)
      }, el("span", { class: "key" }, LETTERS[k]), el("span", {}, o),
        counts ? el("span", { class: "tally nums", "aria-label": counts[k] + " chose this" }, counts[k]) : null)));
  }

  function questionCard(it, n, of, extra) {
    const q = it.q;
    return el("section", { class: "card stage" },
      el("div", { class: "quizbar nums" }, el("span", {}, `Question ${n} of ${of}`), extra || null),
      el("div", { class: "progress", "aria-hidden": "true" }, el("i", { style: `width:${(n - 1) / of * 100}%` })),
      el("p", { class: "prompt" }, C.TYPE_PROMPT[q.type]),
      el("blockquote", { class: "saying big", lang: q.l || "en" }, C.blankedNode(shownText(q))));
  }
  function revealSaying(card, it) {
    if (it.q.type === "blank") card.querySelector(".saying").replaceChildren(C.blankedNode(it.q.q, it.q.a));
  }

  /* ----------------------------------------------------------- setup page */
  function renderSetup() {
    const redraw = renderSetup;
    const count = store.get("groupCount", 10);
    const mcCount = ctx.poolFor(ctx.state.topic, ctx.state.tier).filter(q => q.type !== "order").length;
    const countSeg = el("div", { class: "seg", role: "group", "aria-label": "Number of questions" },
      COUNTS.map(n => el("button", { "aria-pressed": String(n === count), onclick: () => { store.set("groupCount", n); redraw(); } }, n)));
    const enough = mcCount >= 4;
    const running = game && game.phase !== "done" && game.phase !== "end";
    main.replaceChildren(...[
      el("section", { class: "intro" },
        el("p", { class: "label" }, "Play together"),
        el("h1", {}, "One quiz for the whole room"),
        el("p", {}, "For a class, a family or a collective. The questions are Shri Mataji's sentences, exactly as captioned, on one big screen. Afterwards everyone sees where and when she said them.")),
      running ? el("section", { class: "card notice-card" },
        el("div", { class: "spread" },
          el("p", {}, el("b", {}, game.mode === "phones" ? `A room is open with ${game.players.size} players.` : "A team game is in progress.")),
          el("div", { class: "row" },
            el("a", { class: "btn accent small", href: "#/group/" + game.mode }, "Back to the game"),
            el("button", { class: "btn ghost small", onclick: () => { endGame(); redraw(); } }, "End it")))) : null,
      ctx.langPicker(redraw),
      el("section", { class: "card" },
        el("div", { class: "spread" }, el("h2", {}, "Who is playing?"), el("span", { class: "muted" }, "Age group")),
        ctx.agePicker(redraw)),
      ctx.topicPicker(redraw),
      el("section", { class: "card" },
        el("div", { class: "spread" },
          el("div", {}, el("h3", {}, "How many questions?"), el("p", { class: "muted nums" }, `${mcCount.toLocaleString()} questions in ${ctx.state.topic.name} for ages ${AGES[ctx.state.tier]}`)),
          countSeg)),
      el("div", { class: "modes" },
        el("section", { class: "card mode" },
          el("h2", {}, "Everyone on their phones"),
          el("p", {}, "Players scan a code with their own phone and answer there; no app needed on their phones. Right answers score more the faster they come, and the scores appear after each question."),
          el("p", { class: "muted" }, "This phone and the players must be on the same Wi-Fi. No Wi-Fi? Turn on this phone's hotspot and let the players join it."),
          lastError ? el("p", { class: "notice warn", role: "alert" }, lastError) : null,
          canHost()
            ? el("button", { class: "btn accent", disabled: !enough || null, onclick: startPhones }, "Open a room")
            : el("p", { class: "notice" }, "Opening a room needs the Little Lotus Android app on the host's phone. Players can join from any phone.")),
        el("section", { class: "card mode" },
          el("h2", {}, "Teams on one screen"),
          el("p", {}, "No phones needed. Teams hold up a printed A, B, C or D card (or call it out), and you tap which teams were right. Good for little ones."),
          el("a", { class: "btn accent", href: "#/group/teams", "aria-disabled": !enough || null, onclick: e => { if (!enough) e.preventDefault(); } }, "Set up teams")))
    ].filter(Boolean));
  }

  function endGame() {
    if (game && game.mode === "phones") {
      clearInterval(game.pump);
      try { window.Android.hostStop(); } catch (e) { /* already closed */ }
    }
    game = null;
  }

  /* ---------------------------------------------------------------- teams */
  function teamNames() {
    const saved = store.get("teams", null);
    return Array.isArray(saved) && saved.length >= 2 ? saved.slice(0, 6) : TEAM_NAMES.slice(0, 2);
  }

  function renderTeamSetup() {
    let names = teamNames();
    const list = el("div", { class: "team-names" });
    const save = () => store.set("teams", names);
    const draw = () => {
      list.replaceChildren(...names.map((n, k) => el("label", { class: "field team-field", style: "--team:" + TEAM_COLORS[k] },
        el("span", {}, el("span", { class: "dot", style: "--dot:" + TEAM_COLORS[k] }), `Team ${k + 1}`),
        el("input", { type: "text", value: n, maxlength: "18", "aria-label": `Name of team ${k + 1}`, oninput: e => { names[k] = e.target.value; save(); } }))));
      seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(+b.textContent === names.length)));
    };
    const seg = el("div", { class: "seg", role: "group", "aria-label": "Number of teams" },
      [2, 3, 4, 5, 6].map(n => el("button", { onclick: () => {
        names = names.slice(0, n); while (names.length < n) names.push(TEAM_NAMES[names.length]); save(); draw();
      } }, n)));
    draw();
    const n = OPTION_COUNT[ctx.state.tier];
    main.replaceChildren(
      el("section", { class: "intro" },
        el("p", { class: "label" }, `Play together · ${ctx.state.topic.name} · ages ${AGES[ctx.state.tier]}`),
        el("h1", {}, "Teams on one screen")),
      el("section", { class: "card" },
        el("div", { class: "spread" }, el("h2", {}, "Teams"), seg),
        list),
      el("section", { class: "card" },
        el("h3", {}, "Answer cards"),
        el("p", { class: "muted" }, `Each team holds up the letter of its answer. For ages ${AGES[ctx.state.tier]} there are ${n} answers, so each team needs the cards ${LETTERS.slice(0, n).split("").join(", ")}.`),
        el("div", { class: "row" }, el("button", { class: "btn ghost", onclick: () => printCards(names, n) }, "Print answer cards"))),
      el("div", { class: "row" },
        el("a", { class: "btn ghost", href: "#/group" }, "Back"),
        el("button", { class: "btn accent", onclick: () => startTeams(names.map((s, k) => s.trim() || TEAM_NAMES[k])) }, "Start the quiz")));
  }

  function startTeams(names) {
    const items = makeItems(store.get("groupCount", 10));
    if (!items.length) return;
    game = { mode: "teams", items, i: 0, phase: "ask", tier: ctx.state.tier, got: new Set(),
      teams: names.map((name, k) => ({ name, color: TEAM_COLORS[k], score: 0 })) };
    drawTeams();
  }

  function scoreChips(teams) {
    return el("div", { class: "team-scores" }, teams.map(t => el("span", { class: "team-chip nums", style: "--team:" + t.color }, t.name, el("b", {}, t.score))));
  }

  function drawTeams() {
    const g = game;
    if (g.phase === "done") return teamsDone();
    const it = g.items[g.i];
    const card = questionCard(it, g.i + 1, g.items.length, scoreChips(g.teams));
    const revealed = g.phase === "reveal";
    card.append(tiles(it, revealed));
    if (!revealed) {
      card.append(el("div", { class: "row" },
        C.canSpeak() ? el("button", { class: "btn ghost", onclick: () => C.speak(shownText(it.q), it.q.l) }, "🔊 Read aloud") : null,
        el("button", { class: "btn accent", onclick: () => { g.phase = "reveal"; g.got = new Set(); drawTeams(); } }, "Show the answer")));
    } else {
      revealSaying(card, it);
      const toggles = el("div", { class: "team-toggles", role: "group", "aria-label": "Teams that got it right" },
        g.teams.map((t, k) => el("button", {
          class: "team-toggle", style: "--team:" + t.color, "aria-pressed": String(g.got.has(k)),
          onclick: e => { g.got.has(k) ? g.got.delete(k) : g.got.add(k); e.currentTarget.setAttribute("aria-pressed", String(g.got.has(k))); }
        }, t.name)));
      const last = g.i + 1 >= g.items.length;
      card.append(el("div", { class: "reveal" },
        el("div", { class: "verdict ok" }, `The answer is ${LETTERS[it.right]}: “${it.q.a}”`),
        el("blockquote", { class: "quote", lang: it.q.l || "en" }, it.q.s),
        C.sourceBlock(it.q)),
      el("h3", {}, "Which teams got it right?"), toggles,
      el("div", { class: "row" }, el("button", { class: "btn accent", onclick: () => {
        g.got.forEach(k => g.teams[k].score++);
        g.i++; g.phase = last ? "done" : "ask"; drawTeams(); window.scrollTo({ top: 0 });
      } }, last ? "See the results" : "Next question")));
    }
    main.replaceChildren(card, el("div", { class: "row" }, twoStep("End game", "Tap again to end", () => { endGame(); location.hash = "#/group"; })));
  }

  function teamsDone() {
    const g = game;
    const ranked = g.teams.slice().sort((a, b) => b.score - a.score);
    const top = ranked[0].score;
    const winners = ranked.filter(t => t.score === top);
    main.replaceChildren(
      el("section", { class: "card stage", style: "justify-items:center;text-align:center" },
        el("p", { class: "label" }, `${g.items.length} questions · ages ${AGES[g.tier]}`),
        el("h1", {}, winners.length > 1 ? "A tie at the top!" : `${winners[0].name} wins!`),
        board(ranked.map(t => ({ name: t.name, score: t.score, color: t.color })), n => n === 1 ? "right answer" : "right answers"),
        el("div", { class: "row", style: "justify-content:center" },
          el("button", { class: "btn accent", onclick: () => startTeams(g.teams.map(t => t.name)) }, "Play again"),
          el("button", { class: "btn ghost", onclick: () => { endGame(); location.hash = "#/group"; } }, "Change topic"))));
  }

  // Ranked list; equal scores share a place.
  function board(rows, unit, limit) {
    let place = 0, prev = null;
    const ranked = rows.map((r, k) => { if (r.score !== prev) { place = k + 1; prev = r.score; } return Object.assign({ place }, r); });
    return el("ol", { class: "board" }, ranked.slice(0, limit || ranked.length).map(r => el("li", { class: "nums" + (r.place === 1 ? " first" : ""), style: r.color ? "--team:" + r.color : null },
      el("span", { class: "place" }, ordinal(r.place)),
      el("span", { class: "who" }, r.name),
      r.gain != null ? el("span", { class: "gain" }, r.gain ? "+" + r.gain.toLocaleString() : "") : null,
      el("b", {}, r.score.toLocaleString(), el("small", {}, " " + (typeof unit === "function" ? unit(r.score) : unit))))));
  }

  /* ---------------------------------------------------------- answer cards */
  function printCards(names, n) {
    const ink = ["#FF8A6B", "#FFD45C", "#5ED39A", "#6FB8FF"];
    const halves = [];
    names.forEach(team => LETTERS.slice(0, n).split("").forEach((L, k) => halves.push(
      `<div class="ac" style="--ac:${ink[k]}"><b>${L}</b><span>${esc(team.trim() || "")}</span></div>`)));
    if (halves.length % 2) halves.push('<div class="ac blank"></div>');
    let html = "";
    for (let i = 0; i < halves.length; i += 2) html += `<section class="ac-page">${halves[i]}${halves[i + 1]}</section>`;
    document.getElementById("sheet").innerHTML = html;
    if (window.Android && window.Android.print) window.Android.print();
    else window.print();
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* --------------------------------------------------------------- phones */
  const ERRORS = {
    network: "This phone isn't on a Wi-Fi network. Connect it to Wi-Fi, or turn on its hotspot, then try again.",
    port: "The room couldn't be opened. Close other apps that might be using the network and try again."
  };

  function startPhones() {
    const room = String(1000 + Math.floor(Math.random() * 9000));
    let res;
    try { res = JSON.parse(window.Android.hostStart(room)); } catch (e) { res = { ok: false, error: "port" }; }
    if (!res.ok) { lastError = ERRORS[res.error] || ERRORS.port; renderSetup(); return; }
    lastError = "";
    game = { mode: "phones", room, port: res.port, addrs: res.addrs, addr: res.addrs[0], players: new Map(),
      items: [], i: -1, phase: "lobby", answers: new Map(), tier: ctx.state.tier, n: store.get("groupCount", 10),
      secs: SECONDS[ctx.state.tier], start: 0, deadline: 0 };
    game.pump = setInterval(pump, 250);
    push();
    location.hash = "#/group/phones";
  }
  const roomUrl = g => `http://${g.addr}:${g.port}/?r=${g.room}`;

  function standings(g) {
    return [...g.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }
  function places(g) {
    const out = {}; let place = 0, prev = null;
    standings(g).forEach((p, k) => { if (p.score !== prev) { place = k + 1; prev = p.score; } out[p.id] = place; });
    return out;
  }

  // What the players' phones show, sent to the room.
  function publicState(g) {
    const base = { age: g.tier, players: g.players.size };
    if (g.phase === "lobby") return Object.assign(base, { ph: "lobby" });
    if (g.phase === "end") {
      const pl = places(g), res = {};
      g.players.forEach(p => { res[p.id] = { total: p.score, rank: pl[p.id] }; });
      return Object.assign(base, { ph: "end", res, top: standings(g).slice(0, 3).map(p => ({ name: p.name, total: p.score })) });
    }
    const it = g.items[g.i], q = it.q;
    const common = { n: g.i + 1, of: g.items.length, q: g.i, prompt: C.TYPE_PROMPT[q.type], lang: q.l || "en", opts: it.opts.map(vtt) };
    if (g.phase === "q") return Object.assign(base, common, { ph: "q", text: vtt(shownText(q)), secs: g.secs, left: Math.max(1, Math.round((g.deadline - Date.now()) / 1000)) });
    const pl = places(g), res = {};
    g.players.forEach(p => { res[p.id] = { ok: !!p.ok, pts: p.gain || 0, total: p.score, rank: pl[p.id], ans: p.answered }; });
    return Object.assign(base, common, { ph: "r", text: vtt(q.s), right: it.right, res });
  }
  function push() { return Number(window.Android.hostState(JSON.stringify(publicState(game)))) || Date.now(); }

  function pump() {
    const g = game;
    if (!g || g.mode !== "phones") return;
    let events = [];
    try { events = JSON.parse(window.Android.hostEvents()); } catch (e) { return; }
    let joined = false;
    for (const e of events) {
      if (e.e === "join" && !g.players.has(e.id)) {
        g.players.set(e.id, { id: e.id, name: e.name, score: 0, gain: null, ok: false, answered: false });
        joined = true;
      } else if (e.e === "answer" && g.phase === "q" && e.q === g.i && g.players.has(e.id) && !g.answers.has(e.id) && e.a < g.items[g.i].opts.length) {
        g.answers.set(e.id, { a: e.a, t: e.t });
      }
    }
    if (joined && g.phase !== "q") push(); // phones show how many have joined
    if (g.phase === "q") {
      const left = Math.max(0, Math.ceil((g.deadline - Date.now()) / 1000));
      if (g.ui && g.ui.left) g.ui.left.textContent = left;
      if (g.ui && g.ui.count) g.ui.count.textContent = `${g.answers.size} of ${g.players.size} answered`;
      if (left <= 0 || (g.players.size && g.answers.size >= g.players.size)) reveal();
    } else if (joined && here("phones")) drawPhones();
  }

  function ask() {
    const g = game;
    g.i++;
    if (g.i >= g.items.length) { g.phase = "end"; push(); return drawPhones(); }
    g.phase = "q"; g.answers = new Map();
    g.players.forEach(p => { p.gain = null; p.ok = false; p.answered = false; });
    g.deadline = Date.now() + g.secs * 1000;
    g.start = push();
    drawPhones();
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
    drawPhones();
  }

  function drawPhones() {
    const g = game;
    if (!g || !here("phones")) return; // the game carries on while the host looks at another page
    g.ui = null;
    const end = twoStep("Close the room", "Tap again: everyone leaves", () => { endGame(); location.hash = "#/group"; });
    if (g.phase === "lobby") return main.replaceChildren(lobby(g), el("div", { class: "row" }, end));
    if (g.phase === "end") return main.replaceChildren(finalBoard(g), el("div", { class: "row" }, end));
    const it = g.items[g.i];
    if (g.phase === "q") {
      const left = el("span", { class: "timer nums", "aria-live": "off" }, g.secs);
      const count = el("span", { class: "muted nums" }, `0 of ${g.players.size} answered`);
      g.ui = { left, count };
      const card = questionCard(it, g.i + 1, g.items.length, left);
      card.append(tiles(it, false), el("div", { class: "spread" }, count,
        el("div", { class: "row" },
          C.canSpeak() ? el("button", { class: "btn ghost small", onclick: () => C.speak(shownText(it.q), it.q.l) }, "🔊 Read aloud") : null,
          el("button", { class: "btn accent small", onclick: reveal }, "Show the answer now"))));
      return main.replaceChildren(card, el("div", { class: "row" }, end));
    }
    const counts = it.opts.map(() => 0);
    g.answers.forEach(a => counts[a.a]++);
    const last = g.i + 1 >= g.items.length;
    if (g.phase === "board") {
      return main.replaceChildren(el("section", { class: "card stage" },
        el("div", { class: "quizbar nums" }, el("span", {}, `After question ${g.i + 1} of ${g.items.length}`)),
        el("h2", {}, "Scores"),
        board(standings(g).map(p => ({ name: p.name, score: p.score, gain: p.gain })), "points", 8),
        el("div", { class: "row" }, el("button", { class: "btn accent", onclick: ask }, last ? "Final results" : "Next question"))), el("div", { class: "row" }, end));
    }
    const card = questionCard(it, g.i + 1, g.items.length, el("span", { class: "muted nums" }, `${g.answers.size} of ${g.players.size} answered`));
    revealSaying(card, it);
    const right = [...g.players.values()].filter(p => p.ok).length;
    card.append(tiles(it, true, counts), el("div", { class: "reveal" },
      el("div", { class: "verdict ok" }, `The answer is ${LETTERS[it.right]}: “${it.q.a}”`),
      el("p", { class: "muted nums" }, `${right} of ${g.players.size} got it right`),
      el("blockquote", { class: "quote", lang: it.q.l || "en" }, it.q.s),
      C.sourceBlock(it.q)),
    el("div", { class: "row" }, el("button", { class: "btn accent", onclick: () => { g.phase = "board"; drawPhones(); } }, "Show the scores")));
    main.replaceChildren(card, el("div", { class: "row" }, end));
  }

  function lobby(g) {
    const url = roomUrl(g);
    const qr = el("div", { class: "qr-big", html: window.QR.svg(url, { size: 260 }) });
    const addrSeg = g.addrs.length > 1 ? el("div", { class: "row" }, el("span", { class: "muted" }, "Players can't open it? Try another address:"),
      el("div", { class: "seg", role: "group", "aria-label": "Address" }, g.addrs.map(a => el("button", { "aria-pressed": String(a === g.addr), onclick: () => { g.addr = a; drawPhones(); } }, a)))) : null;
    const names = [...g.players.values()];
    return el("section", { class: "card stage" },
      el("p", { class: "label" }, `${ctx.state.topic.name} · ages ${AGES[g.tier]} · ${g.n} questions`),
      el("div", { class: "lobby" },
        qr,
        el("div", { class: "join-steps" },
          el("h1", {}, "Join the game"),
          el("ol", {},
            el("li", {}, "Join the same Wi-Fi as this phone, or this phone's hotspot."),
            el("li", {}, "Scan the code with your phone's camera, or open ", el("b", { class: "nums url" }, url.replace(/^http:\/\//, "").replace(/\?r=\d+$/, "")), " in its browser."),
            el("li", {}, "Type your name. Room code ", el("b", { class: "nums room" }, g.room), ".")))),
      addrSeg,
      el("h3", { class: "nums" }, names.length ? `${names.length} ${names.length === 1 ? "player" : "players"} in` : "Waiting for players…"),
      el("div", { class: "chips players" }, names.map(p => el("span", { class: "chip" }, p.name))),
      el("div", { class: "row" },
        el("button", { class: "btn accent", disabled: !names.length || null, onclick: () => { g.items = makeItems(g.n); g.i = -1; ask(); } }, "Start the quiz")));
  }

  function finalBoard(g) {
    const s = standings(g);
    const podium = s.slice(0, 3);
    return el("section", { class: "card stage", style: "justify-items:center;text-align:center" },
      el("p", { class: "label" }, `${g.items.length} questions · ages ${AGES[g.tier]}`),
      el("h1", {}, s.length ? (s[1] && s[1].score === s[0].score ? "A tie at the top!" : `${s[0].name} wins!`) : "Thank you for playing"),
      el("div", { class: "podium" }, podium.map((p, k) => el("div", { class: "step s" + (k + 1) }, el("b", {}, p.name), el("span", { class: "nums" }, p.score.toLocaleString()), el("i", {}, ordinal(k + 1))))),
      board(s.map(p => ({ name: p.name, score: p.score })), "points"),
      el("div", { class: "row", style: "justify-content:center" },
        el("button", { class: "btn accent", onclick: () => { g.players.forEach(p => { p.score = 0; p.gain = null; }); g.phase = "lobby"; push(); drawPhones(); } }, "Play again with this room")));
  }

  /* ---------------------------------------------------------------- entry */
  function render(m, sub, c) {
    main = m; ctx = c;
    if (sub === "teams") return game && game.mode === "teams" ? drawTeams() : renderTeamSetup();
    if (sub === "phones") return game && game.mode === "phones" ? drawPhones() : renderSetup();
    renderSetup();
  }

  window.CQGroup = { render };
})();
