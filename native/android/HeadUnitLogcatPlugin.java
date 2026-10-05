package com.yourname.drivelog;

// Copy into android/app/src/main/java/com/yourname/drivelog/ (match your appId package).
// Reads the head unit's logcat directly on the device — no laptop, no adb.
// Uses root (su) when available, otherwise falls back to READ_LOGS permission.

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "HeadUnitLogcat")
public class HeadUnitLogcatPlugin extends Plugin {
    private static final Pattern KEEP = Pattern.compile(
        "reportLocation|SdvcService|setSteeWheel|VehiclePlatform|CAR\\.HAL|RvcVehicle|[Gg]ear|[Rr]everse|ACC|[Ii]gnition");

    private Process proc;
    private Thread reader;
    private volatile boolean running = false;

    private static boolean hasRoot() {
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"su", "-c", "id"});
            BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String out = r.readLine();
            p.waitFor();
            return out != null && out.contains("uid=0");
        } catch (Exception e) { return false; }
    }

    @PluginMethod
    public void start(PluginCall call) {
        stopInternal();
        boolean wantRoot = call.getBoolean("root", true);
        boolean root = wantRoot && hasRoot();
        String cmd = "logcat -v threadtime -T 1";
        try {
            proc = root
                ? Runtime.getRuntime().exec(new String[]{"su", "-c", cmd})
                : Runtime.getRuntime().exec(cmd.split(" "));
        } catch (Exception e) {
            call.reject("Cannot start logcat: " + e.getMessage());
            return;
        }
        running = true;
        reader = new Thread(() -> {
            List<String> batch = new ArrayList<>();
            long lastSend = System.currentTimeMillis();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(proc.getInputStream()))) {
                String line;
                while (running && (line = br.readLine()) != null) {
                    if (KEEP.matcher(line).find()) batch.add(line);
                    long now = System.currentTimeMillis();
                    if (!batch.isEmpty() && (now - lastSend > 250 || batch.size() > 50)) {
                        JSObject d = new JSObject();
                        d.put("lines", new JSArray(batch));
                        notifyListeners("lines", d);
                        batch = new ArrayList<>();
                        lastSend = now;
                    }
                }
            } catch (Exception e) {
                JSObject d = new JSObject();
                d.put("message", e.getMessage());
                notifyListeners("error", d);
            }
        });
        reader.start();
        JSObject res = new JSObject();
        res.put("mode", root ? "root" : "read_logs");
        call.resolve(res);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    private void stopInternal() {
        running = false;
        if (proc != null) { proc.destroy(); proc = null; }
    }

    @Override
    protected void handleOnDestroy() { stopInternal(); }
}
