package com.keyrabbit.crumbsbakery;

import android.annotation.SuppressLint;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.webkit.WebViewAssetLoader;

/**
 * The whole Kindle/Android app.
 *
 * Crumb's Bakery is a self-contained offline web app — canvas, DOM, localStorage, no network and
 * no native APIs — so the native layer's only jobs are to host a WebView, get out of the way
 * visually, and make the hardware back button behave.
 *
 * Two decisions worth knowing:
 *
 * 1. Assets are served through {@link WebViewAssetLoader} on https://appassets.androidplatform.net
 *    rather than with a file:// URL. Fire OS's WebView applies the opaque-origin rules to file://,
 *    under which **localStorage throws** — and localStorage is the entire save system. Serving from
 *    a real https origin gives the page a normal, persistent storage partition.
 *
 * 2. Nothing here calls setJavaScriptEnabled on remote content. The loader only ever resolves
 *    paths inside the app's own assets, and {@link #shouldOverrideUrlLoading} refuses to navigate
 *    anywhere else, so there is no route from the page to the open internet. That matters for a
 *    kids' app: it is the cheapest possible answer to "can my child end up somewhere else?".
 */
public class MainActivity extends AppCompatActivity {

    private static final String ASSET_ORIGIN = "https://appassets.androidplatform.net";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Draw behind the system bars; the web layer already reserves safe-area padding.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        // Remote debugging via chrome://inspect, and only in a debuggable build. On a Fire tablet
        // this is the only practical way to see a layout problem or a console error: the process
        // stays alive and healthy when the page fails, so nothing surfaces in logcat except a
        // single CONSOLE line that is easy to miss.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        final WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        // The save system is localStorage. Without this the game silently loses every session.
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        // A child pinching the screen mid-lesson should not be able to break the layout.
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        // Respect the game's own type scale rather than the tablet's accessibility font setting,
        // which would otherwise reflow a canvas-aligned layout.
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(0xFF150A06);
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);
        web.setHapticFeedbackEnabled(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Refuse to leave the bundled app. There is nowhere legitimate to go, and for a
                // kids' app "the child cannot reach the internet from here" is worth stating in
                // code rather than assuming.
                String url = request.getUrl().toString();
                return !url.startsWith(ASSET_ORIGIN + "/");
            }
        });

        // The hardware back button must never drop a child out of a lesson. Hand it to the page
        // first — window.crumb.back() activates whatever back control the current screen shows —
        // and only close the app when the page reports it has nothing left to unwind.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript(
                        "(function(){try{return window.crumb.back();}catch(e){return false;}})()",
                        value -> {
                            if (!"true".equals(value)) {
                                setEnabled(false);
                                getOnBackPressedDispatcher().onBackPressed();
                            }
                        });
            }
        });

        if (savedInstanceState == null) {
            web.loadUrl(ASSET_ORIGIN + "/www/index.html");
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        // Mirrors the web layer's own pagehide flush; onPause is the reliable signal on Android.
        web.evaluateJavascript(
                "(function(){try{window.crumb.store.recordPlaytime();window.crumb.store.flush();}catch(e){}})()",
                null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** Immersive sticky: the bars come back on a swipe and hide again on their own. */
    private void hideSystemBars() {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getWindow().getDecorView().setSystemUiVisibility(flags);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
