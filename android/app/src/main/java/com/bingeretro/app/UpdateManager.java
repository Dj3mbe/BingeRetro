package com.bingeretro.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Checks the latest GitHub release when the app comes to the foreground and,
 * when it is newer than this build, offers a one-press update. The APK is
 * streamed into Android's PackageInstaller, which then shows its own install
 * confirmation.
 *
 * Builds are compared by the release tag "apk-N", where N is the versionCode.
 */
final class UpdateManager {

    static volatile boolean installResultSeen;

    private static final String REPO = "Dj3mbe/BingeRetro";
    private static final String TAG_PREFIX = "apk-";
    private static final String APK_NAME = "BingeRetro.apk";
    private static final String PREFS = "update_prompt";
    private static final String KEY_DECLINED_AT = "declined_at";
    private static final String KEY_CHECKED_AT = "checked_at";
    private static final long QUIET_AFTER_DECLINE_MS = 12L * 60 * 60 * 1000;
    private static final long CHECK_INTERVAL_MS = 12L * 60 * 60 * 1000;
    private static final long INSTALL_START_TIMEOUT_MS = 25_000L;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static volatile boolean promptShowing;
    private static volatile boolean checkInFlight;
    private static volatile boolean firstCheckDone;
    private static volatile WeakReference<Activity> screen = new WeakReference<>(null);

    private UpdateManager() {
    }

    static void onForeground(Activity activity) {
        screen = new WeakReference<>(activity);
        if (promptShowing || checkInFlight) {
            return;
        }
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - prefs.getLong(KEY_DECLINED_AT, 0L) < QUIET_AFTER_DECLINE_MS) {
            return;
        }
        // The first check after launch always runs; later ones wait for the interval.
        if (firstCheckDone && now - prefs.getLong(KEY_CHECKED_AT, 0L) < CHECK_INTERVAL_MS) {
            return;
        }
        firstCheckDone = true;
        checkInFlight = true;
        new Thread(() -> {
            Release latest = fetchLatest();
            checkInFlight = false;
            if (latest == null) {
                return;
            }
            prefs.edit().putLong(KEY_CHECKED_AT, System.currentTimeMillis()).apply();
            if (latest.versionCode > BuildConfig.VERSION_CODE) {
                activity.runOnUiThread(() -> {
                    if (!activity.isFinishing() && !activity.isDestroyed() && !promptShowing) {
                        showPrompt(activity, latest);
                    }
                });
            }
        }).start();
    }

    static void launchConfirm(Context context, Intent confirm) {
        Activity current = screen.get();
        try {
            if (current != null && !current.isFinishing() && !current.isDestroyed()) {
                current.startActivity(confirm);
            } else {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(confirm);
            }
        } catch (Exception e) {
            Toast.makeText(context, "Could not open the installer.", Toast.LENGTH_LONG).show();
        }
    }

    private static Release fetchLatest() {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(
                    "https://api.github.com/repos/" + REPO + "/releases/latest").openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("User-Agent", "BingeRetro-Updater");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }
            JSONObject json = new JSONObject(readText(connection.getInputStream()));
            String tag = json.getString("tag_name");
            if (!tag.startsWith(TAG_PREFIX)) {
                return null;
            }
            int versionCode = Integer.parseInt(tag.substring(TAG_PREFIX.length()));
            return new Release(versionCode, json.optString("name", "").trim());
        } catch (Exception e) {
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String readText(InputStream in) throws IOException {
        try (InputStream stream = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = stream.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static void showPrompt(Activity activity, Release release) {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String label = release.label.isEmpty() ? "" : " (" + release.label + ")";
        promptShowing = true;
        new AlertDialog.Builder(activity)
                .setTitle("Update available")
                .setMessage("A newer version of BingeRetro is ready" + label + ". Update now?")
                .setPositiveButton("Update now", (dialog, which) -> startUpdate(activity))
                .setNegativeButton("Later", (dialog, which) -> recordDecline(prefs))
                .setOnCancelListener(dialog -> recordDecline(prefs))
                .setOnDismissListener(dialog -> promptShowing = false)
                .show();
    }

    private static void recordDecline(SharedPreferences prefs) {
        prefs.edit().putLong(KEY_DECLINED_AT, System.currentTimeMillis()).apply();
    }

    private static void startUpdate(Activity activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            askForInstallPermission(activity);
            return;
        }
        installResultSeen = false;
        AlertDialog progress = new AlertDialog.Builder(activity)
                .setTitle("Updating BingeRetro")
                .setMessage("Downloading... 0%")
                .setCancelable(false)
                .create();
        progress.show();
        new Thread(() -> download(activity, progress)).start();
    }

    private static void askForInstallPermission(Activity activity) {
        new AlertDialog.Builder(activity)
                .setTitle("Allow BingeRetro to install updates")
                .setMessage("Turn on \"Install unknown apps\" for BingeRetro, then press Update now again.")
                .setPositiveButton("Open settings", (dialog, which) -> activity.startActivity(
                        new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + activity.getPackageName()))))
                .setNegativeButton("Cancel", null)
                .show();
    }

    private static void download(Activity activity, AlertDialog progress) {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        int sessionId = -1;
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(
                    "https://github.com/" + REPO + "/releases/latest/download/" + APK_NAME).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(30_000);
            connection.setRequestProperty("User-Agent", "BingeRetro-Updater");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new IOException("HTTP " + connection.getResponseCode());
            }
            long total = connection.getContentLengthLong();

            PackageInstaller.SessionParams params =
                    new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            if (total > 0) {
                params.setSize(total);
            }
            sessionId = installer.createSession(params);
            PackageInstaller.Session session = installer.openSession(sessionId);
            try {
                try (OutputStream out = session.openWrite("bingeretro-update.apk", 0, total > 0 ? total : -1);
                     InputStream in = connection.getInputStream()) {
                    copyWithProgress(in, out, total, activity, progress);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        session.fsync(out);
                    }
                }
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= 31) {
                    flags |= PendingIntent.FLAG_MUTABLE;
                }
                PendingIntent result = PendingIntent.getBroadcast(activity, sessionId,
                        new Intent(activity, UpdateResultReceiver.class), flags);
                session.commit(result.getIntentSender());
            } finally {
                session.close();
            }
            activity.runOnUiThread(() -> {
                progress.dismiss();
                MAIN.postDelayed(() -> {
                    if (!installResultSeen) {
                        Toast.makeText(activity,
                                "The install did not start. Check Install unknown apps for BingeRetro, then try again.",
                                Toast.LENGTH_LONG).show();
                    }
                }, INSTALL_START_TIMEOUT_MS);
            });
        } catch (Exception e) {
            if (sessionId >= 0) {
                try {
                    installer.abandonSession(sessionId);
                } catch (Exception ignored) {
                    // The session is already gone.
                }
            }
            activity.runOnUiThread(() -> {
                progress.dismiss();
                Toast.makeText(activity, "Update failed. Please try again later.", Toast.LENGTH_LONG).show();
            });
        }
    }

    private static void copyWithProgress(InputStream in, OutputStream out, long total,
                                         Activity activity, AlertDialog progress) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long done = 0;
        int lastPercent = -1;
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
            done += read;
            if (total > 0) {
                int percent = (int) (done * 100 / total);
                if (percent >= lastPercent + 5) {
                    lastPercent = percent;
                    activity.runOnUiThread(() -> progress.setMessage("Downloading... " + percent + "%"));
                }
            }
        }
    }

    private static final class Release {
        final int versionCode;
        final String label;

        Release(int versionCode, String label) {
            this.versionCode = versionCode;
            this.label = label;
        }
    }
}
