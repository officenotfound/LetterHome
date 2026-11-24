package ca.letterhome.admin;

import android.app.NotificationManager;
import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Sends the typed reply from a mail notification through the admin's own send endpoint. */
public class ReplyReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        Bundle in = RemoteInput.getResultsFromIntent(i);
        final String text = in == null ? null : String.valueOf(in.getCharSequence("reply_text"));
        if (text == null || text.trim().isEmpty() || text.equals("null")) return;
        final String box = i.getStringExtra("box"), mid = i.getStringExtra("mid"), to = i.getStringExtra("to"), subject = i.getStringExtra("subject");
        final int nid = i.getIntExtra("nid", 0);
        final PendingResult pr = goAsync();
        new Thread(() -> {
            String result;
            try { result = send(box, mid, to, subject, text.trim()) ? "Reply sent" : "Reply not sent. Open the app to answer."; }
            catch (Throwable e) { result = "Reply not sent. Open the app to answer."; }
            try {
                NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
                nm.cancel(nid);
                Notify.showMail(c, nid + 500000, result, to == null ? "" : to, "/admin/mail", null);
            } catch (Throwable ignored) { }
            pr.finish();
        }).start();
    }

    private boolean send(String box, String mid, String to, String subject, String body) throws Exception {
        String cookie = CookieManager.getInstance().getCookie(PollJob.HOST);
        if (cookie == null || cookie.isEmpty() || box == null || to == null) return false;
        HttpURLConnection m = (HttpURLConnection) new URL(PollJob.HOST + "/api/admin/me").openConnection();
        m.setRequestProperty("Cookie", cookie); m.setConnectTimeout(15000); m.setReadTimeout(20000);
        if (m.getResponseCode() != 200) return false;
        StringBuilder sb = new StringBuilder(); String ln;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(m.getInputStream(), "UTF-8"))) { while ((ln = r.readLine()) != null) sb.append(ln); }
        String csrf = new JSONObject(sb.toString()).optString("csrfToken", "");
        String bd = "----lh" + UUID.randomUUID().toString().replace("-", "");
        HttpURLConnection h = (HttpURLConnection) new URL(PollJob.HOST + "/api/admin/mail/" + box + "/send").openConnection();
        h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15000); h.setReadTimeout(40000);
        h.setRequestProperty("Cookie", cookie); h.setRequestProperty("X-CSRF-Token", csrf);
        h.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + bd);
        try (OutputStream o = h.getOutputStream()) {
            String[][] f = { {"to", to}, {"subject", subject == null || subject.isEmpty() ? "Re:" : (subject.toLowerCase().startsWith("re:") ? subject : "Re: " + subject)}, {"body", body}, {"replyTo", mid == null ? "" : mid} };
            for (String[] p : f) {
                if (p[1].isEmpty()) continue;
                o.write(("--" + bd + "\r\nContent-Disposition: form-data; name=\"" + p[0] + "\"\r\n\r\n" + p[1] + "\r\n").getBytes(StandardCharsets.UTF_8));
            }
            o.write(("--" + bd + "--\r\n").getBytes(StandardCharsets.UTF_8));
        }
        return h.getResponseCode() == 200;
    }
}
