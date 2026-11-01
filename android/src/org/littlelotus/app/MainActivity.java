package org.littlelotus.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Locale;

/** Hosts the Little Lotus web app, bundled in assets/www, in a full-screen WebView. */
public class MainActivity extends Activity {
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;
    private GameServer game;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(0xFF1D2047);

        web = new WebView(this);
        web.setBackgroundColor(0xFF2A2160); // same violet as the splash, so no white flash before the page draws
        // Android 15+ draws apps edge to edge, so pad the page clear of the status bar, navigation bar and keyboard.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF1D2047);
        root.addView(web);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
                return insets.consumeSystemWindowInsets();
            }
        });
        setContentView(root);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    openExternal(uri.toString());
                    return true;
                }
                return false;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    int r = tts.setLanguage(new Locale("en", "IN"));
                    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.ENGLISH);
                    tts.setSpeechRate(0.92f);
                    ttsReady = true;
                }
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/www/index.html");
    }

    private void keepScreenOn(final boolean on) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() { web.setKeepScreenOn(on); }
        });
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
            // No app can open the link.
        }
    }

    /** Methods the web app calls as window.Android.* */
    private class Bridge {
        @JavascriptInterface
        public void openUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { openExternal(url); }
            });
        }

        @JavascriptInterface
        public void speak(String text) {
            if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "cq");
        }

        /** Speaks text in the given language tag (en-IN, hi-IN, mr-IN), falling back to English. */
        @JavascriptInterface
        public void speakLang(String text, String tag) {
            if (!ttsReady) return;
            int r = tts.setLanguage(Locale.forLanguageTag(tag));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(new Locale("en", "IN"));
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "cq");
        }

        /* Play together: a small server players on the same Wi-Fi or hotspot join from their phones. */

        /** Opens the room. Returns {"ok":true,"port":8686,"addrs":["192.168.1.5"]} or {"ok":false,"error":"..."}. */
        @JavascriptInterface
        public String hostStart(String room) {
            List<String> addrs = GameServer.addresses();
            if (addrs.isEmpty()) return "{\"ok\":false,\"error\":\"network\"}";
            try {
                if (game == null) {
                    game = new GameServer(new GameServer.Files() {
                        @Override
                        public InputStream open(String path) throws IOException { return getAssets().open("www/" + path); }
                    });
                }
                int port = game.start(room);
                keepScreenOn(true);
                StringBuilder a = new StringBuilder();
                for (String ip : addrs) a.append(a.length() > 0 ? "," : "").append(GameServer.quote(ip));
                return "{\"ok\":true,\"port\":" + port + ",\"addrs\":[" + a + "]}";
            } catch (IOException e) {
                return "{\"ok\":false,\"error\":\"port\"}";
            }
        }

        /** Sets the screen players see. Returns the server clock in milliseconds. */
        @JavascriptInterface
        public double hostState(String json) {
            return game == null ? 0 : game.setState(json);
        }

        /** Joins and answers since the last call, as a JSON array. */
        @JavascriptInterface
        public String hostEvents() {
            return game == null ? "[]" : game.takeEvents();
        }

        @JavascriptInterface
        public void hostStop() {
            if (game != null) game.stop();
            keepScreenOn(false);
        }

        @JavascriptInterface
        public void print() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    PrintDocumentAdapter adapter = web.createPrintDocumentAdapter("Little Lotus worksheets");
                    pm.print("Little Lotus worksheets", adapter,
                            new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                }
            });
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (game != null) game.stop();
        if (tts != null) tts.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
