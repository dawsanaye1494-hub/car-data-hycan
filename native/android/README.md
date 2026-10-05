# Standalone APK (no laptop, no adb)

After `npx cap add android`:

1. Copy `HeadUnitLogcatPlugin.java` into `android/app/src/main/java/<your/app/id>/` and change the `package` line to your appId.
2. Edit `MainActivity.java`:
   ```java
   public class MainActivity extends BridgeActivity {
     @Override public void onCreate(Bundle b) {
       registerPlugin(HeadUnitLogcatPlugin.class);
       super.onCreate(b);
     }
   }
   ```
3. In `AndroidManifest.xml` add:
   ```xml
   <uses-permission android:name="android.permission.READ_LOGS" />
   ```
4. `npx cap sync` and build the APK.
5. Install the APK on the head unit and open it. Tap **Read from car**.
   - Rooted unit: approve the root (Superuser) prompt once. Done.
   - Not rooted: grant log access once with `adb shell pm grant <appId> android.permission.READ_LOGS`, then never again.
