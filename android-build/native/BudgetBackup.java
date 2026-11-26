package app.saldoza.budget;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BudgetBackup")
public class BudgetBackup extends Plugin {
    private static final int MAX_BACKUP_BYTES = 32 * 1024 * 1024;

    @PluginMethod
    public void exportBackup(PluginCall call) {
        String name = call.getString("name", "");
        String json = call.getString("json", "");
        if (!name.matches("saldoza-backup-\\d{4}-\\d{2}-\\d{2}\\.json") || json.isEmpty()
                || json.getBytes(StandardCharsets.UTF_8).length > MAX_BACKUP_BYTES) {
            call.reject("Invalid backup");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/json")
                .putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(call, intent, "writeBackup");
        } catch (ActivityNotFoundException | SecurityException e) {
            call.reject("Cannot open document picker");
        }
    }

    @ActivityCallback
    private void writeBackup(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            call.resolve(new JSObject().put("saved", false));
            return;
        }
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null
                || !ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) {
            call.reject("Invalid document result");
            return;
        }

        execute(() -> {
            ContentResolver resolver = getContext().getContentResolver();
            try (OutputStream stream = resolver.openOutputStream(uri, "wt")) {
                if (stream == null) throw new IOException("No output stream");
                stream.write(call.getString("json", "").getBytes(StandardCharsets.UTF_8));
            } catch (IOException | SecurityException | IllegalArgumentException e) {
                try {
                    DocumentsContract.deleteDocument(resolver, uri);
                } catch (Exception ignored) {
                    // The provider may decline cleanup of an incomplete write.
                }
                call.reject("Cannot save document");
                return;
            }
            call.resolve(new JSObject().put("saved", true));
        });
    }
}
