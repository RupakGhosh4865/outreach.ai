"""
Derive a reusable layout map from a resume PDF.

Why this exists: the optimizer used to send a resume's *text* to the LLM and ask
for a fresh structured document back. Whatever the candidate's CV actually looked
like — its section order, its right-aligned date columns, its page count — was
lost, and a tailored two-page CV came back as a generic one-pager.

Here we read the structure off the PDF itself with PyMuPDF and keep it. The LLM
is later handed this map and allowed to rewrite only the prose inside it, so the
optimized PDF is the same document with better words.

Nothing in this module calls an LLM. Everything it returns is observed from the
file. The parser works in *visual rows* rather than PDF text lines, because a
role and its date range are usually two separately-positioned runs sharing one
baseline — treating them as separate lines is what makes date columns disappear.
"""

import json
import re
from typing import Any, Optional

import fitz  # PyMuPDF

# Glyphs PDFs use for list markers, stripped before the bullet text is stored.
# LaTeX-produced CVs commonly use ⋄ or ▪ and often emit no space after it, so the
# separator is optional — requiring one silently turned every bullet into a
# paragraph and lost the list structure.
BULLET_CHARS = "•◦‣∙·▪▫⋄◆●○–—*"
BULLET_RE = re.compile(rf"^\s*[{re.escape(BULLET_CHARS)}]\s*(?=\S)")

MONTHS = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*"
# Matches "2021 - Present", "(Nov'24 - March'25)", "Dec 2025 – Present", "June,2024".
DATEISH_RE = re.compile(
    rf"(?:{MONTHS}|\d{{4}}|['’]\d{{2}}|Present|Current|Ongoing)",
    re.IGNORECASE,
)

CONTACT_RE = re.compile(r"[@]|\+\d|linkedin|github|https?://|portfolio|\|\s*\d")

# Rows are one visual line when their baselines differ by less than this.
ROW_TOLERANCE = 3.5

# Longest a row can be and still be a section heading. This was 40, which
# rejected "Certifications & Professional Development" (41 chars) — the heading
# was absorbed into the skills row above it and the section vanished. Size and
# left-margin position are the real signals; this only rules out prose.
HEADING_MAX_CHARS = 60


def _lines(page, page_index: int) -> list[dict]:
    """Flatten a page into styled text runs."""
    out = []
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:  # skip images
            continue
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
            if not spans:
                continue
            # The longest span decides the run's style — a trailing marker
            # shouldn't make a body line look like a heading.
            lead = max(spans, key=lambda s: len(s.get("text", "")))
            out.append({
                "text": "".join(s["text"] for s in line["spans"]).strip(),
                "size": round(lead.get("size", 10), 1),
                "font": lead.get("font", ""),
                "bold": bool(lead.get("flags", 0) & 2 ** 4) or "bold" in lead.get("font", "").lower(),
                "x0": round(line["bbox"][0], 1),
                "x1": round(line["bbox"][2], 1),
                "y": round(line["bbox"][1], 1),
                "page": page_index,
            })
    return out


def _rows(lines: list[dict], page_width: float) -> list[dict]:
    """
    Group text runs sharing a baseline into visual rows.

    A row's `left` is its first run; `right` is a run that starts in the
    right-hand third of the page — that is where CVs put date ranges.
    """
    lines = sorted(lines, key=lambda l: (l["page"], l["y"], l["x0"]))
    rows: list[dict] = []

    for line in lines:
        current = rows[-1] if rows else None
        if current and line["page"] == current["page"] and abs(line["y"] - current["y"]) <= ROW_TOLERANCE:
            current["runs"].append(line)
            current["x1"] = max(current["x1"], line["x1"])
        else:
            rows.append({
                "page": line["page"], "y": line["y"],
                "x0": line["x0"], "x1": line["x1"], "runs": [line],
            })

    right_edge = page_width * 0.62
    for row in rows:
        runs = sorted(row["runs"], key=lambda r: r["x0"])
        lead = runs[0]
        tail = runs[-1]

        # A run starting in the right-hand third is the row's right column —
        # dates most often, but also locations. This is decided on position
        # alone: requiring it to look like a date dropped location columns into
        # the body text and broke the two-column entry layout.
        right = ""
        body = runs
        if len(runs) > 1 and tail["x0"] >= right_edge:
            right = tail["text"].strip()
            body = runs[:-1]

        # A bold label at the margin with its value starting at a consistent
        # inner column is a skills/definition row. Without this the label and
        # value merge into one long paragraph and a skills table reads as a wall
        # of text — the section ATS parsers care about most.
        #
        # Only when the row has no right column: an entry header like
        # "TRUE-FEEDBACK APP  [Live] [GitHub]        June,2024" has the same
        # bold-then-plain shape, and treating it as a label dropped the project
        # name out of the document.
        label = ""
        if not right and len(body) > 1 and body[0]["bold"] and not body[1]["bold"]:
            gap = body[1]["x0"] - body[0]["x1"]
            if gap > 4 and body[1]["x0"] < right_edge:
                label = body[0]["text"].strip()
                body = body[1:]

        row.update({
            "text": " ".join(r["text"] for r in body).strip(),
            "right": right,
            "label": label,
            "size": lead["size"],
            "bold": lead["bold"],
            "font": lead["font"],
            "x0": lead["x0"],
        })
    return [r for r in rows if r["text"] or r["right"]]


def _pick_heading_size(rows: list[dict], body_size: float, name_size: float, left_margin: float) -> Optional[float]:
    """
    Find the font size used for section headings.

    Section headings share one distinctive size, sit at the left margin, are
    short, and carry no dates. Rather than judging each line on its own — which
    promotes every bold label like "Languages:" — we look for the size class
    whose members all behave that way.
    """
    candidates: dict[float, int] = {}
    for row in rows:
        if row["size"] <= body_size or row["size"] >= name_size:
            continue
        if row["right"] or row["x0"] > left_margin + 6:
            continue
        text = row["text"].strip()
        if not text or len(text) > HEADING_MAX_CHARS or BULLET_RE.match(text) or DATEISH_RE.search(text):
            continue
        candidates[row["size"]] = candidates.get(row["size"], 0) + 1

    if not candidates:
        return None
    # Most-used qualifying size; ties break toward the larger, which is more
    # likely to be a heading than an emphasised entry title.
    return max(candidates.items(), key=lambda kv: (kv[1], kv[0]))[0]


def derive_layout(pdf_bytes: bytes) -> dict[str, Any]:
    """
    Read a resume PDF into the layout map the tailoring step edits.

    Returns sections in document order, each with its heading verbatim and its
    blocks typed as `paragraph`, `entry` (a titled item with dates and bullets)
    or `bullets`. Block ids are assigned here and are the contract the LLM must
    preserve.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if doc.page_count == 0:
            raise ValueError("The PDF has no pages.")
        raw: list[dict] = []
        for i, page in enumerate(doc):
            raw.extend(_lines(page, i))
        page_rect = doc[0].rect
        page_size = [round(page_rect.width, 1), round(page_rect.height, 1)]
        page_count = doc.page_count
    finally:
        doc.close()

    raw = [l for l in raw if l["text"]]
    if not raw:
        raise ValueError("No selectable text found — is this a scanned image?")

    rows = _rows(raw, page_size[0])

    # Body size is the size carrying the most characters.
    weights: dict[float, int] = {}
    for line in raw:
        weights[line["size"]] = weights.get(line["size"], 0) + len(line["text"])
    body_size = max(weights.items(), key=lambda kv: kv[1])[0]

    left_margin = min(r["x0"] for r in rows)
    name_size = max(r["size"] for r in rows[:6]) if rows else body_size

    heading_size = _pick_heading_size(rows, body_size, name_size, left_margin)

    def is_heading(row: dict) -> bool:
        if heading_size is None or row["size"] != heading_size:
            return False
        if row["right"] or row["x0"] > left_margin + 6:
            return False
        text = row["text"].strip()
        return bool(text) and len(text) <= HEADING_MAX_CHARS and not BULLET_RE.match(text)

    # ── Header: everything above the first section heading ──
    first = next((i for i, r in enumerate(rows) if is_heading(r)), len(rows))
    header_rows = rows[:first]

    name = ""
    header_rest = []
    if header_rows:
        # The name is the largest run in the header, not necessarily the first.
        name_row = max(header_rows, key=lambda r: r["size"])
        name = name_row["text"]
        name_size = name_row["size"]
        header_rest = [r["text"] for r in header_rows if r is not name_row and r["text"]]

    contact_lines = [t for t in header_rest if CONTACT_RE.search(t)]
    title_lines = [t for t in header_rest if not CONTACT_RE.search(t)]

    body_x0 = min((r["x0"] for r in rows[first:]), default=left_margin)
    header_x0 = min((r["x0"] for r in header_rows), default=body_x0)

    layout: dict[str, Any] = {
        "page_size": page_size,
        "page_count": page_count,
        "margins": {"left": left_margin, "right": round(page_size[0] - max(r["x1"] for r in rows), 1)},
        "fonts": {
            "body": {"family": raw[0]["font"], "size": body_size},
            "name": {"size": name_size},
            "heading": {"size": heading_size or round(body_size + 2, 1)},
        },
        "header": {
            "name": name,
            "title": title_lines[0] if title_lines else "",
            "contact_lines": contact_lines,
            "extra_lines": title_lines[1:],
            "align": "center" if header_x0 > body_x0 + 12 else "left",
        },
        "sections": [],
    }

    # ── Sections ──
    counters = {"s": 0, "b": 0}

    def next_id(prefix: str) -> str:
        counters[prefix] += 1
        return f"{prefix}{counters[prefix]}"

    section: Optional[dict] = None
    entry: Optional[dict] = None
    last_bullet: Optional[dict] = None  # (container list, index) of the bullet still being wrapped
    last_labeled: Optional[tuple] = None  # (block, value column x) of a labelled row that may wrap
    bullet_indent: Optional[float] = None

    def ensure_section():
        nonlocal section
        if section is None:
            section = {"id": next_id("s"), "heading": "", "blocks": []}
            layout["sections"].append(section)
        return section

    for row in rows[first:]:
        text = row["text"].strip()

        if is_heading(row):
            section = {"id": next_id("s"), "heading": text, "blocks": []}
            layout["sections"].append(section)
            entry = None
            last_bullet = None
            last_labeled = None
            continue

        if not text and not row["right"]:
            continue

        ensure_section()

        # ── Bullet ──
        bullet = BULLET_RE.match(text)
        if bullet:
            content = text[bullet.end():].strip()
            bullet_indent = row["x0"]
            if entry is not None:
                entry["bullets"].append(content)
                last_bullet = (entry["bullets"], len(entry["bullets"]) - 1)
            else:
                blocks = section["blocks"]
                if blocks and blocks[-1]["type"] == "bullets":
                    blocks[-1]["items"].append(content)
                    last_bullet = (blocks[-1]["items"], len(blocks[-1]["items"]) - 1)
                else:
                    block = {"type": "bullets", "id": next_id("b"), "items": [content]}
                    blocks.append(block)
                    last_bullet = (block["items"], 0)
            continue

        # ── Wrapped continuation of the previous bullet ──
        # A wrapped line is sometimes indented past the marker and sometimes
        # flush with the margin, so indentation alone can't decide it. The
        # reliable signal is that the bullet it continues has no sentence-final
        # punctuation yet; an indented row is taken as a continuation either way.
        if last_bullet and not row["right"] and not row["bold"]:
            container, index = last_bullet
            indented = bullet_indent is not None and row["x0"] > bullet_indent
            unfinished = not container[index].rstrip().endswith((".", ":", "!", "?"))
            if indented or unfinished:
                container[index] = f"{container[index]} {text}".strip()
                continue

        # ── Labelled row (skills table) ──
        if row["label"] and not row["right"]:
            entry = None
            last_bullet = None
            block = {
                "type": "labeled", "id": next_id("b"),
                "label": row["label"], "text": text,
            }
            section["blocks"].append(block)
            # Remember where the value column starts so wrapped lines can be
            # recognised and folded back in below.
            last_labeled = (block, row["x0"])
            continue

        # ── Wrapped continuation of a labelled row ──
        # A long skills list wraps under its value column with no label of its
        # own. Left as a paragraph it becomes an orphan line adrift from the
        # category it belongs to.
        if last_labeled and not row["right"] and not row["label"] and not row["bold"]:
            block, value_x0 = last_labeled
            if row["x0"] >= value_x0 - 2:
                block["text"] = f"{block['text']} {text}".strip()
                continue

        # ── Entry header: a titled row with a date range on the right ──
        if row["right"]:
            entry = {
                "type": "entry", "id": next_id("b"),
                "left": text, "right": row["right"], "sub": "", "bullets": [],
            }
            section["blocks"].append(entry)
            last_bullet = None
            continue

        # A short unbulleted row right after an entry header is its
        # employer/location sub-line, not a new paragraph.
        if entry is not None and not entry["bullets"] and not entry["sub"] and len(text) < 80:
            entry["sub"] = text
            continue

        entry = None
        last_bullet = None
        blocks = section["blocks"]
        # PDFs break paragraphs across lines; rejoin unless the previous line
        # closed a sentence.
        if blocks and blocks[-1]["type"] == "paragraph" and not blocks[-1]["text"].endswith((".", ":", "!", "?")):
            blocks[-1]["text"] = f"{blocks[-1]['text']} {text}".strip()
        else:
            blocks.append({"type": "paragraph", "id": next_id("b"), "text": text})

    layout["sections"] = [s for s in layout["sections"] if s["blocks"] or s["heading"]]
    if not layout["sections"]:
        raise ValueError("Could not identify any sections in this resume.")

    return layout


def editable_view(layout: dict) -> dict:
    """
    The subset of a layout the LLM is allowed to rewrite.

    Headings, dates, employers, names and contact details are deliberately
    excluded — they are facts, not phrasing, and sending them at all invites the
    model to "improve" them.
    """
    sections = []
    for sec in layout.get("sections", []):
        blocks = []
        for block in sec.get("blocks", []):
            if block["type"] == "paragraph":
                blocks.append({"id": block["id"], "type": "paragraph", "text": block["text"]})
            elif block["type"] == "labeled":
                # The label is the category ("Languages:"); only its contents
                # are open to reprioritising for the role.
                blocks.append({
                    "id": block["id"], "type": "labeled",
                    "label_context": block["label"], "text": block["text"],
                })
            elif block["type"] == "bullets":
                blocks.append({"id": block["id"], "type": "bullets", "items": list(block["items"])})
            elif block["type"] == "entry" and block["bullets"]:
                title, _, employer = split_title(block["left"])
                entry = {
                    "id": block["id"], "type": "entry",
                    "bullets": list(block["bullets"]),
                }
                if employer:
                    # Only the title is offered for rewriting; the employer is
                    # sent as context so the model knows where the work happened
                    # but has no way to alter it.
                    entry["left"] = title
                    entry["employer_context"] = employer
                else:
                    entry["role_context"] = block["left"]
                blocks.append(entry)
        if blocks:
            sections.append({"id": sec["id"], "heading": sec.get("heading", ""), "blocks": blocks})
    return {"sections": sections}


# Separators CVs use between a job title and its employer, most specific first.
TITLE_SEPARATORS = (" | ", " · ", ", ", " @ ", " – ", " - ")


def split_title(left: str) -> tuple[str, str, str]:
    """
    Split an entry heading into (title, separator, employer).

    "Lead Business Analyst, Barclays PLC" -> ("Lead Business Analyst", ", ", "Barclays PLC")

    Returns ("", "", "") when the two can't be told apart — a project name like
    "RESEARCH.IO [Live]" has no employer to protect, so the whole string stays
    locked rather than being guessed at.
    """
    for sep in TITLE_SEPARATORS:
        if sep in left:
            title, employer = left.rsplit(sep, 1)
            if title.strip() and employer.strip():
                return title.strip(), sep, employer.strip()
    return "", "", ""


def _retitle(block: dict, incoming) -> Optional[str]:
    """
    The new entry heading to accept, or None to keep the original.

    Job titles are re-expressed in the target role's language, which the account
    owner has asked for. The employer is not theirs to change, so it is carried
    over from the original rather than taken from the model: whatever the model
    returns, the company on the CV stays the company they worked for.
    """
    if not isinstance(incoming, str) or not incoming.strip():
        return None

    original = block.get("left", "")
    new = " ".join(incoming.split())
    if new == original:
        return None

    _, sep, employer = split_title(original)
    if not employer:
        # Employer and title are indistinguishable (a project name, say) — the
        # safe move is to leave it alone.
        return None

    new_title, _, _ = split_title(new)
    new_title = (new_title or new).strip()
    if not new_title:
        return None

    rebuilt = f"{new_title}{sep}{employer}"
    return rebuilt if rebuilt != original else None


def apply_rewrite(layout: dict, rewrite: dict) -> tuple[dict, list[dict]]:
    """
    Merge the LLM's rewritten text back into the layout.

    This is what actually guarantees the format cannot change. Rather than
    trusting the model's output shape, we walk the *original* layout and accept a
    new string only where the model supplied one for a known id with a matching
    item count. An invented block, a dropped bullet or a reordered section is
    ignored and the original text stands.

    Returns the merged layout and the list of applied changes, which drives the
    live preview.
    """
    by_id: dict[str, dict] = {}
    for sec in rewrite.get("sections") or []:
        for block in sec.get("blocks") or []:
            if isinstance(block, dict) and block.get("id"):
                by_id[block["id"]] = block

    merged = json.loads(json.dumps(layout))  # deep copy; layouts are plain JSON
    changes: list[dict] = []

    def clean(value) -> Optional[str]:
        if not isinstance(value, str):
            return None
        return " ".join(value.split()) or None

    for sec in merged.get("sections", []):
        for block in sec.get("blocks", []):
            new = by_id.get(block["id"])
            if not new:
                continue

            if block["type"] in ("paragraph", "labeled"):
                text = clean(new.get("text"))
                if text and text != block["text"]:
                    changes.append({"block_id": block["id"], "before": block["text"], "after": text})
                    block["text"] = text

            elif block["type"] in ("bullets", "entry"):
                if block["type"] == "entry":
                    retitled = _retitle(block, new.get("left"))
                    if retitled:
                        changes.append({
                            "block_id": block["id"], "field": "left",
                            "before": block["left"], "after": retitled,
                        })
                        block["left"] = retitled

                key = "items" if block["type"] == "bullets" else "bullets"
                originals = block[key]
                incoming = new.get(key)
                # The count must match exactly: a different number of bullets
                # reflows the document and can add a page.
                if not isinstance(incoming, list) or len(incoming) != len(originals):
                    continue
                for i, candidate in enumerate(incoming):
                    text = clean(candidate)
                    if text and text != originals[i]:
                        changes.append({
                            "block_id": block["id"], "index": i,
                            "before": originals[i], "after": text,
                        })
                        originals[i] = text

    return merged, changes


def layout_to_text(layout: dict) -> str:
    """Plain-text rendering, used to enrich the email-writing prompt."""
    parts = [layout.get("header", {}).get("name", ""), layout.get("header", {}).get("title", "")]
    for sec in layout.get("sections", []):
        if sec.get("heading"):
            parts.append(f"\n{sec['heading']}")
        for block in sec.get("blocks", []):
            if block["type"] == "paragraph":
                parts.append(block["text"])
            elif block["type"] == "labeled":
                parts.append(f"{block['label']} {block['text']}".strip())
            elif block["type"] == "bullets":
                parts.extend(block["items"])
            elif block["type"] == "entry":
                parts.append(f"{block['left']} {block['right']}".strip())
                if block.get("sub"):
                    parts.append(block["sub"])
                parts.extend(block["bullets"])
    return "\n".join(p for p in parts if p).strip()
