# Outreach.ai

Job-outreach automation. Ingest a job (URL, pasted text, uploaded document, or a
multi-source "radar" scan), build a job-matched CV, find hiring contacts, write a
personalised email, and send it — with scheduling, follow-ups, and a state machine
tracking every application.

## Architecture

| Service | Stack | Port | Role |
|---|---|---|---|
| `client` | Next.js 15 (App Router) | 3000 | Web UI |
| `server` | Node 20, Express 5, Mongoose | 5000 | API, pipeline orchestration, email, scraping |
| `optimizer` | Python 3.11, FastAPI, SQLite | 8002 | Turns a JD + resume into a structured JSON resume |
| `extension` | Chrome MV3 | – | 1-click outreach from a LinkedIn job page |

MongoDB (Atlas or self-hosted) is the primary datastore. OpenAI powers email
writing, job extraction, ATS scoring and CV generation.

### Request flow for a full application

```
ingest (URL / text / document / radar)
  └─ scrape + classify ............... server/services/scrape.js
     └─ JobApplication created ....... status: ready
        └─ user clicks Apply Now ..... status: applying
           └─ user approves .......... status: approved   ← the gate
              └─ pipeline ............ server/services/pipeline.js
                 ├─ generate_cv ...... optimizer → JSON → Puppeteer PDF
                 ├─ find_contacts .... Hunter.io + emails in the post
                 ├─ generate_email ... OpenAI, links appended in code
                 └─ send_email ....... paused for review unless autoSend
```

Status changes go through the FSM in `server/services/applicationFsm.js`, so a
stale client cannot push an application backwards or skip the approval gate.

## Getting started

### 1. Configure

```bash
cp .env.example .env
```

Fill in at minimum `MONGODB_URL`, `JWT_SECRET`, `SESSION_SECRET` (the server
refuses to boot without them) and `OPENAI_API_KEY`. Generate secrets with:

```bash
openssl rand -hex 32
```

### 2. Run with Docker (recommended)

```bash
docker compose up --build          # development, with hot reload
docker compose -f docker-compose.prod.yml up -d --build   # production build
```

Client on http://localhost:3000, API on http://localhost:5000. The optimizer is
internal (reachable as `http://optimizer:8002`).

### 3. Run locally without Docker

```bash
npm run install:all
cd ResumeOptimiser/backend && pip install -r requirements.txt && cd ../..
npm run dev        # starts server, client and optimizer together
```

## Configuration

Every variable is documented in [.env.example](.env.example). The ones worth
knowing about:

- **`OPENAI_MODEL_FAST` / `OPENAI_MODEL_QUALITY`** — model tiers. The fast tier
  handles high-volume extraction and classification; the quality tier writes the
  emails and CVs a human actually reads.
- **`CORS_ORIGINS`** — comma-separated allowlist. Requests from anywhere else are
  refused.
- **`NEXT_PUBLIC_API_URL`** — inlined into the client bundle *at build time*, so it
  must be set when the image is built, not just when it runs.
- **`ENABLE_REPLY_TRACKING`** — IMAP reply scanning, off by default.
- **`FOLLOW_UP_CRON` / `SCHEDULED_SEND_CRON`** — see "Scaling" below.

## Email sending

By default all outreach goes through one shared mailbox (`GMAIL_USER`). That caps
you at Gmail's ~500/day, means SPF/DKIM will not align with the sender's own
domain, and lands replies in the app owner's inbox.

Users can instead connect their own Google account at
`/api/auth/google/connect-gmail`, after which their outreach sends from their own
mailbox. The shared mailbox remains the fallback for anyone who has not.

## Testing

```bash
cd server && npm test      # unit tests: FSM, email composition, mailer, PDF
                           # extraction, auth middleware, cron claim
cd client && npm run lint && npm run build
```

## Scaling

The server is safe to run as multiple replicas with one caveat:

- Pipelines and radar scans take a Mongo-backed lock (`server/services/lock.js`),
  so two replicas cannot run the same one.
- The follow-up and scheduled-send crons claim each row atomically
  (`server/services/jobClaim.js`) before acting, so no email is sent twice.
- **However**, every replica still *runs* both cron schedules. That is correct but
  wasteful. For more than a couple of replicas, run the crons on a single
  dedicated instance and set `FOLLOW_UP_CRON` / `SCHEDULED_SEND_CRON` to an empty
  value elsewhere.

Long work (CV rendering, council scraping, radar scans) runs as detached promises
inside the API process. That is the main remaining architectural limit: a proper
job queue would give per-job retries and let workers scale separately from the API.

## Known limitations

- **Scraping connectors** for Indeed, Glassdoor, Google Jobs and Wellfound are
  best-effort and sit behind anti-bot protection. They fail soft (returning no
  results) rather than breaking a scan. Adzuna and JSearch are official APIs and
  are the reliable sources.
- **Hunter.io free tier** allows 25 lookups/month, which is the practical ceiling
  on contact discovery.
- **The Chrome extension** defaults to `http://localhost:3000`. Point it at a
  deployment by setting `appUrl` in extension storage, and update
  `host_permissions` in `extension/manifest.json` to match your domain.

## CI/CD

[Jenkinsfile](Jenkinsfile) runs tests and the client build in parallel, builds the
production images, deploys with compose, and polls `/api/health` — failing the
build if the API never becomes healthy.

Add your `.env` as a Jenkins **Secret file** credential with the ID `my-env-file`.
