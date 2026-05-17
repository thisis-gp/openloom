#!/usr/bin/env python3
"""
Rebrand opencode → openloom in the Openloom repo.
Run from the repo root: python rebrand.py
"""

import os
import re
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))

# Extensions to process
TEXT_EXTS = {
    ".ts", ".tsx", ".js", ".cjs", ".mjs", ".json", ".jsonc",
    ".toml", ".yaml", ".yml", ".md", ".txt", ".sh", ".nix",
    ".html", ".css", ".env", ".example",
}

# Files/dirs to skip entirely
SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".turbo", "bun.lockb"}
SKIP_FILES = {"bun.lock", "flake.lock", "rebrand.py"}

# External npm packages that contain "opencode" — do NOT rename these
EXTERNAL_KEEP = [
    "opencode-gitlab-auth",
    "opencode-poe-auth",
    "@gitlab/opencode-gitlab-auth",
]

def should_skip(path):
    parts = path.replace("\\", "/").split("/")
    for part in parts:
        if part in SKIP_DIRS:
            return True
    return os.path.basename(path) in SKIP_FILES

def make_substitutions(content, filepath):
    rel = filepath.replace(ROOT, "").replace("\\", "/")

    # 1. Package namespace: @opencode-ai/ → @openloom/
    content = content.replace("@opencode-ai/", "@openloom/")

    # 2. Config dir: .opencode → .openloom (as path segment)
    content = content.replace('".opencode"', '".openloom"')
    content = content.replace("'.opencode'", "'.openloom'")
    content = content.replace("/.opencode/", "/.openloom/")
    content = content.replace("/.opencode\"", "/.openloom\"")
    content = content.replace('endsWith(".opencode")', 'endsWith(".openloom")')
    content = content.replace('".opencode", "plans"', '".openloom", "plans"')
    content = content.replace('".opencode", "agents"', '".openloom", "agents"')
    content = content.replace('basename(source_dir) === ".opencode"', 'basename(source_dir) === ".openloom"')

    # 3. Config file names: opencode.json → openloom.json
    content = content.replace('"opencode.json"', '"openloom.json"')
    content = content.replace('"opencode.jsonc"', '"openloom.jsonc"')
    content = content.replace("'opencode.json'", "'openloom.json'")
    content = content.replace("'opencode.jsonc'", "'openloom.jsonc'")
    content = content.replace("`opencode.json`", "`openloom.json`")
    content = content.replace("`opencode.jsonc`", "`openloom.jsonc`")
    # In array literals
    content = content.replace('["opencode.json", "opencode.jsonc"]', '["openloom.json", "openloom.jsonc"]')
    content = content.replace('["opencode.jsonc", "opencode.json"]', '["openloom.jsonc", "openloom.json"]')
    # In user-facing strings
    content = content.replace("in opencode.json", "in openloom.json")
    content = content.replace("from opencode.json", "from openloom.json")
    content = content.replace("via opencode.json", "via openloom.json")
    content = content.replace("opencode.json files", "openloom.json files")
    content = content.replace("opencode.json shape", "openloom.json shape")

    # 4. Env vars: OPENCODE_ → OPENLOOM_
    content = re.sub(r'\bOPENCODE_', 'OPENLOOM_', content)

    # 5. Binary name in package.json bin field
    if rel.endswith("/packages/opencode/package.json"):
        content = content.replace('"opencode": "./bin/opencode"', '"openloom": "./bin/openloom"')

    # 6. Root package.json name
    if rel == "/package.json":
        content = content.replace('"name": "opencode"', '"name": "openloom"')

    # 7. Display/user-facing strings — "opencode" → "openloom"
    # Only in string literals, not in external package names
    # Replace "opencode" as standalone word in strings but preserve external deps
    for ext in EXTERNAL_KEEP:
        # These stay — handled by not touching them (they're exact strings not matched above)
        pass

    # GitHub repo URL in root package.json
    content = content.replace(
        '"url": "https://github.com/anomalyco/opencode"',
        '"url": "https://github.com/thisis-gp/openloom"'
    )

    # 8. Catch-all: remaining "opencode" in user-visible strings
    # In .ts/.tsx files, replace in string literals carefully
    if filepath.endswith((".ts", ".tsx")):
        # Replace standalone "opencode" in template literals and string user messages
        # but NOT in import paths or variable names
        content = content.replace("'opencode'", "'openloom'")
        # In descriptive strings like "basic auth username (defaults to ... or 'opencode')"
        content = content.replace("or 'opencode')", "or 'openloom')")
        # In log messages
        content = content.replace('"Warning: OPENLOOM_SERVER_PASSWORD', '"Warning: OPENLOOM_SERVER_PASSWORD')  # already changed above

    return content

def process_file(filepath):
    _, ext = os.path.splitext(filepath)
    # Handle extensionless files like bin/opencode
    basename = os.path.basename(filepath)
    if ext not in TEXT_EXTS and basename not in {"opencode", "openloom"}:
        return False

    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            original = f.read()
    except Exception as e:
        print(f"  SKIP (read error): {filepath}: {e}")
        return False

    modified = make_substitutions(original, filepath)

    if modified != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(modified)
        return True
    return False

def rename_bin_file():
    """Rename bin/opencode → bin/openloom"""
    src = os.path.join(ROOT, "packages", "opencode", "bin", "opencode")
    dst = os.path.join(ROOT, "packages", "opencode", "bin", "openloom")
    if os.path.exists(src) and not os.path.exists(dst):
        shutil.copy2(src, dst)
        os.remove(src)
        print(f"  RENAMED: packages/opencode/bin/opencode → packages/opencode/bin/openloom")
        return True
    elif os.path.exists(dst):
        print(f"  SKIP (already renamed): bin/openloom exists")
    return False

def main():
    print("=== Openloom Rebrand Script ===\n")

    changed = []
    skipped = 0

    for dirpath, dirnames, filenames in os.walk(ROOT):
        # Prune skip dirs in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            if should_skip(filepath):
                skipped += 1
                continue
            if process_file(filepath):
                rel = os.path.relpath(filepath, ROOT)
                changed.append(rel)
                print(f"  CHANGED: {rel}")

    print(f"\n--- Renaming binary entrypoint ---")
    rename_bin_file()

    print(f"\n=== Done ===")
    print(f"Files changed: {len(changed)}")
    print(f"Files skipped (binary/lockfiles): {skipped}")

if __name__ == "__main__":
    main()
