package ca.letterhome.admin;

import android.app.Activity;
import android.app.DownloadManager;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.app.KeyguardManager;
import android.content.SharedPreferences;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;

public class MainActivity extends Activity {
    private static final String HOME = "https://letterhome.ca/admin";
    private WebView web;
    private ProgressBar bar;
    private ValueCallback<Uri[]> picker;
    private View cover;
    private long leftAt = 0;
    private boolean unlocking = false, unlocked = false;
    private float downY = -1;

    private static final String OFFLINE = "<meta name='viewport' content='width=device-width,initial-scale=1'><body style='font-family:sans-serif;background:#f6f4ef;color:#222;text-align:center;padding:30vh 24px 0'>"
            + "<h2 style='margin:0 0 8px'>No connection</h2><p style='color:#666;margin:0 0 22px'>Letterhome Admin cannot reach the server right now.</p>"
            + "<a href='https://letterhome.ca/admin' style='display:inline-block;padding:12px 22px;background:#222;color:#fff;border-radius:8px;text-decoration:none'>Try again</a></body>";

    /** What the admin's Settings screen can read and change inside the app. */
    public class Bridge {
        @JavascriptInterface public String get() {
            SharedPreferences sp = getSharedPreferences("ui", MODE_PRIVATE);
            return "{\"quietOn\":" + sp.getBoolean("quiet_on", true) + ",\"start\":" + sp.getInt("quiet_start", 22) + ",\"end\":" + sp.getInt("quiet_end", 7)
                    + ",\"lock\":" + sp.getBoolean("lock_on", false) + ",\"canLock\":" + secure() + ",\"version\":\"" + BuildConfigVersion() + "\"}";
        }
        @JavascriptInterface public void setQuiet(boolean on, int start, int end) {
            getSharedPreferences("ui", MODE_PRIVATE).edit().putBoolean("quiet_on", on).putInt("quiet_start", Math.max(0, Math.min(23, start))).putInt("quiet_end", Math.max(0, Math.min(23, end))).apply();
        }
        @JavascriptInterface public void setLock(boolean on) { getSharedPreferences("ui", MODE_PRIVATE).edit().putBoolean("lock_on", on).apply(); }
    }
    private String BuildConfigVersion() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Throwable e) { return ""; } }
    private boolean secure() { try { return ((KeyguardManager) getSystemService(KEYGUARD_SERVICE)).isDeviceSecure(); } catch (Throwable e) { return false; } }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        try {
            android.content.SharedPreferences cp = getSharedPreferences("crash", MODE_PRIVATE);
            String last = cp.getString("last", null);
            if (last != null) {
                cp.edit().remove("last").apply();
                android.widget.TextView tv = new android.widget.TextView(this);
                tv.setText(last); tv.setTextSize(11); tv.setTextIsSelectable(true); tv.setPadding(24, 24, 24, 24);
                android.widget.ScrollView sv = new android.widget.ScrollView(this); sv.addView(tv);
                new android.app.AlertDialog.Builder(this).setTitle("The app crashed last time").setView(sv).setPositiveButton("OK", null).show();
            }
        } catch (Throwable ignored) { }
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#1a1a1a"));
        w.setNavigationBarColor(Color.parseColor("#1a1a1a"));

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.addView(bar, new FrameLayout.LayoutParams(-1, 8));
        setContentView(root);
        root.setFitsSystemWindows(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, false);

        web.addJavascriptInterface(new Bridge(), "LHApp");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String h = u.getHost() == null ? "" : u.getHost();
                boolean mine = "https".equals(u.getScheme()) && (h.equals("letterhome.ca") || h.endsWith(".letterhome.ca")
                        || h.equals("letterhome.us") || h.endsWith(".letterhome.us")
                        || h.equals("letterhome.co.uk") || h.endsWith(".letterhome.co.uk"));
                if (mine) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) { CookieManager.getInstance().flush(); }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL("https://letterhome.ca/admin", OFFLINE, "text/html", "UTF-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int p) {
                bar.setProgress(p);
                bar.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (picker != null) picker.onReceiveValue(null);
                picker = cb;
                try { startActivityForResult(p.createIntent(), 7); }
                catch (Exception e) { picker = null; return false; }
                return true;
            }
        });
        web.setDownloadListener((url, ua, cd, mime, len) -> {
            DownloadManager.Request q = new DownloadManager.Request(Uri.parse(url));
            q.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
            q.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            q.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, cd, mime));
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(q);
        });

        web.setOnTouchListener((v, ev) -> {
            try {
                if (ev.getAction() == MotionEvent.ACTION_DOWN) downY = web.getScrollY() == 0 ? ev.getY() : -1;
                else if (ev.getAction() == MotionEvent.ACTION_UP) { if (downY >= 0 && ev.getY() - downY > 320 && web.getScrollY() == 0) web.reload(); downY = -1; }
                else if (ev.getAction() == MotionEvent.ACTION_CANCEL) downY = -1;
            } catch (Throwable ignored) { }
            return false;
        });
        cover = new View(this); cover.setBackgroundColor(Color.parseColor("#1a1a1a")); cover.setVisibility(View.GONE);
        root.addView(cover, new FrameLayout.LayoutParams(-1, -1));

        String start = startUrl(getIntent());
        if (b != null) web.restoreState(b); else web.loadUrl(start);

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 5);
        if (Build.VERSION.SDK_INT < 33 || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED) startLive();
        try {
            JobScheduler js = (JobScheduler) getSystemService(JOB_SCHEDULER_SERVICE);
            if (js.getPendingJob(1) == null)
                js.schedule(new JobInfo.Builder(1, new ComponentName(this, PollJob.class))
                        .setPeriodic(15 * 60 * 1000L).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).build());
        } catch (Throwable ignored) { }
    }

    private String startUrl(Intent i) {
        String p = i == null ? null : i.getStringExtra("path");
        return (p != null && p.startsWith("/admin")) ? "https://letterhome.ca" + p : HOME;
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); if (i.getStringExtra("path") != null) web.loadUrl(startUrl(i)); }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == 9) {
            unlocking = false;
            if (res == RESULT_OK) { unlocked = true; leftAt = 0; cover.setVisibility(View.GONE); } else finish();
            return;
        }
        if (req == 7 && picker != null) {
            Uri[] r = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount(); r = new Uri[n];
                    for (int i = 0; i < n; i++) r[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) r = new Uri[]{data.getData()};
            }
            picker.onReceiveValue(r); picker = null;
        }
    }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); if (!unlocking) { leftAt = System.currentTimeMillis(); } }

    @Override protected void onResume() {
        super.onResume();
        try {
            SharedPreferences sp = getSharedPreferences("ui", MODE_PRIVATE);
            boolean need = sp.getBoolean("lock_on", false) && secure() && !unlocking && (!unlocked || (leftAt > 0 && System.currentTimeMillis() - leftAt > 60000));
            if (need) {
                unlocking = true; cover.setVisibility(View.VISIBLE);
                Intent k = ((KeyguardManager) getSystemService(KEYGUARD_SERVICE)).createConfirmDeviceCredentialIntent("Letterhome Admin", "Unlock to open the admin");
                if (k != null) startActivityForResult(k, 9); else { unlocking = false; cover.setVisibility(View.GONE); }
            }
        } catch (Throwable e) { unlocking = false; if (cover != null) cover.setVisibility(View.GONE); }
    }

    private void startLive() {
        try { Intent live = new Intent(this, LiveService.class); if (Build.VERSION.SDK_INT >= 26) startForegroundService(live); else startService(live); } catch (Throwable ignored) { }
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == 5) startLive();
    }
}
