# Deploying Nivasa

Live app: **https://nivasa-delta.vercel.app**
Repository: **https://github.com/architaagr25/Nivasa**

## Demo logins for the reviewer

The live app runs in demo mode. No real SMS or WhatsApp messages are sent: sign-in codes appear on screen, and every message the system would send is kept in the **Message outbox** in the staff workspace.

### Sales workspace — https://nivasa-delta.vercel.app/staff

Every staff account uses the password **`NivasaDemo#2026`**. The sign-in page also lists these accounts, so you can sign in with one click.

| Role                       | Email               | What to try                                                                                                                       |
| -------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Sales head                 | `meera@nivasa.demo` | Everything: all leads with full numbers, dashboard, review of flagged chats, fact sheet and visiting-time editors, message outbox |
| Sales executive, Project 1 | `rahul@nivasa.demo` | Own and unassigned leads only; unassigned numbers are masked until the lead is taken                                              |
| Sales executive, Project 2 | `harsh@nivasa.demo` | Owns the sample lead LD-58211 (Nidhi Shah), handed off from the chat                                                              |

### Buyer side — https://nivasa-delta.vercel.app

Buyers don't need an account. Ask a question in the chat or book a visit; when a mobile number is needed, use any 10-digit number starting with 6–9 (please use a made-up one, such as `70000 12345`). The one-time code is shown on screen in a box marked "Demo mode".

To see a buyer who already has a visit, open **My visits** and sign in with **`70000 58210`**: that is Hardik Patel (LD-58210) from the sample data.

Things worth trying:

- Ask in Hindi or Gujarati, or in Hindi typed in English letters.
- Ask something that isn't on the fact sheet ("What is the maintenance charge?") or ask for a discount. The assistant says a person will confirm and hands the chat to a named executive.
- Book a visit from a project page or inside the chat, then change or cancel it from the visit pass.
- In the staff workspace, open **Message outbox** and use its demo console to send in a portal lead, a social-ad lead or a STOP reply, and to run the reminder job now.

Please don't enter real personal data: this is a public demo.

## Running it locally

You need Node.js 22 or later, npm, and a free [Supabase](https://supabase.com) account and [Google AI Studio](https://aistudio.google.com) key. Docker is not needed.

1. **Get the code**

   ```bash
   git clone https://github.com/architaagr25/Nivasa.git
   cd Nivasa
   npm ci
   ```

2. **Create the database.** In Supabase, create a project in the **Mumbai (ap-south-1)** region. From **Connect** at the top of the project, copy:
   - the **Transaction pooler** connection string (port 6543) for `DATABASE_URL`
   - the **Session pooler** connection string (port 5432) for `DIRECT_URL`

   From **Project Settings → API Keys**, copy the project URL, the publishable key and a secret key.

3. **Get an AI key.** In Google AI Studio, create an API key. The free tier is enough.

4. **Fill in the environment.** Copy `.env.example` to `.env.local` and fill in every value (see the table below). For the secrets, any long random string works, for example:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

5. **Create the tables and the sample data**

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   The seed creates both projects with their fact sheets, the 12 staff accounts, about 6,000 leads over the last 60 days (including the three sample leads from the brief), visits, chats and visiting slots. Run it again at any time to start fresh; it deletes the app's data first.

6. **Start the app**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 for the buyer site and http://localhost:3000/staff for the sales workspace.

Reminders are sent by a job at `/api/jobs/reminders`. Locally nothing calls it on a schedule; use **Run reminder job** in the staff Message outbox, or call it yourself:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/reminders
```

### Tests

The integration tests and the assistant check run against a **separate** Supabase project, so they never touch your app data. Create a second project, put its session pooler string in `TEST_DATABASE_URL`, then:

```bash
npm run db:migrate -- --test     # once, to create the tables
npm test                         # unit and integration tests (Vitest)
npm run test:e2e                 # browser tests on phone and desktop (Playwright; starts the app)
npm run eval                     # sends 29 test conversations to the real model and writes docs/assistant-eval.md
```

`npm run eval` uses about 40 model requests of the free daily quota. Run `npx playwright install chromium` once before the browser tests.

## How it is deployed

| Part         | Where                                  | Notes                                                                                                                           |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| App          | Vercel (Hobby), Mumbai region (`bom1`) | Builds from `main` on every push. `vercel.json` pins the region next to the database.                                           |
| Database     | Supabase Postgres (free), Mumbai       | Data stays in India. Row-level security is on for every table and the public API has no access; only the app's server connects. |
| Reminder job | Supabase `pg_cron` + `pg_net`          | Calls `/api/jobs/reminders` every minute with the `CRON_SECRET`, kept in Supabase Vault.                                        |
| Keep-alive   | GitHub Actions (`keep-alive.yml`)      | Runs the reminder job once a day so the free database is never paused for inactivity.                                           |
| Checks       | GitHub Actions (`ci.yml`)              | Secret scan (gitleaks), lint, type check, format check and tests on every push.                                                 |
| AI           | Google Gemini, free tier               | A Flash Lite model with a second one as fallback.                                                                               |

### Steps to deploy your own copy

1. **Vercel:** import the GitHub repository as a new project. Add the environment variables below for Production, with `BETTER_AUTH_URL` set to the project's address (`https://<name>.vercel.app`, no slash at the end), and deploy.
2. **Database:** run `npm run db:migrate` and `npm run db:seed` from your machine against the same Supabase project.
3. **Reminder job:** in the Supabase SQL editor, run:

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select vault.create_secret('<your CRON_SECRET>', 'nivasa_cron_secret');
   select cron.schedule('nivasa-reminders', '* * * * *', $$
     select net.http_post(
       url := 'https://<your-app>.vercel.app/api/jobs/reminders',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nivasa_cron_secret'),
         'Content-Type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000);
   $$);
   ```

   After two minutes, `select status_code, content::text from net._http_response order by created desc limit 5;` should show `200` and `"ok":true`.

4. **Keep-alive:** in the GitHub repository, add the Actions secrets `SITE_URL` (the app's address) and `CRON_SECRET`, then run the **Keep alive** workflow once from the Actions tab.

## Environment variables

Names only. The server checks all of them when it starts and refuses to start if one is missing or too short.

| Name                                   | Used for                                                                       | Needed in             |
| -------------------------------------- | ------------------------------------------------------------------------------ | --------------------- |
| `DATABASE_URL`                         | The app's database connection (Supabase transaction pooler, port 6543)         | App                   |
| `DIRECT_URL`                           | Migrations and seeding (session pooler, port 5432)                             | Local only            |
| `TEST_DATABASE_URL`                    | Integration tests and the assistant check, on a separate project               | Local / CI only       |
| `NEXT_PUBLIC_SUPABASE_URL`             | The Supabase project address                                                   | App                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key                                                       | App                   |
| `SUPABASE_SECRET_KEY`                  | Supabase secret key (server only)                                              | App                   |
| `BETTER_AUTH_SECRET`                   | Signs sessions and demo codes; 32 characters or more                           | App                   |
| `BETTER_AUTH_URL`                      | The app's public address, used for sign-in and the links in visit passes       | App                   |
| `GOOGLE_GENERATIVE_AI_API_KEY`         | Gemini API key                                                                 | App                   |
| `AI_MODEL`                             | The main model (`gemini-3.5-flash-lite`)                                       | App                   |
| `AI_FALLBACK_MODEL`                    | Used when the main model fails or is rate-limited (`gemini-3.1-flash-lite`)    | App                   |
| `CRON_SECRET`                          | Protects the reminder job; 16 characters or more                               | App, Supabase, GitHub |
| `INTAKE_SECRET`                        | Shared with lead sources that post to `/api/intake/...`; 16 characters or more | App                   |
| `DEMO_MODE`                            | `true` shows sign-in codes on screen and turns on the demo console             | App                   |

GitHub Actions secrets: `SITE_URL` and `CRON_SECRET` for the keep-alive, and optionally `TEST_DATABASE_URL` so CI also runs the integration tests.

## Lead sources

Property portals, social ad platforms and the website form post leads to:

```
POST /api/intake/property-portal
POST /api/intake/social-ad
POST /api/intake/website
Authorization: Bearer <INTAKE_SECRET>
Content-Type: application/json

{ "name": "Nidhi Shah", "phone": "+91 70000 58211", "project": "project-2",
  "bhk": "2BHK", "budget_lakh": 70, "language": "gu", "consent": true }
```

`consent` is required: a lead without it is stored but never messaged automatically. Calls to the hoarding number are logged by staff with **Log a call** on the leads page. In the demo, the staff demo console sends these same requests for you.
