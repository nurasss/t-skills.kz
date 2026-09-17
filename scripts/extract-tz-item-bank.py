"""Extract the authoritative T-Skills item bank from the supplied DOCX.

This is a build-time/provenance helper, not runtime application code. The
generated TypeScript keeps the draft item pool traceable to the source TZ.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from docx import Document


def cell(row, index: int) -> str:
    return row.cells[index].text.strip().replace("\n", " ")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    document = Document(args.source)

    traits = []
    for table_index in range(1, 7):
        table = document.tables[table_index]
        for row in table.rows[1:]:
            traits.append(
                {
                    "code": cell(row, 0),
                    "name": cell(row, 1),
                    "internalEn": cell(row, 2),
                    "definition": cell(row, 3),
                    "overuseRisk": cell(row, 4),
                }
            )

    items = []
    for row in document.tables[15].rows[1:]:
        items.append(
            {
                "id": cell(row, 0),
                "type": "forced",
                "leftTrait": cell(row, 1).split(" ", 1)[0],
                "left": cell(row, 2),
                "rightTrait": cell(row, 3).split(" ", 1)[0],
                "right": cell(row, 4),
            }
        )

    for row in document.tables[16].rows[1:]:
        items.append(
            {
                "id": cell(row, 0),
                "type": "likert",
                "trait": cell(row, 1).split(" ", 1)[0],
                "text": cell(row, 2),
                "reverse": cell(row, 3).lower() == "reverse",
            }
        )

    for row in document.tables[17].rows[1:]:
        rule = cell(row, 3)
        expected = None
        if rule.startswith("expected="):
            expected = int(rule.split("=", 1)[1])
        items.append(
            {
                "id": cell(row, 0),
                "type": "quality",
                "qualityKind": cell(row, 1),
                "text": cell(row, 2),
                "expected": expected,
                "rule": rule,
            }
        )

    for row in document.tables[18].rows[1:]:
        items.append(
            {
                "id": cell(row, 0),
                "type": "adaptive_likert",
                "trait": cell(row, 1).split(" ", 1)[0],
                "text": cell(row, 2),
            }
        )

    for row in document.tables[19].rows[1:]:
        left_trait, right_trait = [part.strip() for part in cell(row, 1).split("↔")]
        items.append(
            {
                "id": cell(row, 0),
                "type": "adaptive_forced",
                "leftTrait": left_trait,
                "rightTrait": right_trait,
                "prompt": cell(row, 2),
                "left": cell(row, 3),
                "right": cell(row, 4),
            }
        )

    output = "// Generated from Strength_Assessment_Full_TZ.docx. Draft for pilot.\n"
    output += "// Do not treat this item pool as validated production content.\n\n"
    output += "export const TRAITS = " + json.dumps(traits, ensure_ascii=False, indent=2) + " as const;\n\n"
    output += "export const ITEM_BANK = " + json.dumps(items, ensure_ascii=False, indent=2) + " as const;\n\n"
    output += "export type TraitCode = (typeof TRAITS)[number][\"code\"];\n"
    output += "export type Item = (typeof ITEM_BANK)[number];\n"

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output, encoding="utf-8")
    print(json.dumps({"traits": len(traits), "items": len(items), "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
