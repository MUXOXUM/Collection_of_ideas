#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCRIPT_DIR="$SCRIPT_DIR" python3 <<'PY'
import json
import os
from pathlib import Path


root = Path(os.environ["SCRIPT_DIR"])
js_output = root / "projects.js"


def format_title(folder_name: str) -> str:
    words = folder_name.replace("-", " ").replace("_", " ").split()
    formatted_words = []

    for word in words:
        if word == word.upper():
            formatted_words.append(word)
        else:
            formatted_words.append(word.capitalize())

    return " ".join(formatted_words)


projects = []

for path in sorted(root.iterdir(), key=lambda item: item.name.lower()):
    if not path.is_dir():
        continue

    if not (path / "index.html").is_file():
        continue

    projects.append(
        {
            "title": format_title(path.name),
            "folder": path.name,
            "path": f"{path.name}/index.html",
        }
    )

serialized = json.dumps(projects, ensure_ascii=False, indent=2)
js_output.write_text(f"window.PROJECTS = {serialized};\n", encoding="utf-8")

print(f"Updated {js_output.name} with {len(projects)} project(s).")
PY
