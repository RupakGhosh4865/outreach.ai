# Outreach.ai

Job-outreach automation. Ingest a job posting → generate a job-matched CV → find hiring
contacts → write a personalised email → send it, with scheduling, follow-ups, and reply
tracking. A finite state machine tracks every application end to end.

**Stack:** Next.js 15 / React 19 client · Node 20 / Express 5 / Mongoose server · Python
FastAPI resume optimizer · Chrome MV3 extension. Roughly 16k LOC. MongoDB is the primary
datastore; OpenAI powers extraction, scoring, email writing and CV generation.

---

## Repo map

| Path | Contents |
|---|---|
| `client/` | Next.js 15 App Router UI (port 3000). Routes are directories under `client/app/`. |
| `client/app/` | Pages: `page.js` (dashboard), `outreach/`, `history/`, `profile/`, `pricing/`, `login/`, `auth-callback/`. |
| `client/app/components/` | 12 shared components plus `ui/` — the primitive set (`Card`, `Badge`, `Toast`, …) exported from `ui/index.js`. |
| `client/lib/api.js` | The single API client. Every server call goes through it. |
| `client/hooks/` | **Empty.** The directory exists but contains no files. |
| `server/` | Express API (port 5000). Entry point `server.js`. |
| `server/routes/` | 7 routers, mounted in `server.js:147-153`. |
| `server/services/` | 17 service modules plus `jobSources/` (9 job-board connectors). |
| `server/models/` | 10 Mongoose models. |
| `server/middleware/auth.js` | Authentication and ownership. The only auth surface. |
| `server/config/` | `env.js` (boot-time validation), `passport.js` (Google/LinkedIn OAuth). |
| `server/tests/` | 11 `node:test` files plus `fixtures/`. |
| `server/templates/`, `server/data/` | LaTeX/HTML CV templates; the UK councils dataset. |
| `server/uploads/`, `server/tmp/` | Runtime artefacts (resumes, generated CVs). Gitignored. |
| `ResumeOptimiser/backend/` | Python FastAPI service (port 8002, internal). `main.py`, `layout.py`. |
| `ResumeOptimiser/frontend/` | A legacy standalone Vite app. **Not wired into the main product** — only `backend/` is used. |
| `extension/` | Chrome MV3 extension: 1-click outreach from a LinkedIn job page. |
| `scripts/` | One utility, `test-limits.js`. |

---

## The pipeline

`services/pipeline.js` is the heart of the product. Everything after the user's approval
runs here.

### Steps

`STEP_ORDER` (`pipeline.js:285`) is mirrored by `PIPELINE_STEPS`
(`models/JobApplication.js:20`), which seeds each application's `steps[]` array so the UI
can render progress before anything has run.

```js
['generate_cv', 'find_contacts', 'generate_email', 'send_email']
```

| Step | Consumes | Produces (persisted via `finishStep` patch) |
|---|---|---|
| `generate_cv` | `jobDescription`, `profile` | `cv.{pdfPath, candidateName, coverPdfPath, coverText, content, matchScore, atsTips, addedKeywords, matchedKeywords, missingKeywords}` |
| `find_contacts` | `companyName`, `jobDescription`, plan limit | `contacts[]`, `companyDomain` |
| `generate_email` | `profile`, resume text, `contacts[0]`, job fields | `email.{subject, body, to}` |
| `send_email` | `contacts`, `email`, attachments | `email.{to, attachmentStatus, sentAt, errors}` + a mirrored `JobRequest` + `AppliedJob` |

### Control flow

- **State lives in Mongo, not memory.** Every step writes through `startStep` / `finishStep`
  / `transition` so a restart can always tell what happened.
- **`send_email` only runs when `app.autoSend` is true** (`pipeline.js:302`). Otherwise the
  run stops at `email_drafted` and waits for the user's Review & Send, which calls
  `sendDraft` (`pipeline.js:357`).
- **`runPipeline` is double-guarded** (`pipeline.js:319-334`): an in-process `localRuns` Map
  means a double-click joins the in-flight promise rather than starting a second run, and a
  Mongo lock (30-minute TTL) means another replica is refused outright.
- **`retryFrom`** (`pipeline.js:340`) resets the named step and everything after it via
  `resetStepsFrom`, rewinds `status` so the FSM permits the re-run, then re-enters
  `runPipeline` with `fromStep`.
- **`StepError`** (`pipeline.js:41`) carries a `step` field, so a failure reports *where* it
  broke rather than just that it broke.

### Ingest

All four ingest paths funnel through one function: `upsertApplication`
(`routes/jobSources.js:40`), which creates the application at status `ready`.

| Path | Entry point | `source` |
|---|---|---|
| Job URL | `POST /api/job-sources/ingest` | `user-link` |
| Pasted text | `POST /api/job-sources/ingest` | `manual` |
| Uploaded document | `POST /api/job-sources/ingest` (PDF/DOCX/TXT/CSV, ≤5 MB) | `document` |
| Board search / radar | `POST /api/job-sources/from-search`, `POST /api/job-radar/jobs/:id/to-pipeline` | `uk-search` |

Re-ingesting a job the user has already acted on does **not** clobber it
(`jobSources.js:62`), and the original `applyStartedAt` is preserved so the apply-duration
clock does not restart.

---

## Conventions

Follow these. They are all load-bearing — most encode a bug that was fixed once already.

### Services
ESM named exports, one responsibility per file, `import 'dotenv/config'` at the top of any
module that reads env. See `services/lock.js`, `services/contacts.js`.

### Routes
`express.Router()`; `router.use(requireAuth)` at the top when every route is protected
(`routes/applications.js:12`). Wrap handlers in a local `handle(fn)` helper that maps
`err.status` onto the response and only `console.error`s on a 500
(`routes/applications.js:14-22`).

### Errors
Throw typed errors carrying a `status`: `HttpError` (`middleware/auth.js:15`),
`IllegalTransitionError` (`services/applicationFsm.js:24`). Messages tell the user what to
do next, not what broke internally. The global handler (`server.js:170`) hides 500 detail in
production.

### Auth and ownership
Identity comes from the signed JWT and **nowhere else** — never `req.body.userEmail` or
`req.query.userEmail`. Use `currentEmail(req)`, `assertOwnership`, `loadOwnedApplication`,
`loadOwnedDiscoveredJob`.

**Ownership failures return 404, not 403** (`middleware/auth.js:70-76`). A 403 confirms the
id exists, which leaks the existence of other users' records to anyone probing ids.

### The FSM
Every status change goes through `transition()`. `ALLOWED` (`services/applicationFsm.js:7`)
is the complete state graph — read it before adding a status. `approved` is the human gate:
nothing sends without passing through it.

### Concurrency
- `services/lock.js` — mutual exclusion across replicas. `acquireLock` / `releaseLock` /
  `withLock`, TTL-reclaimable so a dead process cannot hold a lock forever.
- `services/jobClaim.js` — `claimDueJobs` claims each row with a single `findOneAndUpdate`,
  so two replicas running the same cron never send the same email twice.

### LLM calls
**All** LLM calls go through `services/llm.js` (`chatJson` / `chatText`). Never import the
OpenAI SDK directly. It provides uniform retries with backoff, a retryable-vs-permanent
error taxonomy (quota exhaustion is *not* retried), structured output via JSON Schema with
a graceful fallback to `json_object`, and user-actionable error messages.

Use `MODELS.fast` for high-volume extraction/classification and `MODELS.quality` for prose a
human reads. Both are env-overridable.

### Comment style
Block comments explain **why**, and usually name the bug the code prevents — see
`services/jobClaim.js:1-11` or `middleware/auth.js:6-13`. Match this. Do not add comments
that restate what the code plainly does.

### Config
`config/env.js` splits **required** (server exits if missing or weak) from **recommended**
(logs a warning; the feature degrades). Weak or short secrets fail the boot in production.

---

## Commands

```bash
npm run install:all          # root + server + client
npm run dev                  # server + client + optimizer together (concurrently)

cd server && npm run dev     # nodemon server.js
cd server && npm start       # node server.js
cd server && npm test        # node --test tests/

cd client && npm run dev     # next dev -p 3000
cd client && npm run build   # next build --turbopack
cd client && npm run lint    # eslint

docker compose up --build                                 # development
docker compose -f docker-compose.prod.yml up -d --build    # production
```

Ports: client `3000`, server `5000`, optimizer `8002` (internal only).
Health check: `GET /api/health` — returns 503 when Mongo is disconnected.

---

## Constraints

- **Prefer editing existing files** over creating new ones.
- **Match the existing error-handling and comment style exactly.**
- **Never introduce a new dependency without flagging it first.**
- **Never modify `.env` or commit secrets.** `.env` is gitignored and must stay that way.
- **The existing single-shot LLM prompts in `services/` are working and tested** — there are
  12 call sites across `emailComposer`, `jobRadar`, `scrape`, `councils`, `reminderService`,
  `replyTrackingService`, `routes/jobs.js` and `routes/jobSearch.js`. Do not refactor them
  unless a task explicitly says to.
- **Do not modify `services/pipeline.js`, `applicationFsm.js`, `lock.js` or `jobClaim.js`**
  without an explicit instruction. They encode concurrency and state-machine correctness
  that is not obvious from reading them, and a "simplification" there causes duplicate
  emails or lost work.
- **Do not weaken the auth model.** No route may trust a client-supplied identity.
