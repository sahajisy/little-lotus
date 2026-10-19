# Shri Mataji's talks: captions, catalog and Little Lotus

Everything here is built from two sources only:

1. The caption files in <https://github.com/amrutadotorg/captions_zip>, one `.vtt` file per talk and language.
2. The public YouTube title of each talk video, used for its date, puja or event, and place.

**Her words are never changed.** Scripts copy the caption text, sort it and build quizzes from it. No AI wrote, summarised or corrected any of it.

## Download Little Lotus for Android

1. On your Android phone (Android 7 or newer), open the [latest release](https://github.com/sahajisy/little-lotus/releases/latest) and tap **LittleLotus.apk**.
2. Open the downloaded file. If Android asks, allow your browser to install apps.
3. Tap **Install**. The app works fully offline, with no ads, no accounts and no data collected ([privacy policy](https://sahajbalgunde.com/little-lotus-privacy/)).

A Google Play version is coming soon.

## What is where

The raw caption folders (`vtt/`, `text/`, `by-category/`, `zips/`, `download/`) are not in this repository because of their size (about 1.1 GB). `tools/` rebuilds them from the sources above.

| Folder | What it holds |
|---|---|
| `vtt/` | 12,160 original caption files, unchanged (46 languages; 2,280 talks in English) |
| `text/<language>/<video-id>.txt` | Plain text of each caption file: the caption lines only, in order, with timing lines removed |
| `by-category/Pujas/…`, `Events/…`, `Chakras/…`, `Languages/…` | Folders of shortcuts to each talk's text in the language she spoke, one folder per puja, event, chakra and language (English, Hindi, Marathi) |
| `meta/catalog.csv` | One row per talk: date, title, language, pujas, events, chakras, YouTube link, text file (opens in LibreOffice Calc) |
| `meta/hindi_marathi_review.tsv` | Every Hindi and Marathi caption file, marked "her words" or "left out" with the reason |
| `meta/titles.json` | The YouTube titles that were looked up |
| `app/` | **Little Lotus**, the quiz, talks and worksheets app (web app / PWA) |
| `android/out/LittleLotus.apk` | The Android app |
| `tools/` | The scripts that build all of the above |
| `zips/`, `download/` | The downloaded originals |

## Little Lotus

### Open it on this computer
Open `app/index.html` in Firefox or Brave. Everything works offline from the file, including printing.

### Use it as an installable web app (PWA)
The `app/` folder is a complete static website. Put it on any web host (GitHub Pages, Netlify, a school server). On a phone, open the address and choose **Add to Home screen**. After the first visit it works offline.

To try it on your home network: run `python3 -m http.server 8080` inside `app/`, then open `http://<this-computer's-IP>:8080` on a phone on the same Wi-Fi.

### Android
Copy `android/out/LittleLotus.apk` to the phone and open it. Android will ask you to allow installing from that source. The app works fully offline. **Print** opens Android's print screen, where you can also choose "Save as PDF". **Read aloud** uses the phone's voice, and **Watch** opens the YouTube app at that moment.

The APK is signed with a local key (`android/littlelotus.keystore`, password `littlelotus`). Keep that file if you want to publish updates. For the Google Play Store, upload `android/out/LittleLotus.aab`. It is signed with the upload key in `~/android-build/keys/` (password in `upload-password.txt` there). Back up both files; Google holds the final app-signing key. For each update, raise the version: `UPLOAD_PASS=$(cat ~/android-build/keys/upload-password.txt) VERSION_CODE=2 VERSION_NAME=1.1 android/build.sh`.

### What is in the app
- **Play:** choose an age group (1–6, 7–13, 14–18, 19–25, 26+) and a topic (any puja, event or chakra). Each answer shows her full sentence, unchanged, with the talk, date, a link to that moment of the video, and a link to read the whole talk.
- **Question types**, all from her captioned sentences:
  - *Which word did Shri Mataji say?*: one word (a chakra, deity, quality or key term) is hidden behind a blank.
  - *Put her words back in order*: the sentence's own words, shuffled.
  - *At which puja did she say this?*, for ages 14 and up.
  - *In which decade did she say this?*, for adults.
- **Age levels:**
  - 1–6: two big choices and short sentences, with read-aloud.
  - 7–13: three choices.
  - 14 and up: four choices and longer sentences.
  - The harder question types are kept for older groups.
- **Languages:** English, हिंदी (Hindi) and मराठी (Marathi). Choose a language on the Play and Print screens. Hindi and Marathi questions come only from talks she gave in those languages, from those captions exactly as written. Crossword and word search are offered in English only, because their letter grids need English letters.
- **Talks:** every talk grouped by puja, event, chakra and the language she spoke, searchable. A talk she gave in Hindi or Marathi opens in that language first; its English captions are shown as a translation. Each one opens line by line exactly as captioned, with a time link on every line.
- **Print:** worksheets for any topic and age. Activities:
  - colour the chakras
  - trace her words
  - multiple choice, with a QR code beside each question
  - matching
  - word search
  - crossword (clues are her sentences with the word hidden)
  - her words in order
  - fill in the blanks
  - reflect and write
  - an answer key
  - a sources page with a QR code for every talk and moment used

## How the sorting works

- **Language:** the caption collection has Hindi captions for 117 videos and Marathi captions for 15. Each one was read and checked against the English captions of the same video (see `meta/hindi_marathi_review.tsv`). 50 Hindi and 5 Marathi files are transcriptions of talks she gave in those languages; those are used. The rest are translations of English talks, documentaries about her, AI-generated, or garbled at the source; those are left out. To change a decision, edit the `decision` column and run `tools/build.py` again.

- **Pujas and events** come from the video title. For example, "1985-05-19 Shri Ganesha Puja Talk, Rome" goes under *Shri Ganesha Puja*. A talk can be in more than one group.
- **Chakras:** a talk is listed under a chakra when she names that chakra at least 5 times in the captions, or when the title names it.
- 52 videos are not talks by Shri Mataji (meetings, talks by others, a concert). They are kept under `by-category/Not Shri Mataji's talks/` and left out of the app.
- 50 videos have no public title (private or removed), so they could not be sorted. Their captions are still in `vtt/` and `text/`.

## Rebuild after the caption collection is updated

```bash
cd ~/shri-mataji-talks
# 1. Download the latest archive, then unpack it into zips/ and vtt/ (see the commands in this README's history)
python3 -I tools/vtt_to_text.py vtt text     # caption text, unchanged
python3 -I tools/verify_text.py .            # proves every text file matches its caption file
python3 -I tools/fetch_titles.py .           # looks up titles for new talks only
python3 -I tools/build.py .                  # catalog, folders, question bank, app data
android/build.sh                             # Android app (needs ~/android-build: JDK 17 + Android SDK)
```

## Accuracy and permission

- `tools/verify_text.py` checks every text file against its caption file. On the last run, all 12,160 matched exactly. Three caption files are malformed at the source (a timing line with no blank line before it). For those, the timing line was removed and every caption word was kept.
- The captions are as accurate as their transcribers made them. This project does not correct them.
- The caption repository has no license file. Using it privately and within the collective is reasonable. **Before publishing the app or the texts publicly, ask the caption maintainers and the rights holders of Shri Mataji's talks for permission.**

## Developer

Little Lotus was developed by **Sahaj Balgunde**.

- Website: <https://sahajbalgunde.com/>
- GitHub: <https://github.com/sahajisy>
- LinkedIn: <https://in.linkedin.com/in/sahaj-balgunde>
