"""Staged import of the 111-profession catalog (профессии.xlsx, sheet Профессии).

Builds lib/t-skills/teen/content.careers-v2.json + content.careers-v2.kk.json from:
- items75/stage2/traits/values/subjects copied verbatim from content.v2* (NOT re-edited),
- professions replaced by the 111 xlsx rows.
IDs are kept verbatim (p001..p170 with gaps), never renumbered.
Weights: xlsx integers ±1/±2 divided by 2 (same conversion as the combat
algorithm uses for the 170-bank; see scripts/convert-teen-bank.py).
KK: carried over by content identity (unchanged ids verbatim; relocated ids
follow their content from the source old id); p036 title/description flagged
in careers-v3.i18n.json. Nothing here is wired to the runtime: no changes to
versions.ts, runtime.ts or drizzle migrations (staging only, no deploy).
"""
import json
import re
import sys

import openpyxl

ROOT = "/Users/nuras/Desktop/gallup 2"
XLSX = "/Users/nuras/Downloads/профессии.xlsx"

TRAIT_IDS = {
    "Любознательность": "curiosity",
    "Стратегическое мышление": "strategic-thinking",
    "Инновационность": "innovativeness",
    "Эстетическое чутьё": "aesthetic-sense",
    "Дисциплинированность": "discipline",
    "Ориентация на результат": "result-orientation",
    "Организатор": "organizer",
    "Надёжность": "reliability",
    "Стрессоустойчивость": "stress-resilience",
    "Адаптивность": "adaptability",
    "Самообладание": "composure",
    "Эмпатия": "empathy",
    "Гармонизатор": "harmonizer",
    "Командный игрок": "team-player",
    "Энергетик": "energizer",
    "Нетворкер": "networker",
    "Автономность": "autonomy",
    "Коммуникатор": "communicator",
    "Лидерство": "leadership",
    "Аналитический интерес": "analytical-interest",
    "Системность с данными": "data-systemizing",
    "Технический интерес": "technical-interest",
    "Творческое самовыражение": "creative-expression",
    "Предпринимательская жилка": "entrepreneurial-drive",
    "Упорство": "persistence",
}
SUBJECT_ALIASES = {
    "математика": "math", "физика": "physics", "химия": "chemistry", "биология": "biology",
    "география": "geography", "информатика": "informatics", "история": "history",
    "обществознание": "social-studies",
    "казахский язык и литература": "kazakh", "казахский": "kazakh",
    "русский язык и литература": "russian", "русский": "russian",
    "английский язык": "english", "английский": "english",
    "творческие предметы (изо, музыка)": "creative",
    "творческие предметы": "creative", "физическая культура": "pe",
    "педагогика": "pedagogy",
}
VALUE_ALIASES = {
    "стабильность": "stability", "доход": "income", "рост/развитие": "growth",
    "рост": "growth", "развитие": "growth", "автономия": "value-autonomy",
    "социальная польза": "social-impact", "творческая свобода": "creative-freedom",
    "статус": "status", "баланс работа/жизнь": "work-life-balance", "баланс": "work-life-balance",
}

issues: list = []


def parse_row(row):
    pid, title, sphere, klimov, edu, descr, wtext, subj, vals = row
    trait_weights = {}
    for m in re.finditer(r"([^;:]+?)\s*:\s*([+-]?\d+)", str(wtext or "")):
        name = m.group(1).strip()
        val = int(m.group(2))
        if name not in TRAIT_IDS:
            issues.append(f"{pid}: unknown trait {name!r}")
            continue
        if val not in (1, 2, -1, -2):
            issues.append(f"{pid}: unexpected weight {val}")
            continue
        trait_weights[TRAIT_IDS[name]] = val / 2.0  # combat conversion, unchanged
    subjects = []
    for part in str(subj or "").split(","):
        key = part.strip().lower()
        if not key:
            continue
        if key in SUBJECT_ALIASES:
            subjects.append(SUBJECT_ALIASES[key])
        else:
            issues.append(f"{pid}: unknown subject {part.strip()!r}")
    values = []
    for part in str(vals or "").split(","):
        key = part.strip().lower()
        if not key:
            continue
        if key in VALUE_ALIASES:
            values.append(VALUE_ALIASES[key])
        else:
            issues.append(f"{pid}: unknown value {part.strip()!r}")
    return {
        "id": pid, "title": str(title or "").strip(), "sphere": str(sphere or "").strip(),
        "klimovType": str(klimov or "").strip(), "education": str(edu or "").strip(),
        "description": str(descr or "").strip(), "traitWeights": trait_weights,
        "subjectTags": sorted(set(subjects)), "valueFit": sorted(set(values)),
    }


def main():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    rows = list(wb["Профессии"].iter_rows(values_only=True))
    assert list(rows[0]) == ["id", "Профессия", "Сфера", "Тип по Климову", "Образование",
                             "Чем занимается", "Веса качеств", "Бонус-предметы", "Ценности"], rows[0]
    parsed = [parse_row(r) for r in rows[1:]]
    ids = [p["id"] for p in parsed]
    assert len(parsed) == 111 and len(set(ids)) == 111 and all(ids), "id integrity"
    if issues:
        print("IMPORT ISSUES:")
        print("\n".join(sorted(set(issues))))
        sys.exit(1)

    with open(f"{ROOT}/lib/t-skills/teen/content.v2.json", encoding="utf-8") as f:
        base_ru = json.load(f)
    with open(f"{ROOT}/lib/t-skills/teen/content.v2.kk.json", encoding="utf-8") as f:
        base_kk = json.load(f)
    old_ru = {p["id"]: p for p in base_ru["professions"]}
    old_kk = {p["id"]: p for p in base_kk["professions"]}
    fields = ["title", "sphere", "klimovType", "education", "description",
              "traitWeights", "subjectTags", "valueFit"]

    def content_key(p):
        return json.dumps([p[f] for f in fields], sort_keys=True, ensure_ascii=False)

    old_ru_by_content: dict = {}
    old_kk_by_content: dict = {}
    for p in base_ru["professions"]:
        old_ru_by_content.setdefault(content_key(p), []).append(p["id"])
    for p in base_kk["professions"]:
        old_kk_by_content.setdefault(content_key(p), []).append(p["id"])

    kk_new = []
    unchanged, relocated, edited = [], [], []
    needs_translation: dict = {}
    for p in parsed:
        k = content_key({**p, "traitWeights": p["traitWeights"]})
        # match RU record against old RU content (traitWeights already /2 on both sides)
        same_id_same = p["id"] in old_ru and content_key(old_ru[p["id"]]) == k
        if same_id_same:
            unchanged.append(p["id"])
            kk_new.append({**old_kk[p["id"]], "id": p["id"]})
            continue
        # relocated: identical content under another old id -> carry its KK over
        src = old_ru_by_content.get(k, [])
        # p036-style edit: same id, changed fields -> keep old KK, flag changed text fields
        if p["id"] in old_ru and not src:
            edited.append(p["id"])
            flagged = [f for f in ("title", "description") if old_ru[p["id"]][f] != p[f]]
            needs_translation[p["id"]] = flagged or ["title", "description"]
            kk_new.append({**old_kk[p["id"]], "id": p["id"]})
        elif src:
            relocated.append({"to": p["id"], "from": src})
            # KK follows the content: translation of this exact content lives under src id
            src_kk = [old_kk[s] for s in src if s in old_kk]
            assert src_kk, f"no KK source for relocated {p['id']}"
            kk_new.append({**src_kk[0], "id": p["id"]})
        else:
            edited.append(p["id"])
            needs_translation.setdefault(p["id"], ["title", "description", "sphere", "education"])
            kk_new.append({**{f: old_kk.get(p["id"], {}).get(f, "") for f in
                              ("title", "sphere", "klimovType", "education", "description")},
                           "id": p["id"], "traitWeights": p["traitWeights"],
                           "subjectTags": p["subjectTags"], "valueFit": p["valueFit"]})

    ru_bundle = {**base_ru, "professions": parsed}
    kk_bundle = {**base_kk, "professions": kk_new}
    with open(f"{ROOT}/lib/t-skills/teen/content.careers-v2.json", "w", encoding="utf-8") as f:
        json.dump(ru_bundle, f, ensure_ascii=False, indent=1)
        f.write("\n")
    with open(f"{ROOT}/lib/t-skills/teen/content.careers-v2.kk.json", "w", encoding="utf-8") as f:
        json.dump(kk_bundle, f, ensure_ascii=False, indent=1)
        f.write("\n")

    old_ids = set(old_ru)
    new_ids = set(ids)
    sidecar = {
        "careerCatalogVersion": "t-skills-teen-careers-v2",
        "source": "профессии.xlsx / лист Профессии (111 записей)",
        "weightConversion": "xlsx ±1/±2 divided by 2 (same as combat algorithm)",
        "counts": {"new": len(parsed), "unchanged": len(unchanged), "relocated": len(relocated),
                   "edited": len(edited), "excluded": len(old_ids - new_ids)},
        "unchanged": sorted(unchanged),
        "relocated": relocated,
        "edited": edited,
        "excluded": sorted(old_ids - new_ids),
        "kkCarryOver": "by content identity for relocated; verbatim by id for unchanged",
        "needsTranslation": needs_translation,
    }
    with open(f"{ROOT}/lib/t-skills/teen/careers-v3.i18n.json", "w", encoding="utf-8") as f:
        json.dump(sidecar, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote content.careers-v2.json + content.careers-v2.kk.json: {len(parsed)} professions; "
          f"unchanged={len(unchanged)} relocated={len(relocated)} edited={edited} "
          f"excluded={len(old_ids - new_ids)} needsTranslation={needs_translation}")


main()
