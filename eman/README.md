# EMAN

**AI • Education • Knowledge • Creativity**

EMAN is an AI-powered education platform: an AI chat assistant, AI study tools, a book library, education resources, a media gallery, user accounts, and an admin panel.

> **Build status:** Phases 1–6 working and tested: public website, accounts, dashboard, full AI chat, study tools, and admin AI settings. See [Roadmap](#roadmap).

## ⚡ Quick start (Windows — no typing needed)

1. Install **Node.js LTS** (version 22 or newer) from https://nodejs.org
2. Unzip EMAN, open the folder, and **double-click `START-EMAN.bat`**.
3. Your browser opens **http://localhost:3000**. Click **Get started** and create your account — **the first account becomes the administrator**.
4. You land on **Admin → AI Settings**: choose your provider, paste your API key, press **Test connection**, pick models, press **Save & activate**.
5. Open **Ask Eman** and start chatting. Change the key any time on the same page.

macOS / Linux: run `./start.sh` instead.

---

## 1. Project overview

| Area | What it does |
|---|---|
| Public site | Home, About, AI, Education, Books, Gallery, Features, Contact, legal pages |
| AI chat | Streaming answers, history, rename/pin/favorite/delete, file & image upload, stop/retry/regenerate |
| AI study tools | Explain topic, summarizer, quiz generator, flashcards, study plan, code explainer, writing help, translation |
| Library & education | Books with covers/PDFs, subjects with notes, guides and quizzes |
| Gallery | Image grid, categories, lightbox, favorites, admin uploads |
| Accounts | Register, login, email verification, password reset, profile, settings, theme |
| Admin | Users, content, **AI provider & API key**, system prompt, limits, branding, analytics, audit log |

### Changing the AI API key (no code, no redeploy)

Admins go to **Admin → AI Settings**, pick a provider (Anthropic Claude, OpenAI, Google Gemini, or any OpenAI-compatible service), paste the API key, choose models for **Fast / Balanced / Advanced**, and press **Test connection**. Keys can be replaced at any time. Keys are:

- encrypted in the database with AES-256-GCM (`ENCRYPTION_KEY`),
- never sent to the browser (only the last 4 characters are shown),
- never written to logs.

If the admin enables it, users can also add **their own key** in Settings; it's stored the same way and used only for that user.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node.js 22** | One language front to back; runs on any host |
| Server | Dependency-free HTTP server (`server/`) in TypeScript | Small attack surface, no framework lock-in, fast |
| Frontend | **React 19** single-page app, bundled with **esbuild** | Code-split per page, fast builds |
| Styling | Hand-written design system with CSS variables | Light/dark themes, no runtime CSS cost |
| Database | **SQLite** (built into Node 22 via `node:sqlite`), WAL mode, FTS5 search | Zero setup, reliable, very fast for a single server. Schema is Postgres-portable. |
| Images | **sharp** | Resize & convert uploads to WebP |
| AI | Provider abstraction (`server/ai/`) | Anthropic, OpenAI, Gemini, OpenAI-compatible — switch from the admin panel |
| Tests | Node's built-in test runner | No extra tooling |

**Why not Next.js + PostgreSQL?** The spec allowed choosing a better-supported stack for the build environment. This stack could be fully built *and tested* end to end, needs only four runtime packages, and deploys to any Node host. SQLite handles thousands of users on one server. If EMAN outgrows one server, the schema in `server/db/migrations` maps directly onto PostgreSQL.

---

## 3. Installation

Requirements: **Node.js 22.13 or newer** (`node -v`).

```bash
npm install
cp .env.example .env
# Generate two secrets and paste them into .env as AUTH_SECRET and ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Environment variables

See [`.env.example`](.env.example) — every variable is documented there.

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | yes (prod) | 32+ random characters |
| `ENCRYPTION_KEY` | yes (prod) | exactly 64 hex characters; encrypts saved AI keys |
| `APP_URL` | yes (prod) | e.g. `https://eman.example.com` |
| `DATABASE_PATH` | no | default `./data/eman.db` |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | no | optional fallback; the admin panel is the normal way to set AI |
| `STORAGE_*` | no | `local` (default) or any S3-compatible bucket |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | for real emails; otherwise links print to the server log |
| `TRUST_PROXY=1` | no | set when running behind a reverse proxy/load balancer |

## 5. Database setup

Nothing to install. The database file is created and migrated automatically on first start. To run migrations manually:

```bash
npm run db:migrate
```

Back up by copying `data/eman.db` (or use `sqlite3 data/eman.db ".backup backup.db"` while running).

## 6. AI setup

1. Get an API key from your provider (Anthropic Console, OpenAI Platform, Google AI Studio, Groq, OpenRouter…).
2. Sign in as admin → **Admin → AI Settings** → add provider → paste key → **Test connection** → choose models → **Activate**.
3. Edit Eman's personality in **Admin → AI Settings → System prompt**.

Model names are fetched live from your provider — nothing is hard-coded.

## 7. Development

```bash
npm run dev        # rebuilds client on change, restarts server on change → http://localhost:3000
npm test           # run the test suite
npm run typecheck  # TypeScript check for the server
```

## 8. Production build

```bash
npm run build      # outputs dist/
npm start          # serves dist/ on $PORT
```

## 9. Deployment

Any host that runs Node 22 and keeps a persistent disk works: a VPS (DigitalOcean, Hetzner, Lightsail), Render, Railway, Fly.io.

- Mount a **persistent volume** at `./data` (database + local uploads), or use S3 storage for uploads.
- Set `NODE_ENV=production` and all required variables.
- Put it behind HTTPS (the platform usually does this; on a VPS use Caddy or Nginx) and set `TRUST_PROXY=1`.
- Health check URL: `/api/health`.

Serverless platforms (Vercel, Netlify functions) are **not** suitable because the database is a file on disk.

## 10. Admin setup

The **first account registered** on a new installation automatically becomes the administrator.
To make another existing account an admin:

```bash
npm run admin:create -- someone@example.com
```

## 11. Security

- Passwords hashed with **scrypt** (salted, constant-time compare). Plain text is never stored.
- Sessions: random tokens in `HttpOnly; Secure; SameSite=Lax` cookies; only a SHA-256 hash is stored server-side.
- CSRF tokens on every state-changing request; strict Content-Security-Policy; `X-Frame-Options: DENY`; HSTS in production.
- All SQL uses bound parameters. All input validated server-side. Output rendered by React (escaped) and sanitized Markdown.
- Uploads validated by **file signature**, not extension; images re-encoded; size limits enforced on the server.
- Rate limits on login, registration, password reset and AI requests. Admin actions are audit-logged.
- AI keys encrypted at rest and never exposed to the browser.

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| `Missing required environment variable AUTH_SECRET` | Fill in `.env` (see step 3) |
| `ENCRYPTION_KEY must be 64 hex characters` | Generate with the command in step 3 |
| "Client not built. Run: npm run build" | Run `npm run build` before `npm start` |
| `node:sqlite` not found | Upgrade to Node 22.13+ |
| "Eman AI has not been set up yet" | Add a provider in Admin → AI Settings |
| "The AI connection needs attention" | The API key is invalid or revoked — replace it in Admin → AI Settings |
| Saved AI keys stopped working after changing `ENCRYPTION_KEY` | Re-enter the keys in Admin → AI Settings |

---

## Project structure

```
client/                 React app
  components/ui/        Design-system components (Button, Form, Modal, Menu, Tabs, Icon, Logo…)
  components/layout/    Header, footer, navigation
  pages/                One file per page (code-split)
  lib/                  Router, theme, API client
  styles/               tokens.css, base.css, components.css, layout.css
server/
  ai/                   AIProvider interface, errors, providers/ (anthropic, openai, gemini)
  config/               Environment config
  db/                   Database access + migrations/
  lib/                  Router, HTTP helpers, crypto, static files, logger
  middleware/           Security headers, auth, CSRF, rate limits
  routes/ controllers/ services/
public/                 Logo, icons, manifest
scripts/                Build and admin scripts
tests/                  Test suite
```

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, design system, logo, database schema, AI provider layer | ✅ Done |
| 2 | Homepage & public pages (Home, About, AI, Features, Education, Books, Gallery, Contact, legal, 404) | ✅ Done |
| 3 | Authentication (register, login, remember me, forgot/reset, verify email, sessions, CSRF, rate limits) | ✅ Done |
| 4 | Dashboard, profile, settings, theme sync, personal AI key, notifications | ✅ Done |
| 5 | AI chat (streaming, stop, retry, regenerate, copy, markdown/code, files & images, history, search, pin, favourite) + 8 study tools | ✅ Done |
| 6 | Cloud AI integration & Admin → AI Settings (paste/test/change keys, live model list, system prompt, limits, usage) | ✅ Done |
| 7 | Books & education content management, reading page, bookmarks | ⏳ |
| 8 | Gallery uploads & management, lightbox, favourites | ⏳ (viewing done) |
| 9 | Global search, favourites everywhere | ⏳ (notifications done) |
| 10 | Full admin panel (users, content, branding, announcements) | ⏳ (overview, contact inbox, AI done) |
| 11 | Security & performance hardening | ⏳ |
| 12 | Testing | ⏳ |
| 13 | Production deployment | ⏳ |
