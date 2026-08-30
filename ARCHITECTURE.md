# Architecture

How a job becomes a sent email, and where the work actually runs.

## Services

| Service | Stack | Port | Role |
|---|---|---|---|
| `client` | Next.js 15 (App Router) | 3000 | Web UI |
| `server` | Node 20, Express 5, Mongoose | 5000 | API, pipeline orchestration, email, scraping |
| `optimizer` | Python 3.11, FastAPI, SQLite | 8002 | Turns a JD + resume into a structured JSON resume |
| `extension` | Chrome MV3 | – | 1-click outreach from a LinkedIn job page |

MongoDB is the primary datastore. The optimizer is internal — reachable only as
`http://optimizer:8002` from the server.

---

## Request flow: ingestion to send

```mermaid
flowchart TD
    subgraph ingest["Ingest — all paths funnel through upsertApplication()"]
        U1["Job URL"]
        U2["Pasted text"]
        U3["Uploaded document<br/>PDF / DOCX / TXT / CSV"]
        U4["Board search / Job Radar"]
    end

    U1 --> ING["POST /api/job-sources/ingest<br/>routes/jobSources.js:76"]
    U2 --> ING
    U3 --> ING
    U4 --> FS["POST /from-search<br/>POST /api/job-radar/jobs/:id/to-pipeline"]

    ING --> SCRAPE["scrape + classify<br/>services/scrape.js"]
    SCRAPE --> UPSERT
    FS --> UPSERT["upsertApplication()<br/>routes/jobSources.js:40"]

    UPSERT --> READY["JobApplication created<br/><b>status: ready</b>"]

    READY -->|"user clicks Apply Now"| APPLYING["<b>status: applying</b><br/>POST /:id/apply-clicked"]
    APPLYING -->|"user denies"| DENIED["<b>status: denied</b><br/>terminal"]
    APPLYING -->|"user confirms they applied"| APPROVED["<b>status: approved</b><br/>◆ THE HUMAN GATE ◆"]

    APPROVED --> DETACH{{"runPipeline(app._id)<br/>routes/applications.js:63<br/><b>detached — not awaited</b>"}}
    DETACH -.->|"HTTP 200 returns immediately"| POLL["UI polls GET /api/applications/:id"]

    DETACH ==> LOCK["acquire Mongo lock<br/>services/lock.js — 30 min TTL"]
    LOCK ==> S1["1 · generate_cv<br/>optimizer → JSON → Puppeteer PDF"]
    S1 ==> S2["2 · find_contacts<br/>post-text emails + Hunter.io"]
    S2 ==> S3["3 · generate_email<br/>OpenAI; links appended in code"]
    S3 ==> GATE{"app.autoSend?"}

    GATE -->|"false — default"| DRAFTED["<b>status: email_drafted</b><br/>paused for Review &amp; Send"]
    DRAFTED -->|"POST /:id/send → sendDraft()"| S4
    GATE -->|"true"| S4["4 · send_email<br/>services/mailer.js"]

    S4 ==> SENT["<b>status: emailed</b> — terminal<br/>+ mirrored JobRequest<br/>+ AppliedJob (radar dedupe)"]

    S1 -.->|"failure"| FAIL["StepError → status: *_failed<br/>POST /:id/retry → retryFrom()"]
    S2 -.-> FAIL
    S3 -.-> FAIL
    S4 -.-> FAIL
    FAIL -.->|"resets this step and all after it"| LOCK

    style APPROVED fill:#1e40af,color:#fff
    style DETACH fill:#b45309,color:#fff
    style SENT fill:#15803d,color:#fff
    style DENIED fill:#6b7280,color:#fff
    style FAIL fill:#b91c1c,color:#fff
```

---

## Stage notes

**Ingest.** Four entry paths, one creation funnel (`upsertApplication`,
`routes/jobSources.js:40`). Links found inside pasted text or an uploaded document are
themselves scraped as jobs; text with no links becomes a job on its own. Re-ingesting a job
the user has already acted on will not clobber it (`jobSources.js:62`).

**The human gate.** `ready → applying → approved`. The pipeline cannot start, and no email
can be sent, without passing through `approved`. The FSM (`services/applicationFsm.js:7`)
enforces this — a stale client cannot skip the gate or push an application backwards.

**Detached execution — the current architectural limit.** `routes/applications.js:63` calls
`runPipeline(app._id)` **without awaiting it**. The HTTP response returns immediately and
the UI polls `GET /api/applications/:id` for progress.

> This means a crash or a deploy mid-run **orphans the work**. There is no queue, so no
> automatic retry and no separate worker scaling. On the next boot,
> `sweepInterruptedSteps()` (`server.js:131`, defined in `applicationFsm.js:92`) finds steps
> left `running` by a process that no longer exists and marks them errored, so the UI offers
> a retry instead of spinning forever. That is damage control, not recovery — the user must
> click retry.
>
> The fix is a real job queue (BullMQ + Redis), with each `STEP_ORDER` entry becoming a job
> with its own retry policy. `pipeline.js` is already shaped for this: discrete steps,
> persisted state, and `retryFrom` for partial re-runs.

**Concurrency.** `services/lock.js` gives cross-replica mutual exclusion so two replicas
cannot run the same pipeline or radar scan. The in-process `localRuns` map additionally lets
a second call join an in-flight run rather than starting a competing one.

**Background jobs.** All three are cron-driven and safe under replication because they claim
each row atomically via `claimDueJobs` (`services/jobClaim.js`):

| Service | Schedule | Purpose |
|---|---|---|
| `initReminderService` (`services/reminderService.js:15`) | `FOLLOW_UP_CRON`, hourly | Sends AI-written follow-ups on unanswered outreach |
| `initScheduledSendService` (`routes/jobs.js:235`) | `SCHEDULED_SEND_CRON`, every minute | Sends emails queued for a future time |
| `initReplyTrackingService` (`services/replyTrackingService.js`) | IMAP poll | Classifies replies (interview / info / rejection / other). **Off unless `ENABLE_REPLY_TRACKING=true`** |

Every replica *runs* both cron schedules; the atomic claim makes that correct but wasteful.
Past a couple of replicas, run crons on one dedicated instance and set the cron env vars
empty elsewhere.

**LLM boundary.** Every model call goes through `services/llm.js`, which centralises retries,
the retryable-vs-permanent error taxonomy, and JSON-Schema structured output. Twelve call
sites, all single-shot — there are no agent loops or tool-calling flows today.
