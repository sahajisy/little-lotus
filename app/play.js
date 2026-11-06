/* Little Lotus, Play together: the page players open on their own phones.
   It is served either by the host's phone (GameServer.java, on the local network) or by the
   website (room.php, online); it shows whatever the host's screen is asking, and sends this
   player's answer back. */
(function () {
  "use strict";
  const LETTERS = "ABCD";
  const TILES = ["var(--c-mooladhara)", "var(--c-swadishthan)", "var(--c-nabhi)", "var(--c-vishuddhi)"];
  const main = document.getElementById("main");
  const conn = document.getElementById("conn");
  const who = document.getElementById("who");
  const params = new URLSearchParams(location.search);
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem("lotus-player")) || {}; } catch (e) { return {}; } })();
  let room = params.get("r") || saved.room || "";
  let me = saved.room === room ? saved : {}; // {room, id, key, name}
  let version = 0, current = null, answered = {}, timer = null, closed = false;
  // The phone's own server listens on ports 8686-8690; anywhere else, this page came from the website.
  const ONLINE = !/^(868[6-9]|8690)$/.test(location.port);
  const api = (op, query) => ONLINE ? `room.php?a=${op}${query ? "&" + query : ""}` : `${op}${query ? "?" + query : ""}`;
  const CANT_REACH = ONLINE ? "Couldn't reach the game. Check your internet connection." : "Couldn't reach the host's phone. Are you on the same Wi-Fi?";

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
    return n;
  }
  const ordinal = n => n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "th");
  const remember = () => { try { sessionStorage.setItem("lotus-player", JSON.stringify(me)); } catch (e) { /* private mode */ } };
  const post = (path, data) => fetch(path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data) }).then(r => r.json());
  function blanked(text) {
    const parts = text.split("_____"), frag = el("span");
    parts.forEach((p, i) => { frag.append(p); if (i < parts.length - 1) frag.append(el("span", { class: "blank", "aria-label": "blank" }, "_____")); });
    return frag;
  }
  const show = (...kids) => { clearInterval(timer); main.replaceChildren(...kids); };

  /* ----------------------------------------------------------------- join */
  function joinScreen(error) {
    const name = el("input", { class: "search", type: "text", maxlength: "18", autocomplete: "nickname", placeholder: "Your name", "aria-label": "Your name", value: me.name || "" });
    const code = el("input", { class: "search nums", type: "text", inputmode: "numeric", maxlength: "6", placeholder: "Room code", "aria-label": "Room code", value: room });
    const btn = el("button", { class: "btn accent", type: "submit" }, "Join");
    const form = el("form", { class: "card join", onsubmit: e => {
      e.preventDefault();
      if (!name.value.trim()) { name.focus(); return; }
      btn.disabled = true;
      room = code.value.trim();
      post(api("join"), { room, name: name.value }).then(r => {
        if (r.error) { btn.disabled = false; joinScreen({ room: "That room code isn't right. Check the host's screen.", full: "This room is full.", name: "Please type a name.", closed: "This room is closed." }[r.error] || "Couldn't join. Try again."); return; }
        me = { room, id: r.id, key: r.key, name: r.name };
        remember();
        listen();
      }).catch(() => { btn.disabled = false; joinScreen(CANT_REACH); });
    } },
      el("h1", {}, "Join the game"),
      el("p", { class: "muted" }, "Your name is shown on the big screen with the scores."),
      error ? el("p", { class: "notice warn", role: "alert" }, error) : null,
      name, params.get("r") ? null : code, btn);
    show(form);
    name.focus();
  }

  /* --------------------------------------------------------------- listen */
  function listen() {
    who.textContent = me.name || "";
    if (!current) show(el("section", { class: "card" }, el("p", {}, "Connecting…")));
    const loop = () => {
      if (closed) return;
      fetch(api("state", `code=${encodeURIComponent(room)}&key=${encodeURIComponent(me.key)}&v=${version}`), { cache: "no-store" }).then(r => r.json()).then(r => {
        conn.hidden = true;
        if (r.closed) { closed = true; return show(el("section", { class: "card" }, el("h1", {}, "The room is closed"), el("p", {}, "Thank you for playing!"))); }
        if (!r.me) { me = {}; remember(); return joinScreen("The host's room was opened again. Please join once more."); }
        const changed = r.v !== version;
        if (changed) { version = r.v; current = r.s; draw(r.s); }
        // The phone's server waits for news before answering; the website answers at once, so ask again in a moment.
        setTimeout(loop, ONLINE && !changed ? 1000 : 0);
      }).catch(() => { conn.hidden = false; setTimeout(loop, 1500); });
    };
    loop();
  }

  function draw(s) {
    document.documentElement.setAttribute("data-age", String(s.age == null ? 2 : s.age));
    if (s.ph === "q") return question(s);
    if (s.ph === "r") return result(s);
    if (s.ph === "end") return final(s);
    show(el("section", { class: "card wait" },
      el("p", { class: "label" }, "You're in"),
      el("h1", {}, me.name),
      el("p", {}, "Watch the big screen. The quiz starts soon."),
      el("p", { class: "muted nums" }, `${s.players || 1} ${s.players === 1 ? "player" : "players"} in the room`)));
  }

  function question(s) {
    const head = el("div", { class: "quizbar nums" }, el("span", {}, `Question ${s.n} of ${s.of}`), el("span", { class: "timer" }, s.left));
    if (answered[s.q] != null) {
      return show(el("section", { class: "card wait" }, head,
        el("div", { class: "answer picked", style: "--tile:" + TILES[answered[s.q] % 4] }, el("span", { class: "key" }, LETTERS[answered[s.q]]), el("span", {}, s.opts[answered[s.q]])),
        el("p", {}, "Answer sent. Waiting for the others…")));
    }
    const box = el("div", { class: "answers" + (s.opts.length === 2 ? " two" : "") }, s.opts.map((o, k) => el("button", {
      class: "answer", style: "--tile:" + TILES[k % 4], onclick: () => {
        [...box.children].forEach(b => b.disabled = true);
        post(api("answer"), { code: room, key: me.key, q: s.q, a: k }).then(r => {
          if (r.error === "player") { me = {}; remember(); return joinScreen("Please join again."); }
          answered[s.q] = k;
          if (current === s) question(s);
        }).catch(() => { [...box.children].forEach(b => b.disabled = false); conn.hidden = false; });
      }
    }, el("span", { class: "key" }, LETTERS[k]), el("span", {}, o))));
    show(el("section", { class: "card" }, head,
      el("p", { class: "prompt" }, s.prompt),
      el("blockquote", { class: "saying", lang: s.lang }, blanked(s.text)),
      box));
    // Count down on this phone from the seconds left when the question arrived.
    const t = head.querySelector(".timer"), end = Date.now() + s.left * 1000;
    timer = setInterval(() => { t.textContent = Math.max(0, Math.ceil((end - Date.now()) / 1000)); }, 250);
  }

  // The talk and moment the sentence comes from. The link only ever opens YouTube, whatever the room sends.
  function source(src) {
    if (!src || typeof src.title !== "string") return null;
    const safe = typeof src.url === "string" && /^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+(&t=\d+s)?$/.test(src.url);
    return el("div", { class: "source" },
      el("b", {}, src.title),
      el("span", { class: "muted nums" }, [src.date, src.at ? "at " + src.at : ""].filter(Boolean).join(" · ")),
      safe ? el("div", { class: "row" }, el("a", { class: "btn small", href: src.url, target: "_blank", rel: "noopener" }, "▶ Watch this moment")) : null);
  }

  function result(s) {
    const r = s.res && s.res[me.id];
    const right = el("p", {}, "The answer was ", el("b", {}, `${LETTERS[s.right]}: ${s.opts[s.right]}`));
    const words = [el("blockquote", { class: "quote", lang: s.lang }, s.text), source(s.src)];
    if (!r) return show(el("section", { class: "card wait" }, el("h1", {}, "Get ready"), right, el("p", { class: "muted" }, "You'll play from the next question."), ...words));
    show(el("section", { class: "card wait" },
      el("div", { class: "quizbar nums" }, el("span", {}, `Question ${s.n} of ${s.of}`)),
      el("div", { class: "verdict " + (r.ok ? "ok" : "no") }, r.ok ? "Right!" : r.ans ? "Not this time" : "Time's up"),
      r.ok ? el("p", { class: "score nums" }, "+" + r.pts.toLocaleString()) : right,
      el("p", { class: "nums" }, `${r.total.toLocaleString()} points · ${ordinal(r.rank)} of ${s.players}`),
      ...words));
  }

  function final(s) {
    const r = s.res && s.res[me.id];
    show(el("section", { class: "card wait", style: "text-align:center;justify-items:center" },
      el("p", { class: "label" }, "Final results"),
      r ? el("h1", {}, `You came ${ordinal(r.rank)}`) : el("h1", {}, "Thank you for playing"),
      r ? el("p", { class: "score nums" }, r.total.toLocaleString()) : null,
      r ? el("p", { class: "muted nums" }, `points · ${s.players} players`) : null,
      el("ol", { class: "board" }, s.top.map((p, k) => el("li", { class: "nums" + (k === 0 ? " first" : "") },
        el("span", { class: "place" }, ordinal(k + 1)), el("span", { class: "who" }, p.name), el("b", {}, p.total.toLocaleString()))))));
  }

  if (me.key) listen(); else joinScreen();
})();
