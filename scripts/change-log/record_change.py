#!/usr/bin/env python3
"""Prepend an intent-ledger entry for an existing implementation commit."""

from __future__ import annotations

import argparse
import datetime as dt
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse


ENTRY_MARKER = "<!-- change-log:entries -->"


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip()


def ordinal(day: int) -> str:
    if 10 < day % 100 < 14:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"


def human_local_time(value: dt.datetime) -> str:
    hour = value.hour % 12 or 12
    meridiem = "a.m." if value.hour < 12 else "p.m."
    zone = value.tzname() or value.strftime("%z")
    return (
        f"{value.strftime('%B')} {ordinal(value.day)}, {value.year} at "
        f"{hour}:{value.minute:02d}:{value.second:02d} {meridiem} {zone}"
    )


def one_line(value: str, label: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise SystemExit(f"{label} cannot be empty")
    return normalized


def parse_file_reason(value: str) -> tuple[str, str]:
    if "::" not in value:
        raise argparse.ArgumentTypeError("use PATH::WHY")
    path, reason = value.split("::", 1)
    path = path.strip()
    reason = one_line(reason, "file reason")
    if not path:
        raise argparse.ArgumentTypeError("file path cannot be empty")
    return path, reason


def validate_specstory_uri(value: str) -> str:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (
        host == "specstory.com" or host.endswith(".specstory.com")
    ):
        raise argparse.ArgumentTypeError(
            "SpecStory URI must be an https URL on specstory.com"
        )
    return value


def quote_block(value: str) -> str:
    lines = value.splitlines() or [value]
    return "\n".join(f"> {line}" if line else ">" for line in lines)


def insert_entry(path: Path, entry: str) -> None:
    if path.exists():
        original = path.read_text(encoding="utf-8")
    else:
        original = "# Change Log\n\n" + ENTRY_MARKER + "\n"

    if ENTRY_MARKER in original:
        before, after = original.split(ENTRY_MARKER, 1)
        updated = before + ENTRY_MARKER + "\n\n" + entry + "\n" + after.lstrip("\n")
    else:
        lines = original.splitlines(keepends=True)
        insert_at = 1 if lines and lines[0].lstrip().startswith("# ") else 0
        lines.insert(insert_at, "\n" + ENTRY_MARKER + "\n\n" + entry + "\n")
        updated = "".join(lines)

    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", dir=str(path.parent), text=True
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(updated)
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--changelog", default="CHANGELOG.md")
    parser.add_argument("--commit", required=True)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--detail", action="append", default=[])
    parser.add_argument(
        "--file", dest="files", action="append", type=parse_file_reason, required=True
    )
    parser.add_argument("--quote", action="append", required=True)
    specstory = parser.add_mutually_exclusive_group(required=True)
    specstory.add_argument("--specstory-uri", type=validate_specstory_uri)
    specstory.add_argument("--specstory-note")
    args = parser.parse_args()

    repo = Path(git(args.repo, "rev-parse", "--show-toplevel"))
    commit = git(repo, "rev-parse", "--verify", f"{args.commit}^{{commit}}")
    short_commit = git(repo, "rev-parse", "--short=12", commit)
    subject = one_line(git(repo, "show", "-s", "--format=%s", commit), "subject")
    touched = set(
        git(repo, "diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit).splitlines()
    )
    undocumented = [path for path, _ in args.files if path not in touched]
    if undocumented:
        raise SystemExit(
            "documented file path was not touched by the implementation commit: "
            + ", ".join(undocumented)
        )

    changelog = repo / args.changelog
    if changelog.exists() and commit in changelog.read_text(encoding="utf-8"):
        raise SystemExit(f"commit {commit} is already present in {changelog}")

    now = dt.datetime.now().astimezone().replace(microsecond=0)
    parts = [
        f"## {human_local_time(now)} — `{short_commit}` {subject}",
        "",
        f"- **Implementation commit:** `{commit}`",
        f"- **Change:** {one_line(args.summary, 'summary')}",
    ]
    if args.detail:
        parts.extend(["- **Details:**"] + [f"  - {one_line(item, 'detail')}" for item in args.detail])
    parts.append("- **Files:**")
    parts.extend(f"  - `{path}` — {reason}" for path, reason in args.files)
    parts.append("- **User context (verbatim):**")
    for quote in args.quote:
        parts.append("  " + quote_block(quote).replace("\n", "\n  "))
    if args.specstory_uri:
        parts.append(f"- **SpecStory:** [durable session]({args.specstory_uri})")
    else:
        parts.append(
            f"- **SpecStory:** unavailable — {one_line(args.specstory_note, 'SpecStory note')}"
        )

    insert_entry(changelog, "\n".join(parts).rstrip() + "\n")
    print(f"Prepended {short_commit} to {changelog}")


if __name__ == "__main__":
    main()
