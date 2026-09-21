"""Phase 1: convert customer teen-bank files into a candidate bundle + validation report.
Reads: 75-item docx, stage-2 docx, professions xlsx. Writes: /tmp/teen-bundle.json, prints report.
Mapping assumption (flagged to owner): weight +2 -> 1.0, +1 -> 0.5, absent -> 0.
"""
import json
import re
from docx import Document
import openpyxl

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

VALUES = [
    ("Стабильность", "stability"),
    ("Доход", "income"),
    ("Рост/развитие", "growth"),
    ("Автономия", "value-autonomy"),
    ("Социальная польза", "social-impact"),
    ("Творческая свобода", "creative-freedom"),
    ("Статус", "status"),
    ("Баланс работа/жизнь", "work-life-balance"),
]

SUBJECTS = [
    ("Математика", "math"),
    ("Физика", "physics"),
    ("Химия", "chemistry"),
    ("Биология", "biology"),
    ("География", "geography"),
    ("Информатика", "informatics"),
    ("История", "history"),
    ("Обществознание / Основы права", "social-studies"),
    ("Казахский язык и литература", "kazakh"),
    ("Русский язык и литература", "russian"),
    ("Английский язык", "english"),
    ("Творческие предметы (ИЗО, музыка)", "creative"),
    ("Физическая культура", "pe"),
]

SUBJECT_ALIASES = {
    "математика": "math", "физика": "physics", "химия": "chemistry", "биология": "biology",
    "география": "geography", "информатика": "informatics", "история": "history",
    "обществознание": "social-studies", "основы права": "social-studies",
    "казахский язык и литература": "kazakh", "казахский": "kazakh",
    "русский язык и литература": "russian", "русский": "russian",
    "английский язык": "english", "английский": "english",
    "творческие предметы (изо, музыка)": "creative", "изо": "creative", "музыка": "creative",
    "творческие предметы": "creative", "физическая культура": "pe",
}

VALUE_ALIASES = {
    "стабильность": "stability", "доход": "income", "рост/развитие": "growth",
    "рост": "growth", "развитие": "growth", "автономия": "value-autonomy",
    "социальная польза": "social-impact", "творческая свобода": "creative-freedom",
    "статус": "status", "баланс работа/жизнь": "work-life-balance", "баланс": "work-life-balance",
}

issues = []


def parse_75(path):
    d = Document(path)
    paras = [p.text.strip() for p in d.paragraphs if p.text.strip()]
    items = []
    cur = None
    for t in paras:
        m = re.match(r"^(\d+)\.\s*\[(.+?)\]$", t)
        if m:
            if cur:
                items.append(cur)
            ts = [x.strip() for x in m.group(2).split("/")]
            for tr in ts:
                if tr not in TRAIT_IDS:
                    issues.append(f"75: unknown trait '{tr}' in item {m.group(1)}")
            cur = {"n": int(m.group(1)), "leftTrait": TRAIT_IDS.get(ts[0]), "rightTrait": TRAIT_IDS.get(ts[1]), "leftText": "", "rightText": ""}
        elif re.match(r"^А\b", t) and cur is not None and not cur["leftText"]:
            cur["leftText"] = re.sub(r"^А(\s*\(Лево\))?:\s*", "", t)
        elif re.match(r"^Б\b", t) and cur is not None and not cur["rightText"]:
            cur["rightText"] = re.sub(r"^Б(\s*\(Право\))?:\s*", "", t)
    if cur:
        items.append(cur)
    return items


def parse_stage2(path):
    d = Document(path)
    paras = [p.text.strip() for p in d.paragraphs if p.text.strip()]
    out = []
    cur = None
    for t in paras:
        if t.startswith("Качество:"):
            if cur:
                out.append(cur)
            name = t.split(":", 1)[1].strip()
            if name not in TRAIT_IDS:
                issues.append(f"stage2: unknown trait '{name}'")
            cur = {"trait": TRAIT_IDS.get(name), "traitRu": name, "scenario": "", "options": []}
        elif t.startswith("Сценарий:") and cur is not None:
            cur["scenario"] = t.split(":", 1)[1].strip()
        else:
            m = re.match(r"^([ABCD])\s*\(([+-]\d)\):\s*(.+)$", t)
            if m and cur is not None:
                code = {"A": -2, "B": -1, "C": 1, "D": 2}[m.group(1)]
                if int(m.group(2)) != code:
                    issues.append(f"stage2: code mismatch {m.group(1)} vs {m.group(2)} in {cur['traitRu']}")
                cur["options"].append({"id": m.group(1), "value": code, "text": m.group(3).strip()})
    if cur:
        out.append(cur)
    return out


def parse_professions(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Профессии"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    out = []
    for r in rows:
        pid, title, sphere, klimov, edu, descr, weights, subjects, values = r[:9]
        weights = str(weights or "")
        trait_weights = {}
        for m in re.finditer(r"([^;:]+?)\s*:\s*([+-]?\d+)", weights):
            name = m.group(1).strip()
            val = int(m.group(2))
            if name not in TRAIT_IDS:
                issues.append(f"professions: unknown weight trait '{name}' in {pid}")
                continue
            if val not in (1, 2, -1, -2):
                issues.append(f"professions: unexpected weight {val} in {pid}")
            trait_weights[TRAIT_IDS[name]] = 1.0 if val >= 2 else 0.5
        subj = []
        for part in str(subjects or "").split(","):
            key = part.strip().lower()
            if not key:
                continue
            if key in SUBJECT_ALIASES:
                subj.append(SUBJECT_ALIASES[key])
            else:
                issues.append(f"professions: unknown subject '{part.strip()}' in {pid}")
        vals = []
        for part in str(values or "").split(","):
            key = part.strip().lower()
            if not key:
                continue
            if key in VALUE_ALIASES:
                vals.append(VALUE_ALIASES[key])
            else:
                issues.append(f"professions: unknown value '{part.strip()}' in {pid}")
        out.append({
            "id": pid, "title": str(title or "").strip(), "sphere": str(sphere or "").strip(),
            "klimovType": str(klimov or "").strip(), "education": str(edu or "").strip(),
            "description": str(descr or "").strip(), "traitWeights": trait_weights,
            "subjectTags": sorted(set(subj)), "valueFit": sorted(set(vals)),
        })
    return out


items75 = parse_75("/Users/nuras/Downloads/список 75 вопросов.docx")
stage2 = parse_stage2("/Users/nuras/Downloads/этап2_ситуативные_вопросы-2.docx")
profs = parse_professions("/Users/nuras/Downloads/career-test-professions-db-170-1.xlsx")

covered_traits = {t for p in profs for t in p["traitWeights"]}
missing_in_weights = [TRAIT_IDS[t] for t in TRAIT_IDS if TRAIT_IDS[t] not in covered_traits]
stage2_traits = [q["trait"] for q in stage2]

bundle = {
    "status": "DRAFT-UNAPPROVED",
    "traits": [{"id": v, "ru": k} for k, v in TRAIT_IDS.items()],
    "values": [{"id": v, "ru": k} for k, v in VALUES],
    "subjects": [{"id": v, "ru": k} for k, v in SUBJECTS],
    "items75": items75,
    "stage2": stage2,
    "professions": profs,
}
with open("/tmp/teen-bundle.json", "w", encoding="utf-8") as f:
    json.dump(bundle, f, ensure_ascii=False, indent=1)

print("=== VALIDATION REPORT ===")
print(f"75 items: {len(items75)} | incomplete: {[i['n'] for i in items75 if not i['leftText'] or not i['rightText']]}")
print(f"stage2: {len(stage2)} | traits covered: {len(set(stage2_traits))}/25 | options!=4: {[q['trait'] for q in stage2 if len(q['options']) != 4]}")
print(f"professions: {len(profs)} | traits covered in weights: {len(covered_traits)}/25")
print(f"traits NEVER weighted: {missing_in_weights}")
print(f"total issues: {len(issues)}")
seen = set()
for i in issues:
    key = i.split(" in ")[0]
    if key in seen:
        continue
    seen.add(key)
    print(" -", i)
print(f"(+{len(issues) - len(seen)} duplicate issue lines collapsed)")
