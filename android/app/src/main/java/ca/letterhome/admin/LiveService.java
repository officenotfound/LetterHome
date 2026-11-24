package ca.letterhome.admin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.webkit.CookieManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.Locale;

/** Keeps one connection open to the admin's live stream and turns each new order, message or extra payment into a notification at once. */
public class LiveService extends Service {
    static volatile long lastAlive = 0;                 // PollJob stays quiet while this is fresh
    private volatile boolean running;
    private Thread worker;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent i, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel("live") == null)
            nm.createNotificationChannel(new NotificationChannel("live", "Live alerts connection", NotificationManager.IMPORTANCE_MIN));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, "live") : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat).setContentTitle("Letterhome Admin").setContentText("Listening for new orders and messages").setOngoing(true);
        try { startForeground(77, b.build()); } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        if (worker == null || !worker.isAlive()) { running = true; worker = new Thread(this::loop, "live"); worker.start(); }
        return START_STICKY;
    }

    @Override public void onDestroy() { running = false; super.onDestroy(); }

    private void loop() {
        long backoff = 3000;
        while (running) {
            boolean ok = false;
            try { ok = connect(); } catch (Exception ignored) { }
            lastAlive = 0;
            try { Thread.sleep(ok ? 2000 : backoff); } catch (InterruptedException e) { return; }
            backoff = ok ? 3000 : Math.min(backoff * 2, 60000);
        }
    }

    /** Returns true if the stream was established (even if it later dropped). */
    private boolean connect() throws Exception {
        String cookie = CookieManager.getInstance().getCookie(PollJob.HOST);
        if (cookie == null || cookie.isEmpty()) return false;
        SharedPreferences sp = getSharedPreferences("poll", MODE_PRIVATE);
        String since = sp.getString("since", null);
        String url = PollJob.HOST + "/api/admin/events" + (since != null ? "?since=" + URLEncoder.encode(since, "UTF-8") : "");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestProperty("Cookie", cookie);
        c.setRequestProperty("Accept", "text/event-stream");
        c.setConnectTimeout(15000); c.setReadTimeout(60000); c.setInstanceFollowRedirects(false);
        int code = c.getResponseCode();
        if (code == 401 || code == 403 || (code >= 300 && code < 400)) {
            if (!sp.getBoolean("signedOutShown", false)) {
                Notify.show(this, 9000, "Signed out", "Open Letterhome Admin and sign in again to keep getting alerts.", "/admin");
                sp.edit().putBoolean("signedOutShown", true).apply();
            }
            return false;
        }
        if (code != 200) return false;
        sp.edit().putBoolean("signedOutShown", false).apply();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
            String line;
            while (running && (line = r.readLine()) != null) {
                lastAlive = System.currentTimeMillis();
                if (!line.startsWith("data: ")) continue;
                JSONObject j = new JSONObject(line.substring(6));
                handle(j);
                String at = j.optString("at", null);
                if (at != null && !at.isEmpty()) sp.edit().putString("since", at).apply();
            }
        } finally { c.disconnect(); }
        return true;
    }

    private void handle(JSONObject j) {
        String type = j.optString("type");
        if (type.equals("order")) {
            int id = j.optInt("id");
            String name = j.optString("name", ""), dest = j.optString("dest", "");
            String price = String.format(Locale.CANADA, "$%.2f", j.optInt("price_cents", 0) / 100.0);
            Notify.show(this, 1000 + id, "New order #" + id, price + (name.isEmpty() ? "" : " · letter to " + name) + (dest.isEmpty() ? "" : " (" + dest + ")"), "/admin/orders/" + id);
        } else if (type.equals("message")) {
            Notify.show(this, 2000 + j.optInt("id"), "Message from " + j.optString("name", "a customer"), j.optString("preview", ""), "/admin/contacts");
        } else if (type.equals("extra")) {
            int oid = j.optInt("order_id");
            String amt = String.format(Locale.CANADA, "$%.2f", j.optInt("amount_cents", 0) / 100.0) + " " + j.optString("currency", "");
            Notify.show(this, 3000 + j.optInt("id"), "Extra payment received", amt + " paid for order #" + oid, "/admin/orders/" + oid);
        }
    }
}
