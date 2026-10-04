# Family Health

A private iPhone app for your family's health history: one page per person with records from any
country, photo scans of prescriptions and bills, payments by illness or doctor, and a large-print
emergency card for when someone can't explain for themselves.

Built with Expo (React Native) and Supabase. Scans are read by Claude through a Supabase Edge
Function, so the AI key never ships inside the app.

## What's in this first version

- Sign in with email and password; Face ID locks the app on launch and after 1 minute in the background
- Family home with a card per person (photo, age, blood group, allergies, conditions, medicines, last visit)
- Each person's page
  - **Records**: timeline by year; scan a prescription, bill or report with the camera; add records by hand; allergy warnings against current medicines
  - **About me**: emergency card, profile photo, personal details, allergies, height and weight by year (US or metric, with BMI), eye prescription by year, emergency contacts
  - **Health**: Apple Health and Apple Watch data (steps, resting heart rate, sleep, blood oxygen, HRV, weight, blood pressure, glucose, workouts) with 30-day trends
  - **Payments**: what you and insurance paid, grouped by illness, doctor, type or year, in any currency
- Row-level security: every row and file belongs to the signed-in account and nobody else can read it

Coming next: lab trend charts, Apple Health clinical records, doctor finder and benefits tracker, doctor messaging.

## One-time setup

### 1. Supabase (backend)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run each file in `supabase/migrations/`, oldest first:
   `20261004000000_init.sql`, then `20261004010000_apple_health.sql`.
   (Or with the Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)
3. Under **Authentication > Providers**, keep **Email** on. For family-only use you can turn off
   "Allow new users to sign up" after everyone has an account.

### 2. Scanning (Claude)

1. Create an API key at [console.anthropic.com](https://console.anthropic.com).
2. Deploy the function and store the key as a secret (it never goes in the app):

   ```sh
   npx supabase functions deploy scan-document
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```

### 3. The app

```sh
npm install
cp .env.example .env   # then fill in your Supabase URL and publishable key
npx expo start
```

Install **Expo Go** on your iPhone and scan the QR code. Expo Go is fine for trying screens;
Face ID inside Expo Go falls back to your passcode, and **Apple Health doesn't work in Expo Go**.
Use a development build (`npx eas-cli@latest build --profile development --platform ios`) or TestFlight for that.

### Apple Health and Apple Watch

Each person connects from **their own iPhone**: open their page › **Health** › **Connect Apple Health**
and choose what to share. The app reads the last 180 days the first time, then catches up whenever the
page is opened (at most every 10 minutes). It reads only; it never writes to Apple Health. Blood group,
sex and date of birth are filled in from Apple Health if the profile doesn't have them yet.

App Review note: HealthKit apps need a privacy policy URL in App Store Connect, must say in the app
what health data is used for, and must never use it for advertising. TestFlight internal testing
doesn't need App Review.

### 4. Your iPhone (TestFlight), no Mac needed

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios
```

EAS creates the signing certificates with your Apple Developer account, builds in the cloud and
uploads to App Store Connect. Then add your family as testers in **TestFlight**.

The bundle ID is `com.go2sshan.familyhealth` (change it in `app.json` before the first build if you prefer another).

## Project layout

```
src/app/                  screens (Expo Router)
  index.tsx               family home
  add-member.tsx
  member/[id]/            a person's page, scan, add record, add payment, edit, emergency card
src/components/           UI pieces, emergency card, member tabs
src/lib/                  Supabase client, data API, scanning, formatting
supabase/migrations/      database schema and security rules
supabase/functions/       scan-document (Claude)
```

## Checks

```sh
npm run typecheck
npx eslint src
```

This app is for keeping personal records. It doesn't give medical advice.
