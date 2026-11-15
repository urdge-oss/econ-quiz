#!/usr/bin/env python3
"""Build every course's question bank (JSON for the app + a readable preview).

Layout:
  content/courses/<courseId>/course.json      course metadata (title, emoji, exam size, final exam, answer framework)
  content/courses/<courseId>/src/bank_part*.md quiz questions (format below)
  content/courses/<courseId>/src/exam_points.md key points for oral practice mode
  content/courses/<courseId>/src/exam_raw.txt   original exam wording, one "N. text" per line
  content/courses/<courseId>/src/charts.json    optional graphs (see make_charts.py)

Output (default --out content/out, the app uses --out public/data):
  <out>/courses.json              index of courses for the home screen
  <out>/courses/<courseId>.json   one course: levels, questions, charts, exam questions
  content/courses/<courseId>/questions_preview.md

Bank format (bank_part*.md):
  @level N | slug | title | subtitle | from-to      level header (exam question range)
  @brief text                                        briefing bullet shown before the level
  ### type | examRefs | difficulty [| flags]         type = single | multi | order
        flags (space or | separated): v = volatile figures, chart=<chartId> = show this graph
  Q: question text
  * correct option          (single: 4 options, 1 correct; multi: 5 options, 2-4 correct)
  - wrong option
  1. item in correct order  (order: 3-6 items)
  E: explanation shown after every answer

Exam points (exam_points.md):
  @exam N | clean title [| problem]                  "problem" = a calculation task
  - key point                                        2-6 per question
  = formula                                          optional, 0-4 per question
  > what to draw [chart:<chartId>]                   optional graph hint (+ model graph)
"""
import argparse
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANNED = re.compile(r"(?i:\ball of the above\b|\bnone of the above\b)|\b[Bb]oth [A-D] and [A-D]\b|\b[A-D] and [A-D]\b")
errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def parse_bank(cid, paths, chart_ids):
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
        if q["chart"] and q["chart"] not in chart_ids:
            err(where, f"unknown chart {q['chart']}")
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
        # deterministic shuffle so the correct answer is never always first in the file
        random.Random(q["id"]).shuffle(q["options"])
        del q["_opts"], q["_where"]
        questions.append(q)
        q = None

    for path in paths:
        for ln, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            where = f"{cid}/{path.name}:{ln}"
            if not line or line.startswith("//"):
                continue
            if line.startswith("@level"):
                close_question()
                n, slug, title, subtitle, rng = [p.strip() for p in line[len("@level"):].split("|")]
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
                flags = " ".join(parts[3:]).split()
                if qtype not in ("single", "multi", "order"):
                    err(where, f"unknown type {qtype}")
                chart = None
                for f in flags:
                    if f.startswith("chart="):
                        chart = f[len("chart="):]
                    elif f != "v":
                        err(where, f"unknown flag {f}")
                level_qs = [x for x in questions if x["level"] == level["id"]]
                q = {
                    "id": f"L{level['id']:02d}-{len(level_qs) + 1:03d}",
                    "level": level["id"],
                    "type": qtype,
                    "examRefs": [int(r) for r in refs.split(",")],
                    "difficulty": int(diff),
                    "volatile": "v" in flags,
                    "chart": chart,
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


def parse_exam(cid, src, levels, count, chart_ids):
    original = {}
    raw_path = src / "exam_raw.txt"
    if raw_path.exists():
        for line in raw_path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^\s*(\d+)\.\s+(.*)$", line)
            if m:
                original[int(m.group(1))] = m.group(2).strip()
    exams, cur = {}, None
    path = src / "exam_points.md"
    for ln, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        where = f"{cid}/{path.name}:{ln}"
        if not line or line.startswith("//"):
            continue
        if line.startswith("@exam"):
            parts = [p.strip() for p in line[len("@exam"):].split("|")]
            n = int(parts[0])
            cur = {"n": n, "title": parts[1], "originalTitle": original.get(n, ""),
                   "problem": len(parts) > 2 and parts[2] == "problem",
                   "keyPoints": [], "formulas": [], "draw": None, "chart": None}
            exams[n] = cur
        elif line.startswith("- "):
            cur["keyPoints"].append(line[2:].strip())
        elif line.startswith("= "):
            cur["formulas"].append(line[2:].strip())
        elif line.startswith("> "):
            text = line[2:].strip()
            m = re.search(r"\s*\[chart:(\w+)\]\s*$", text)
            if m:
                cur["chart"] = m.group(1)
                text = text[:m.start()].strip()
                if cur["chart"] not in chart_ids:
                    err(where, f"unknown chart {cur['chart']}")
            cur["draw"] = text
        else:
            err(where, f"unparsed line: {line[:60]}")
    for n in range(1, count + 1):
        if n not in exams:
            err(f"{cid}/exam_points.md", f"missing exam question {n}")
            continue
        if not 2 <= len(exams[n]["keyPoints"]) <= 6:
            err(f"{cid}/exam_points.md", f"exam {n} has {len(exams[n]['keyPoints'])} key points")
        if len(exams[n]["formulas"]) > 4:
            err(f"{cid}/exam_points.md", f"exam {n} has more than 4 formulas")
        if n not in original:
            err(f"{cid}/exam_raw.txt", f"missing original title {n}")
    for e in exams.values():
        e["level"] = next(l["id"] for l in levels if l["examRange"][0] <= e["n"] <= l["examRange"][1])
    return [exams[n] for n in sorted(exams)]


def check_charts(cid, charts):
    ids = set()
    for c in charts:
        where = f"{cid}/charts.json:{c.get('id')}"
        if c["id"] in ids:
            err(where, "duplicate chart id")
        ids.add(c["id"])
        xm, ym = c["x"]["max"], c["y"]["max"]
        def inside(p):
            return -1e-9 <= p[0] <= xm + 1e-9 and -1e-9 <= p[1] <= ym + 1e-9
        for cv in c["curves"]:
            if len(cv["points"]) < 2:
                err(where, f"curve {cv['label']!r} needs 2+ points")
            if not all(inside(p) for p in cv["points"]):
                err(where, f"curve {cv['label']!r} leaves the plot area")
        for a in c["areas"]:
            if len(a["polygon"]) < 3 or not all(inside(p) for p in a["polygon"]):
                err(where, f"area {a['label']!r} is not a valid polygon inside the plot")
    return ids


def build_course(course_dir, out):
    meta = json.loads((course_dir / "course.json").read_text(encoding="utf-8"))
    cid, src = meta["id"], course_dir / "src"
    chart_path = src / "charts.json"
    charts = json.loads(chart_path.read_text(encoding="utf-8")) if chart_path.exists() else []
    chart_ids = check_charts(cid, charts)
    levels, questions = parse_bank(cid, sorted(src.glob("bank_part*.md")), chart_ids)
    count = meta["examQuestionCount"]
    exams = parse_exam(cid, src, levels, count, chart_ids) if (src / "exam_points.md").exists() else []

    # levels must tile 1..count without gaps; every exam question needs a quiz question
    expected = 1
    for lvl in levels:
        if lvl["examRange"][0] != expected:
            err(cid, f"level {lvl['id']} starts at {lvl['examRange'][0]}, expected {expected}")
        expected = lvl["examRange"][1] + 1
    if levels and expected != count + 1:
        err(cid, f"levels end at {expected - 1}, expected {count}")
    covered = {r for q in questions for r in q["examRefs"]}
    for n in range(1, count + 1):
        if n not in covered:
            err(cid, f"exam question {n} has no quiz question")
    seen = {}
    for q in questions:
        key = q["question"].lower()
        if key in seen:
            err(f"{cid}/{q['id']}", f"duplicate question text with {seen[key]}")
        seen[key] = q["id"]
    for e in exams:
        e["quizQuestionIds"] = [q["id"] for q in questions if e["n"] in q["examRefs"]]
    used = {q["chart"] for q in questions if q["chart"]} | {e["chart"] for e in exams if e["chart"]}
    unused = chart_ids - used

    bank = {
        "schemaVersion": 2,
        "course": {k: meta[k] for k in ("id", "title", "subtitle", "emoji", "answerFramework")},
        "dataAsOf": meta["dataAsOf"],
        "language": meta["language"],
        "levels": levels,
        "finalExam": meta["finalExam"],
        "charts": charts,
        "questions": questions,
        "examQuestions": exams,
    }
    return meta, bank, unused


def stats(bank):
    singles = [q for q in bank["questions"] if q["type"] == "single"]
    longest = 0
    for q in singles:
        lens = {o["id"]: len(o["text"]) for o in q["options"]}
        c = q["correct"][0]
        if lens[c] > max(v for k, v in lens.items() if k != c):
            longest += 1
    multi = {}
    for q in bank["questions"]:
        if q["type"] == "multi":
            multi[len(q["correct"])] = multi.get(len(q["correct"]), 0) + 1
    by_type = {}
    for q in bank["questions"]:
        by_type[q["type"]] = by_type.get(q["type"], 0) + 1
    share = longest / len(singles) if singles else 0
    return by_type, share, dict(sorted(multi.items()))


def write_preview(course_dir, bank):
    c = bank["course"]
    lines = [f"# {c['emoji']} {c['title']} Quiz — question bank (preview)", "",
             f"Data as of {bank['dataAsOf']}. Correct answers are marked ✅. "
             "🔄 = figures to update every year. 📊 = the question shows a graph (see the chart list at the end).", ""]
    for lvl in bank["levels"]:
        qs = [q for q in bank["questions"] if q["level"] == lvl["id"]]
        lines += [f"## Level {lvl['id']} · {lvl['title']} — {lvl['subtitle']}",
                  f"Exam questions {lvl['examRange'][0]}–{lvl['examRange'][1]} · {len(qs)} quiz questions", "",
                  "**Briefing**", ""] + [f"- {b}" for b in lvl["briefing"]] + [""]
        for q in qs:
            refs = ", ".join(f"Q{r}" for r in q["examRefs"])
            flag = (" 🔄" if q["volatile"] else "") + (f" 📊 {q['chart']}" if q["chart"] else "")
            kind = {"single": "one answer", "multi": "select all", "order": "put in order"}[q["type"]]
            lines.append(f"**{q['id']}** · {kind} · difficulty {q['difficulty']} · exam {refs}{flag}  ")
            lines += [q["question"], ""]
            if q["type"] == "order":
                text = {o["id"]: o["text"] for o in q["options"]}
                lines += [f"{i}. {text[oid]}" for i, oid in enumerate(q["correct"], 1)]
            else:
                lines += [f"- {'✅' if o['id'] in q['correct'] else '▫️'} {o['text']}" for o in q["options"]]
            lines += ["", f"> {q['explanation']}", ""]
    if bank["examQuestions"]:
        lines += ["## Exam questions — oral practice cards", ""]
        for e in bank["examQuestions"]:
            tag = " · 🧮 calculation task" if e["problem"] else ""
            lines.append(f"**{e['n']}. {e['title']}**{tag}")
            lines += [f"- {p}" for p in e["keyPoints"]]
            lines += [f"- 🧮 `{f}`" for f in e["formulas"]]
            if e["draw"]:
                lines.append(f"- ✏️ Draw: {e['draw']}" + (f" (📊 {e['chart']})" if e["chart"] else ""))
            lines.append("")
    if bank["charts"]:
        lines += ["## Charts", ""]
        for ch in bank["charts"]:
            curves = ", ".join(cv["label"] for cv in ch["curves"] if cv["label"])
            areas = ", ".join(a["label"] for a in ch["areas"])
            lines.append(f"- **{ch['id']}** — {ch['title']}. Curves: {curves}." + (f" Areas: {areas}." if areas else "")
                         + (" " + " ".join(ch["notes"]) if ch["notes"] else ""))
    (course_dir / "questions_preview.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "out"), help="output folder (the app uses public/data)")
    ap.add_argument("--course", help="build only this course id")
    args = ap.parse_args()
    out = Path(args.out)
    course_dirs = sorted(p.parent for p in (ROOT / "courses").glob("*/course.json"))
    built = []
    for d in course_dirs:
        if args.course and json.loads((d / "course.json").read_text(encoding="utf-8"))["id"] != args.course:
            continue
        built.append((d, *build_course(d, out)))
    if errors:
        print("ERRORS:")
        print("\n".join(errors))
        sys.exit(1)
    (out / "courses").mkdir(parents=True, exist_ok=True)
    index = {"schemaVersion": 2, "courses": []}
    for d, meta, bank, unused in sorted(built, key=lambda b: b[1]["order"]):
        (out / "courses" / f"{meta['id']}.json").write_text(
            json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
        write_preview(d, bank)
        index["courses"].append({
            "id": meta["id"], "title": meta["title"], "subtitle": meta["subtitle"], "emoji": meta["emoji"],
            "file": f"courses/{meta['id']}.json", "dataAsOf": meta["dataAsOf"],
            "levels": len(bank["levels"]), "questions": len(bank["questions"]),
            "examQuestions": len(bank["examQuestions"]),
        })
        by_type, share, multi = stats(bank)
        print(f"OK {meta['id']}: {len(bank['levels'])} levels, {len(bank['questions'])} questions {by_type}, "
              f"{sum(q['volatile'] for q in bank['questions'])} volatile, "
              f"{sum(1 for q in bank['questions'] if q['chart'])} with charts, {len(bank['examQuestions'])} exam questions")
        print(f"   correct option is the longest in {share:.0%} of single questions; multi correct counts {multi}")
        if unused:
            print(f"   note: charts not used yet: {sorted(unused)}")
        for lvl in bank["levels"]:
            n = sum(1 for q in bank["questions"] if q["level"] == lvl["id"])
            print(f"   L{lvl['id']:02d} {lvl['title']:<24} {n:>3} q  exam Q{lvl['examRange'][0]}-{lvl['examRange'][1]}")
    if not args.course:
        (out / "courses.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
