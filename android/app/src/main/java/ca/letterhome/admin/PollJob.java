package ca.letterhome.admin;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.SharedPreferences;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.Locale;

/** Every ~15 minutes, asks the admin for new paid orders and unread messages and shows a notification for each. */
public class PollJob extends JobService {
    static final String HOST = "https://letterhome.ca";

    @Override public boolean onStartJob(JobParameters p) {
        new Thread(() -> {
            try { poll(); } catch (Exception ignored) { }
            jobFinished(p, false);
        }).start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters p) { return true; }

    private void poll() throws Exception {
        if (System.currentTimeMillis() - LiveService.lastAlive < 90000) return;      // the live connection is handling alerts
        String cookie = CookieManager.getInstance().getCookie(HOST);
        if (cookie == null || cookie.isEmpty()) return;               // never signed in
        SharedPreferences sp = getSharedPreferences("poll", MODE_PRIVATE);
        String since = sp.getString("since", null);
        String url = HOST + "/api/admin/notifications" + (since != null ? "?since=" + URLEncoder.encode(since, "UTF-8") : "");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestProperty("Cookie", cookie);
        c.setRequestProperty("Accept", "application/json");
        c.setConnectTimeout(15000); c.setReadTimeout(15000); c.setInstanceFollowRedirects(false);
        int code = c.getResponseCode();
        if (code == 401 || code == 403 || (code >= 300 && code < 400)) {
            if (!sp.getBoolean("signedOutShown", false)) {
                Notify.show(this, 9000, "Signed out", "Open Letterhome Admin and sign in again to keep getting alerts.", "/admin");
                sp.edit().putBoolean("signedOutShown", true).apply();
            }
            return;
        }
        if (code != 200) return;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = c.getInputStream()) { byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n); }
        JSONObject j = new JSONObject(out.toString("UTF-8"));
        sp.edit().putBoolean("signedOutShown", false).apply();
        if (since != null) {                                          // first run only sets the starting point
            JSONArray orders = j.optJSONArray("orders");
            for (int i = 0; orders != null && i < Math.min(orders.length(), 5); i++) {
                JSONObject o = orders.getJSONObject(i);
                int id = o.getInt("id");
                String name = o.optString("recipient_name", "");
                String dest = o.optString("destination_country", "");
                String price = String.format(Locale.CANADA, "$%.2f", o.optInt("price_cents", 0) / 100.0);
                Notify.show(this, 1000 + id, "New order #" + id, price + (name.isEmpty() ? "" : " · letter to " + name) + (dest.isEmpty() ? "" : " (" + dest + ")"), "/admin/orders/" + id);
            }
            if (orders != null && orders.length() > 5) Notify.show(this, 1999, "More new orders", (orders.length() - 5) + " more new orders.", "/admin/orders");
            JSONArray contacts = j.optJSONArray("contacts");
            for (int i = 0; contacts != null && i < Math.min(contacts.length(), 5); i++) {
                JSONObject m = contacts.getJSONObject(i);
                Notify.showMail(this, 2000 + m.getInt("id"), "Message from " + m.optString("name", "a customer"), m.optString("preview", ""), "/admin/contacts?id=" + m.getInt("id"), null);
            }
        }
        sp.edit().putString("since", j.getString("now")).apply();
    }
}
