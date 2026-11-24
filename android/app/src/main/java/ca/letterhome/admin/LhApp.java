package ca.letterhome.admin;

import android.app.Application;
import android.content.SharedPreferences;

import java.io.PrintWriter;
import java.io.StringWriter;

/** Saves the reason for any crash so the next launch can show it. */
public class LhApp extends Application {
    @Override public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler old = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                String s = "Thread " + t.getName() + "\n" + sw;
                if (s.length() > 3000) s = s.substring(0, 3000);
                getSharedPreferences("crash", MODE_PRIVATE).edit().putString("last", s).commit();
            } catch (Throwable ignored) { }
            if (old != null) old.uncaughtException(t, e);
        });
    }
}
