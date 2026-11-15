#!/usr/bin/env python3
"""Build questions.json + a readable preview from the plain-text question sources.

Source format (src/bank_*.md):
  @level N | slug | title | subtitle | from-to      level header (exam question range)
  @brief text                                        briefing bullet shown before the level
  ### type | examRefs | difficulty [| v]             question header; type = single | multi | order
  Q: question text
  * correct option          (single / multi)
  - wrong option            (single / multi)
  1. item in correct order  (order)
  E: explanation shown after every answer
"v" marks a question with figures that go out of date (update yearly).

Exam key points (src/exam_points.md):
  @exam N | clean title
  - key point
"""
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "out"

BANNED = re.compile(r"(?i:\ball of the above\b|\bnone of the above\b)|\b[Bb]oth [A-D] and [A-D]\b|\b[A-D] and [A-D]\b")
errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def parse_bank(paths):
    levels, questions = [], []
    level = None
    q = None

    def close_question():
        nonlocal q
        if q is None:
            return
        where = q["_where"]
        if not q.get("question"):
            err(where, "missing Q:")
        if not q.get("explanation"):
            err(where, "missing E:")
        opts = q["_opts"]
        if q["type"] == "single":
            if len(opts) != 4:
                err(where, f"single needs 4 options, has {len(opts)}")
            if sum(c for _, c in opts) != 1:
                err(where, "single needs exactly 1 correct option")
        elif q["type"] == "multi":
            if len(opts) != 5:
                err(where, f"multi needs 5 options, has {len(opts)}")
            n = sum(c for _, c in opts)
            if not 2 <= n <= 4:
                err(where, f"multi needs 2-4 correct options, has {n}")
        elif q["type"] == "order":
            if not 3 <= len(opts) <= 6:
                err(where, f"order needs 3-6 items, has {len(opts)}")
        texts = [t for t, _ in opts]
        if len(set(texts)) != len(texts):
            err(where, "duplicate option text")
        for t in texts + [q.get("question", "")]:
            if BANNED.search(t):
                err(where, f"shuffle-unsafe wording: {t!r}")
        ids = "abcdef"
        q["options"] = [{"id": ids[i], "text": t} for i, (t, _) in enumerate(opts)]
        if q["type"] == "order":
            q["correct"] = [o["id"] for o in q["options"]]  # source order = correct order
        else:
            q["correct"] = [ids[i] for i, (_, c) in enumerate(opts) if c]
        lo, hi = level["examRange"]
        for r in q["examRefs"]:
            if not lo <= r <= hi:
                err(where, f"examRef {r} outside level range {lo}-{hi}")
        # store options in a deterministic shuffled order, so the correct answer is never
        # always first in the file; ids keep the link to "correct"
        random.Random(q["id"]).shuffle(q["options"])
        del q["_opts"], q["_where"]
        questions.append(q)
        q = None

    for path in paths:
        for ln, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            where = f"{path.name}:{ln}"
            if not line:
                continue
            if line.startswith("@level"):
                close_question()
                parts = [p.strip() for p in line[len("@level"):].split("|")]
                n, slug, title, subtitle, rng = parts
                lo, hi = (int(x) for x in rng.split("-"))
                level = {"id": int(n), "slug": slug, "title": title, "subtitle": subtitle,
                         "examRange": [lo, hi], "briefing": []}
                levels.append(level)
            elif line.startswith("@brief"):
                level["briefing"].append(line[len("@brief"):].strip())
            elif line.startswith("###"):
                close_question()
                parts = [p.strip() for p in line[3:].split("|")]
                qtype, refs, diff = parts[0], parts[1], parts[2]
                if qtype not in ("single", "multi", "order"):
                    err(where, f"unknown type {qtype}")
                level_qs = [x for x in questions if x["level"] == level["id"]]
                q = {
                    "id": f"L{level['id']:02d}-{len(level_qs) + 1:03d}",
                    "level": level["id"],
                    "type": qtype,
                    "examRefs": [int(r) for r in refs.split(",")],
                    "difficulty": int(diff),
                    "volatile": len(parts) > 3 and parts[3] == "v",
                    "_opts": [],
                    "_where": where,
                }
            elif line.startswith("Q:"):
                q["question"] = line[2:].strip()
            elif line.startswith("E:"):
                q["explanation"] = line[2:].strip()
            elif line.startswith("* "):
                q["_opts"].append((line[2:].strip(), True))
            elif line.startswith("- "):
                q["_opts"].append((line[2:].strip(), False))
            elif re.match(r"^\d+\.\s", line) and q is not None:
                q["_opts"].append((re.sub(r"^\d+\.\s+", "", line), True))
            else:
                err(where, f"unparsed line: {line[:60]}")
    close_question()
    return levels, questions


def parse_exam(levels):
    raw = (SRC / "exam_raw.txt").read_text(encoding="utf-8")
    original = {}
    for line in raw.splitlines():
        m = re.match(r"^\s*(\d+)\.\s+(.*)$", line)
        if m:
            original[int(m.group(1))] = m.group(2).strip()
    exams, cur = {}, None
    path = SRC / "exam_points.md"
    for ln, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("@exam"):
            n, title = [p.strip() for p in line[len("@exam"):].split("|", 1)]
            cur = {"n": int(n), "title": title, "originalTitle": original.get(int(n), ""),
                   "keyPoints": []}
            exams[int(n)] = cur
        elif line.startswith("- "):
            cur["keyPoints"].append(line[2:].strip())
        else:
            err(f"{path.name}:{ln}", f"unparsed line: {line[:60]}")
    for n in range(1, 111):
        if n not in exams:
            err("exam_points.md", f"missing exam question {n}")
        elif not 2 <= len(exams[n]["keyPoints"]) <= 6:
            err("exam_points.md", f"exam {n} has {len(exams[n]['keyPoints'])} key points")
        if n not in original:
            err("exam_raw.txt", f"missing original title {n}")
    for e in exams.values():
        e["level"] = next(l["id"] for l in levels
                          if l["examRange"][0] <= e["n"] <= l["examRange"][1])
    return [exams[n] for n in sorted(exams)]


def main():
    parts = sorted(SRC.glob("bank_part*.md"))
    levels, questions = parse_bank(parts)
    exams = parse_exam(levels) if (SRC / "exam_points.md").exists() else []

    # coverage: every exam question should be trained by at least one quiz question
    covered = {r for q in questions for r in q["examRefs"]}
    for lvl in levels:
        for n in range(lvl["examRange"][0], lvl["examRange"][1] + 1):
            if n not in covered:
                err("coverage", f"exam question {n} has no quiz question")
    seen = {}
    for q in questions:
        key = q["question"].lower()
        if key in seen:
            err(q["id"], f"duplicate question text with {seen[key]}")
        seen[key] = q["id"]
    for e in exams:
        e["quizQuestionIds"] = [q["id"] for q in questions if e["n"] in q["examRefs"]]

    if errors:
        print("ERRORS:")
        print("\n".join(errors))
        sys.exit(1)

    bank = {
        "schemaVersion": 1,
        "dataAsOf": "2026-11",
        "language": "en",
        "levels": levels,
        "finalExam": {"title": "Final Exam", "subtitle": "All topics, balanced random sample",
                      "questionsPerLevel": 3},
        "questions": questions,
        "examQuestions": exams,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / "questions.json").write_text(json.dumps(bank, ensure_ascii=False, indent=2),
                                        encoding="utf-8", newline="\n")
    write_preview(bank)

    by_type = {}
    for q in questions:
        by_type[q["type"]] = by_type.get(q["type"], 0) + 1
    print(f"OK: {len(levels)} levels, {len(questions)} questions {by_type}, "
          f"{sum(q['volatile'] for q in questions)} volatile, {len(exams)} exam questions")
    for lvl in levels:
        n = sum(1 for q in questions if q["level"] == lvl["id"])
        print(f"  L{lvl['id']:02d} {lvl['title']:<24} {n:>3} questions  exam Q{lvl['examRange'][0]}-{lvl['examRange'][1]}")


def write_preview(bank):
    lines = ["# World Economy Quiz — question bank (preview)", "",
             f"Data as of {bank['dataAsOf']}. Correct answers are marked ✅. "
             "Questions marked 🔄 contain figures that should be updated every year.", ""]
    exams = {e["n"]: e for e in bank["examQuestions"]}
    for lvl in bank["levels"]:
        qs = [q for q in bank["questions"] if q["level"] == lvl["id"]]
        lines += [f"## Level {lvl['id']} · {lvl['title']} — {lvl['subtitle']}",
                  f"Exam questions {lvl['examRange'][0]}–{lvl['examRange'][1]} · {len(qs)} quiz questions", "",
                  "**Briefing**", ""] + [f"- {b}" for b in lvl["briefing"]] + [""]
        for q in qs:
            refs = ", ".join(f"Q{r}" for r in q["examRefs"])
            flag = " 🔄" if q["volatile"] else ""
            kind = {"single": "one answer", "multi": "select all", "order": "put in order"}[q["type"]]
            lines.append(f"**{q['id']}** · {kind} · difficulty {q['difficulty']} · exam {refs}{flag}  ")
            lines.append(q["question"])
            lines.append("")
            if q["type"] == "order":
                text = {o["id"]: o["text"] for o in q["options"]}
                for i, oid in enumerate(q["correct"], 1):
                    lines.append(f"{i}. {text[oid]}")
            else:
                for o in q["options"]:
                    mark = "✅" if o["id"] in q["correct"] else "▫️"
                    lines.append(f"- {mark} {o['text']}")
            lines += ["", f"> {q['explanation']}", ""]
    if exams:
        lines += ["## Exam questions — key points (oral practice mode)", ""]
        for n in sorted(exams):
            e = exams[n]
            lines.append(f"**{n}. {e['title']}**")
            lines += [f"- {p}" for p in e["keyPoints"]] + [""]
    (OUT / "questions_preview.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
