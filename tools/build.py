"""Sort the talks into pujas, events and chakras, and build the quiz bank.

Everything comes from two sources only: the YouTube title of each talk and
its caption files. Talks she gave in Hindi or Marathi (listed in
meta/hindi_marathi_review.tsv) use those caption files; their English
captions are translations, so no English questions are made from them. Every question shows one of Shri Mataji's captioned
sentences exactly as it appears in the caption file (caption lines joined
with a space). The only change a question ever makes is to hide one word
behind a blank, or to show the sentence's own words shuffled for a
"put her words in order" puzzle; the answer always reveals the sentence
unchanged, with its source.

Usage: python3 -I build.py <base_dir>
Writes:
  meta/catalog.json, meta/catalog.csv        one row per talk
  by-category/<Pujas|Events|Chakras>/<group>/  symlinks to text/en/<id>.txt
  app/data.js                                talks, categories, questions
  app/talks/<id>.js, <id>.hi.js, <id>.mr.js  each talk's captions with times
"""
import csv
import json
import os
import pathlib
import random
import re
import sys
from collections import Counter, defaultdict

base = pathlib.Path(sys.argv[1])
titles = json.loads((base / "meta" / "titles.json").read_text())
random.seed(108)

# ---------------------------------------------------------------- categories

NOT_HER = re.compile(r"Gregoire|EY meeting|Vocal Concert|Golden Memories", re.I)

# (name, title pattern, key words for questions from these talks)
PUJAS = [
    ("Guru Puja", r"\bGuru Puja|Guru Purnima", ["Guru", "disciple", "master", "Void", "Dattatreya", "dharma"]),
    ("Shri Ganesha Puja", r"Ganesh(a)? Puja|Ganapati Puja|Eve of Ganesha|Gauri", ["Ganesha", "innocence", "Mooladhara", "Gauri", "wisdom"]),
    ("Navaratri Puja", r"Navara?tri|Nava ?ratri", ["Devi", "Goddess", "Shakti", "Durga", "Mahakali"]),
    ("Diwali & Lakshmi Puja", r"Diwali|Divali|\bLakshmi Puja", ["Lakshmi", "lamps", "Nabhi", "generosity"]),
    ("Mahalakshmi Puja", r"Mahalakshmi|Mahakalshmi", ["Mahalakshmi", "Sushumna", "seeking", "Nabhi"]),
    ("Shiva & Shivaratri Puja", r"Shiva(ratri)? Puja|Shivaratri|Shivratri|Sadashiva", ["Shiva", "Spirit", "Heart", "Sadashiva", ]),
    ("Sahasrara Puja", r"Sahast?rara (Day )?Puja|Mahasahast?rara|Sahasrara Day", ["Sahasrara", "Kundalini", "Kalki", "integration"]),
    ("Adi Shakti Puja", r"Adi ?Shakti", ["Adi Shakti", "Shakti", "Kundalini", ]),
    ("Birthday Puja", r"Birthday Puja", ["Adi Shakti", "Mahamaya", "birthday"]),
    ("Christmas Puja", r"Christmas", ["Christ", "Jesus", "Mary", "Agnya", "forgiveness"]),
    ("Easter Puja", r"Easter|Resurrection", ["Christ", "resurrection", "cross", "Agnya", "forgiveness"]),
    ("Shri Krishna Puja", r"Krishna Puja|Yogeshwara|Janmashtami", ["Krishna", "Vishuddhi", "collectivity", "witness", "Radha"]),
    ("Devi, Durga & Mahakali Puja", r"Devi Puja|Puja to the Devi|Mahakali|Durga|Kali Puja", ["Devi", "Durga", "Mahakali", "Goddess"]),
    ("Hamsa Puja", r"Hamsa", ["Hamsa", "discretion", "Vishuddhi", "Agnya"]),
    ("Buddha & Mahavira Puja", r"Buddha Puja|Mahavira", ["Buddha", "Mahavira", "ego", "desire", "Agnya"]),
    ("Shri Rama & Hanumana Puja", r"Rama Puja|Hanuman|Dassera|Dussehra|Rama Navami", ["Rama", "Hanumana", "Sita", "dharma", "Heart"]),
    ("Saraswati Puja", r"Saraswati Puja", ["Saraswati", "creativity", "Swadishthan", "music", "knowledge"]),
    ("Makar Sankranti Puja", r"Sankranti|Sakrant", ["Sun", "sweetness"]),
    ("Gudi Padwa", r"Gudi Padwa", ["Gudi Padwa", "new year"]),
    ("Raksha Bandhan", r"Raksha", ["brother", "sister", "rakhi", "purity"]),
    ("Shri Vishnumaya Puja", r"Vishnumaj?ya", ["Vishnumaya", "Vishuddhi", "sister", "guilt"]),
    ("Virata Puja", r"Virata", ["Virata", "collective", "Akbar"]),
    ("Ekadasha Rudra Puja", r"Ekadh?[ae]sha Rudra", ["Rudra", "Void", "destruction", "eleven"]),
    ("Shri Kundalini Puja", r"Kundalini Puja", ["Kundalini", "sacrum", "Gauri"]),
    ("Kartikeya Puja", r"Kartikeya", ["Kartikeya", "Ganesha"]),
    ("Fatima Puja", r"Fatima", ["Fatima", "Mohammed", "Grace"]),
    ("New Year Puja", r"New Year Puja|Nav Varsh", ["Gudi Padwa", "new year"]),
    ("Shri Lalita & Raja Rajeshwari Puja", r"Lalita|Raj(a)? Rajeshwar", ["Lalita", "Shakti"]),
    ("Bhairava Puja", r"Bhairava", ["Bhairava", "left side"]),
    ("Pallas Athena Puja", r"Athena", ["Athena"]),
]
EVENTS = [
    ("Public programs", r"Public Program|\bPP\b|Public Lecture|Program(me)? at|Evening Program"),
    ("Seminars", r"Seminar"),
    ("Talks to Sahaja Yogis", r"Talk to (the )?(Sahaja )?yogis|Advice|Talk to leaders"),
    ("Weddings", r"Wedding|Marriage|Haldi"),
    ("Interviews", r"Interview"),
    ("Birthday celebrations", r"Birthday (Felicitation|Celebration)|Felicitation"),
    ("Havans", r"Havan"),
    ("Arrivals & receptions", r"Arrival|Reception|Welcome"),
    ("Music & cultural programs", r"Music|Concert|Drama|Cultural"),
]

CHAKRAS = {
    "Mooladhara": r"Mooladhara?|Muladhara?",
    "Swadishthan": r"Swadh?ist?h?ana?",
    "Nabhi": r"Nabhi",
    "Void": r"Void|Bhavasagara",
    "Heart": r"Anahata?|[Hh]eart(?= [Cc]hakra| [Cc]ent(?:re|er))",
    "Vishuddhi": r"Vishudd?hi|Vishuddi|Vishuddha",
    "Agnya": r"Agnya|Agya|Ajna|Adnya",
    "Sahasrara": r"Sahast?rara?",
}
CHAKRA_MIN_MENTIONS = 5

DEITIES = {
    "Ganesha": r"Ganesha|Ganesh|Ganapati", "Saraswati": r"Saraswati", "Brahmadeva": r"Brahmadeva",
    "Lakshmi": r"Lakshmi", "Vishnu": r"Vishnu", "Shiva": r"Shiva", "Parvati": r"Parvati",
    "Durga": r"Durga", "Jagadamba": r"Jagadamba", "Rama": r"Rama", "Sita": r"Sita",
    "Krishna": r"Krishna", "Radha": r"Radha", "Christ": r"Christ|Jesus", "Mary": r"Mary",
    "Buddha": r"Buddha", "Mahavira": r"Mahavira", "Kalki": r"Kalki", "Hanumana": r"Hanumana?",
    "Dattatreya": r"Dattatreya", "Gauri": r"Gauri", "Mahakali": r"Mahakali", "Bhairava": r"Bhairava",
    "Kartikeya": r"Kartikeya", "Mohammed": r"Mohammed|Muhammad", "Nanaka": r"Nanaka?",
}
QUALITIES = ["innocence", "wisdom", "creativity", "satisfaction", "generosity", "peace", "mastery",
             "security", "compassion", "love", "collectivity", "forgiveness", "humility", "integration",
             "joy", "chastity", "detachment", "dignity", "purity", "auspiciousness", "patience",
             "sweetness", "discretion", "gratitude", "courage", "simplicity", "honesty"]
CONCEPTS = {
    "Kundalini": r"Kundalini", "vibrations": r"vibrations", "Spirit": r"Spirit", "ego": r"ego",
    "superego": r"superego|super-ego", "meditation": r"meditation", "attention": r"attention",
    "Self-realization": r"[Ss]elf[- ][Rr]eali[sz]ation", "truth": r"truth", "dharma": r"dharma",
    "Paramchaitanya": r"Param ?chaitanya", "Sushumna": r"Sushumna", "Ida": r"Ida", "Pingala": r"Pingala",
    "thoughtless": r"thoughtless", "Guru": r"Guru", "Divine": r"Divine", "collective": r"collective",
    "desire": r"desire", "seeking": r"seeking", "awareness": r"awareness", "conditionings": r"conditionings",
}


def rx_word(p, flags=0):
    return re.compile(r"(?<![\w-])(?:%s)(?![\w-])" % p, flags)


CHAKRA_RE = {k: rx_word(v) for k, v in CHAKRAS.items()}
DEITY_RE = {k: rx_word(v) for k, v in DEITIES.items()}
QUAL_RE = {q: rx_word(q, re.I) for q in QUALITIES}
CONCEPT_RE = {k: rx_word(v) for k, v in CONCEPTS.items()}
GROUPS = {"chakra": CHAKRA_RE, "deity": DEITY_RE, "quality": QUAL_RE, "concept": CONCEPT_RE}

# ------------------------------------------------- Hindi and Marathi talks

LANG_NAMES = {"en": "English", "hi": "Hindi", "mr": "Marathi"}
ORIGINAL = {}  # video id -> "hi" or "mr" for talks she gave in that language
_review = base / "meta" / "hindi_marathi_review.tsv"
if _review.exists():
    with open(_review, encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            if r["decision"] == "her words":
                ORIGINAL[r["video_id"]] = r["language"]

# Devanagari spellings as they appear in the captions; the first one is used for answer choices.
DEV_CHAKRAS = {
    "Mooladhara": ["मूलाधार"], "Swadishthan": ["स्वाधिष्ठान"], "Nabhi": ["नाभि", "नाभी"],
    "Heart": ["हृदय(?= चक्र)", "अनाहत"], "Vishuddhi": ["विशुद्धि", "विशुद्धी"],
    "Agnya": ["आज्ञा(?= चक्र)"], "Sahasrara": ["सहस्रार", "सहस्त्रार"],
}
DEV_DEITIES = {
    "Ganesha": ["गणेश", "गणपति", "गणपती"], "Krishna": ["कृष्ण", "श्रीकृष्ण"], "Rama": ["राम", "श्रीराम"],
    "Shiva": ["शिव", "शंकर", "महादेव"], "Vishnu": ["विष्णु", "विष्णू"], "Lakshmi": ["लक्ष्मी"],
    "Mahalakshmi": ["महालक्ष्मी"], "Saraswati": ["सरस्वती"], "Durga": ["दुर्गा"], "Hanumana": ["हनुमान"],
    "Brahmadeva": ["ब्रह्मदेव"], "Christ": ["ईसा", "ख्रिस्त", "क्राइस्ट", "येशु", "यीशु"], "Buddha": ["बुद्ध"],
    "Mahavira": ["महावीर"], "Nanak": ["नानक"], "Kabir": ["कबीर"], "Mohammed": ["मोहम्मद", "मुहम्मद"],
    "Dattatreya": ["दत्तात्रेय"], "Sita": ["सीता"], "Radha": ["राधा"], "Gauri": ["गौरी"], "Parvati": ["पार्वती"],
}
DEV_CONCEPTS = {
    "Kundalini": ["कुंडलिनी", "कुण्डलिनी"], "Atma": ["आत्मा"], "Paramatma": ["परमात्मा"],
    "Chaitanya": ["चैतन्य"], "Sahaja Yoga": ["सहजयोग", "सहज योग"], "Dhyan": ["ध्यान"], "Dharma": ["धर्म"],
    "Prem": ["प्रेम"], "Anand": ["आनंद", "आनन्द"], "Guru": ["गुरु", "गुरू"],
    "Self-realization": ["आत्मसाक्षात्कार", "साक्षात्कार"], "Parameshwar": ["परमेश्वर"], "Bhagwan": ["भगवान"],
    "Satya": ["सत्य"], "Shakti": ["शक्ति", "शक्ती"], "Shanti": ["शांति", "शान्ति"],
}
DEV = "\u0900-\u097F"


def rx_dev(alts):
    return re.compile(r"(?<![%s\w])(?:%s)(?![%s\w])" % (DEV, "|".join(alts), DEV))


DEV_GROUPS = {g: {k: rx_dev(v) for k, v in d.items()}
              for g, d in (("chakra", DEV_CHAKRAS), ("deity", DEV_DEITIES), ("concept", DEV_CONCEPTS))}
DEV_FIRST = {g: {k: re.sub(r"\(.*\)", "", v[0]) for k, v in d.items()}
             for g, d in (("chakra", DEV_CHAKRAS), ("deity", DEV_DEITIES), ("concept", DEV_CONCEPTS))}
DEV_SPLIT = re.compile(r"(?<=[।|?!.॥])\s+")
DEV_SENTENCE_END = re.compile(r"[।|?!.॥]$")
# Lines that start with a speaker label ("योगी- …") are someone else speaking or a transcriber's note.
SPEAKER = re.compile(r"^(?:योगी|श्रीमाताजी|श्री माताजी|साधक|प्रश्न|उत्तर)\s?[-–:]|^[^\s-]{1,14}\s[-–]\s")

ASSOC = {
    "Mooladhara": {"Ganesha", "Gauri", "innocence", "wisdom", "chastity", "auspiciousness", "Kundalini"},
    "Swadishthan": {"Brahmadeva", "Saraswati", "creativity", "attention"},
    "Nabhi": {"Lakshmi", "Vishnu", "satisfaction", "generosity", "peace", "dharma"},
    "Void": {"Dattatreya", "mastery", "dharma", "Guru"},
    "Heart": {"Jagadamba", "Shiva", "Parvati", "Durga", "Rama", "Sita", "security", "compassion", "love", "Spirit"},
    "Vishuddhi": {"Krishna", "Radha", "collectivity", "detachment", "sweetness", "discretion", "collective"},
    "Agnya": {"Christ", "Mary", "Buddha", "Mahavira", "forgiveness", "humility", "ego", "superego"},
    "Sahasrara": {"Kalki", "integration", "joy", "thoughtless", "Kundalini"},
}

AGE_TIERS = ["1-6", "7-13", "14-18", "19-25", "26+"]
LEN_LIMITS = [14, 22, 32, 45, 10 ** 9]  # words allowed at each tier


def len_tier(n):
    return next(i for i, lim in enumerate(LEN_LIMITS) if n <= lim)


def finds(text, regexes):
    return {k: r.findall(text) for k, r in regexes.items() if r.search(text)}


def parse_date(title):
    m = re.search(r"\b((?:19|20)\d\d)[-. ]?(\d\d)[-. ]?(\d\d)\b", title)
    return f"{m[1]}-{m[2]}-{m[3]}" if m else ""


# ------------------------------------------------------------- caption parse

TIME = re.compile(r"^\s*(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s+-->")


def cues(vtt_path):
    """(start_seconds, [caption lines]) for each cue, lines exactly as in the file."""
    out, start, buf = [], None, []
    for line in vtt_path.read_text(encoding="utf-8").splitlines() + [""]:
        line = line.rstrip("\r")
        m = TIME.match(line)
        if m:
            if start is not None and buf:
                out.append((start, buf))
            start = int(m[1] or 0) * 3600 + int(m[2]) * 60 + int(m[3])
            buf = []
        elif line.strip() == "":
            if start is not None and buf:
                out.append((start, buf))
            start, buf = None, []
        elif start is not None:
            buf.append(line)
    return out


SPLIT = re.compile(r"(?<=[.!?])[\"”’']?\s+(?=[\"“‘]?[A-Z])")


def sentences(cue_list, splitter=SPLIT):
    """Sentences of the running caption text (lines joined by one space), with start times."""
    text, starts = "", []
    for t, lines in cue_list:
        for ln in lines:
            ln = ln.strip()
            if not ln:
                continue
            if text:
                text += " "
            starts.append((len(text), t))
            text += ln
    out, pos, k = [], 0, 0
    for p in splitter.split(text):
        idx = text.find(p, pos)
        while k + 1 < len(starts) and starts[k + 1][0] <= idx:
            k += 1
        out.append((starts[k][1], p.strip()))
        pos = idx + len(p)
    return out


TITLE_LIKE = re.compile(r"\b(?:19|20)\d\d[-./]\d|DP-RAW|NITL|\bP\d\b|Puja Talk,|Talk,|, India,|, Italy,")
GOOD_SENTENCE = re.compile(r"^[\"“‘]?[A-Z].*[.!?][\"”’']?$")
ENGLISH = set("the a an is are was of and to you we that it in this be have has not they will all your our".split())


def mostly_english(words):
    common = sum(1 for w in words if w.lower().strip(".,!?;:'\"“”’") in ENGLISH)
    return common >= 2 and common / len(words) >= 0.15

# --------------------------------------------------------------- build

talks, questions = {}, []
seen = set()
by_type = Counter()


def add_question(q):
    q["id"] = len(questions)
    questions.append(q)
    by_type[q["type"] + ":" + q.get("g", "")] += 1


def dev_questions(vid, lang, cue_list, date, pujas):
    """Questions from a talk she gave in Hindi or Marathi, from those captions exactly as written."""
    per_talk = Counter()
    for start, s in sentences(cue_list, DEV_SPLIT):
        if not DEV_SENTENCE_END.search(s) or re.search(r"[\[\](){}:*♪\"“”]", s) or SPEAKER.match(s):
            continue
        dev, latin = len(re.findall(f"[{DEV}]", s)), len(re.findall(r"[A-Za-z]", s))
        words = s.split()
        n = len(words)
        if not dev or latin > dev * 0.1 or n < 5 or n > 40:
            continue
        norm = re.sub(r"\W+", " ", s).strip()
        if norm in seen:
            continue
        hits = {g: finds(s, rx) for g, rx in DEV_GROUPS.items()}
        chakra = next(iter(hits["chakra"]), None)
        made = None
        if n >= 6 and per_talk["word"] < 25:
            for g in ("chakra", "deity", "concept"):
                if len(hits[g]) != 1:
                    continue
                (term, found), = hits[g].items()
                if len(found) != 1 or per_talk[term] >= 3:
                    continue
                made = {"type": "blank", "g": g, "k": DEV_FIRST[g][term], "a": found[0],
                        "c": chakra, "tier": max({"chakra": 0, "deity": 0, "concept": 2}[g], len_tier(n)), "link": 0,
                        "q": DEV_GROUPS[g][term].sub("_____", s, count=1)}
                per_talk[term] += 1
                per_talk["word"] += 1
                break
        if not made and 5 <= n <= 9 and per_talk["order"] < 6 and any(hits.values()):
            per_talk["order"] += 1
            made = {"type": "order", "tier": 1, "c": chakra}
        if not made and date and per_talk["decade"] < 2 and 12 <= n <= 40 and (hits["chakra"] or hits["concept"]):
            per_talk["decade"] += 1
            made = {"type": "decade", "a": date[:3] + "0s", "tier": 4, "c": chakra}
        if made:
            seen.add(norm)
            made.update({"s": s, "t": vid, "at": start, "n": n, "l": lang})
            add_question(made)


for vid in sorted(set(titles) | set(ORIGINAL)):
    meta = titles.get(vid) or {}
    title = meta.get("title", "")
    orig = ORIGINAL.get(vid)
    vtt = base / "vtt" / f"{vid}.en.vtt"
    if not orig and (not title or not vtt.exists()):
        continue
    if not title:
        title = f"{LANG_NAMES[orig]} talk (title not available)"
    channel = meta.get("channel", "")
    excluded = bool(NOT_HER.search(title) or NOT_HER.search(channel))
    pujas = [name for name, rx, _ in PUJAS if re.search(rx, title, re.I)]
    events = [name for name, rx in EVENTS if re.search(rx, title, re.I)]
    if not pujas and re.search(r"\bPuja\b", title, re.I):
        pujas = ["Other pujas"]
    if meta.get("title") and ("Excerpt" in channel or not re.match(r"\s*(19|20)\d\d", title)):
        events.append("Short talks & excerpts")
    if not pujas and not events:
        events = ["Other talks"]

    cue_list = cues(vtt) if vtt.exists() else []
    orig_cues = cues(base / "vtt" / f"{vid}.{orig}.vtt") if orig else []
    if orig:
        text = "\n".join(ln for _, lines in orig_cues for ln in lines)
        mentions = {k: len(v) for k, v in finds(text, DEV_GROUPS["chakra"]).items()}
    else:
        text = "\n".join(ln for _, lines in cue_list for ln in lines)
        mentions = {k: len(v) for k, v in finds(text, CHAKRA_RE).items()}
    chakras = sorted((k for k, n in mentions.items() if n >= CHAKRA_MIN_MENTIONS or CHAKRA_RE[k].search(title)),
                     key=lambda k: -mentions.get(k, 0))
    date = parse_date(title)
    talks[vid] = {"title": title, "date": date, "channel": channel, "pujas": pujas, "events": events,
                  "chakras": chakras, "chakra_mentions": mentions, "excluded": excluded,
                  "language": orig or "en", "langs": [orig] * bool(orig) + ["en"] * bool(cue_list),
                  "cues": len(orig_cues or cue_list)}
    if excluded:
        continue

    # Talk captions for the reader, exactly as captioned.
    tdir = base / "app" / "talks"
    tdir.mkdir(parents=True, exist_ok=True)
    for key, cl in ((vid, cue_list), (f"{vid}.{orig}", orig_cues)):
        if cl:
            (tdir / f"{key}.js").write_text(
                "SY_TALK(" + json.dumps(key) + "," + json.dumps([[t, ls] for t, ls in cl], ensure_ascii=False,
                                                               separators=(",", ":")) + ");\n", encoding="utf-8")
    if orig:
        dev_questions(vid, orig, orig_cues, date, pujas)
        continue  # the English captions of this talk are a translation

    puja_keys = {w.lower() for name, _, keys in PUJAS if name in pujas for w in keys}
    per_talk = Counter()
    for start, s in sentences(cue_list):
        if not GOOD_SENTENCE.match(s) or "[" in s or "(" in s or "♪" in s or TITLE_LIKE.search(s):
            continue
        words = s.split()
        n = len(words)
        if n < 5 or n > 60 or not mostly_english(words):
            continue
        norm = re.sub(r"\W+", " ", s.lower()).strip()
        if norm in seen:
            continue
        hits = {g: finds(s, rx) for g, rx in GROUPS.items()}
        made = None

        # 1. Chakra knowledge: a chakra named with its own deity or quality.
        ch_hits = hits["chakra"]
        others = set(hits["deity"]) | set(hits["quality"]) | set(hits["concept"])
        if len(ch_hits) == 1:
            (ch, found), = ch_hits.items()
            if len(found) == 1 and ASSOC[ch] & others and n >= 7:
                made = {"type": "blank", "g": "chakra", "k": ch, "a": found[0], "rx": CHAKRA_RE[ch],
                        "c": ch, "tier": len_tier(n), "link": 1}
        if not made and ch_hits:
            for g in ("deity", "quality", "concept"):
                if len(hits[g]) != 1:
                    continue
                (term, found), = hits[g].items()
                owners = [c for c in ch_hits if term in ASSOC[c]]
                if len(found) == 1 and owners and n >= 7:
                    made = {"type": "blank", "g": g, "k": term, "a": found[0], "rx": GROUPS[g][term],
                            "c": owners[0], "tier": max(1 if g != "deity" else 0, len_tier(n)), "link": 1}
                    break

        # 2. Her word: one key word of a group, no other word of that group in the sentence.
        if not made and per_talk["word"] < 4 and n >= 8:
            for g in ("deity", "chakra", "concept", "quality"):
                if len(hits[g]) != 1:
                    continue
                (term, found), = hits[g].items()
                if len(found) != 1:
                    continue
                keyed = term.lower() in puja_keys
                floor = {"deity": 0, "chakra": 0, "concept": 2, "quality": 2}[g]
                if not keyed and random.random() > 0.35:
                    continue  # keep the bank balanced towards puja-related words
                made = {"type": "blank", "g": g, "k": term, "a": found[0], "rx": GROUPS[g][term],
                        "c": next(iter(ch_hits), None), "tier": max(floor, len_tier(n)), "link": 0}
                per_talk["word"] += 1
                break

        if made:
            if per_talk[made["k"]] >= 2:
                continue
            per_talk[made["k"]] += 1
            seen.add(norm)
            rx = made.pop("rx")
            made.update({"q": rx.sub("_____", s, count=1), "s": s, "t": vid, "at": start, "n": n})
            add_question(made)
            continue

        # 3. Put her words in order (short sentences only).
        if 5 <= n <= 9 and per_talk["order"] < 2 and (hits["deity"] or hits["chakra"] or hits["concept"]):
            per_talk["order"] += 1
            seen.add(norm)
            add_question({"type": "order", "s": s, "t": vid, "at": start, "n": n, "tier": 1,
                          "c": next(iter(ch_hits), None)})
            continue

        # 4. Which puja was this said at? Only for talks with exactly one puja,
        #    and only when the sentence carries one of that puja's key words.
        if len(pujas) == 1 and pujas[0] != "Other pujas" and per_talk["puja"] < 2 and 10 <= n <= 40:
            keys = next(k for name, _, k in PUJAS if name == pujas[0])
            if any(re.search(r"(?<!\w)%s(?!\w)" % re.escape(w), s, 0 if w[0].isupper() else re.I) for w in keys):
                per_talk["puja"] += 1
                seen.add(norm)
                add_question({"type": "puja", "a": pujas[0], "s": s, "t": vid, "at": start, "n": n,
                              "tier": max(2, len_tier(n)), "c": next(iter(ch_hits), None)})
                continue

        # 5. Which decade? Adults only.
        if date and per_talk["decade"] < 1 and 12 <= n <= 40 and (hits["chakra"] or hits["concept"]):
            per_talk["decade"] += 1
            seen.add(norm)
            add_question({"type": "decade", "a": date[:3] + "0s", "s": s, "t": vid, "at": start, "n": n,
                          "tier": 4, "c": next(iter(ch_hits), None)})

# ------------------------------------------------------------------ outputs

meta_dir = base / "meta"
(meta_dir / "catalog.json").write_text(json.dumps(talks, ensure_ascii=False, indent=1))
with open(meta_dir / "catalog.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["video_id", "date", "title", "language", "pujas", "events", "chakras", "excluded", "youtube",
                "text_file", "english_translation"])
    for vid, t in sorted(talks.items(), key=lambda kv: (kv[1]["date"] or "9999", kv[1]["title"])):
        lang = t["language"]
        w.writerow([vid, t["date"], t["title"], LANG_NAMES[lang], "; ".join(t["pujas"]), "; ".join(t["events"]),
                    "; ".join(t["chakras"]), "yes" if t["excluded"] else "",
                    f"https://www.youtube.com/watch?v={vid}", f"text/{lang}/{vid}.txt",
                    f"text/en/{vid}.txt" if lang != "en" and "en" in t["langs"] else ""])

cat_root = base / "by-category"
if cat_root.exists():
    for p in sorted(cat_root.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if p.is_symlink():
            p.unlink()
        elif p.is_dir():
            p.rmdir()


def safe(name):
    return re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "-", name).strip()[:150]


for vid, t in talks.items():
    src = base / "text" / t["language"] / f"{vid}.txt"
    groups = [("Pujas", g) for g in t["pujas"]] + [("Events", g) for g in t["events"]] + \
             [("Chakras", g) for g in t["chakras"]] + [("Languages", LANG_NAMES[t["language"]])]
    if t["excluded"]:
        groups = [("Not Shri Mataji's talks", "All")]
    for top, g in groups:
        d = cat_root / top / safe(g)
        d.mkdir(parents=True, exist_ok=True)
        name = f"{t['date'] + ' ' if t['date'] and not t['title'].startswith(t['date'][:4]) else ''}{safe(t['title'])} [{vid}].txt"
        link = d / name
        if not link.exists():
            os.symlink(os.path.relpath(src, d), link)

# Remove reader files for talks no longer included.
keep = {v for v, t in talks.items() if not t["excluded"]} | {f"{v}.{o}" for v, o in ORIGINAL.items() if v in talks}
for p in (base / "app" / "talks").glob("*.js"):
    if p.stem not in keep:
        p.unlink()

order_cat = lambda key, names: [n for n in names if any(n in t[key] for t in talks.values() if not t["excluded"])]
data = {
    "built": __import__("datetime").date.today().isoformat(),
    "ages": AGE_TIERS,
    "talks": {v: [t["title"], t["date"], t["pujas"], t["events"], t["chakras"], t["langs"]]
              for v, t in talks.items() if not t["excluded"]},
    "categories": {
        "pujas": order_cat("pujas", [p[0] for p in PUJAS] + ["Other pujas"]),
        "events": order_cat("events", [e[0] for e in EVENTS] + ["Short talks & excerpts", "Other talks"]),
        "chakras": list(CHAKRAS),
    },
    "options": {"chakra": list(CHAKRAS), "deity": list(DEITIES), "quality": QUALITIES,
                "concept": list(CONCEPTS), "puja": [p[0] for p in PUJAS],
                "decade": ["1970s", "1980s", "1990s", "2000s"],
                "dev": {g: sorted(set(d.values()), key=list(d.values()).index) for g, d in DEV_FIRST.items()}},
    "questions": questions,
}
app = base / "app"
(app / "data.js").write_text("window.SY_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                             encoding="utf-8")

# ------------------------------------------------------------------ summary
print(f"talks: {len(talks)} ({sum(t['excluded'] for t in talks.values())} not Shri Mataji's)")
print(f"questions: {len(questions)} from {len({q['t'] for q in questions})} talks")
print("by language:", dict(Counter(LANG_NAMES[q.get("l", "en")] for q in questions)),
      "| talks:", dict(Counter(LANG_NAMES[t["language"]] for t in talks.values() if not t["excluded"])))
print("by type:", dict(by_type))
print("by age tier:", dict(sorted(Counter(AGE_TIERS[q['tier']] for q in questions).items())))
for label, key in (("Pujas", "pujas"), ("Events", "events")):
    c = Counter(g for t in talks.values() if not t["excluded"] for g in t[key])
    qc = Counter(g for q in questions for g in talks[q["t"]][key])
    print(f"\n{label}:")
    for g, n in c.most_common():
        print(f"  {g}: {n} talks, {qc.get(g, 0)} questions")
c = Counter(g for t in talks.values() if not t["excluded"] for g in t["chakras"])
qc = Counter(q["c"] for q in questions if q.get("c"))
print("\nChakras:")
for g in CHAKRAS:
    print(f"  {g}: {c.get(g, 0)} talks, {qc.get(g, 0)} questions")
