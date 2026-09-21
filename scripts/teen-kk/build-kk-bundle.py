"""Сборка content.v1.kk.json из RU-бандла + kk-переводов.
Структура, ID, коды, веса — из RU-бандла без изменений; меняются только тексты.
Запуск: /tmp/docxenv/bin/python scripts/teen-kk/build-kk-bundle.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KK = ROOT / "scripts" / "teen-kk"

ru = json.loads((ROOT / "lib" / "t-skills" / "teen" / "content.v1.json").read_text(encoding="utf-8"))
glossary = json.loads((KK / "glossary.kk.json").read_text(encoding="utf-8"))
fields = json.loads((KK / "professions-fields-kk.json").read_text(encoding="utf-8"))

items = {}
for part in sorted(KK.glob("items-kk-*.json")):
    items.update(json.loads(part.read_text(encoding="utf-8")))
stage2 = {}
for part in sorted(KK.glob("stage2-kk-*.json")):
    stage2.update(json.loads(part.read_text(encoding="utf-8")))
profs = {}
for part in sorted(KK.glob("professions-kk-*.json")):
    profs.update(json.loads(part.read_text(encoding="utf-8")))

issues = []

kk_items = []
for it in ru["items75"]:
    key = str(it["n"])
    if key not in items:
        issues.append(f"items75: missing translation n={key}")
        continue
    kk_items.append({**it, "leftText": items[key]["left"], "rightText": items[key]["right"]})

kk_stage2 = []
for q in ru["stage2"]:
    trait = q["trait"]
    if trait not in stage2:
        issues.append(f"stage2: missing translation {trait}")
        continue
    t = stage2[trait]
    opts = []
    for o in q["options"]:
        if o["id"] not in t:
            issues.append(f"stage2: missing option {trait}/{o['id']}")
            continue
        opts.append({**o, "text": t[o["id"]]})
    kk_stage2.append({**q, "scenario": t["scenario"], "options": opts})

kk_profs = []
for p in ru["professions"]:
    pid = p["id"]
    if pid not in profs:
        issues.append(f"professions: missing translation {pid}")
        continue
    sphere = fields["spheres"].get(p["sphere"])
    edu = fields["edu"].get(p["education"])
    klimov = fields["klimov"].get(p["klimovType"])
    if sphere is None:
        issues.append(f"professions: missing sphere '{p['sphere']}'")
    if edu is None:
        issues.append(f"professions: missing edu '{p['education']}'")
    if klimov is None:
        issues.append(f"professions: missing klimov '{p['klimovType']}'")
    kk_profs.append({
        **p,
        "title": profs[pid]["title"],
        "sphere": sphere or p["sphere"],
        "klimovType": klimov or p["klimovType"],
        "education": edu or p["education"],
        "description": profs[pid]["description"],
    })

bundle = {
    **ru,
    "status": "DRAFT-UNAPPROVED-KK",
    "locale": "kk",
    "translationVersion": "kk-draft-v1",
    "traits": [{"id": t["id"], "ru": glossary["traits"][t["id"]]} for t in ru["traits"]],
    "values": [{"id": v["id"], "ru": glossary["values"][v["id"]]} for v in ru["values"]],
    "subjects": [{"id": s["id"], "ru": glossary["subjects"][s["id"]]} for s in ru["subjects"]],
    "items75": kk_items,
    "stage2": kk_stage2,
    "professions": kk_profs,
}

out = ROOT / "lib" / "t-skills" / "teen" / "content.v1.kk.json"
out.write_text(json.dumps(bundle, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"items: {len(kk_items)}/75 | stage2: {len(kk_stage2)}/25 | profs: {len(kk_profs)}/170")
print(f"issues: {len(issues)}")
for i in issues[:20]:
    print(" -", i)
