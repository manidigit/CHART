# CHART — Unified Authentication, Google Sign-In & Password Recovery

This plan upgrades CHART's personal authentication system so your account, email, and credentials work seamlessly across both the **Android application** and the **Web terminal (`chart.manico.es`)**, adding **Google Sign-In**, **Email-based Password Recovery**, and prominent **Header Account & Logout Controls**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Please review the confirmed choices from our discussion before we proceed with implementation and Firebase provisioning:

- **Confirmed Decision 1 (Unified Identity & Google Sign-In):** Integrate **Firebase Authentication** (with Google Sign-In via Jetpack Credential Manager on Android) alongside synchronized server-backed credentials so logging in on Android and Web uses a single unified identity rather than separate device-only passwords.
- **Confirmed Decision 2 (Email & Password Recovery via Host Server):** Capture the owner's recovery email address during account setup or in Settings, and provide a complete **"Forgot Password?" (`فراموشی رمز عبور`)** flow that sends a 6-digit recovery code / reset link via the host server (`auth.php`) to reset the password.
- **Confirmed Decision 3 (Single Personal Owner Scope for Phase 1):** Maintain a single personal owner account (with username, email, password, Google Sign-In, change password, and password recovery) in Phase 1, keeping full multi-user management scheduled for Phase 6.

---

## 1. Overview & Core Concept

- **What It Does:**
  1. **Unified Cross-Platform Account:** Eliminates the bug where Android only checked local device storage (`SharedPreferences`) while Web checked the server. Both Android and Web now synchronize with the central authentication API and support **Google Sign-In** via Firebase Authentication.
  2. **Email Registration & Password Recovery (`فراموشی رمز عبور`):** Adds an Email field to account registration and Settings, plus an interactive "Forgot Password?" screen on both Android and Web where you can request a 6-digit verification code sent to your email and set a new password.
  3. **Always-Accessible Account & Logout Button:** Adds a visible user profile badge and quick **Logout (`خروج`)** button directly in the top header bar of both the Web Terminal and Android app (in addition to the Settings page) so you always know who is logged in and can sign out or switch modes with one click.
- **Target Audience / Persona:** Project owner and trader using CHART across desktop browsers and Android phones.
- **Key Value:** True single-account continuity between Web and Android, zero lockout risk thanks to email recovery and Google Sign-In, and clear session control.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **First-Time Owner Setup (Unified):**
   - If no owner account exists yet, the setup card prompts for **Username**, **Email Address (for password recovery)**, **Password**, and **Confirm Password**, or **Sign in with Google** to bind your Google email immediately.
2. **Returning Sign-In (Web & Android):**
   - Users can sign in using either:
     - **Sign in with Google** (one-tap Google account selector via Credential Manager / Firebase Auth), or
     - **Username / Email + Password** verified against the synchronized account store.
3. **Forgot Password Flow (`فراموشی رمز عبور`):**
   - Clicking **"Forgot Password?"** on the Login card switches to the Recovery step:
     - **Step A (Request Code):** Enter your registered Email address. The server generates a time-limited 6-digit recovery token and dispatches it via email (`mail()`).
     - **Step B (Verify & Reset):** Enter the 6-digit recovery code and your new password. Upon verification, the password is updated across the server and local cache, and you are signed in.
4. **Active Session Header & Quick Logout:**
   - The top bar on both Desktop Web and Android displays the active username/email badge alongside a dedicated **Logout (`خروج`)** icon button, plus full account & recovery email management inside the **Settings** screen.

### Visual Identity & Theme
- **Aesthetic Direction:** Institutional dark financial terminal (`#0B0F17` obsidian canvas, `#131A26` elevated cards, `#232F46` crisp borders).
- **Color Palette & Mood:** Emerald (`#10B981`) for verified/authenticated badges, Sky Blue (`#38BDF8`) for primary actions and Google Sign-In accents, Rose (`#F43F5E`) for destructive/logout actions and validation errors.
- **Typography & Hierarchy:** `Vazirmatn` for Persian RTL labels and `JetBrains Mono` (LTR tabular numerals) for emails, usernames, and 6-digit recovery codes.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Hybrid Firebase Google Sign-In + Host Server Email Recovery**
  - *Chosen Approach:* Provision Firebase Authentication (Google Sign-In via Credential Manager on Android) while also upgrading the PHP REST API (`auth.php` + MariaDB `users` table) to store the owner's email, password hash, and recovery tokens, with Android syncing directly with the remote API and caching offline credentials.
  - *Why:* Gives you effortless one-tap Google Sign-In on Android while ensuring your username/password and email recovery work identically on `chart.manico.es` and Android.
- **Decision 2: Visible Session Controls in Top Bar**
  - *Chosen Approach:* Place an explicit user badge and Logout button in the top navigation header as well as in the Settings screen.
  - *Why:* Previously, the logout button was buried at the very bottom of the Settings screen, making it appear as though the app lacked login/logout controls.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Authentication Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Presentation Layer (UI)                           │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │        Login & Recovery        │  │     Workspace Header & Nav     │  │
│  │ - Sign in with Google Button   │  │ - Active User / Email Badge    │  │
│  │ - Username/Email + Password    │  │ - Quick Logout Action Button   │  │
│  │ - Forgot Password (2-Step UI)  │  │ - Settings Account & Email Box │  │
│  └───────────────┬────────────────┘  └───────────────┬────────────────┘  │
└──────────────────┼───────────────────────────────────┼───────────────────┘
                   │                                   │
┌──────────────────▼───────────────────────────────────▼───────────────────┐
│                    Authentication & Session Coordinator                  │
│  - Firebase Auth (Google Sign-In via Jetpack Credential Manager)         │
│  - Remote Auth Sync (Synchronizes Owner Username, Email & Password Hash) │
│  - Password Recovery State Machine (IDLE ➔ CODE_SENT ➔ VERIFIED)         │
└──────────────────┬───────────────────────────────────┬───────────────────┘
                   │                                   │
┌──────────────────▼───────────────┐   ┌───────────────▼───────────────────┐
│   Firebase Auth & Google Identity│   │   Host Backend API (auth.php)     │
│  - OAuth 2.0 Google ID Token     │   │  - MariaDB `users` + `email`      │
│  - Verified Google Email         │   │  - 6-Digit Reset Code Generator   │
│  - Cross-Device Identity         │   │  - PHP mail() Recovery Dispatcher │
└──────────────────────────────────┘   └───────────────────────────────────┘
```

### Data Model & State Updates
1. **Owner Account Model:**
   - `username` (String)
   - `email` (String — used for Google Sign-In matching and password reset emails)
   - `password_hash` (Argon2id / SHA-256 salted hash)
   - `reset_code_hash` & `reset_expires_at_utc` (For 15-minute 6-digit email recovery codes)
2. **Auth UI State Machine:**
   - `AuthMode.SIGN_IN`: Standard login with Username/Email + Password or Google Sign-In.
   - `AuthMode.SETUP_OWNER`: Initial owner registration requiring Username, Recovery Email, and Password.
   - `AuthMode.FORGOT_PASSWORD_REQUEST`: Input registered Email to receive a 6-digit recovery code.
   - `AuthMode.FORGOT_PASSWORD_VERIFY`: Input the 6-digit code and new password to complete reset.

### Interactive Component & State Mapping
- **Login Screen (Android & Web):**
  - Toggle between Sign-In and Forgot Password modes.
  - Interactive **"Sign in with Google"** button invoking `CredentialManager` (`GetSignInWithGoogleOption`).
  - Form validation for empty fields, email format, password length, and recovery code verification.
- **Top Header Bar (Android & Web):**
  - Displays current authenticated user (`ownerUsername` / `ownerEmail`) and a one-click **Logout (`خروج`)** button that clears both Firebase/CredentialManager state and session state, returning immediately to `LoginScreen`.
- **Settings Screen (Android & Web):**
  - Displays Account card with Username, Recovery Email field (editable with save button), Change Password form, and Sign Out button.
- **In-Place Documentation Updates:**
  - Automatically update `CHART_INTELLIGENCE_MASTER_SPEC.md`, `docs/PROJECT_GUIDE.md`, `ARCHITECTURE.md`, and `CHANGELOG.md` in place to reflect the unified authentication and email recovery architecture.
