package com.bingeretro.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

public class UpdateResultReceiver extends BroadcastReceiver {

    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context context, Intent intent) {
        UpdateManager.installResultSeen = true;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                UpdateManager.launchConfirm(context, confirm);
            }
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            Toast.makeText(context, "The update could not be installed.", Toast.LENGTH_LONG).show();
        }
    }
}
