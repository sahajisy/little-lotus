#!/usr/bin/env bash
# Builds android/out/LittleLotus.apk (to install directly) and android/out/LittleLotus.aab (for Google Play)
# from the web app in ../app, without Gradle.
# Needs a JDK (17+), the Android SDK with platforms;android-36 and build-tools;36.0.0, and bundletool.
#   JAVA_HOME=...  ANDROID_SDK=...  BUNDLETOOL=...  UPLOAD_KS=...  UPLOAD_PASS=...  VERSION_CODE=2  VERSION_NAME=1.1  ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
HERE=$(pwd)
JAVA_HOME=${JAVA_HOME:-$(ls -d "$HOME"/android-build/jdk-17*/ 2>/dev/null | head -1)}
ANDROID_SDK=${ANDROID_SDK:-$HOME/android-build/sdk}
BT=$ANDROID_SDK/build-tools/36.0.0
JAR=$ANDROID_SDK/platforms/android-36/android.jar
export PATH="$JAVA_HOME/bin:$PATH"
VERSION_CODE=${VERSION_CODE:-1}
VERSION_NAME=${VERSION_NAME:-1.0}
BUNDLETOOL=${BUNDLETOOL:-$HOME/android-build/tools/bundletool.jar}

rm -rf build && mkdir -p build/classes build/res build/assets/www out

# Web app into assets (test files and tooling left out).
rsync -a --exclude '_test.html' --exclude 'sw.js' ../app/ build/assets/www/

# Launcher icons from the web app icon.
python3 -I - <<'EOF'
from PIL import Image
import os
src = Image.open("../app/icons/icon-512.png")
for name, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    d = f"res/mipmap-{name}"; os.makedirs(d, exist_ok=True)
    src.resize((px, px), Image.LANCZOS).save(f"{d}/ic_launcher.png")
EOF

"$BT/aapt2" compile --dir res -o build/res/res.zip
LINK=(-I "$JAR" --manifest AndroidManifest.xml --min-sdk-version 24 --target-sdk-version 36
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" -A build/assets build/res/res.zip)
"$BT/aapt2" link -o build/base.apk "${LINK[@]}"
"$BT/aapt2" link --proto-format -o build/proto.apk "${LINK[@]}"

javac -source 8 -target 8 -bootclasspath "$JAR" -classpath "$JAR" -d build/classes $(find src -name '*.java') 2>&1 | grep -v 'bootstrap classpath\|source value 8\|target value 8\|To suppress warnings' || true
"$BT/d8" --release --min-api 24 --lib "$JAR" --output build $(find build/classes -name '*.class')

python3 -I - <<'EOF'
import zipfile, shutil
shutil.copy("build/base.apk", "build/unsigned.apk")
with zipfile.ZipFile("build/unsigned.apk", "a", zipfile.ZIP_DEFLATED) as z:
    z.write("build/classes.dex", "classes.dex")
EOF
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk

KS=${KEYSTORE:-$HERE/littlelotus.keystore}
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias littlelotus -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass littlelotus -keypass littlelotus -dname "CN=Little Lotus" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-key-alias littlelotus --ks-pass pass:${KS_PASS:-littlelotus} \
  --key-pass pass:${KS_PASS:-littlelotus} --out out/LittleLotus.apk build/aligned.apk
"$BT/apksigner" verify out/LittleLotus.apk && ls -la out/LittleLotus.apk

# Google Play bundle: the same app laid out as a bundletool module, signed with the upload key.
python3 -I - <<'EOF'
import zipfile
with zipfile.ZipFile("build/proto.apk") as src, zipfile.ZipFile("build/base-module.zip", "w", zipfile.ZIP_DEFLATED) as out:
    for n in src.namelist():
        out.writestr("manifest/AndroidManifest.xml" if n == "AndroidManifest.xml" else n, src.read(n))
    out.write("build/classes.dex", "dex/classes.dex")
EOF
rm -f out/LittleLotus.aab
java -jar "$BUNDLETOOL" build-bundle --modules=build/base-module.zip --output=out/LittleLotus.aab
UPLOAD_KS=${UPLOAD_KS:-$HOME/android-build/keys/littlelotus-upload.jks}
if [ -f "$UPLOAD_KS" ] && [ -n "${UPLOAD_PASS:-}" ]; then
  jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$UPLOAD_KS" -storepass "$UPLOAD_PASS" \
    out/LittleLotus.aab upload >/dev/null
  jarsigner -verify out/LittleLotus.aab | tail -1 && ls -la out/LittleLotus.aab
else
  echo "out/LittleLotus.aab is NOT signed: set UPLOAD_KS and UPLOAD_PASS to sign it for Google Play." >&2
fi
