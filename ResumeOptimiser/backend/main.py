import os
import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

import sqlite3
from datetime import datetime

from layout import derive_layout, editable_view, apply_rewrite, layout_to_text

load_dotenv()

app = FastAPI(title="AI Resume Optimizer API")

# ── LLM ──────────────────────────────────────────────────────────────────────
# Model tiers are env-overridable so they can be upgraded without a code change.
OPENAI_MODEL = os.environ.get("OPENAI_MODEL_QUALITY", "gpt-4o")


def _openai_client():
    """Build the client, failing with a message that says what to do about it."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set in .env")
    from openai import OpenAI
    return OpenAI(api_key=api_key, timeout=120.0, max_retries=2)


def _strip_fences(content: str) -> str:
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    return content.strip()


def complete_json(system_prompt: str, user_message: str, max_tokens: int = 8000,
                  temperature: float = 0.1) -> dict:
    """
    One JSON completion, with the parse and the error handling in a single place
    rather than repeated at every call site.
    """
    client = _openai_client()
    content = ""
    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        return json.loads(_strip_fences(content))
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"LLM returned invalid JSON. Raw output: {content[:500]}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM processing failed: {str(e)}")

# Database Setup. Overridable so the container can point it at a mounted volume
# — a relative path inside the image is lost on every redeploy.
DB_PATH = os.environ.get("DB_PATH", "resume_history.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME,
            user_email TEXT,
            job_description TEXT,
            match_score_genai INTEGER,
            match_score_backend INTEGER,
            data_json TEXT
        )
    ''')
    # History predates per-user scoping; add the column in place for existing DBs.
    if "user_email" not in {row[1] for row in cursor.execute("PRAGMA table_info(history)")}:
        cursor.execute("ALTER TABLE history ADD COLUMN user_email TEXT")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_user ON history (user_email, timestamp DESC)")
    # Defaults are per (user, variant). The original schema keyed only on variant,
    # which meant every user shared one row and overwrote each other's resumes.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS defaults (
            user_email TEXT NOT NULL,
            variant TEXT NOT NULL,
            filename TEXT,
            text_content TEXT,
            PRIMARY KEY (user_email, variant)
        )
    ''')
    # Layout map derived from the user's own resume PDF. Tailoring rewrites text
    # inside this structure instead of generating a fresh document, which is what
    # keeps the optimized CV looking like the one the user uploaded.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS templates (
            user_email TEXT NOT NULL,
            variant TEXT NOT NULL,
            layout_json TEXT,
            derived_at DATETIME,
            PRIMARY KEY (user_email, variant)
        )
    ''')
    conn.commit()
    conn.close()
    _migrate_defaults_to_per_user()


def _migrate_defaults_to_per_user():
    """
    Move any rows from the old single-tenant `defaults` table (PK `id`) aside.

    The old rows cannot be attributed to a user, and guessing would hand one
    person's resume to another — exactly the bug this migration exists to close.
    They are preserved in `defaults_orphaned` for manual recovery and dropped from
    the live table.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        columns = {row[1] for row in cursor.execute("PRAGMA table_info(defaults)")}
        if "id" not in columns:
            return  # already migrated

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS defaults_orphaned (
                id TEXT, filename TEXT, text_content TEXT, archived_at TEXT
            )
        ''')
        cursor.execute(
            "INSERT INTO defaults_orphaned (id, filename, text_content, archived_at)"
            " SELECT id, filename, text_content, ? FROM defaults",
            (datetime.now().isoformat(),),
        )
        cursor.execute("DROP TABLE defaults")
        cursor.execute('''
            CREATE TABLE defaults (
                user_email TEXT NOT NULL,
                variant TEXT NOT NULL,
                filename TEXT,
                text_content TEXT,
                PRIMARY KEY (user_email, variant)
            )
        ''')
        conn.commit()
        print("[Migration] Archived unattributed default resumes to defaults_orphaned.")
    except Exception as e:
        print(f"[Migration] defaults migration skipped: {e}")
    finally:
        conn.close()

init_db()

# Resume slots, in the order tailoring prefers them. "main" is the resume every
# user actually fills in; it was previously excluded, so an account with only a
# main resume had no layout template and every tailor request 404'd into the
# generic builder.
SLOT_VARIANTS = ("main", "genai", "backend")

# `IN (?, ?, ?)` built from the slot list so adding a slot can't leave a query
# silently filtering on a stale set.
def _slot_placeholders() -> str:
    return ", ".join("?" for _ in SLOT_VARIANTS)


@app.post("/api/save-defaults")
async def save_defaults(
    user_email: str = Form(...),
    resume_main: UploadFile = File(None),
    resume_genai: UploadFile = File(None),
    resume_backend: UploadFile = File(None)
):
    """Store this user's default resumes. `user_email` scopes them to one account."""
    if not user_email.strip():
        raise HTTPException(status_code=400, detail="user_email is required.")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        derived = {}
        for variant, upload in (("main", resume_main), ("genai", resume_genai), ("backend", resume_backend)):
            if not upload:
                continue
            raw = await upload.read()
            content = extract_text_from_pdf(raw)
            cursor.execute(
                "INSERT OR REPLACE INTO defaults (user_email, variant, filename, text_content)"
                " VALUES (?, ?, ?, ?)",
                (user_email, variant, upload.filename, content),
            )

            # Capture this resume's own layout so tailoring can rewrite text
            # inside it rather than generating a new document. Derived here, on
            # the bytes we already have, so the template can never drift out of
            # sync with the stored resume. A failure is non-fatal: tailoring
            # falls back to the legacy structured-JSON path.
            try:
                layout = derive_layout(raw)
                cursor.execute(
                    "INSERT OR REPLACE INTO templates (user_email, variant, layout_json, derived_at)"
                    " VALUES (?, ?, ?, ?)",
                    (user_email, variant, json.dumps(layout), datetime.now().isoformat()),
                )
                derived[variant] = {
                    "sections": len(layout["sections"]),
                    "pages": layout["page_count"],
                }
            except Exception as layout_err:
                print(f"[Layout] Could not derive template for {user_email}/{variant}: {layout_err}")
                cursor.execute(
                    "DELETE FROM templates WHERE user_email = ? AND variant = ?", (user_email, variant)
                )

        conn.commit()
        conn.close()
        return {"status": "success", "templates": derived}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/clear-default")
async def clear_default(user_email: str, variant: str):
    """Forget one saved resume. Called when the user deletes that slot in their
    profile — without this the optimizer would keep tailoring CVs from a resume
    the user has already removed."""
    if variant not in SLOT_VARIANTS:
        raise HTTPException(status_code=400, detail=f"variant must be one of {', '.join(SLOT_VARIANTS)}.")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM defaults WHERE user_email = ? AND variant = ?", (user_email, variant))
        cursor.execute("DELETE FROM templates WHERE user_email = ? AND variant = ?", (user_email, variant))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/get-defaults")
async def get_defaults(user_email: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT variant, filename FROM defaults WHERE user_email = ?", (user_email,))
        rows = cursor.fetchall()
        conn.close()
        return {row[0]: row[1] for row in rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# This service is internal — only the Node API should reach it. Credentials are
# never used across this boundary, so "*" with credentials (which is invalid
# anyway) is replaced by an explicit allowlist.
_allowed_origins = [
    o.strip() for o in os.environ.get("OPTIMIZER_ALLOWED_ORIGINS", "http://localhost:5000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return text
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(e)}")

# Define the Pydantic schema for the LLM output is not strictly necessary since
# we can just use JSON mode or rely on the system prompt and parse it.
# We'll use the prompt directly to get strict JSON.

SYSTEM_PROMPT = """You are an expert ATS Resume Optimizer and Tech Career Coach.

The user will give you:
1. Two original resumes extracted from PDFs
2. A job description / vacancy post
3. Two STRICT LaTeX Templates: one for Gen AI, one for Backend.

Your job:
- Analyze both resumes against the job description.
- For EACH resume category, generate a highly optimized version with a 90-100% keyword match to the given Job Description.
- You MUST return the optimized resumes using the EXACT LaTeX Templates provided for each category. Do not change the document class, margins, packages, styling, or contact information. Only modify the Skills, Experience bullet points, and Project descriptions to align perfectly with the job description. Keep the Education graduation date exactly as "2021 - 2025".
- Add keywords from the JD naturally into the resume content.
- Remove irrelevant skills that hurt ATS ranking for this specific role.
- Give a match score out of 100.
- Suggest 2 specific projects the candidate should build to get shortlisted for this exact role — be very specific with tech stack, what to build, and exactly why it matches the JD.

Respond ONLY with a valid JSON object. No markdown, no explanation outside JSON.
Use this exact structure:
{
  "resume_genai": {
    "match_score": number,
    "optimized_resume_latex": "exact latex string",
    "added_keywords": ["kw1"],
    "removed_keywords": ["kw2"],
    "ats_tips": ["tip1"],
    "project_suggestions": [{ "title": "t1", "description": "d1", "why_selected": "w1" }]
  },
  "resume_backend": {
    "match_score": number,
    "optimized_resume_latex": "exact latex string",
    "added_keywords": [],
    "removed_keywords": [],
    "ats_tips": [],
    "project_suggestions": [{ "title": "", "description": "", "why_selected": "" }]
  }
}
"""

@app.post("/api/optimize")
async def optimize_resumes(
    user_email: str = Form(...),
    resume_genai: UploadFile = File(None),
    resume_backend: UploadFile = File(None),
    job_description: str = Form(...)
):
    # Extract text or fall back to this user's saved defaults
    genai_text = ""
    backend_text = ""

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    async def resolve(upload, variant: str, label: str) -> str:
        if upload:
            if not upload.filename.lower().endswith(".pdf"):
                raise HTTPException(status_code=400, detail=f"{label} resume must be a PDF file.")
            return extract_text_from_pdf(await upload.read())

        cursor.execute(
            "SELECT text_content FROM defaults WHERE user_email = ? AND variant = ?",
            (user_email, variant),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail=f"{label} resume missing and no default saved for this account.")
        return row[0]

    try:
        genai_text = await resolve(resume_genai, "genai", "Gen AI")
        backend_text = await resolve(resume_backend, "backend", "Backend")
    finally:
        conn.close()

    # Load and optimize templates to minimize token generation
    def minify_latex(text: str) -> str:
        import re
        # Remove comments (lines starting with %)
        text = re.sub(r'(?m)^%.*$', '', text)
        # Remove inline comments (not escaped %)
        text = re.sub(r'(?<!\\)%.*$', '', text)
        # Remove excessive whitespace
        text = re.sub(r'\n\s*\n', '\n', text)
        return text.strip()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    try:
        with open(os.path.join(base_dir, "template_genai.tex"), "r", encoding="utf-8") as f:
            template_genai = minify_latex(f.read())
        with open(os.path.join(base_dir, "template_backend.tex"), "r", encoding="utf-8") as f:
            template_backend = minify_latex(f.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load LaTeX templates: {str(e)}")

    # Format the prompt
    user_message = f"""Here are the inputs:

--- Original Gen AI Resume Text ---
{genai_text}

--- Original Backend Resume Text ---
{backend_text}

--- TARGET Gen AI LaTeX Template to Fill ---
{template_genai}

--- TARGET Backend LaTeX Template to Fill ---
{template_backend}

--- Job Description ---
{job_description}
"""
    
    try:
        parsed_json = complete_json(
            SYSTEM_PROMPT + "\n\nIMPORTANT: Your entire response must be a single raw JSON object. No markdown, no backticks, no explanation. Start with { and end with }.",
            user_message,
        )

        # Save to DB
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO history (timestamp, job_description, match_score_genai, match_score_backend, data_json)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                datetime.now().isoformat(),
                job_description,
                parsed_json.get("resume_genai", {}).get("match_score", 0),
                parsed_json.get("resume_backend", {}).get("match_score", 0),
                json.dumps(parsed_json)
            ))
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"Database error: {db_err}")

        return parsed_json

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Processing Failed: {str(e)}")

class OptimizeForJobRequest(BaseModel):
    job_description: str
    user_email: str

@app.post("/api/optimize-for-job")
async def optimize_for_job(req: OptimizeForJobRequest):
    """
    Optimizes resumes against a job description using saved default resumes.
    Called by the Node.js outreach server — no PDF upload needed.
    Returns match scores and compiled LaTeX for both resumes;
    caller picks the winner.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT variant, text_content FROM defaults WHERE user_email = ? AND variant IN ('genai', 'backend')",
        (req.user_email,),
    )
    rows = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()

    if "genai" not in rows or "backend" not in rows:
        raise HTTPException(
            status_code=400,
            detail="Default resumes not set for this account. Please upload both resumes in the Resume Optimizer first."
        )

    genai_text = rows["genai"]
    backend_text = rows["backend"]

    def minify_latex(text: str) -> str:
        import re
        text = re.sub(r'(?m)^%.*$', '', text)
        text = re.sub(r'(?<!\\)%.*$', '', text)
        text = re.sub(r'\n\s*\n', '\n', text)
        return text.strip()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    try:
        with open(os.path.join(base_dir, "template_genai.tex"), "r", encoding="utf-8") as f:
            template_genai = minify_latex(f.read())
        with open(os.path.join(base_dir, "template_backend.tex"), "r", encoding="utf-8") as f:
            template_backend = minify_latex(f.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load LaTeX templates: {str(e)}")

    user_message = f"""Here are the inputs:

--- Original Gen AI Resume Text ---
{genai_text}

--- Original Backend Resume Text ---
{backend_text}

--- TARGET Gen AI LaTeX Template to Fill ---
{template_genai}

--- TARGET Backend LaTeX Template to Fill ---
{template_backend}

--- Job Description ---
{req.job_description}
"""

    try:
        parsed_json = complete_json(
            SYSTEM_PROMPT + "\n\nIMPORTANT: Your entire response must be a single raw JSON object. No markdown, no backticks, no explanation. Start with { and end with }.",
            user_message,
        )

        # Persist to history DB
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO history (timestamp, job_description, match_score_genai, match_score_backend, data_json)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                datetime.now().isoformat(),
                req.job_description,
                parsed_json.get("resume_genai", {}).get("match_score", 0),
                parsed_json.get("resume_backend", {}).get("match_score", 0),
                json.dumps(parsed_json)
            ))
            conn.commit()
            conn.close()
        except Exception as db_err:
            print(f"Database error: {db_err}")

        return parsed_json
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Processing Failed: {str(e)}")


# ── Structured JSON resume (used by the Node pipeline; rendered to PDF by Puppeteer) ──

JSON_RESUME_SYSTEM_PROMPT = """You are an expert ATS resume writer.

You receive a candidate's existing resume text (and/or profile summary) plus a target job
description. Rewrite the candidate's resume so it matches the job description as closely as
honestly possible.

Hard rules:
- NEVER invent employers, job titles, degrees, dates or certifications that are not present in
  the source material. You may rephrase, reorder, and re-emphasise existing content, and you may
  surface skills implied by the candidate's projects.
- Mirror the job description's vocabulary in the summary, skills and bullet points. An ATS matches
  on the exact term, so reuse the JD's wording rather than a synonym, and put the most important
  requirements in the summary and the most recent role.
- Every experience/project bullet starts with a strong verb and includes a metric where the source
  material provides one.
- List any JD requirement you found no evidence for in `missing_keywords`. It must NOT appear
  anywhere in the resume — claiming a qualification the candidate lacks costs them the interview.

Respond ONLY with a single raw JSON object (no markdown, no backticks) in this exact shape:
{
  "match_score": 0-100,
  "resume": {
    "name": "", "title": "", "email": "", "phone": "", "location": "",
    "links": [{"label": "LinkedIn", "url": ""}],
    "summary": "2-3 sentence positioning statement targeted at this job",
    "skills": [{"category": "Languages", "items": ["Python"]}],
    "experience": [{"role": "", "company": "", "location": "", "start": "", "end": "", "bullets": [""]}],
    "projects": [{"name": "", "tech": "", "bullets": [""]}],
    "education": [{"degree": "", "school": "", "start": "", "end": "", "detail": ""}],
    "certifications": [""]
  },
  "matched_keywords": ["JD requirements the candidate genuinely evidences"],
  "missing_keywords": ["JD requirements with no support in the source"],
  "added_keywords": [""],
  "removed_keywords": [""],
  "gaps": ["up to 3 short honest notes on what would strengthen this application"],
  "ats_tips": [""],
  "project_suggestions": [{"title": "", "description": "", "why_selected": ""}]
}
Omit any array you have no source material for — return it empty rather than fabricating."""


class ResumeJsonRequest(BaseModel):
    job_description: str
    # Optional caller-supplied source material. When omitted we fall back to this
    # user's saved default resumes; when neither exists we return a 400.
    resume_text: Optional[str] = None
    profile_summary: Optional[str] = None
    variant: Optional[str] = None  # 'genai' | 'backend' — which default to prefer
    user_email: Optional[str] = None


def _load_default_resume_text(variant: Optional[str], user_email: Optional[str]) -> tuple[str, str]:
    """
    Returns (text, source_label) for one user's saved defaults.

    Without the user_email filter this read returned whichever resume was uploaded
    most recently by *any* user, so one person's CV could be generated from another
    person's resume. An unattributed caller gets no defaults at all.
    """
    if not user_email:
        return "", "none"

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        f"SELECT variant, text_content FROM defaults WHERE user_email = ? AND variant IN ({_slot_placeholders()})",
        (user_email, *SLOT_VARIANTS),
    )
    rows = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()

    if variant and rows.get(variant):
        return rows[variant], variant
    for key in SLOT_VARIANTS:
        if rows.get(key):
            return rows[key], key
    return "", "none"


@app.post("/api/resume-json")
async def resume_json(req: ResumeJsonRequest):
    """
    Build a structured, job-matched resume as JSON. The caller renders it to PDF.
    Works from caller-supplied resume text, the user's saved default resumes, or a
    profile summary — whichever is available.
    """
    if not req.job_description or not req.job_description.strip():
        raise HTTPException(status_code=400, detail="job_description is required.")

    source_text = (req.resume_text or "").strip()
    source_label = "caller"
    if not source_text:
        source_text, source_label = _load_default_resume_text(req.variant, req.user_email)

    profile_summary = (req.profile_summary or "").strip()

    if not source_text and not profile_summary:
        raise HTTPException(
            status_code=400,
            detail=(
                "No resume source available. Upload a resume on your profile, or set the "
                "default resumes in the Resume Optimizer."
            ),
        )

    user_message = f"""--- Candidate Resume Text ---
{source_text or "(none provided)"}

--- Candidate Profile Summary ---
{profile_summary or "(none provided)"}

--- Target Job Description ---
{req.job_description}
"""

    parsed = complete_json(JSON_RESUME_SYSTEM_PROMPT, user_message)

    if not isinstance(parsed.get("resume"), dict):
        raise HTTPException(status_code=502, detail="LLM response did not contain a 'resume' object.")

    parsed["source"] = source_label

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO history (timestamp, user_email, job_description, match_score_genai, match_score_backend, data_json)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (datetime.now().isoformat(), req.user_email, req.job_description,
             parsed.get("match_score", 0), 0, json.dumps(parsed)),
        )
        conn.commit()
        conn.close()
    except Exception as db_err:
        print(f"Database error: {db_err}")

    return parsed


# ── Layout-preserving tailoring (the path the outreach app uses) ─────────────

TAILOR_SYSTEM_PROMPT = """You are an expert ATS resume editor.

You are given a candidate's resume already broken into blocks, plus a target job
description. You rewrite each block so the resume reads as though it were
written for this specific role. The document's STRUCTURE is fixed — same
sections, same blocks, same number of bullets — but the PROSE inside it is
yours to rewrite completely.

Rewrite, do not substitute. A bullet should come back as a genuinely new
sentence aimed at this job: different verb, different emphasis, different
framing of the same real achievement. Swapping one or two words for the job
description's synonyms is not enough and is the most common failure here.

Return JSON with exactly this shape — the same sections, in the same order, with
the same block ids, and every list the same length as the one you were given:
{
  "sections": [
    { "id": "s1", "blocks": [
        { "id": "b1", "type": "paragraph", "text": "rewritten text" },
        { "id": "b4", "type": "labeled", "text": "rewritten value only" },
        { "id": "b2", "type": "bullets", "items": ["rewritten", "rewritten"] },
        { "id": "b3", "type": "entry", "left": "retitled role", "bullets": ["rewritten", "rewritten"] }
    ]}
  ],
  "match_score": 0-100,
  "matched_keywords": ["JD requirements the candidate genuinely evidences"],
  "missing_keywords": ["JD requirements with no support in the source"],
  "added_keywords": ["terms you worked into the text"],
  "removed_keywords": ["terms you de-emphasised"],
  "gaps": ["up to 3 short honest notes on what would strengthen this application"],
  "ats_tips": ["..."]
}

How to maximise the ATS match:
1. First read the job description and list its hard requirements — named skills,
   tools, platforms, certifications, domain and seniority.
2. For each requirement, look for evidence in the candidate's blocks. Where it
   exists, make sure the JD's own wording appears in the text — an ATS matches
   on the exact term, so "management accounting" does not score for "managed
   accounts". Put the most important ones in the summary and the most recent
   role, where both parsers and humans look first.
3. Where a `labeled` skills row exists, reorder it so JD-relevant items lead.
4. Prefer the JD's vocabulary over synonyms throughout, and spell out an acronym
   once alongside its expansion ("UAT (User Acceptance Testing)") so either form
   matches.
5. Requirements with no evidence go in `missing_keywords`. They must NOT appear
   anywhere in the rewritten CV.

What to rewrite, block by block:
- The summary/profile paragraph: rewrite it from scratch as a positioning
  statement for THIS role. It should read as though written for this advert —
  same person and same career, new argument for why they fit.
- Every experience bullet: rebuild it, do not edit it. Work through them one at
  a time and, for each, pick the job requirement it best evidences and write the
  sentence to prove that requirement. Open with the requirement's own verb and
  noun, then the real scope, then the outcome or number if the source has one.
  The underlying fact stays true; the sentence that carries it is new.
  A useful check: if your bullet still shares its opening clause with the
  original, you have edited rather than rebuilt it — write it again.
  Cover the requirements across the bullets rather than repeating the same one;
  the most senior role carries the requirements the advert leads with.
- `left` on an entry is the JOB TITLE ONLY. Return the title re-expressed in the
  target role's language where the work genuinely supports it — a business
  analyst who ran technology change can be "Technology Business Analyst", but
  cannot become "Engineering Manager". Do not seniority-inflate: a "Lead" stays
  a Lead, an "Analyst" does not become a "Head of". `employer_context` is the
  company and is never yours to return or change.
- `labeled` skills rows: reorder so the job's priorities lead, and use the job's
  exact term where the candidate genuinely has the skill.

Length discipline: each rewritten string must stay within about 10% of the
original's character count. The layout is fixed and the page count with it —
a longer bullet reflows the document and costs the candidate a clean page.

`match_score` is your honest estimate of how this CV now scores against this JD.
Use the full range: a CV aimed at a different domain scores below 40, not 60.

Hard rules:
- NEVER add, remove, reorder or merge sections, blocks or bullets. If a block has
  three bullets, return exactly three bullets for it.
- NEVER invent employers, dates, degrees, certifications, metrics or
  technologies the candidate has not shown evidence of. Job titles may be
  re-expressed for the target role as described above; everything else on this
  list is a matter of record.
- Mirror the job description's vocabulary and seniority in the summary, skills
  and bullets. Lead bullets with strong verbs; keep any metric already present.
- `employer_context`, `role_context` and `label_context` are given for
  orientation only. Never return them. For a `labeled` block return only the
  value, never the label.
- In a `labeled` skills row you may reorder and drop items so the most relevant
  come first, but never add a skill the candidate has not demonstrated.
- Rewrite every block you are given. Returning a block unchanged wastes the one
  chance to aim it at this role.

`added_keywords` are terms from the job description you worked in;
`removed_keywords` are ones you de-emphasised; `ats_tips` are 2-5 specific,
actionable gaps the candidate should address."""


class ResumeTailorRequest(BaseModel):
    job_description: str
    user_email: str
    variant: Optional[str] = None  # 'main' | 'genai' | 'backend' — which template to use


def _load_template(user_email: str, variant: Optional[str]) -> tuple[Optional[dict], str]:
    """The stored layout map for one user's resume slot, and which slot it came from."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        f"SELECT variant, layout_json FROM templates WHERE user_email = ? AND variant IN ({_slot_placeholders()})",
        (user_email, *SLOT_VARIANTS),
    )
    rows = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()

    order = [variant] if variant else []
    order += [v for v in SLOT_VARIANTS if v != variant]
    for key in order:
        if rows.get(key):
            try:
                return json.loads(rows[key]), key
            except json.JSONDecodeError:
                continue
    return None, "none"


@app.get("/api/template")
async def get_template(user_email: str, variant: Optional[str] = None):
    """The stored layout map itself, so the UI can show the real document while
    it is being tailored rather than an abstract spinner."""
    layout, source = _load_template(user_email, variant)
    if not layout:
        raise HTTPException(status_code=404, detail="No resume template for this account.")
    return {"layout": layout, "source": source}


class TemplateUpdateRequest(BaseModel):
    user_email: str
    layout: dict
    variant: Optional[str] = None


@app.put("/api/template")
async def update_template(req: TemplateUpdateRequest):
    """
    Save user edits to their base CV.

    The incoming layout is merged into the stored one through `apply_rewrite`,
    the same guard tailoring uses — so an edit can change wording but cannot
    reorder sections, drop bullets or rewrite dates and employers. Those are
    read off the source PDF and are what the whole layout guarantee rests on.
    """
    stored, source = _load_template(req.user_email, req.variant)
    if not stored:
        raise HTTPException(status_code=404, detail="No resume template for this account.")

    merged, changes = apply_rewrite(stored, req.layout)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE templates SET layout_json = ?, derived_at = ? WHERE user_email = ? AND variant = ?",
        (json.dumps(merged), datetime.now().isoformat(), req.user_email, source),
    )
    conn.commit()
    conn.close()

    return {"layout": merged, "changes": changes, "source": source}


@app.get("/api/template-status")
async def template_status(user_email: str):
    """Which slots have a usable layout template. Lets the caller decide between
    the layout-preserving path and the legacy one without attempting a tailor."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT variant FROM templates WHERE user_email = ?", (user_email,))
    variants = [row[0] for row in cursor.fetchall()]
    conn.close()
    return {"variants": variants}


@app.post("/api/resume-tailor")
async def resume_tailor(req: ResumeTailorRequest):
    """
    Rewrite a resume's wording against a job description, inside its own layout.

    Unlike /api/resume-json this never generates a document. It loads the layout
    derived from the user's uploaded PDF, asks the LLM to rewrite only the text,
    then merges the result back block by block — discarding anything that would
    have altered the structure.
    """
    if not req.job_description or not req.job_description.strip():
        raise HTTPException(status_code=400, detail="job_description is required.")

    layout, source = _load_template(req.user_email, req.variant)
    if not layout:
        raise HTTPException(
            status_code=404,
            detail="No resume template found for this account. Upload a resume on your profile first.",
        )

    editable = editable_view(layout)
    user_message = f"""--- Resume blocks to rewrite ---
{json.dumps(editable, ensure_ascii=False)}

--- Target job description ---
{req.job_description[:6000]}
"""

    parsed = complete_json(TAILOR_SYSTEM_PROMPT, user_message)

    # The merge is what enforces the format contract — anything the model
    # returned that doesn't line up with the original layout is dropped.
    merged, changes = apply_rewrite(layout, parsed)

    result = {
        "layout": merged,
        "original_layout": layout,
        "changes": changes,
        "resume_text": layout_to_text(merged),
        "match_score": parsed.get("match_score", 0),
        "matched_keywords": parsed.get("matched_keywords", []) or [],
        "missing_keywords": parsed.get("missing_keywords", []) or [],
        "added_keywords": parsed.get("added_keywords", []) or [],
        "removed_keywords": parsed.get("removed_keywords", []) or [],
        "gaps": parsed.get("gaps", []) or [],
        "ats_tips": parsed.get("ats_tips", []) or [],
        "source": source,
    }

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO history (timestamp, user_email, job_description, match_score_genai, match_score_backend, data_json)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (datetime.now().isoformat(), req.user_email, req.job_description,
             result["match_score"], 0, json.dumps({"changes": changes, "source": source})),
        )
        conn.commit()
        conn.close()
    except Exception as db_err:
        print(f"Database error: {db_err}")

    return result


COVER_SYSTEM_PROMPT = """You write cover letters for a specific candidate and job.

You are given the candidate's tailored CV content and the job description. Write
a letter that reads like the candidate wrote it themselves.

Rules:
- 200-230 words, three short paragraphs, addressed "Dear Hiring Team,".
- Paragraph 1: the role they're applying for and the single strongest reason
  they fit. Paragraph 2: concrete evidence drawn from the CV — real employers,
  real projects, real numbers. Paragraph 3: what draws them to this role, and a
  brief close.
- Use ONLY facts present in the CV content. Never invent an employer, a metric,
  a qualification or an interest. If the CV doesn't support a JD requirement,
  say nothing about it rather than implying it.
- UK English. No flattery, no "I am writing to apply", no bullet points, no
  placeholders like [Company]. If the company name is in the job description,
  use it; otherwise write around it.
- Output only the letter body, starting with "Dear Hiring Team,". Do not add a
  signature block — the renderer appends it."""


class CoverLetterRequest(BaseModel):
    job_description: str
    resume_text: str
    candidate_name: Optional[str] = None


@app.post("/api/resume-cover")
async def resume_cover(req: CoverLetterRequest):
    """Write a cover letter from the tailored CV, so the letter and the CV tell
    the same story rather than being generated from different source material."""
    if not req.job_description.strip():
        raise HTTPException(status_code=400, detail="job_description is required.")
    if not req.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is required.")

    user_message = f"""--- Candidate CV content ---
{req.resume_text[:6000]}

--- Target job description ---
{req.job_description[:6000]}
"""
    client = _openai_client()
    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            max_tokens=900,
            messages=[
                {"role": "system", "content": COVER_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
        letter = (response.choices[0].message.content or "").strip()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cover letter generation failed: {str(e)}")

    if not letter:
        raise HTTPException(status_code=502, detail="The model returned an empty cover letter.")

    return {"cover_letter": letter}


@app.get("/api/history")
async def get_history(user_email: str):
    """History is per-account — an unscoped read would expose every user's job
    descriptions and generated resumes."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM history WHERE user_email = ? ORDER BY timestamp DESC LIMIT 20",
            (user_email,),
        )
        rows = cursor.fetchall()
        conn.close()
        
        result = []
        for row in rows:
            result.append({
                "id": row["id"],
                "timestamp": row["timestamp"],
                "job_description": row["job_description"],
                "match_score_genai": row["match_score_genai"],
                "match_score_backend": row["match_score_backend"],
                "data": json.loads(row["data_json"])
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")

import requests
from fastapi.responses import StreamingResponse
import io

class CompileRequest(BaseModel):
    latex_code: str

@app.post("/api/compile-pdf")
async def compile_pdf(request: CompileRequest):
    templates_to_try = [
        # Primary: latex.online (with better timeout and user-agent)
        ("https://latex.online/compile?command=pdflatex", "post_json"),
        # Fallback: texlive.net (widely used for web-based tex)
        ("https://texlive.net/cgi-bin/texlive/texlive.sh", "post_form")
    ]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    last_error = ""
    for url, method in templates_to_try:
        try:
            if method == "post_json":
                response = requests.post(url, json={"text": request.latex_code}, headers=headers, timeout=15)
            else:
                # texlive.net format
                response = requests.post(url, data={
                    "filecontents[]": request.latex_code,
                    "filename[]": "main.tex",
                    "engine": "pdflatex",
                    "return": "pdf"
                }, headers=headers, timeout=15)

            if response.status_code == 200 and len(response.content) > 1000: # Basic check if it's a real PDF
                return StreamingResponse(
                    io.BytesIO(response.content),
                    media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=optimized_resume.pdf"}
                )
            last_error = f"Service {url} returned {response.status_code}"
        except Exception as e:
            last_error = str(e)
            continue # Try next service

    raise HTTPException(status_code=503, detail=f"All LaTeX compilation services failed or timed out. Last error: {last_error}. Please use the '.tex' download and paste into Overleaf.")

@app.get("/health")
def health_check():
    return {"status": "ok"}
