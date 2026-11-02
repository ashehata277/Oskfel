#!/bin/bash
set -u

THRESHOLD="${OSKFEL_HANDOFF_THRESHOLD:-90}"
WINDOW_DEFAULT="${OSKFEL_CONTEXT_WINDOW:-200000}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_ROOT="$ROOT/handoff"
STATE="$OUT_ROOT/.state"

INPUT="$(cat)"
export INPUT ROOT OUT_ROOT STATE THRESHOLD WINDOW_DEFAULT

python3 - <<'PY'
import json, os, shutil, subprocess, sys, time
from pathlib import Path

d = json.loads(os.environ["INPUT"] or "{}")
if d.get("stop_hook_active"):
    sys.exit(0)

threshold = float(os.environ["THRESHOLD"])
root = Path(os.environ["ROOT"])
out_root = Path(os.environ["OUT_ROOT"])
state = Path(os.environ["STATE"])
sid = d.get("session_id", "unknown")
transcript = d.get("transcript_path", "")
if not transcript or not Path(transcript).is_file():
    sys.exit(0)

tokens = 0
first_user = []
last_user = []
last_assistant = ""
with open(transcript, encoding="utf-8") as f:
    for line in f:
        try:
            e = json.loads(line)
        except Exception:
            continue
        if e.get("isSidechain"):
            continue
        m = e.get("message") or {}
        role = m.get("role")
        content = m.get("content")
        text = content if isinstance(content, str) else "".join(
            p.get("text", "") for p in (content or []) if isinstance(p, dict) and p.get("type") == "text"
        )
        if role == "assistant":
            u = m.get("usage") or {}
            t = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
            if t:
                tokens = t
            if text.strip():
                last_assistant = text
        elif role == "user" and text.strip() and not text.lstrip().startswith("<"):
            last_user.append(text)

window = int(os.environ["WINDOW_DEFAULT"])
if tokens > window:
    window = 1_000_000
percent = tokens * 100 / window

state.parent.mkdir(parents=True, exist_ok=True)
marks = json.loads(state.read_text()) if state.exists() else {}
if percent < threshold:
    if marks.pop(sid, None) is not None:
        state.write_text(json.dumps(marks))
    sys.exit(0)
if sid in marks:
    sys.exit(0)

stamp = time.strftime("%Y-%m-%d_%H%M%S")
folder = out_root / f"{stamp}_{sid[:8]}"
(folder / "transcript").mkdir(parents=True, exist_ok=True)
shutil.copy(transcript, folder / "transcript" / f"{sid}.jsonl")
side = Path(transcript[:-6])
if side.is_dir():
    shutil.copytree(side, folder / "transcript" / sid, dirs_exist_ok=True)

def git(repo, *args):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""

repos = [root] + sorted(p.parent for p in root.glob("*/.git"))
rows = []
for r in repos:
    branch = git(r, "rev-parse", "--abbrev-ref", "HEAD")
    head = git(r, "rev-parse", "--short", "HEAD")
    dirty = len([l for l in git(r, "status", "--short").splitlines() if l])
    rows.append(f"{r.name}: {branch} {head} uncommitted={dirty}")

def clip(s, n):
    return s if len(s) <= n else s[:n] + "\n…(truncated)"

recent = "\n\n".join(f"- {clip(u.strip(), 1500)}" for u in last_user[-8:])
handoff = folder / "HANDOFF.md"
handoff.write_text(
    "# Session handoff\n\n"
    f"Context reached {percent:.0f}% ({tokens} of {window} tokens) at {time.strftime('%Y-%m-%d %H:%M:%S')}.\n\n"
    "## Summary\n\n_PENDING: Claude fills Goal, Current status, Key decisions, Files touched, Open problems, Next steps._\n\n"
    "## Recent user messages (verbatim, oldest first)\n\n" + recent + "\n\n"
    "## Last assistant message\n\n" + clip(last_assistant.strip(), 4000) + "\n"
)
(folder / "SESSION.md").write_text(
    "# Session facts\n\n"
    f"- Session id: `{sid}`\n- Workspace: `{root}`\n- Session cwd: `{d.get('cwd', '')}`\n"
    f"- Transcript: `transcript/{sid}.jsonl`\n\n## Repos\n\n```\n" + "\n".join(rows) + "\n```\n"
)
paste = (
    f"Continue a handed-off Claude Code session.\nRead {folder}/HANDOFF.md first, then {folder}/SESSION.md.\n"
    f"The full previous transcript is in {folder}/transcript/ if you need exact details.\n"
    "Confirm the current state (git status in the repos listed), then continue with Next steps without redoing finished work."
)
(folder / "PASTE_IN_NEW_SESSION.txt").write_text(paste + "\n")
resume = folder / "resume.sh"
resume.write_text(
    "#!/bin/bash\nset -e\nhere=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\n"
    f"sid='{sid}'\nproj=\"${{1:-{d.get('cwd', str(root))}}}\"\n"
    "cfg=\"${CLAUDE_CONFIG_DIR:-$HOME/.claude}\"\n"
    "enc=\"$(printf '%s' \"$proj\" | sed 's/[^A-Za-z0-9]/-/g')\"\n"
    "mkdir -p \"$cfg/projects/$enc\"\n"
    "cp \"$here/transcript/$sid.jsonl\" \"$cfg/projects/$enc/$sid.jsonl\"\n"
    "[ -d \"$here/transcript/$sid\" ] && cp -R \"$here/transcript/$sid\" \"$cfg/projects/$enc/\"\n"
    "cd \"$proj\" && exec claude --resume \"$sid\"\n"
)
resume.chmod(0o755)

marks[sid] = time.time()
state.write_text(json.dumps(marks))

reason = (
    f"Context reached {percent:.0f}%. A handoff folder was created at {folder}. "
    f"Open {handoff} and replace the PENDING line under '## Summary' with these sections, concrete (paths, branches, commands, IDs, decisions): "
    "Goal, Current status, Key decisions & constraints, Files touched, Open problems, Next steps (ordered), Context to re-read. "
    f"Then reply to the user with the folder path and this paste message in a code block:\n\n{paste}\n\n"
    f"Or resume the full session: bash {folder}/resume.sh"
)
print(json.dumps({"decision": "block", "reason": reason}))
PY
exit 0
