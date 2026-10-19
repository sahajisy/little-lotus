/* Printable worksheets. Every sentence printed is Shri Mataji's captioned sentence,
   unchanged except for one word hidden behind a blank, or its own words shuffled
   for "her words in order". Each item carries a source number; the sources page
   and the multiple-choice items carry QR codes that open that moment of the video. */
(function () {
  "use strict";
  const C = window.CQ;
  const { el, shuffle, sample, talk, ytShort, fmtTime, niceDate, optionsFor, AGES, AGE_NAMES } = C;

  const ACTIVITIES = [
    { id: "colour", name: "Colour the chakras", desc: "Chakra drawing with her words and QR codes", tiers: [0, 1] },
    { id: "trace", name: "Trace her words", desc: "Trace a word or a short sentence", tiers: [0, 1] },
    { id: "mcq", name: "Multiple choice", desc: "Her sentences with a word to choose, with a QR code each", tiers: [0, 1, 2, 3, 4] },
    { id: "matching", name: "Match the words", desc: "Draw a line from each sentence to its word", tiers: [1, 2, 3, 4] },
    { id: "wordsearch", name: "Word search", desc: "Find the words from her sentences", tiers: [1, 2, 3, 4] },
    { id: "crossword", name: "Crossword", desc: "Clues are her sentences with the word hidden", tiers: [1, 2, 3, 4] },
    { id: "jumble", name: "Her words in order", desc: "Write the shuffled sentence in order", tiers: [1, 2, 3] },
    { id: "wordbank", name: "Fill in the blanks", desc: "Use the word bank to complete her sentences", tiers: [2, 3, 4] },
    { id: "reflect", name: "Reflect and write", desc: "Her words with space to write your thoughts", tiers: [2, 3, 4] },
    { id: "key", name: "Answer key", desc: "Answers for every activity", tiers: [0, 1, 2, 3, 4] },
    { id: "sources", name: "Sources with QR codes", desc: "Every talk and moment used, to watch", tiers: [0, 1, 2, 3, 4] }
  ];
  const DEFAULTS = {
    0: ["colour", "trace", "mcq", "key", "sources"],
    1: ["colour", "mcq", "wordsearch", "crossword", "jumble", "key", "sources"],
    2: ["mcq", "matching", "crossword", "wordsearch", "wordbank", "key", "sources"],
    3: ["mcq", "matching", "crossword", "wordsearch", "wordbank", "reflect", "key", "sources"],
    4: ["mcq", "crossword", "wordsearch", "wordbank", "reflect", "key", "sources"]
  };
  const SIZES = { mcq: [6, 10, 12, 12, 12], crossword: [0, 7, 9, 11, 12], wordsearch: [0, 8, 10, 12, 14], matching: [0, 5, 6, 7, 7], jumble: [0, 5, 6, 6, 6], wordbank: [0, 0, 8, 10, 10], trace: [4, 4, 0, 0, 0], reflect: [0, 0, 3, 3, 3] };

  const letters = s => s.toUpperCase().replace(/[^A-Z]/g, "");
  const VTT_REFS = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": "\u00a0", "&lrm;": "\u200e", "&rlm;": "\u200f" };
  const esc = s => String(s).replace(/&(?:amp|lt|gt|nbsp|lrm|rlm);/g, r => VTT_REFS[r]).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const blanked = q => esc(q.q).replace(/_____/g, '<span class="ws-blank">&nbsp;</span>');

  /* ------------------------------------------------------------ settings */
  let picked = null;
  function settings() {
    const s = C.store.get("print", {});
    return { acts: s.acts || null, name: s.name || "", seed: s.seed || 1 };
  }

  function render(main, ctx) {
    const st = settings();
    const tier = ctx.state.tier;
    // Letter grids (crossword, word search) only work with English letters.
    const latinOnly = new Set(["crossword", "wordsearch"]);
    const offered = ACTIVITIES.filter(a => a.tiers.includes(tier) && (ctx.state.lang === "en" || !latinOnly.has(a.id)));
    const acts = (st.acts && st.acts[tier]) || DEFAULTS[tier];
    const actBox = el("div", { class: "acts" });
    offered.forEach(a => {
      const id = "act-" + a.id;
      actBox.append(el("label", { class: "act", for: id },
        el("input", { type: "checkbox", id, checked: acts.includes(a.id) || null, onchange: () => {
          const s = C.store.get("print", {});
          s.acts = s.acts || {};
          s.acts[tier] = [...actBox.querySelectorAll("input:checked")].map(i => i.id.slice(4));
          C.store.set("print", s);
          build();
        } }),
        el("span", {}, el("b", {}, a.name), el("span", {}, a.desc))));
    });
    const titleInput = el("input", { type: "text", id: "ws-title", value: st.name, placeholder: "e.g. Sunday class, Balapuja group", onchange: () => { const s = C.store.get("print", {}); s.name = titleInput.value; C.store.set("print", s); build(); } });
    const preview = el("div", { class: "preview", "aria-label": "Worksheet preview" });
    const info = el("p", { class: "muted nums" });
    const printBtn = el("button", { class: "btn accent", onclick: doPrint }, "🖨 Print");
    const newSet = el("button", { class: "btn ghost", onclick: () => { picked = null; build(); } }, "New set of questions");

    main.replaceChildren(
      el("section", { class: "intro" },
        el("p", { class: "label" }, "Printable activities"),
        el("h1", {}, "Worksheets"),
        el("p", {}, "Make a printed set for a class, a family or yourself. Every sentence is Shri Mataji's, as captioned. QR codes open the moment of the talk on YouTube.")),
      ctx.langPicker(() => { picked = null; render(main, ctx); }),
      el("section", { class: "card" }, el("div", { class: "spread" }, el("h2", {}, "Age group"), el("span", { class: "muted" }, "Sets difficulty and activities")), ctx.agePicker(() => { picked = null; render(main, ctx); })),
      ctx.topicPicker(() => { picked = null; render(main, ctx); }),
      el("section", { class: "card" },
        el("h2", {}, "Activities"), actBox,
        el("div", { class: "field" }, el("label", { class: "label", for: "ws-title" }, "Heading on each page (optional)"), titleInput),
        el("div", { class: "spread" }, info, el("div", { class: "row" }, newSet, printBtn))),
      preview);

    function build() {
      const chosen = [...actBox.querySelectorAll("input:checked")].map(i => i.id.slice(4));
      const pool = ctx.poolFor(ctx.state.topic, tier);
      const key = ctx.state.lang + ctx.state.topic.kind + ctx.state.topic.name + tier;
      if (!picked || picked.key !== key) picked = { key, pool: shuffle(pool) };
      const html = makeSheet(chosen, picked.pool, tier, ctx.state.topic, titleInput.value.trim());
      document.getElementById("sheet").innerHTML = html.html;
      preview.innerHTML = html.html;
      info.textContent = `${html.pages} pages · ${html.sources} sources · ${pool.length.toLocaleString()} questions to choose from`;
      printBtn.disabled = html.pages === 0;
    }
    build();
  }

  function doPrint() {
    if (window.Android && window.Android.print) window.Android.print();
    else window.print();
  }

  /* ---------------------------------------------------------- the sheet */
  function makeSheet(chosen, pool, tier, topic, heading) {
    const sources = []; // {id, at, n}
    const srcIndex = {};
    const src = q => {
      const k = q.t + "@" + q.at;
      if (!(k in srcIndex)) { srcIndex[k] = sources.length + 1; sources.push({ id: q.t, at: q.at, n: sources.length + 1 }); }
      return srcIndex[k];
    };
    const used = new Set(), answerCount = {};
    const take = (filter, n) => {
      const out = [];
      for (const q of pool) {
        if (out.length >= n) break;
        const a = (q.a || "").toLowerCase();
        if (used.has(q.id) || (a && (answerCount[a] || 0) >= 2) || !filter(q)) continue;
        out.push(q); used.add(q.id); if (a) answerCount[a] = (answerCount[a] || 0) + 1;
      }
      return out;
    };
    const sub = `${topic.name} · Ages ${AGES[tier]}`;
    const pages = []; // {title, body, instr}
    const keys = [];  // answer key sections (html)

    const page = (title, instr, body, opts = {}) => pages.push({ title, instr, body, who: opts.who !== false });

    for (const act of chosen) {
      if (act === "colour") {
        const qs = take(q => q.type === "blank" && q.g === "chakra" && q.n <= 22, 4);
        const notes = qs.map(q => `<div class="note"><div><b>${esc(q.a)}</b><br>“${esc(q.s)}”<div class="srcline">Source ${src(q)} · ${esc(talk(q.t).title)}</div></div>${QR.svg(ytShort(q.t, q.at), { size: 60 })}</div>`).join("");
        page("Colour the chakras", tier === 0 ? "Colour each chakra. Ask a grown-up to read Shri Mataji's words to you, or scan the code to hear her." : "Colour each chakra and read what Shri Mataji said. Scan a code to hear her say it.",
          `<div class="colour">${chakraSVG()}<div class="notes">${notes || "<p>No chakra sentences in this topic for this age.</p>"}</div></div>`);
      }
      if (act === "trace") {
        const qs = take(q => q.type === "blank" && q.n <= (tier === 0 ? 14 : 12), SIZES.trace[tier]);
        const items = qs.map(q => tier === 0
          ? `<div class="trace-item"><div>“${esc(q.s)}” <span class="srcline">Source ${src(q)}</span></div><div class="trace-line">${esc(q.a)} &nbsp; ${esc(q.a)} &nbsp; ${esc(q.a)}</div></div>`
          : `<div class="trace-item"><div class="srcline">Source ${src(q)} · ${esc(talk(q.t).title)}</div><div class="trace-line">${esc(q.s)}</div><div class="trace-line empty">.</div></div>`).join("");
        page(tier === 0 ? "Trace the word" : "Trace her words", tier === 0 ? "Trace the word Shri Mataji used. Say it out loud." : "Trace Shri Mataji's words, then write them again on the empty line.", `<div class="trace">${items}</div>`);
      }
      if (act === "mcq") {
        const qs = take(q => q.type !== "order", SIZES.mcq[tier]);
        const prompt = { blank: "", puja: "At which puja did she say this?", decade: "In which decade did she say this?" };
        const items = qs.map((q, i) => {
          const opts = optionsFor(q, tier);
          q._opts = opts;
          const text = q.type === "blank" ? blanked(q) : "“" + esc(q.s) + "”";
          return { len: q.s.length + 120, html: `<div class="mcq-item"><div class="qtext"><div><b>${i + 1}.</b> ${prompt[q.type] ? "<i>" + prompt[q.type] + "</i><br>" : ""}${text}</div><div class="opts">${opts.map((o, k) => `<span>${"abcd"[k]}) ${esc(o)}</span>`).join("")}</div><div class="srcline">Source ${src(q)}</div></div><div class="qr">${QR.svg(ytShort(q.t, q.at), { size: 64 })}Listen</div></div>`, q };
        });
        paginate(items, 1650).forEach((chunk, p, all) => page(all.length > 1 ? `Multiple choice (${p + 1} of ${all.length})` : "Multiple choice",
          p === 0 ? "Choose the word Shri Mataji said. Scan the code beside a question to hear her say it." : "", `<div class="mcq">${chunk.map(x => x.html).join("")}</div>`));
        if (qs.length) keys.push(`<h3>Multiple choice</h3><ol>${qs.map(q => `<li><b>${"abcd"[q._opts.indexOf(q.a)]}) ${esc(q.a)}</b> <span class="srcline">· Source ${src(q)}</span></li>`).join("")}</ol>`);
      }
      if (act === "matching") {
        const seen = new Set();
        const qs = take(q => q.type === "blank" && q.n <= 30 && !seen.has(q.a.toLowerCase()) && seen.add(q.a.toLowerCase()), SIZES.matching[tier]);
        const right = shuffle(qs.map(q => q.a));
        const rows = qs.map((q, i) => `<div class="l"><b>${i + 1}.</b> ${blanked(q)} <span class="srcline">Source ${src(q)}</span></div><div class="dotc"><i></i><i></i></div><div class="r">${"ABCDEFGH"[i]}. ${esc(right[i])}</div>`).join("");
        if (qs.length) {
          page("Match the words", "Draw a line from each sentence to the word Shri Mataji said.", `<div class="match">${rows}</div>`);
          keys.push(`<h3>Match the words</h3><ol>${qs.map(q => `<li>${"ABCDEFGH"[right.indexOf(q.a)]}. ${esc(q.a)}</li>`).join("")}</ol>`);
        }
      }
      if (act === "wordsearch") {
        const size = [10, 10, 12, 14, 15][tier];
        const seen = new Set();
        const qs = take(q => q.type === "blank" && letters(q.a).length >= 3 && letters(q.a).length <= size && !seen.has(letters(q.a)) && seen.add(letters(q.a)), SIZES.wordsearch[tier]);
        const ws = wordSearch(qs.map(q => letters(q.a)), size, tier);
        if (ws.placed.length) {
          const placedQs = qs.filter(q => ws.placed.includes(letters(q.a)));
          page("Word search", `Find these ${ws.placed.length} words from Shri Mataji's sentences. ${tier <= 1 ? "Words go across and down." : tier === 2 ? "Words go across, down and diagonally." : "Words go in every direction, even backwards."}`,
            `${gridTable(ws.grid, null, size > 12)}<div class="wordbank">${ws.placed.map(esc).join("<span></span>")}</div>
             <h3>Where she said them</h3><div class="key"><ol>${placedQs.map(q => `<li>${blanked(q)} <span class="srcline">Source ${src(q)}</span></li>`).join("")}</ol></div>`);
          keys.push(`<h3>Word search</h3>${gridTable(ws.grid, ws.hits, true)}`);
        }
      }
      if (act === "crossword") {
        const seen = new Set();
        const cand = take(q => q.type === "blank" && letters(q.a).length >= 3 && letters(q.a).length <= 12 && q.n <= 40 && !seen.has(letters(q.a)) && seen.add(letters(q.a)), SIZES.crossword[tier] + 6);
        const xw = crossword(cand.map(q => ({ word: letters(q.a), q })), SIZES.crossword[tier]);
        if (xw.words.length >= 3) {
          const clue = w => `<p><b>${w.num}.</b> ${blanked(w.q)} <span class="srcline">(${w.word.length}) · Source ${src(w.q)}</span></p>`;
          const across = xw.words.filter(w => w.dir === "a").sort((a, b) => a.num - b.num);
          const down = xw.words.filter(w => w.dir === "d").sort((a, b) => a.num - b.num);
          page("Crossword", "Each clue is Shri Mataji's sentence with one word hidden. Write that word in the grid.",
            `<div class="xw-wrap">${xwTable(xw, false)}</div><div class="clues"><h3>Across</h3>${across.map(clue).join("")}<h3>Down</h3>${down.map(clue).join("")}</div>`);
          keys.push(`<h3>Crossword</h3><div class="xw-wrap">${xwTable(xw, true)}</div>`);
          // Words not placed go back for other activities.
          cand.filter(q => !xw.words.some(w => w.q === q)).forEach(q => { used.delete(q.id); answerCount[q.a.toLowerCase()]--; });
        } else cand.forEach(q => { used.delete(q.id); answerCount[q.a.toLowerCase()]--; });
      }
      if (act === "jumble") {
        const qs = take(q => q.type === "order", SIZES.jumble[tier]);
        const items = qs.map((q, i) => {
          let w = shuffle(q.s.split(" "));
          if (w.join(" ") === q.s) w = w.reverse();
          return `<div class="jumble-item"><div><b>${i + 1}.</b> <span class="srcline">Source ${src(q)}</span></div><div class="tiles">${w.map(x => `<span>${esc(x)}</span>`).join("")}</div><div class="writeline"></div></div>`;
        }).join("");
        if (qs.length) {
          page("Her words in order", "These are Shri Mataji's words, shuffled. Write the sentence in the right order.", `<div class="jumble">${items}</div>`);
          keys.push(`<h3>Her words in order</h3><ol>${qs.map(q => `<li>“${esc(q.s)}”</li>`).join("")}</ol>`);
        }
      }
      if (act === "wordbank") {
        const seen = new Set();
        const qs = take(q => q.type === "blank" && q.n <= 40 && !seen.has(q.a.toLowerCase()) && seen.add(q.a.toLowerCase()), SIZES.wordbank[tier]);
        if (qs.length) {
          page("Fill in the blanks", "Complete each of Shri Mataji's sentences with a word from the word bank.",
            `<div class="wordbank" style="border:1pt solid #111;border-radius:2mm;padding:3mm">${shuffle(qs.map(q => q.a)).map(esc).join("<span></span>")}</div>
             <div class="mcq">${qs.map((q, i) => `<div><b>${i + 1}.</b> ${blanked(q)} <span class="srcline">Source ${src(q)}</span></div>`).join("")}</div>`);
          keys.push(`<h3>Fill in the blanks</h3><ol>${qs.map(q => `<li>${esc(q.a)}</li>`).join("")}</ol>`);
        }
      }
      if (act === "reflect") {
        const qs = take(q => q.n >= 14 && q.n <= 45 && q.type !== "order", SIZES.reflect[tier]);
        if (qs.length) page("Reflect and write", "Read Shri Mataji's words slowly. Listen to the moment with the QR code. Then write what they mean to you in your own life and meditation.",
          qs.map(q => `<div class="trace-item"><div class="mcq-item"><div class="qtext"><div>“${esc(q.s)}”</div><div class="srcline">Source ${src(q)} · ${esc(talk(q.t).title)}</div></div><div class="qr">${QR.svg(ytShort(q.t, q.at), { size: 64 })}Listen</div></div>${'<div class="writeline"></div>'.repeat(5)}</div>`).join(""));
      }
    }

    if (chosen.includes("key") && keys.length) page("Answer key", "", `<div class="key">${keys.join("")}</div>`, { who: false });
    if (chosen.includes("sources") && sources.length) {
      const items = sources.map(s => {
        const t = talk(s.id); const url = ytShort(s.id, s.at);
        return { len: 260, html: `<div class="src">${QR.svg(url, { size: 72 })}<div><b>${s.n}. ${esc(t.title)}</b><br>${esc(niceDate(t.date))}${t.date ? " · " : ""}at ${fmtTime(s.at)}<br><code>${esc(url)}</code></div></div>` };
      });
      paginate(items, 4200).forEach((chunk, p, all) => page(all.length > 1 ? `Sources (${p + 1} of ${all.length})` : "Sources", p === 0 ? "Scan a code to watch Shri Mataji say these words, at that moment of the talk." : "", `<div class="sources">${chunk.map(x => x.html).join("")}</div>`, { who: false }));
    }

    const total = pages.length;
    const html = pages.map((p, i) => `<section class="page">
      <div class="ws-head"><div><h2>${esc(p.title)}</h2><div class="ws-sub">${esc(heading ? heading + " · " : "")}${esc(sub)}</div></div>${p.who ? '<div class="who"><span>Name</span><span>Date</span></div>' : ""}</div>
      ${p.instr ? `<div class="ws-instr">${esc(p.instr)}</div>` : ""}
      ${p.body}
      <div class="ws-foot"><span>Little Lotus · Shri Mataji's words exactly as captioned · sahajbalgunde.com</span><span>Page ${i + 1} of ${total}</span></div>
    </section>`).join("");
    return { html, pages: total, sources: sources.length };
  }

  function paginate(items, budget) {
    const out = []; let cur = [], used = 0;
    for (const it of items) {
      if (cur.length && used + it.len > budget) { out.push(cur); cur = []; used = 0; }
      cur.push(it); used += it.len;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  /* --------------------------------------------------------- crossword */
  function crossword(entries, want) {
    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const list = attempt === 0 ? entries.slice().sort((a, b) => b.word.length - a.word.length) : shuffle(entries);
      const grid = new Map(), placed = [], dirAt = new Map();
      const get = (r, c) => grid.get(r + "," + c);
      const fits = (word, r, c, dir) => {
        const dr = dir === "d" ? 1 : 0, dc = dir === "a" ? 1 : 0;
        if (get(r - dr, c - dc) || get(r + dr * word.length, c + dc * word.length)) return -1;
        let cross = 0;
        for (let i = 0; i < word.length; i++) {
          const rr = r + dr * i, cc = c + dc * i, cell = get(rr, cc);
          if (cell) { if (cell !== word[i] || (dirAt.get(rr + "," + cc) || "").includes(dir)) return -1; cross++; }
          else if (get(rr + dc, cc + dr) || get(rr - dc, cc - dr)) return -1;
        }
        return cross;
      };
      const put = (e, r, c, dir) => {
        const dr = dir === "d" ? 1 : 0, dc = dir === "a" ? 1 : 0;
        for (let i = 0; i < e.word.length; i++) { const k = (r + dr * i) + "," + (c + dc * i); grid.set(k, e.word[i]); dirAt.set(k, (dirAt.get(k) || "") + dir); }
        placed.push({ ...e, r, c, dir });
      };
      for (const e of list) {
        if (placed.length >= want) break;
        if (!placed.length) { put(e, 0, 0, "a"); continue; }
        let bestPos = null;
        for (const [key, ch] of grid) {
          const [r0, c0] = key.split(",").map(Number);
          for (let i = 0; i < e.word.length; i++) {
            if (e.word[i] !== ch) continue;
            for (const dir of ["a", "d"]) {
              const r = dir === "d" ? r0 - i : r0, c = dir === "a" ? c0 - i : c0;
              const x = fits(e.word, r, c, dir);
              if (x > 0 && (!bestPos || x > bestPos.x)) bestPos = { r, c, dir, x };
            }
          }
        }
        if (bestPos) put(e, bestPos.r, bestPos.c, bestPos.dir);
      }
      let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
      for (const k of grid.keys()) { const [r, c] = k.split(",").map(Number); minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
      const area = (maxR - minR + 1) * (maxC - minC + 1);
      const fitsPage = maxC - minC + 1 <= 24 && maxR - minR + 1 <= 22;
      const score = placed.length * 1000 - area;
      if (fitsPage && (!best || score > best.score)) best = { score, placed, grid, minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
    }
    if (!best) return { words: [] };
    const starts = new Map();
    best.placed.forEach(w => { const k = (w.r - best.minR) + "," + (w.c - best.minC); starts.set(k, true); });
    const keysSorted = [...starts.keys()].sort((a, b) => { const [ar, ac] = a.split(",").map(Number), [br, bc] = b.split(",").map(Number); return ar - br || ac - bc; });
    const num = {}; keysSorted.forEach((k, i) => { num[k] = i + 1; });
    const words = best.placed.map(w => ({ ...w, num: num[(w.r - best.minR) + "," + (w.c - best.minC)] }));
    return { words, grid: best.grid, minR: best.minR, minC: best.minC, rows: best.rows, cols: best.cols, num };
  }

  function xwTable(xw, filled) {
    let h = `<table class="xw${xw.cols > 18 ? " small" : ""}">`;
    for (let r = 0; r < xw.rows; r++) {
      h += "<tr>";
      for (let c = 0; c < xw.cols; c++) {
        const ch = xw.grid.get((r + xw.minR) + "," + (c + xw.minC));
        const n = xw.num[r + "," + c];
        h += ch ? `<td class="on">${n ? `<sup>${n}</sup>` : ""}${filled ? ch : ""}</td>` : "<td></td>";
      }
      h += "</tr>";
    }
    return h + "</table>";
  }

  /* -------------------------------------------------------- word search */
  function wordSearch(words, size, tier) {
    const dirsByTier = [[[0, 1], [1, 0]], [[0, 1], [1, 0]], [[0, 1], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0]], [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]];
    const dirs = dirsByTier[tier];
    let best = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const grid = Array.from({ length: size }, () => Array(size).fill(""));
      const hits = new Set(), placed = [];
      for (const w of words.slice().sort((a, b) => b.length - a.length)) {
        let ok = false;
        for (let t = 0; t < 200 && !ok; t++) {
          const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
          const r = Math.floor(Math.random() * size), c = Math.floor(Math.random() * size);
          const er = r + dr * (w.length - 1), ec = c + dc * (w.length - 1);
          if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
          let fit = true;
          for (let i = 0; i < w.length; i++) { const cell = grid[r + dr * i][c + dc * i]; if (cell && cell !== w[i]) { fit = false; break; } }
          if (!fit) continue;
          for (let i = 0; i < w.length; i++) { grid[r + dr * i][c + dc * i] = w[i]; hits.add((r + dr * i) + "," + (c + dc * i)); }
          placed.push(w); ok = true;
        }
      }
      if (!best || placed.length > best.placed.length) best = { grid, hits, placed };
      if (placed.length === words.length) break;
    }
    const abc = "ABCDEFGHIJKLMNOPRSTUVWY";
    best.grid.forEach(row => row.forEach((v, i) => { if (!v) row[i] = abc[Math.floor(Math.random() * abc.length)]; }));
    return best;
  }

  function gridTable(grid, hits, dense) {
    return `<table class="ws-grid${dense ? " dense" : ""}">${grid.map((row, r) => `<tr>${row.map((ch, c) => `<td${hits && hits.has(r + "," + c) ? ' class="hit"' : ""}>${ch}</td>`).join("")}</tr>`).join("")}</table>`;
  }

  /* -------------------------------------------------- chakra drawing */
  function chakraSVG() {
    const chakras = [["Sahasrara", 24], ["Agnya", 2], ["Vishuddhi", 16], ["Heart", 12], ["Nabhi", 10], ["Swadishthan", 6], ["Mooladhara", 4]];
    const W = 240, H = 500, cx = 80;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The seven chakras to colour"><line x1="${cx}" y1="34" x2="${cx}" y2="${H - 30}" stroke="#999" stroke-width="2" stroke-dasharray="4 4"/>`;
    chakras.forEach(([name, petals], i) => {
      const cy = 36 + i * 71, r = 14, pr = 11;
      for (let p = 0; p < petals; p++) {
        const a = (p / petals) * Math.PI * 2;
        const px = cx + Math.cos(a) * (r + pr * .55), py = cy + Math.sin(a) * (r + pr * .55);
        s += `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="${(petals > 12 ? 4 : 6.5)}" ry="${pr * .62}" transform="rotate(${(a * 180 / Math.PI + 90).toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})" fill="#fff" stroke="#222" stroke-width="1.3"/>`;
      }
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#222" stroke-width="1.8"/>`;
      s += `<text x="${cx + 44}" y="${cy + 5}" font-family="Baloo 2, sans-serif" font-size="17" font-weight="700" fill="#222">${name}</text>`;
    });
    return s + "</svg>";
  }

  window.CQPrint = { render };
})();
