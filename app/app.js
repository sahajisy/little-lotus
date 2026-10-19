/* Little Lotus: quizzes and talks built only from Shri Mataji's caption files.
   Her sentences are always shown exactly as captioned. A question may hide one
   word behind a blank or shuffle the sentence's own words; every answer then
   reveals the sentence unchanged, with the talk, date and moment it comes from. */
(function () {
  "use strict";

  const D = window.SY_DATA;
  const AGES = D.ages; // ["1-6", "7-13", "14-18", "19-25", "26+"]
  const AGE_NAMES = ["Little ones", "Children", "Teens", "Young adults", "Adults"];
  const OPTION_COUNT = [2, 3, 4, 4, 4];
  const ROUND_SIZE = [6, 10, 10, 12, 12];
  const CHAKRA_COLOR = {
    Mooladhara: "var(--c-mooladhara)", Swadishthan: "var(--c-swadishthan)", Nabhi: "var(--c-nabhi)",
    Void: "var(--c-void)", Heart: "var(--c-heart)", Vishuddhi: "var(--c-vishuddhi)",
    Agnya: "var(--c-agnya)", Sahasrara: "var(--c-sahasrara)"
  };
  const LANGS = [["en", "English", "English"], ["hi", "हिंदी", "Hindi"], ["mr", "मराठी", "Marathi"]];
  const LANG_LABEL = { en: "English", hi: "हिंदी", mr: "मराठी" };
  const SPEECH_LANG = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };
  const TILE_COLORS = ["var(--c-mooladhara)", "var(--c-swadishthan)", "var(--c-nabhi)", "var(--c-vishuddhi)"];
  const TYPE_PROMPT = {
    blank: "Which word did Shri Mataji say?",
    order: "Put her words back in order",
    puja: "At which puja did Shri Mataji say this?",
    decade: "In which decade did Shri Mataji say this?"
  };

  /* ---------------------------------------------------------------- utils */
  const APP_VERSION = "1.0";
  const $ = (sel, root = document) => root.querySelector(sel);
  // WebVTT character references (e.g. &nbsp;) are shown as the characters they stand for.
  const VTT_REFS = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": "\u00a0", "&lrm;": "\u200e", "&rlm;": "\u200f" };
  const vtt = s => String(s).replace(/&(?:amp|lt|gt|nbsp|lrm|rlm);/g, r => VTT_REFS[r]);
  const main = $("#main");
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : vtt(kid));
    return n;
  }
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sample = (a, n) => shuffle(a).slice(0, n);
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem("cq:" + k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("cq:" + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const fmtTime = s => { s = Math.max(0, s | 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
  const talk = id => { const t = D.talks[id]; return { id, title: t[0], date: t[1], pujas: t[2], events: t[3], chakras: t[4], langs: t[5] || ["en"] }; };
  // Link to a talk in the reader, in the language of the sentence, at its moment.
  const talkHref = (id, lang, at) => `#/talk/${id}${lang && lang !== "en" ? "~" + lang : ""}${at != null ? "@" + at : ""}`;
  const ytLink = (id, at) => "https://www.youtube.com/watch?v=" + id + (at ? "&t=" + Math.max(0, at | 0) + "s" : "");
  const ytShort = (id, at) => "https://youtu.be/" + id + (at ? "?t=" + Math.max(0, at | 0) : "");
  const niceDate = d => {
    if (!d) return "";
    const [y, m, dd] = d.split("-").map(Number);
    if (!m || m > 12) return String(y);
    return new Date(Date.UTC(y, m - 1, dd || 1)).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  };

  // Open outside links in the system browser / YouTube app when running inside the Android app.
  function openExternal(url) {
    if (window.Android && window.Android.openUrl) window.Android.openUrl(url);
    else window.open(url, "_blank", "noopener");
  }
  document.addEventListener("click", e => {
    const a = e.target.closest("a[data-ext]");
    if (!a) return;
    e.preventDefault();
    openExternal(a.href);
  });

  function speak(text, lang) {
    lang = lang || "en";
    const clean = vtt(text).replace(/_{3,}/g, lang === "en" ? " blank " : " … ");
    if (window.Android && window.Android.speakLang) { window.Android.speakLang(clean, SPEECH_LANG[lang]); return; }
    if (window.Android && window.Android.speak) { window.Android.speak(clean); return; }
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = SPEECH_LANG[lang]; u.rate = 0.92;
    speechSynthesis.speak(u);
  }
  const canSpeak = () => !!(window.Android && window.Android.speak) || "speechSynthesis" in window;

  /* ---------------------------------------------------------------- lotus */
  // The lotus opens with age: a three-petal bud for the little ones, nine open petals for adults.
  const LOTUS_STAGES = [
    { petals: 3, spread: 16, len: 0.82, width: 0.30 },
    { petals: 5, spread: 19, len: 0.86, width: 0.30 },
    { petals: 7, spread: 21, len: 0.90, width: 0.31 },
    { petals: 7, spread: 25, len: 0.92, width: 0.30 },
    { petals: 9, spread: 21, len: 0.95, width: 0.28 }
  ];
  const PETAL_COLORS = ["#E5484D", "#FF8A3D", "#FFC93C", "#3FBF7F", "#4DA3FF", "#7B6CF6", "#C77DFF"];
  function lotusSVG(stage, cls, animate) {
    const st = LOTUS_STAGES[stage] || LOTUS_STAGES[2];
    const mid = (st.petals - 1) / 2, L = 62, ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 120 92"); svg.setAttribute("class", cls); svg.setAttribute("aria-hidden", "true");
    const order = [...Array(st.petals).keys()].sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid));
    order.forEach((i, n) => {
      const k = i - mid, len = L * st.len * (1 - 0.07 * Math.abs(k)), w = len * st.width;
      const color = PETAL_COLORS[Math.round((i / Math.max(1, st.petals - 1)) * (PETAL_COLORS.length - 1))];
      const g = document.createElementNS(ns, "g");
      g.setAttribute("transform", `translate(60 78) rotate(${k * st.spread})`);
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M0 0C${-w} ${-len * .4} ${-w * .55} ${-len * .85} 0 ${-len}C${w * .55} ${-len * .85} ${w} ${-len * .4} 0 0Z`);
      path.setAttribute("fill", color); path.setAttribute("stroke", "#fff"); path.setAttribute("stroke-width", "1.6");
      if (animate) { path.setAttribute("class", "petal"); path.style.animationDelay = (n * 0.06) + "s"; }
      g.append(path); svg.append(g);
    });
    const seed = document.createElementNS(ns, "circle");
    seed.setAttribute("cx", "60"); seed.setAttribute("cy", "77"); seed.setAttribute("r", "4.2"); seed.setAttribute("fill", "#FFE08A");
    const water = document.createElementNS(ns, "path");
    water.setAttribute("d", "M22 86h76"); water.setAttribute("stroke", "currentColor"); water.setAttribute("stroke-width", "3"); water.setAttribute("stroke-linecap", "round"); water.setAttribute("opacity", ".35");
    svg.append(seed, water);
    return svg;
  }
  // The whole look (palette, shapes, type) follows the age group.
  function applyAge() {
    document.documentElement.setAttribute("data-age", String(state.tier));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#1D2047";
  }

  /* -------------------------------------------------------------- indexes */
  const Q = D.questions;
  function topicMatches(q, topic) {
    if (!topic || topic.kind === "all") return true;
    const t = D.talks[q.t];
    if (topic.kind === "pujas") return t[2].includes(topic.name);
    if (topic.kind === "events") return t[3].includes(topic.name);
    if (topic.kind === "chakras") return q.c === topic.name;
    return true;
  }
  function suitable(q, tier) {
    if (q.tier > tier) return false;
    if (tier === 0) return q.type === "blank" && (q.g === "chakra" || q.g === "deity");
    return true;
  }
  function poolFor(topic, tier, lang) {
    lang = lang || state.lang;
    return Q.filter(q => (q.l || "en") === lang && suitable(q, tier) && topicMatches(q, topic));
  }
  const countCache = {};
  function countFor(topic, tier, lang) {
    lang = lang || state.lang;
    const k = lang + "|" + topic.kind + "|" + topic.name + "|" + tier;
    if (!(k in countCache)) countCache[k] = poolFor(topic, tier, lang).length;
    return countCache[k];
  }

  /* ---------------------------------------------------------------- state */
  const state = {
    tier: store.get("tier", 1),
    topic: store.get("topic", { kind: "all", name: "Everything" }),
    topicKind: store.get("topicKind", "pujas"),
    lang: store.get("lang", "en")
  };
  if (!LANG_LABEL[state.lang]) state.lang = "en";
  const saveState = () => { store.set("tier", state.tier); store.set("topic", state.topic); store.set("topicKind", state.topicKind); store.set("lang", state.lang); };

  /* ------------------------------------------------------ shared pickers */
  function agePicker(onChange) {
    const wrap = el("div", { class: "ages", role: "group", "aria-label": "Age group" });
    AGES.forEach((a, i) => wrap.append(el("button", {
      class: "age", "aria-pressed": String(i === state.tier),
      onclick: () => { state.tier = i; saveState(); applyAge(); onChange(); }
    }, lotusSVG(i, "bloom"), el("b", {}, a), el("span", {}, AGE_NAMES[i]))));
    return wrap;
  }

  function langPicker(onChange) {
    const seg = el("div", { class: "seg langs", role: "group", "aria-label": "Language of her words" });
    LANGS.forEach(([k, label, en]) => seg.append(el("button", {
      lang: k, "aria-pressed": String(state.lang === k), title: en,
      onclick: () => {
        state.lang = k;
        if (countFor(state.topic, state.tier) < 4) state.topic = { kind: "all", name: "Everything" };
        saveState(); onChange();
      }
    }, label)));
    return el("section", { class: "card" },
      el("div", { class: "spread" }, el("h2", {}, "Language"), seg),
      el("p", { class: "muted" }, {
        en: "Talks Shri Mataji gave in English.",
        hi: "Talks Shri Mataji gave in Hindi, from the Hindi captions exactly as written.",
        mr: "Talks Shri Mataji gave in Marathi, from the Marathi captions exactly as written."
      }[state.lang]));
  }

  function topicPicker(onChange) {
    const box = el("div", { class: "card" });
    const kinds = [["pujas", "Pujas"], ["events", "Events"], ["chakras", "Chakras"]];
    const seg = el("div", { class: "seg", role: "group", "aria-label": "Topic type" });
    kinds.forEach(([k, label]) => seg.append(el("button", {
      "aria-pressed": String(state.topicKind === k),
      onclick: () => { state.topicKind = k; saveState(); onChange(); }
    }, label)));
    const chips = el("div", { class: "chips", role: "group", "aria-label": "Topic" });
    const all = { kind: "all", name: "Everything" };
    const mk = topic => {
      const n = countFor(topic, state.tier);
      const on = state.topic.kind === topic.kind && state.topic.name === topic.name;
      return el("button", {
        class: "chip", "aria-pressed": String(on), disabled: n < 4 || null,
        onclick: () => { state.topic = topic; saveState(); onChange(); }
      }, topic.kind === "chakras" ? el("span", { class: "dot", style: "--dot:" + CHAKRA_COLOR[topic.name] }) : null,
        topic.name, el("small", {}, n.toLocaleString()));
    };
    chips.append(mk(all));
    D.categories[state.topicKind].forEach(name => {
      const topic = { kind: state.topicKind, name };
      if (state.lang === "en" || countFor(topic, state.tier) > 0) chips.append(mk(topic));
    });
    box.append(el("div", { class: "spread" }, el("h2", {}, "Choose a topic"), seg), chips);
    return box;
  }

  /* ----------------------------------------------------------- play page */
  const HERO = [
    ["Hello, little lotus!", "Listen to a sentence, pick the missing word, and hear Shri Mataji say it."],
    ["Learn from Shri Mataji's own words", "Every question is one of her sentences. Answer it, then watch the moment she said it."],
    ["Learn from Shri Mataji's own words", "Every question is a sentence from one of Shri Mataji's talks, exactly as captioned. Answer, then see where and when she said it, and listen to that moment."],
    ["Shri Mataji's words, exactly as captioned", "Each question is one of her sentences from a captioned talk. Answer, then read where and when she said it, and listen to that moment."],
    ["Shri Mataji's words, exactly as captioned", "Each question is one of her sentences from a captioned talk, unchanged. After each answer you can read the whole passage, see the date and place, and listen to her."]
  ];
  function renderPlay() {
    const best = store.get("best", {});
    const key = state.topic.kind + "|" + state.topic.name + "|" + state.tier;
    const n = countFor(state.topic, state.tier);
    main.replaceChildren(
      el("section", { class: "intro hero" },
        el("div", { class: "intro" },
          el("p", { class: "label" }, HERO[state.tier][0]),
          el("h1", {}, "Little Lotus"),
          el("p", {}, HERO[state.tier][1])),
        lotusSVG(state.tier, "hero-lotus", true)),
      todayCard(),
      langPicker(renderPlay),
      el("section", { class: "card" },
        el("div", { class: "spread" }, el("h2", {}, "Who is playing?"), el("span", { class: "muted" }, "Age group")),
        agePicker(renderPlay)),
      topicPicker(renderPlay),
      el("section", { class: "card" },
        el("div", { class: "spread" },
          el("div", {},
            el("h3", {}, state.topic.name),
            el("p", { class: "muted nums" }, `${n.toLocaleString()} questions for ages ${AGES[state.tier]}` + (best[key] ? ` · Best: ${best[key]} stars` : ""))),
          el("div", { class: "row" },
            el("a", { class: "btn ghost", href: "#/print" }, "Print worksheets"),
            el("button", { class: "btn accent", disabled: n < 4 || null, onclick: startQuiz }, "Start quiz"))))
    );
  }

  // One sentence a day, the same for everyone on that date.
  function todayCard() {
    const fit = q => q.n >= 8 && q.n <= 30 && (q.type === "blank" || q.type === "order");
    let pool = Q.filter(q => fit(q) && (q.l || "en") === state.lang);
    if (!pool.length) pool = Q.filter(q => fit(q) && !q.l);
    if (!pool.length) return null;
    const d = new Date(), day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
    const q = pool[(day * 2654435761 >>> 0) % pool.length];
    const t = talk(q.t);
    return el("section", { class: "card today" },
      el("p", { class: "label" }, "Her words for today"),
      el("blockquote", { class: "saying", lang: q.l || "en" }, q.s),
      el("div", { class: "spread" },
        el("span", { class: "muted" }, t.title + " · " + fmtTime(q.at)),
        el("div", { class: "row" },
          el("a", { class: "btn small", href: ytLink(q.t, q.at), "data-ext": "" }, "▶ Listen"),
          canSpeak() ? el("button", { class: "btn ghost small", onclick: () => speak(q.s, q.l) }, "🔊 Read aloud") : null)));
  }

  /* --------------------------------------------------------------- quiz */
  let quiz = null;

  function pickRound(topic, tier) {
    const pool = poolFor(topic, tier);
    const size = Math.min(ROUND_SIZE[tier], pool.length);
    // Prefer questions made for this age, then the age below, then the rest.
    const weight = q => q.tier === tier ? 4 : q.tier === tier - 1 ? 2 : 1;
    const picked = [], used = new Set(), talksUsed = {};
    const order = pool.map(q => [q, Math.random() ** (1 / weight(q))]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    for (const q of order) {
      if (picked.length >= size) break;
      if ((talksUsed[q.t] || 0) >= 2) continue; // spread questions over many talks
      picked.push(q); used.add(q.id); talksUsed[q.t] = (talksUsed[q.t] || 0) + 1;
    }
    for (const q of order) { if (picked.length >= size) break; if (!used.has(q.id)) picked.push(q); }
    return shuffle(picked);
  }

  function matchCase(word, like) {
    if (like === like.toUpperCase() && like.length > 1) return word.toUpperCase();
    if (like[0] === like[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
    return word[0].toLowerCase() + word.slice(1);
  }

  function optionsFor(q, tier) {
    const n = OPTION_COUNT[tier];
    if (q.type === "blank" && q.l) {
      const pool = D.options.dev[q.g].filter(o => o !== q.k && o !== q.a && !q.s.includes(o));
      return shuffle([q.a, ...sample(pool, n - 1)]);
    }
    if (q.type === "blank") {
      const pool = D.options[q.g].filter(o => o.toLowerCase() !== q.k.toLowerCase() && !new RegExp("\\b" + o + "\\b", "i").test(q.s));
      const caseless = q.g === "quality" || q.g === "concept";
      const distract = sample(pool, n - 1).map(o => caseless ? matchCase(o, q.a) : o);
      return shuffle([q.a, ...distract]);
    }
    if (q.type === "puja") {
      const own = D.talks[q.t][2];
      return shuffle([q.a, ...sample(D.options.puja.filter(p => !own.includes(p)), n - 1)]);
    }
    if (q.type === "decade") {
      const all = D.options.decade.includes(q.a) ? D.options.decade : D.options.decade.concat(q.a);
      return shuffle([q.a, ...sample(all.filter(d => d !== q.a), n - 1)]);
    }
    return [];
  }

  function startQuiz() {
    const qs = pickRound(state.topic, state.tier);
    quiz = { qs, i: 0, score: 0, results: [], topic: state.topic, tier: state.tier };
    location.hash = "#/quiz";
  }

  function blankedNode(text, fill) {
    const parts = text.split("_____");
    const frag = el("span");
    parts.forEach((p, i) => {
      frag.append(p);
      if (i < parts.length - 1) frag.append(el("span", { class: "blank" + (fill ? " filled" : ""), "aria-label": fill ? null : "blank" }, fill || "_____"));
    });
    return frag;
  }

  function renderQuiz() {
    if (!quiz) quiz = { qs: pickRound(state.topic, state.tier), i: 0, score: 0, results: [], topic: state.topic, tier: state.tier };
    if (!quiz.qs.length) { quiz = null; location.hash = "#/play"; return; }
    if (quiz.i >= quiz.qs.length) return renderResult();
    const q = quiz.qs[quiz.i];
    const tier = quiz.tier;
    const card = el("section", { class: "card" });
    const bar = el("div", { class: "quizbar nums" },
      el("span", {}, `Question ${quiz.i + 1} of ${quiz.qs.length}`),
      el("span", {}, `${quiz.score} correct`));
    const prog = el("div", { class: "progress", "aria-hidden": "true" }, el("i", { style: `width:${quiz.i / quiz.qs.length * 100}%` }));
    card.append(bar, prog, el("p", { class: "prompt" }, TYPE_PROMPT[q.type]));
    const reveal = el("div", { class: "reveal", hidden: true });

    const finish = (ok, chosen) => {
      if (ok) quiz.score++;
      quiz.results.push({ q, ok, chosen });
      bar.lastChild.textContent = `${quiz.score} correct`;
      showReveal(reveal, q, ok, chosen);
    };

    if (q.type === "order") {
      const words = q.s.split(" ");
      let pool = shuffle(words.map((w, i) => ({ w, i })));
      if (pool.every((p, k) => p.i === k)) pool = pool.reverse();
      const built = [];
      const builtBox = el("div", { class: "words built", "aria-label": "Your sentence" });
      const poolBox = el("div", { class: "words pool", "aria-label": "Her words, shuffled" });
      const check = el("button", { class: "btn accent", disabled: true }, "Check");
      const draw = () => {
        builtBox.replaceChildren(...built.map((p, k) => el("button", { class: "word", onclick: () => { built.splice(k, 1); pool.push(p); draw(); } }, p.w)));
        poolBox.replaceChildren(...pool.map((p, k) => el("button", { class: "word", onclick: () => { pool.splice(k, 1); built.push(p); draw(); } }, p.w)));
        check.disabled = pool.length > 0;
      };
      check.onclick = () => {
        const ok = built.map(p => p.w).join(" ") === q.s;
        [...builtBox.children, ...poolBox.children].forEach(b => b.disabled = true);
        check.hidden = true;
        finish(ok, built.map(p => p.w).join(" "));
      };
      draw();
      card.append(builtBox, poolBox, el("div", { class: "row" }, check));
    } else {
      const saying = el("blockquote", { class: "saying" + (tier === 0 ? " big" : "") }, q.type === "blank" ? blankedNode(q.q) : q.s);
      card.append(saying);
      if (canSpeak()) card.append(el("div", { class: "row" }, el("button", { class: "btn ghost small", onclick: () => speak(q.type === "blank" ? q.q : q.s, q.l) }, "🔊 Read aloud")));
      const opts = optionsFor(q, tier);
      const box = el("div", { class: "answers" + (opts.length === 2 ? " two" : "") });
      opts.forEach((o, k) => {
        const tile = q.type === "blank" && q.g === "chakra" && CHAKRA_COLOR[o] ? CHAKRA_COLOR[o] : TILE_COLORS[k % 4];
        box.append(el("button", {
          class: "answer", style: "--tile:" + tile,
          onclick: () => {
            const ok = o === q.a;
            [...box.children].forEach((b, j) => {
              b.disabled = true;
              if (opts[j] === q.a) b.classList.add("right");
              else if (j === k) b.classList.add("wrong");
              else b.classList.add("dim");
            });
            if (q.type === "blank") saying.replaceChildren(blankedNode(q.q, q.a));
            finish(ok, o);
          }
        }, el("span", { class: "key" }, k + 1), el("span", {}, o)));
      });
      card.append(box);
    }
    card.append(reveal);
    main.replaceChildren(card);
    keyHandler = e => {
      if (!reveal.hidden && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); next(); return; }
      if (reveal.hidden && /^[1-4]$/.test(e.key)) { const b = card.querySelectorAll(".answer")[+e.key - 1]; if (b && !b.disabled) b.click(); }
    };
  }

  function sourceBlock(q) {
    const t = talk(q.t);
    return el("div", { class: "source" },
      el("b", {}, t.title),
      el("span", { class: "muted nums" }, [niceDate(t.date), "at " + fmtTime(q.at)].filter(Boolean).join(" · ")),
      el("div", { class: "row" },
        el("a", { class: "btn small", href: ytLink(q.t, q.at), "data-ext": "" }, "▶ Watch this moment"),
        el("a", { class: "btn ghost small", href: talkHref(q.t, q.l, q.at) }, "Read the full talk")));
  }

  function showReveal(box, q, ok, chosen) {
    const right = q.type === "order" ? "" : q.a;
    box.replaceChildren(
      el("div", { class: "verdict " + (ok ? "ok" : "no") }, ok ? (quiz.tier === 0 ? "Yes! Well done!" : "Right!") : (right ? `The answer is “${right}”` : "Here is how she said it")),
      el("blockquote", { class: "quote" }, q.s),
      sourceBlock(q),
      el("div", { class: "row" }, el("button", { class: "btn accent", onclick: next, autofocus: true }, quiz.i + 1 < quiz.qs.length ? "Next question" : "See my result")));
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const b = box.querySelector(".btn.accent"); if (b) b.focus({ preventScroll: true });
  }

  function next() { quiz.i++; renderQuiz(); window.scrollTo({ top: 0 }); }

  function renderResult() {
    const n = quiz.qs.length, c = quiz.score;
    const stars = c / n >= 0.8 ? 3 : c / n >= 0.5 ? 2 : 1;
    const key = quiz.topic.kind + "|" + quiz.topic.name + "|" + quiz.tier;
    const best = store.get("best", {});
    if (!best[key] || stars > best[key]) { best[key] = stars; store.set("best", best); }
    const missed = quiz.results.filter(r => !r.ok);
    main.replaceChildren(
      el("section", { class: "card", style: "justify-items:center;text-align:center" },
        el("p", { class: "label" }, `${quiz.topic.name} · ages ${AGES[quiz.tier]}`),
        el("div", { class: "stars", "aria-label": `${stars} of 3 stars` }, [1, 2, 3].map(s => el("span", { class: s <= stars ? "on" : "" }, "★"))),
        el("div", { class: "score" }, `${c} / ${n}`),
        el("p", {}, stars === 3 ? "Beautiful. You know her words well." : stars === 2 ? "Well done. Another round will make it stronger." : "A good start. Read the talks and try again."),
        el("div", { class: "row", style: "justify-content:center" },
          el("button", { class: "btn accent", onclick: startQuiz }, "Play again"),
          el("a", { class: "btn ghost", href: "#/play" }, "Change topic"),
          el("a", { class: "btn ghost", href: "#/print" }, "Print this topic"))),
      missed.length ? el("section", { class: "review" },
        el("h2", {}, "Her words to remember"),
        missed.map(r => el("div", { class: "item" },
          el("blockquote", { class: "quote" }, r.q.s),
          el("span", { class: "muted" }, talk(r.q.t).title + " · " + fmtTime(r.q.at)),
          el("div", { class: "row" }, el("a", { href: ytLink(r.q.t, r.q.at), "data-ext": "" }, "Watch"), el("a", { href: talkHref(r.q.t, r.q.l, r.q.at) }, "Read"))))) : null
    );
  }

  /* -------------------------------------------------------------- talks */
  function talkTags(t) { return [...(t.langs[0] !== "en" ? [LANG_LABEL[t.langs[0]]] : []), ...t.pujas, ...t.events.filter(e => e !== "Other talks"), ...t.chakras.map(c => c + " chakra")].join(" · "); }

  function renderTalks(kind, name) {
    const box = el("section", { class: "card" });
    const search = el("input", { class: "search", id: "talk-search", type: "search", placeholder: "Search talk titles, places, years…", "aria-label": "Search talks" });
    const list = el("div", { class: "talklist" });
    const kindSeg = el("div", { class: "seg", role: "group", "aria-label": "Group talks by" });
    [["pujas", "Pujas"], ["events", "Events"], ["chakras", "Chakras"]].forEach(([k, l]) => kindSeg.append(el("button", { "aria-pressed": String((kind || "pujas") === k), onclick: () => { location.hash = "#/talks/" + k; } }, l)));
    const kindNow = kind || "pujas";
    const talkLang = store.get("talkLang", "all");
    const langSeg = el("div", { class: "seg langs", role: "group", "aria-label": "Language" });
    [["all", "All"], ...LANGS.map(([k, l]) => [k, l])].forEach(([k, l]) => langSeg.append(el("button", { lang: k === "all" ? null : k, "aria-pressed": String(talkLang === k), onclick: () => { store.set("talkLang", k); renderTalks(kind, name); } }, l)));
    const ids = Object.keys(D.talks).filter(id => talkLang === "all" || (D.talks[id][5] || ["en"])[0] === talkLang);
    const groupChips = el("div", { class: "chips" });
    D.categories[kindNow].forEach(g => {
      const idx = { pujas: 2, events: 3, chakras: 4 }[kindNow];
      const n = ids.filter(id => D.talks[id][idx].includes(g)).length;
      if (!n && g !== name) return;
      groupChips.append(el("a", { class: "chip", href: `#/talks/${kindNow}/${encodeURIComponent(g)}`, "aria-pressed": String(g === name) },
        kindNow === "chakras" ? el("span", { class: "dot", style: "--dot:" + CHAKRA_COLOR[g] }) : null, g, el("small", {}, n)));
    });
    const draw = () => {
      const term = search.value.trim().toLowerCase();
      const idx = { pujas: 2, events: 3, chakras: 4 }[kindNow];
      let rows = ids.map(talk).filter(t => (!name || D.talks[t.id][idx].includes(name)) && (!term || (t.title + " " + t.date).toLowerCase().includes(term)));
      rows.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.title.localeCompare(b.title));
      const shown = rows.slice(0, 300);
      list.replaceChildren(
        el("p", { class: "muted nums" }, `${rows.length.toLocaleString()} talks` + (rows.length > shown.length ? ` · showing first ${shown.length}, search to narrow` : "")),
        ...shown.map(t => el("a", { class: "talk", href: `#/talk/${t.id}` },
          el("span", { class: "date" }, t.date || "—"),
          el("span", {}, el("span", { class: "t" }, t.title), el("br"), el("span", { class: "tags" }, talkTags(t))),
          el("span", { class: "muted", "aria-hidden": "true" }, "›"))));
    };
    search.addEventListener("input", draw);
    box.append(el("div", { class: "spread" }, el("h2", {}, name || "All talks"), kindSeg), el("div", { class: "spread" }, el("span", { class: "muted" }, "Language she spoke"), langSeg), groupChips, search, list);
    main.replaceChildren(
      el("section", { class: "intro" },
        el("p", { class: "label" }, `${ids.length.toLocaleString()} talks · ` + (talkLang === "all" ? "English, हिंदी, मराठी" : LANG_LABEL[talkLang])),
        el("h1", {}, "Shri Mataji's talks"),
        el("p", {}, "Grouped by puja, event, the chakras she speaks about most, and the language she spoke. Every talk opens exactly as captioned, line by line, with a link to each moment of the video.")),
      box);
    draw();
  }

  const talkCache = {};
  window.SY_TALK = (id, cues) => { talkCache[id] = cues; const w = talkWaiters[id]; if (w) { w.forEach(f => f(cues)); delete talkWaiters[id]; } };
  const talkWaiters = {};
  function loadTalk(id) {
    return new Promise((resolve, reject) => {
      if (talkCache[id]) return resolve(talkCache[id]);
      (talkWaiters[id] = talkWaiters[id] || []).push(resolve);
      const s = document.createElement("script");
      s.src = "talks/" + encodeURIComponent(id) + ".js";
      s.onerror = () => reject(new Error("missing"));
      document.head.append(s);
    });
  }

  async function renderTalk(id, at, lang) {
    if (!D.talks[id]) { main.replaceChildren(el("p", {}, "This talk is not in the collection.")); return; }
    const t = talk(id);
    if (!t.langs.includes(lang)) lang = t.langs[0];
    const original = lang === t.langs[0];
    const switcher = t.langs.length > 1 ? el("div", { class: "seg langs", role: "group", "aria-label": "Caption language" },
      ...t.langs.map((k, i) => el("button", { lang: k, "aria-pressed": String(k === lang), onclick: () => { location.hash = talkHref(id, k === "en" ? null : k, at); } },
        i === 0 ? LANG_LABEL[k] + " · her words" : LANG_LABEL[k] + " translation"))) : null;
    const reader = el("div", { class: "reader" }, el("p", { class: "muted" }, "Loading the captions…"));
    const find = el("input", { class: "search", type: "search", id: "in-talk-search", placeholder: "Find words in this talk", "aria-label": "Find words in this talk" });
    const qn = Q.filter(q => q.t === id).length;
    const notice = original
      ? "These are the caption lines exactly as they appear in the caption file. Tap a time to hear that moment."
      : `This is the ${{ en: "English", hi: "Hindi", mr: "Marathi" }[lang]} translation from the caption file. Shri Mataji gave this talk in ${{ en: "English", hi: "Hindi", mr: "Marathi" }[t.langs[0]]}; choose ${LANG_LABEL[t.langs[0]]} for her own words.`;
    main.replaceChildren(
      el("section", { class: "intro" },
        el("p", { class: "label" }, [niceDate(t.date), talkTags(t)].filter(Boolean).join(" · ")),
        el("h1", { style: "font-size:clamp(1.5rem,4vw,2.1rem)" }, t.title),
        el("div", { class: "row" },
          el("a", { class: "btn accent small", href: ytLink(id, at), "data-ext": "" }, "▶ Watch on YouTube"),
          el("a", { class: "btn ghost small", href: "#/talks" }, "All talks"),
          qn ? el("span", { class: "muted" }, `${qn} quiz questions come from this talk`) : null)),
      switcher,
      el("p", { class: "notice" + (original ? "" : " warn") }, notice),
      find,
      el("section", { class: "card" }, reader));
    let cues;
    try { cues = await loadTalk(lang === "en" ? id : id + "." + lang); }
    catch (e) { reader.replaceChildren(el("p", {}, "The captions for this talk could not be loaded.")); return; }
    let target = null;
    const rows = cues.map(([s, lines]) => {
      const row = el("div", { class: "cue", "data-s": s },
        el("a", { href: ytLink(id, s), "data-ext": "", "aria-label": "Watch from " + fmtTime(s) }, fmtTime(s)),
        el("p", { lang }, lines.join("\n")));
      if (at != null && target == null && s >= at) target = row;
      return row;
    });
    reader.replaceChildren(...rows);
    if (target) { target.classList.add("hl"); if (target.nextSibling) target.nextSibling.classList.add("hl"); setTimeout(() => target.scrollIntoView({ block: "center" }), 50); }
    find.addEventListener("input", () => {
      const term = find.value.trim();
      const rx = term.length > 1 ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi") : null;
      let first = null;
      rows.forEach((row, i) => {
        const p = row.lastChild; const txt = vtt(cues[i][1].join("\n"));
        if (rx && rx.test(txt)) {
          rx.lastIndex = 0;
          p.replaceChildren(); let last = 0;
          txt.replace(rx, (m, off) => { p.append(txt.slice(last, off), el("mark", {}, m)); last = off + m.length; return m; });
          p.append(txt.slice(last));
          if (!first) first = row;
        } else if (p.querySelector("mark")) p.textContent = txt;
      });
      if (first) first.scrollIntoView({ block: "center" });
    });
  }

  /* -------------------------------------------------------------- about */
  function renderAbout() {
    const nq = Q.length, nt = Object.keys(D.talks).length;
    const theme = store.get("theme", "system");
    const themeSeg = el("div", { class: "seg", role: "group", "aria-label": "Colour theme" });
    [["system", "Automatic"], ["light", "Light"], ["dark", "Dark"]].forEach(([k, l]) => themeSeg.append(el("button", { "aria-pressed": String(theme === k), onclick: () => { store.set("theme", k); applyTheme(); renderAbout(); } }, l)));
    main.replaceChildren(
      el("section", { class: "intro" }, el("p", { class: "label" }, "About"), el("h1", {}, "Her words, unchanged")),
      el("section", { class: "card" },
        el("p", {}, `Little Lotus is built from the caption files of ${nt.toLocaleString()} talks of Shri Mataji Nirmala Devi, in English, Hindi and Marathi. It holds ${nq.toLocaleString()} questions.`),
        el("p", {}, "Hindi and Marathi questions come only from talks she gave in those languages. When a caption file is a translation of a talk she gave in another language, it is labelled as a translation and no questions are made from it."),
        el("p", {}, "Nothing she said has been rewritten, summarised or corrected. Each question takes one of her sentences exactly as captioned, joining caption lines with a single space. It either hides one word behind a blank, or shows the sentence's own words shuffled. When you answer, the full sentence appears unchanged, with the talk, date and moment of the video."),
        el("p", {}, "Talks are grouped by the puja or event named in the video title, and by the chakras she names most often in the captions. A computer program does all of this; no AI wrote or edited any text."),
        el("p", { class: "muted" }, `Question bank built ${D.built}. Captions come from the public caption collection for Shri Mataji's talk videos. The accuracy of each caption is the responsibility of its transcribers.`)),
      el("section", { class: "card" }, el("div", { class: "spread" }, el("h3", {}, "Colour theme"), themeSeg)),
      el("section", { class: "card" },
        el("h3", {}, "Developer"),
        el("p", {}, "Little Lotus was developed by ", el("strong", {}, "Sahaj Balgunde"), "."),
        el("ul", { class: "dev-links" },
          [["Website", "https://sahajbalgunde.com/", "sahajbalgunde.com"],
           ["GitHub", "https://github.com/sahajisy", "github.com/sahajisy"],
           ["LinkedIn", "https://in.linkedin.com/in/sahaj-balgunde", "linkedin.com/in/sahaj-balgunde"]]
            .map(([label, href, text]) => el("li", {}, el("span", { class: "muted" }, label + ": "), el("a", { href, "data-ext": true, target: "_blank", rel: "noopener" }, text)))),
        el("p", { class: "muted" }, `Version ${APP_VERSION}`)));
  }

  function applyTheme() {
    const t = store.get("theme", "system");
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }

  /* ------------------------------------------------------------- router */
  let keyHandler = null;
  document.addEventListener("keydown", e => { if (keyHandler && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) keyHandler(e); });

  function route() {
    keyHandler = null;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    const h = location.hash.replace(/^#\/?/, "");
    const [page, ...rest] = h.split("/");
    const tab = { "": "play", play: "play", quiz: "play", talks: "talks", talk: "talks", print: "print", about: "about" }[page] || "play";
    document.querySelectorAll("[data-tab]").forEach(a => { if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (page === "quiz") renderQuiz();
    else if (page === "talks") renderTalks(rest[0], rest[1] ? decodeURIComponent(rest[1]) : null);
    else if (page === "talk") { const [ref, at] = (rest.join("/") || "").split("@"); const [id, lang] = ref.split("~"); renderTalk(id, at ? +at : null, lang || null); }
    else if (page === "print") window.CQPrint.render(main, { state, saveState, agePicker, topicPicker, langPicker, poolFor, AGES, AGE_NAMES });
    else if (page === "about") renderAbout();
    else renderPlay();
    if (page !== "talk") window.scrollTo({ top: 0 });
  }

  window.CQ = { D, el, shuffle, sample, talk, ytLink, ytShort, fmtTime, niceDate, optionsFor, store, CHAKRA_COLOR, AGES, AGE_NAMES, OPTION_COUNT };
  applyTheme();
  applyAge();
  setTimeout(() => document.documentElement.classList.add("ready"), 300); // colour changes animate only after the first paint
  window.addEventListener("hashchange", route);
  window.addEventListener("DOMContentLoaded", route);
  if (document.readyState !== "loading") setTimeout(route, 0);

  // Let the splash bloom for a moment, then fade it once the first screen is ready.
  const splash = document.getElementById("splash");
  if (splash) {
    const hide = () => { splash.classList.add("done"); setTimeout(() => splash.remove(), 600); };
    const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(hide, Math.max(reduced ? 300 : 1500 - performance.now(), 0));
    splash.addEventListener("click", hide);
  }

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
