# Saldoza Android

This Capacitor project wraps the local version of Saldoza. Package ID app.saldoza.budget, version 1.0.0. Build on the `android-preparation` branch with Node 22, JDK 21 and Android SDK 35.

```sh
npm ci
npm run prepare:web
npx cap add android
npx cap sync android
node apply-version.mjs
node harden-android.mjs
node test-signing.mjs
(cd android && bash gradlew assembleDebug --no-daemon)
```

Use a dedicated PKCS#12 test keystore with alias `saldoza-test`. The store and key use the same password. For local builds set `SALDOZA_TEST_KEYSTORE` to the absolute path outside the checkout and supply `SALDOZA_TEST_KEYSTORE_PASSWORD` through the environment. In GitHub Actions, set repository secrets `SALDOZA_TEST_KEYSTORE_B64` (base64 of the test PKCS#12 file) and `SALDOZA_TEST_KEYSTORE_PASSWORD`. Keep the keystore and password in a private credential store. The release key has its own lifecycle and is not read by this build. A workflow without test secrets labels the candidate `saldoza-debug-apk-ephemeral`.

Use `npm run test:release-web` after installing Chromium with Playwright. The Android suite expects a disposable booted emulator and two different APKs with the same test certificate. It checks offline startup, an in-place upgrade from the baseline, saving and restoring a JSON backup through Android's document picker, and local notifications.
