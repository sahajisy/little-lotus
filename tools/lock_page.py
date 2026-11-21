"""Lock a web page behind a passkey, for hosting it in this public repository.

The page is encrypted (AES-256-GCM, key derived from the passkey with PBKDF2-SHA256, 600,000 rounds),
so the repository and the website only ever hold scrambled text. The browser decrypts it when the
right passkey is typed. The passkey is read from the LOCK_PASSKEY environment variable, never from
the command line or a file in the repository.

Usage: LOCK_PASSKEY=... python3 tools/lock_page.py plain.html locked.html "Page title"
Re-run with a new passkey to change it (the plaintext page is kept outside the repository).
"""
import base64, html, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROUNDS = 600_000
src, dst, title = sys.argv[1], sys.argv[2], sys.argv[3]
passkey = os.environ["LOCK_PASSKEY"].encode("utf-8")
salt, iv = os.urandom(16), os.urandom(12)
key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ROUNDS).derive(passkey)
sealed = AESGCM(key).encrypt(iv, open(src, "rb").read(), None)
b64 = lambda b: base64.b64encode(b).decode()
data = json.dumps({"salt": b64(salt), "iv": b64(iv), "ct": b64(sealed), "rounds": ROUNDS})
t = html.escape(title)
page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>{t}</title>
<style>
:root {{ --bg: #F6F6FB; --card: #FFFFFF; --ink: #1D2047; --muted: #575C84; --line: #E1E3F0; --accent: #D4453B; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg: #12132A; --card: #1B1D3A; --ink: #ECECFA; --muted: #A8ABD0; --line: #2E3158; --accent: #FF7B6E; color-scheme: dark; }} }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--ink); font: 17px/1.5 system-ui, sans-serif;
  padding: 24px max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px)); }}
form {{ width: min(420px, 100%); background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 28px 24px; display: grid; gap: 14px; }}
.eyebrow {{ margin: 0; font-size: .78rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }}
h1 {{ margin: 0; font-size: 1.5rem; line-height: 1.2; }}
label {{ font-weight: 700; }}
input {{ font: inherit; padding: 12px 14px; border: 2px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--ink); width: 100%; }}
button {{ font: inherit; font-weight: 700; padding: 12px 16px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; cursor: pointer; }}
button:disabled {{ opacity: .6; }} input:focus-visible, button:focus-visible {{ outline: 3px solid var(--accent); outline-offset: 2px; }}
#msg {{ margin: 0; min-height: 1.5em; color: var(--accent); font-weight: 700; }} .small {{ margin: 0; font-size: .88rem; color: var(--muted); }}
</style></head><body>
<form id="f" autocomplete="on">
  <p class="eyebrow">Project Restore Shri Ganesha</p><h1>{t}</h1>
  <input type="text" name="username" value="Restore Shri Ganesha" autocomplete="username" hidden>
  <label for="k">Passkey</label><input id="k" type="password" autocomplete="current-password" required autofocus>
  <button id="go">Open</button><p id="msg" role="alert"></p>
  <p class="small">This page is for the seminar team. Ask the organisers for the passkey.</p>
</form>
<script>
(() => {{   // keeps these names out of the unlocked page's own scripts
const D = {data};
const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function unlock(pass) {{
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({{ name: "PBKDF2", salt: bytes(D.salt), iterations: D.rounds, hash: "SHA-256" }}, base, {{ name: "AES-GCM", length: 256 }}, false, ["decrypt"]);
  const page = new TextDecoder().decode(await crypto.subtle.decrypt({{ name: "AES-GCM", iv: bytes(D.iv) }}, key, bytes(D.ct)));
  try {{ sessionStorage.setItem("rsg-passkey", pass); }} catch (e) {{}}   // the other locked page opens without asking again in this tab
  document.open(); document.write(page); document.close();
}}
const f = document.getElementById("f"), k = document.getElementById("k"), go = document.getElementById("go"), msg = document.getElementById("msg");
f.addEventListener("submit", async ev => {{
  ev.preventDefault(); go.disabled = true; msg.textContent = "Opening…";
  try {{ await unlock(k.value); }} catch (e) {{ msg.textContent = "That passkey isn’t right. Check it and try again."; go.disabled = false; k.select(); }}
}});
try {{ const saved = sessionStorage.getItem("rsg-passkey"); if (saved) unlock(saved).catch(() => {{ try {{ sessionStorage.removeItem("rsg-passkey"); }} catch (e) {{}} }}); }} catch (e) {{}}
}})();
</script></body></html>
"""
open(dst, "w", encoding="utf-8").write(page)
print(f"locked {src} -> {dst} ({len(page) // 1024} KB)")
