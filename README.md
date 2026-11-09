# DI Digital Marketing — Android App

Native Android application and progressive studio management platform for **Digital Inertia**, built with Capacitor, React, TypeScript, and Supabase.

---

## 📱 Features

- **Native Android Integration**: Packaged with Capacitor for full Android OS compatibility (Android 7.0+ / API 24 to 34+).
- **Executive Founder & SMM Hub**: Live streak tracking, multi-channel performance insights, and real-time daily publishing targets.
- **Dynamic Multi-Channel Publishing**: Dedicated support for YouTube Shorts, YouTube Full, Instagram Reels, Facebook, and X (Twitter).
- **Automated Client Synchronization**: Any brand or client account created automatically appears as a selectable channel across the app.
- **Real Video Insights Tracker**: Zero fake data — verified views, comments, shares, and likes with automated 1-click YouTube Data API sync.
- **Mobile-Optimized Interface**: Dark OLED theme with bottom navigation bar, edge-to-edge layout, and native haptic responsiveness.

---

## 🛠️ Android Developer Workflow

### 1. Requirements
- Node.js 18+ & npm
- Android Studio Ladybug (or newer)
- Android SDK 34+
- Java 17+

### 2. Install Dependencies & Build
```bash
npm install
npm run build
npx cap sync android
```

### 3. Open in Android Studio
```bash
npx cap open android
```
Or open the `android/` directory directly inside Android Studio.

### 4. Build APK locally via Gradle
```bash
cd android
./gradlew assembleDebug
```
The output APK is generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## ⚡ Automated Cloud APK Builds (GitHub Actions)

Every push to the `main` branch automatically triggers the `.github/workflows/android-build.yml` workflow:
1. Compiles web distribution.
2. Synchronizes Capacitor native Android layer.
3. Assembles the debug APK (`app-debug.apk`).
4. Uploads the ready-to-install `.apk` directly to GitHub Actions Artifacts.

---

## 🌐 Web & Render Deployment

This project remains 100% compatible with static web hosting (e.g. Render, Vercel, Netlify):
```bash
npm run build
```
Output directory: `dist/`

---

## 🔒 Privacy Policy & Google Play Store Compliance

This application complies with Google Play Developer Policies and data protection standards:
- **GitHub Policy File:** [PRIVACY_POLICY.md](./PRIVACY_POLICY.md)
- **Live Render Web Policy:** [https://studio-diskflow-web.onrender.com/privacy-policy.html](https://studio-diskflow-web.onrender.com/privacy-policy.html)
- **In-App Direct Route:** Accessible directly at `/privacy-policy` and from the app login screen.
- **Data Deletion:** Requests can be sent directly to `support@digitalinertia.com` or managed by Founders in-app.

