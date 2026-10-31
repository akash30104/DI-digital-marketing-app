# Digital Inertia — Video Production App (PWA)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/akash30104/studio-diskflow-web)

A full-featured mobile & desktop web application for video production, founder approvals, and multi-platform social media publishing. Runs identically on Android, iOS (Safari PWA), iPad, and Desktop browsers, connecting to the exact same Supabase database as the native iPhone app.

---

## ⚡ 1-Click Deploy to Render

Click the button above or visit:
👉 **[https://render.com/deploy?repo=https://github.com/akash30104/studio-diskflow-web](https://render.com/deploy?repo=https://github.com/akash30104/studio-diskflow-web)**

Render will automatically:
1. Detect `render.yaml`.
2. Run `npm install && npm run build`.
3. Publish `./dist` to a high-speed global CDN with free automatic SSL.
4. Give you your permanent public link: `https://studio-diskflow-web.onrender.com`.

---

## 🚀 Quick Start (Local Development)

### 1. Start the Dev Server
From the project directory:
```bash
cmd /c npm run dev
```
By default, the server runs at:
```
http://localhost:3000
```

### 2. Open on Android & iPhone on the Same Wi-Fi
To open the web app on your phone while running it on your PC:
1. Find your PC's local IP address (in PowerShell, run `ipconfig` — look for `IPv4 Address`, e.g., `192.168.1.15`).
2. On your phone's browser, visit:
   ```
   http://192.168.1.15:3000
   ```
3. Enter your Supabase URL & Anon Key (or configure them via the Settings gear icon in the top navigation bar).

---

## 📱 How to Install as an App on Mobile

### On Android (Chrome)
1. Open `http://<your-ip>:3000` (or your deployed URL) in **Google Chrome**.
2. Tap the three-dot menu (**⋮**) in the top right corner.
3. Select **"Install app"** or **"Add to Home screen"**.
4. Tap **Install**.
5. The Studio DiskFlow icon will appear on your app drawer and home screen. It launches in full-screen standalone mode without any browser URL bar.

### On iPhone & iPad (Safari)
1. Open the URL in **Safari** (note: Apple only supports PWA installation via Safari).
2. Tap the **Share** button (the square with an arrow pointing up at the bottom).
3. Scroll down and tap **"Add to Home Screen"** (`+`).
4. Tap **Add** in the top right.
5. DiskFlow will now launch from your iOS Home Screen with a native app appearance, full notch safe-area integration, and no browser chrome.

---

## 🌐 1-Click Free Cloud Deployment (Vercel / Cloudflare Pages)

To have a permanent HTTPS link (e.g., `https://studio-diskflow.vercel.app`) that anyone on your team can access anytime:

### Option A: Vercel
1. Run:
   ```bash
   cmd /c npm i -g vercel
   cmd /c vercel
   ```
2. Follow the prompt to deploy the `dist/` directory or link your GitHub repo.
3. Add Environment Variables:
   - `VITE_SUPABASE_URL`: `https://YOUR_PROJECT_REF.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `YOUR_ANON_KEY`

### Option B: Cloudflare Pages / Netlify
1. Drag and drop the `dist/` folder into Netlify Drop or Cloudflare Pages.
2. Done!

---

## 🔑 Security & Single-Founder Model

- **Single Founder Protection**: Just like the native iOS app, the web app restricts the Founder role. The database enforces this via the partial unique index:
  ```sql
  CREATE UNIQUE INDEX idx_only_one_founder ON public.profiles (role) WHERE (role = 'founder');
  ```
  And the login screen disables the Founder registration tab once a founder profile exists.
- **Role-Based Access Control**:
  - **Founder**: Full dashboard, editing stage metrics, approval/rejection controls, team management, target configurations, and CSV/Excel exports.
  - **Video Editor**: Assigned recordings with hard drive names & folder paths, editing progress slider, resubmission on changes requested.
  - **Social Media Manager**: Raw footage registration, publishing hub with live post URL confirmation for YouTube Shorts, YouTube Full-Length, and Instagram Reels.
