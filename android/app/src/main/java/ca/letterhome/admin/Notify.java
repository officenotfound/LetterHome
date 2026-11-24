package ca.letterhome.admin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import java.util.Calendar;

final class Notify {
    static final String ORDERS = "orders2", MAIL = "mail2", QUIET = "quiet2";

    /** Quiet hours: everything except new orders is posted silently. */
    static boolean quietNow(Context c) {
        SharedPreferences sp = c.getSharedPreferences("ui", Context.MODE_PRIVATE);
        if (!sp.getBoolean("quiet_on", false)) return false;
        int s = sp.getInt("quiet_start", 22), e = sp.getInt("quiet_end", 7);
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        return s == e ? false : (s < e ? (h >= s && h < e) : (h >= s || h < e));
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(ORDERS) == null) {
            NotificationChannel ch = new NotificationChannel(ORDERS, "New orders", NotificationManager.IMPORTANCE_HIGH);
            Uri tone = Settings.System.DEFAULT_RINGTONE_URI;
            ch.setSound(tone, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ch.enableVibration(true); ch.setVibrationPattern(new long[]{0, 400, 150, 400, 150, 400});
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(MAIL) == null)
            nm.createNotificationChannel(new NotificationChannel(MAIL, "Email and messages", NotificationManager.IMPORTANCE_DEFAULT));
        if (nm.getNotificationChannel(QUIET) == null) {
            NotificationChannel q = new NotificationChannel(QUIET, "Quiet hours", NotificationManager.IMPORTANCE_LOW);
            q.setSound(null, null); q.enableVibration(false);
            nm.createNotificationChannel(q);
        }
    }

    /** Orders and extra payments. */
    static void show(Context c, int id, String title, String text, String path) { post(c, id, true, title, text, path, null); }

    /** Email and customer messages; reply = {box, messageId, folderId, toAddress, subject} lets you answer from the notification. */
    static void showMail(Context c, int id, String title, String text, String path, String[] reply) { post(c, id, false, title, text, path, reply); }

    private static void post(Context c, int id, boolean order, String title, String text, String path, String[] reply) {
        try {
            channels(c);
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            String channel = order ? ORDERS : (quietNow(c) ? QUIET : MAIL);
            Intent open = new Intent(c, MainActivity.class).putExtra("path", path)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
            b.setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(pi).setAutoCancel(true);
            b.setColor(0xFFC4202B).setCategory(order ? Notification.CATEGORY_EVENT : Notification.CATEGORY_MESSAGE).setShowWhen(true);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(order ? Notification.PRIORITY_HIGH : Notification.PRIORITY_DEFAULT);
            // the number on the app icon: how many alerts are waiting
            try { b.setNumber(nm.getActiveNotifications().length + 1); } catch (Throwable ignored) { }
            if (reply != null && Build.VERSION.SDK_INT >= 24) {
                RemoteInput ri = new RemoteInput.Builder("reply_text").setLabel("Reply").build();
                Intent r = new Intent(c, ReplyReceiver.class).putExtra("box", reply[0]).putExtra("mid", reply[1]).putExtra("folder", reply[2])
                        .putExtra("to", reply[3]).putExtra("subject", reply[4]).putExtra("nid", id);
                PendingIntent rp = PendingIntent.getBroadcast(c, id, r, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0));
                b.addAction(new Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_stat), "Reply", rp).addRemoteInput(ri).build());
            }
            nm.notify(id, b.build());
        } catch (Throwable ignored) { }
    }
}
