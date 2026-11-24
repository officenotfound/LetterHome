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

public class MainActivity extends Activity {
    private static final String HOME = "https://letterhome.ca/admin";
    private WebView web;
    private ProgressBar bar;
    private ValueCallback<Uri[]> picker;

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
    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }

    private void startLive() {
        try { Intent live = new Intent(this, LiveService.class); if (Build.VERSION.SDK_INT >= 26) startForegroundService(live); else startService(live); } catch (Throwable ignored) { }
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == 5) startLive();
    }
}
