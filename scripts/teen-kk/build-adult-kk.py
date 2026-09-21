"""Сборка lib/adult-kk.json из переводов scripts/teen-kk/adult-*.json.
Ключи: пары TS001..TS067, фолбэк-индексы, legacy T01..T30.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KK = ROOT / "scripts" / "teen-kk"

pairs = {}
for part in sorted(KK.glob("adult-kk-*.json")):
    pairs.update(json.loads(part.read_text(encoding="utf-8")))
fallback = json.loads((KK / "adult-fallback-kk.json").read_text(encoding="utf-8"))
traits = {}
for part in sorted(KK.glob("legacy-traits-kk-*.json")):
    traits.update(json.loads(part.read_text(encoding="utf-8")))

issues = []
out_pairs = {}
for n in range(1, 68):
    key = str(n)
    if key not in pairs:
        issues.append(f"pairs: missing {n}")
        continue
    out_pairs[f"TS{n:03d}"] = pairs[key]

print(f"pairs: {len(out_pairs)}/67 | fallback: {len(fallback)}/24 | traits: {len(traits)}/30")
print(f"issues: {len(issues)}")
for i in issues:
    print(" -", i)

bundle = {
    "status": "DRAFT-UNREVIEWED",
    "locale": "kk",
    "translationVersion": "kk-draft-v1",
    "pairs": out_pairs,
    "fallback": fallback,
    "fallbackPrompt": "Осы жұмыс жағдайында саған әдетте қайсысы жақынырақ?",
    "legacyTraits": traits,
}
(ROOT / "lib" / "adult-kk.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=1), encoding="utf-8")
print("written lib/adult-kk.json")
