"""
Tests for the layout guarantee.

The promise of the tailoring feature is that the optimized CV is the user's own
document with better wording — same sections, same order, same dates, same
number of bullets. `apply_rewrite` is where that promise is kept or broken, so
these check that a well-behaved model's edits land and a misbehaving one's are
discarded rather than trusted.

Run: python -m pytest test_layout.py   (or: python test_layout.py)
"""

import copy

from layout import apply_rewrite, editable_view, derive_layout  # noqa: F401


def sample_layout() -> dict:
    return {
        "page_size": [595, 842],
        "page_count": 1,
        "fonts": {"body": {"size": 9.0}, "name": {"size": 17}, "heading": {"size": 12}},
        "header": {"name": "Nikita Sah", "title": "Business Analyst", "contact_lines": [], "extra_lines": [], "align": "center"},
        "sections": [
            {"id": "s1", "heading": "Professional Profile", "blocks": [
                {"type": "paragraph", "id": "b1", "text": "Business Analyst with 7+ years experience."},
            ]},
            {"id": "s2", "heading": "Core Skills", "blocks": [
                {"type": "labeled", "id": "b2", "label": "Process Analysis:", "text": "BPMN, Visio, AS-IS/TO-BE"},
            ]},
            {"id": "s3", "heading": "Professional Experience", "blocks": [
                {"type": "entry", "id": "b3", "left": "Product Analyst | Barclays PLC",
                 "right": "Dec 2025 - Present", "sub": "Bournemouth, UK",
                 "bullets": ["Gathered requirements.", "Produced process maps.", "Supported UAT."]},
            ]},
            {"id": "s4", "heading": "Achievements", "blocks": [
                {"type": "bullets", "id": "b4", "items": ["PMI-ACP certified.", "Lean Six Sigma Green Belt."]},
            ]},
        ],
    }


def test_valid_rewrite_is_applied():
    layout = sample_layout()
    merged, changes = apply_rewrite(layout, {"sections": [
        {"id": "s1", "blocks": [{"id": "b1", "text": "Business Analyst with 7+ years in regulated finance."}]},
        {"id": "s2", "blocks": [{"id": "b2", "text": "AS-IS/TO-BE, BPMN, Visio"}]},
        {"id": "s3", "blocks": [{"id": "b3", "bullets": ["Elicited requirements.", "Mapped processes.", "Ran UAT."]}]},
        {"id": "s4", "blocks": [{"id": "b4", "items": ["PMI-ACP.", "Green Belt."]}]},
    ]})

    assert merged["sections"][0]["blocks"][0]["text"].endswith("regulated finance.")
    assert merged["sections"][2]["blocks"][0]["bullets"][2] == "Ran UAT."
    assert len(changes) == 7


def test_structure_is_never_altered():
    layout = sample_layout()
    merged, _ = apply_rewrite(layout, {"sections": [
        {"id": "s1", "blocks": [{"id": "b1", "text": "Rewritten."}]},
    ]})

    assert [s["id"] for s in merged["sections"]] == [s["id"] for s in layout["sections"]]
    assert [s["heading"] for s in merged["sections"]] == [s["heading"] for s in layout["sections"]]
    for original, new in zip(layout["sections"], merged["sections"]):
        assert len(original["blocks"]) == len(new["blocks"])


def test_invented_sections_and_blocks_are_ignored():
    layout = sample_layout()
    merged, changes = apply_rewrite(layout, {"sections": [
        {"id": "s99", "heading": "Invented Section", "blocks": [{"id": "b99", "text": "Made up."}]},
    ]})
    assert changes == []
    assert merged == layout


def test_bullet_count_mismatch_is_rejected_wholesale():
    # A different bullet count reflows the document and can add a page, so the
    # whole block is left alone rather than partially applied.
    layout = sample_layout()
    merged, changes = apply_rewrite(layout, {"sections": [
        {"id": "s3", "blocks": [{"id": "b3", "bullets": ["Only one bullet now."]}]},
    ]})
    assert changes == []
    assert merged["sections"][2]["blocks"][0]["bullets"] == layout["sections"][2]["blocks"][0]["bullets"]


def test_locked_fields_cannot_be_changed():
    # Dates, employers and headings are facts. Even when the model returns new
    # values for them, the originals must survive.
    layout = sample_layout()
    merged, _ = apply_rewrite(layout, {"sections": [
        {"id": "s3", "heading": "Work History", "blocks": [{
            "id": "b3", "left": "Senior Director | Goldman Sachs",
            "right": "Jan 2015 - Present", "sub": "New York, USA",
            "bullets": ["A.", "B.", "C."],
        }]},
    ]})

    entry = merged["sections"][2]["blocks"][0]
    assert entry["left"] == "Product Analyst | Barclays PLC"
    assert entry["right"] == "Dec 2025 - Present"
    assert entry["sub"] == "Bournemouth, UK"
    assert merged["sections"][2]["heading"] == "Professional Experience"


def test_empty_and_non_string_values_leave_the_original():
    layout = sample_layout()
    merged, changes = apply_rewrite(layout, {"sections": [
        {"id": "s1", "blocks": [{"id": "b1", "text": "   "}]},
        {"id": "s4", "blocks": [{"id": "b4", "items": [None, 42]}]},
    ]})
    assert changes == []
    assert merged == layout


def test_editable_view_hides_locked_fields():
    view = editable_view(sample_layout())
    entry = view["sections"][2]["blocks"][0]
    assert "right" not in entry and "sub" not in entry and "left" not in entry
    assert entry["role_context"] == "Product Analyst | Barclays PLC"
    assert "Nikita Sah" not in str(view)


def test_rewrite_does_not_mutate_the_stored_layout():
    layout = sample_layout()
    snapshot = copy.deepcopy(layout)
    apply_rewrite(layout, {"sections": [{"id": "s1", "blocks": [{"id": "b1", "text": "Changed."}]}]})
    assert layout == snapshot


if __name__ == "__main__":
    passed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            passed += 1
            print(f"ok - {name}")
    print(f"\n{passed} passed")
