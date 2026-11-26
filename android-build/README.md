# Saldoza Android — preparation only

Isolated Capacitor 7 scaffold. Proposed application ID: app.saldoza.budget (confirm before release). Version 1.0.0 / code 1 intended. Node 22 and JDK 21 intended.

From android-build: npm install; npm run prepare:web; npx cap add android; npx cap sync android. Build a debug APK using Gradle in the generated android directory.

Not release-ready: six audit findings remain unresolved. Do not publish or sign a release. Check Capacitor package availability, current RuStore SDK requirements, Android manifest/backup/permissions, local HTTPS Web Locks, service worker behavior, all external resources, offline first launch, keyboard/back navigation, and persistence across installed updates. Native icon and splash still need integration. Generate and commit package-lock.json before reproducible CI. Keep signing keys outside Git. Web and native storage are separate; verify backup/import. No production deployment.
