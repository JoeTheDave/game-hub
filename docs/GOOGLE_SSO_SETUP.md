# Google SSO Setup Guide

This guide walks you through configuring Google OAuth 2.0 so sign-in with Google works in GameHub, both locally and when deployed to Fly.io.

---

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Name it (e.g. `game-hub`) and click **Create**

---

## 2. Configure the OAuth Consent Screen

1. In the project, go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace org) → **Create**
3. Fill in:
   - **App name:** GameHub
   - **User support email:** your email
   - **Developer contact email:** your email
4. Click **Save and Continue**
5. On **Scopes**, click **Add or Remove Scopes** and add:
   - `../auth/userinfo.email`
   - `../auth/userinfo.profile`
   - `openid`
6. Click **Save and Continue**
7. Add **Test users** if the app is in Testing (your email + anyone who needs access)
8. Click **Save and Continue** → **Back to Dashboard**

---

## 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: e.g. `GameHub Web Client`
5. Under **Authorized JavaScript origins**, add:
   - Local: `http://localhost:3000`
   - Production: `https://<your-fly-app>.fly.dev` (e.g. `https://game-hub.fly.dev`)
6. Under **Authorized redirect URIs**, add:
   - Local: `http://localhost:3000/api/auth/google/callback`
   - Production: `https://<your-fly-app>.fly.dev/api/auth/google/callback`
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

---

## 4. Local Development Setup

1. Create or edit `.env` in the project root:

```env
SESSION_SECRET="your-long-random-secret-at-least-32-chars"
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/api/auth/google/callback"
```

2. In local dev, the Vite dev server (port 3000) proxies `/api` to the Express server (port 3001). The browser stays on `localhost:3000`, so:
   - Use `http://localhost:3000` as the origin in Google
   - Use `http://localhost:3000/api/auth/google/callback` as the redirect URI

3. Restart the dev server: `npm run dev`

---

## 5. Fly.io Production Setup

### 5.1 Set Secrets

Set the secrets on Fly.io so they are available at runtime:

```bash
fly secrets set SESSION_SECRET="your-production-secret-min-32-chars"
fly secrets set GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
fly secrets set GOOGLE_CLIENT_SECRET="your-client-secret"
fly secrets set GOOGLE_CALLBACK_URL="https://YOUR_APP_NAME.fly.dev/api/auth/google/callback"
```

Replace `YOUR_APP_NAME` with your Fly app name (e.g. `game-hub`).

### 5.2 Google Console Redirect URI

In Google Cloud Console → Credentials → your OAuth client:

- **Authorized JavaScript origins:** add `https://YOUR_APP_NAME.fly.dev`
- **Authorized redirect URIs:** add `https://YOUR_APP_NAME.fly.dev/api/auth/google/callback`

### 5.3 Production vs Development Credentials

You can either:

- **Option A:** Use one OAuth client for both local and production by adding both redirect URIs and origins to the same client (already described above).
- **Option B:** Create separate OAuth clients (e.g. “GameHub Dev” and “GameHub Prod”) and use different `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` per environment.

---

## 6. Checklist

| Step | Local | Production (Fly.io) |
|------|-------|---------------------|
| OAuth consent screen configured | ✓ | ✓ |
| OAuth client created | ✓ | ✓ |
| Authorized origin added | `http://localhost:3000` | `https://YOUR_APP.fly.dev` |
| Redirect URI added | `http://localhost:3000/api/auth/google/callback` | `https://YOUR_APP.fly.dev/api/auth/google/callback` |
| `SESSION_SECRET` set | In `.env` | `fly secrets set` |
| `GOOGLE_CLIENT_ID` set | In `.env` | `fly secrets set` |
| `GOOGLE_CLIENT_SECRET` set | In `.env` | `fly secrets set` |
| `GOOGLE_CALLBACK_URL` set | In `.env` | `fly secrets set` |

---

## 7. Verify

- **Local:** Open `http://localhost:3000/login`, click “Sign in with Google”, complete the flow, then confirm you’re logged in.
- **Production:** Open `https://YOUR_APP.fly.dev/login`, click “Sign in with Google”, complete the flow, then confirm you’re logged in.

---

## 8. Troubleshooting

- **Redirect URI mismatch:** The redirect URI in the Google Console must exactly match `GOOGLE_CALLBACK_URL` (including scheme, host, port, and path).
- **Session cookie not set:** Ensure `SESSION_SECRET` is set and that `CLIENT_ORIGIN` (if used) matches the app’s public URL.
- **App in Testing:** If the consent screen is in Testing, only configured test users can sign in. Add users under **OAuth consent screen** → **Test users**.
