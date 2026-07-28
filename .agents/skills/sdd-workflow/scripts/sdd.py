#!/usr/bin/env python3
"""Deterministic repository tooling for the provider-neutral SDD workflow."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import date
from pathlib import Path
import re
import sys


SPEC_STATUSES = {"draft", "approved", "superseded"}
ISSUE_STATUSES = {"pending", "planned", "in_progress", "blocked", "completed"}
SPEC_HEADINGS = (
    "## Summary",
    "## 1. Objective and Context",
    "## 2. Foundation",
    "## 3. Features and Behaviors",
    "## 4. Validation Gates",
    "## 5. Implementation Phases",
    "## 6. Decisions",
)
ISSUE_HEADINGS = (
    "## Overview",
    "## Surface",
    "## Spec coverage",
    "## Acceptance criteria",
    "## Notes",
)


class SddError(RuntimeError):
    """A user-actionable SDD workflow error."""


def skill_root() -> Path:
    return Path(__file__).resolve().parent.parent


def repository_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / "AGENTS.md").is_file():
            return candidate
    raise SddError("Could not find the repository root (AGENTS.md is missing).")


def normalize_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if not slug:
        raise SddError("The slug must contain at least one letter or number.")
    return slug


def default_title(slug: str) -> str:
    return slug.replace("-", " ").title()


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as error:
        raise SddError(f"Could not read {path}: {error}") from error

    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        raise SddError(f"{path}: missing opening frontmatter delimiter")

    try:
        end = next(index for index, line in enumerate(lines[1:], start=1) if line.strip() == "---")
    except StopIteration as error:
        raise SddError(f"{path}: missing closing frontmatter delimiter") from error

    metadata: dict[str, str] = {}
    for line in lines[1:end]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise SddError(f"{path}: invalid frontmatter line: {line}")
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip().strip('"').strip("'")
    return metadata, content


def render_asset(name: str, values: dict[str, str]) -> str:
    template_path = skill_root() / "assets" / name
    try:
        rendered = template_path.read_text(encoding="utf-8")
    except OSError as error:
        raise SddError(f"Could not read template {template_path}: {error}") from error

    for key, value in values.items():
        rendered = rendered.replace("{{" + key + "}}", value)
    unresolved = sorted(set(re.findall(r"{{([A-Z_]+)}}", rendered)))
    if unresolved:
        raise SddError(f"Template {name} has unresolved values: {', '.join(unresolved)}")
    return rendered


def create_spec(root: Path, slug_value: str, title: str | None = None) -> Path:
    slug = normalize_slug(slug_value)
    target = root / "docs" / "specs" / f"spec-{slug}.md"
    if target.exists():
        raise SddError(f"Spec already exists: {target.relative_to(root)}")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        render_asset(
            "spec-template.md",
            {
                "SPEC_ID": f"SPEC-{slug}",
                "TITLE": title or default_title(slug),
                "DATE": date.today().isoformat(),
            },
        ),
        encoding="utf-8",
    )
    return target


def issue_paths(root: Path) -> list[Path]:
    return sorted((root / "docs" / "issues").glob("[0-9][0-9][0-9]-*.md"))


def next_issue_number(root: Path) -> int:
    numbers = []
    for path in issue_paths(root):
        match = re.match(r"(\d{3})-", path.name)
        if match:
            numbers.append(int(match.group(1)))
    return max(numbers, default=0) + 1


def resolve_repository_path(root: Path, path_value: str) -> Path:
    candidate = Path(path_value)
    if not candidate.is_absolute():
        candidate = root / candidate
    candidate = candidate.resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as error:
        raise SddError("The spec path must be inside the repository.") from error
    return candidate


def create_issue(
    root: Path,
    spec_value: str,
    slug_value: str,
    title: str | None = None,
) -> Path:
    spec_path = resolve_repository_path(root, spec_value)
    if not spec_path.is_file():
        raise SddError(f"Spec does not exist: {spec_path}")
    spec_metadata, _ = parse_frontmatter(spec_path)
    if spec_metadata.get("status") != "approved":
        raise SddError("Issues can only be created from a spec with status: approved.")
    if not spec_metadata.get("id"):
        raise SddError(f"{spec_path}: missing required frontmatter field 'id'")

    number = next_issue_number(root)
    slug = normalize_slug(slug_value)
    target = root / "docs" / "issues" / f"{number:03d}-{slug}.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        render_asset(
            "issue-template.md",
            {
                "ISSUE_ID": f"ISS-{number:03d}",
                "SPEC_ID": spec_metadata["id"],
                "TITLE": title or default_title(slug),
                "DATE": date.today().isoformat(),
            },
        ),
        encoding="utf-8",
    )
    return target


def missing_headings(content: str, headings: tuple[str, ...]) -> list[str]:
    lines = {line.strip() for line in content.splitlines()}
    return [heading for heading in headings if heading not in lines]


def validate_repository(root: Path) -> list[str]:
    errors: list[str] = []
    spec_ids: dict[str, tuple[Path, str]] = {}
    issue_ids: dict[str, Path] = {}

    for path in sorted((root / "docs" / "specs").glob("spec-*.md")):
        relative = path.relative_to(root)
        try:
            metadata, content = parse_frontmatter(path)
        except SddError as error:
            errors.append(str(error))
            continue

        spec_id = metadata.get("id", "")
        status = metadata.get("status", "")
        if not spec_id:
            errors.append(f"{relative}: missing required field 'id'")
        elif spec_id in spec_ids:
            errors.append(f"{relative}: duplicate spec id '{spec_id}'")
        else:
            spec_ids[spec_id] = (path, status)
        if status not in SPEC_STATUSES:
            errors.append(f"{relative}: invalid spec status '{status}'")
        for heading in missing_headings(content, SPEC_HEADINGS):
            errors.append(f"{relative}: missing heading '{heading}'")

    for path in issue_paths(root):
        relative = path.relative_to(root)
        try:
            metadata, content = parse_frontmatter(path)
        except SddError as error:
            errors.append(str(error))
            continue

        issue_id = metadata.get("id", "")
        spec_id = metadata.get("spec", "")
        status = metadata.get("status", "")
        if not issue_id:
            errors.append(f"{relative}: missing required field 'id'")
        elif issue_id in issue_ids:
            errors.append(f"{relative}: duplicate issue id '{issue_id}'")
        else:
            issue_ids[issue_id] = path
        if "depends_on" not in metadata:
            errors.append(f"{relative}: missing required field 'depends_on'")
        if status not in ISSUE_STATUSES:
            errors.append(f"{relative}: invalid issue status '{status}'")
        if spec_id not in spec_ids:
            errors.append(f"{relative}: unknown parent spec '{spec_id}'")
        elif spec_ids[spec_id][1] != "approved":
            errors.append(f"{relative}: parent spec '{spec_id}' is not approved")
        for heading in missing_headings(content, ISSUE_HEADINGS):
            errors.append(f"{relative}: missing heading '{heading}'")
        if status in {"planned", "in_progress", "blocked", "completed"} and "## Plan" not in content:
            errors.append(f"{relative}: status '{status}' requires a '## Plan' section")
        if status == "completed" and "## Review" not in content:
            errors.append(f"{relative}: completed issues require a '## Review' section")

    return errors


def status_markdown(root: Path) -> str:
    rows: list[tuple[str, str, str, str]] = []
    counts: Counter[str] = Counter()
    for path in issue_paths(root):
        try:
            metadata, content = parse_frontmatter(path)
        except SddError:
            continue
        title_match = re.search(r"^#\s+(.+)$", content, flags=re.MULTILINE)
        title = title_match.group(1).strip() if title_match else path.stem
        status = metadata.get("status", "unknown")
        counts[status] += 1
        rows.append((metadata.get("id", "?"), title, metadata.get("spec", "?"), status))

    lines = [
        "<!-- AUTO-GENERATED by ./scripts/sdd status --write. Do not edit manually. -->",
        "",
        "# SDD Issue Status",
        "",
    ]
    if rows:
        lines.extend(
            [
                "| Issue | Title | Spec | Status |",
                "|---|---|---|---|",
                *[f"| {issue_id} | {title} | {spec_id} | {status} |" for issue_id, title, spec_id, status in rows],
            ]
        )
    else:
        lines.append("No operational issues have been created.")

    lines.extend(["", "## Summary", "", f"- total: {len(rows)}"])
    for status in sorted(ISSUE_STATUSES):
        lines.append(f"- {status}: {counts[status]}")
    return "\n".join(lines) + "\n"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Provider-neutral SDD repository tooling")
    subparsers = parser.add_subparsers(dest="command", required=True)

    new_spec = subparsers.add_parser("new-spec", help="create a draft specification")
    new_spec.add_argument("slug")
    new_spec.add_argument("--title")

    new_issue = subparsers.add_parser("new-issue", help="create an issue from an approved spec")
    new_issue.add_argument("spec")
    new_issue.add_argument("slug")
    new_issue.add_argument("--title")

    subparsers.add_parser("validate", help="validate all SDD artifacts")
    status = subparsers.add_parser("status", help="show issue status")
    status.add_argument("--write", action="store_true", help="write docs/issues/status.md")
    return parser


def run(arguments: argparse.Namespace, root: Path) -> int:
    if arguments.command == "new-spec":
        target = create_spec(root, arguments.slug, arguments.title)
        print(f"Created {target.relative_to(root)}")
        return 0
    if arguments.command == "new-issue":
        target = create_issue(root, arguments.spec, arguments.slug, arguments.title)
        print(f"Created {target.relative_to(root)}")
        return 0
    if arguments.command == "validate":
        errors = validate_repository(root)
        if errors:
            print("SDD validation failed:", file=sys.stderr)
            for error in errors:
                print(f"- {error}", file=sys.stderr)
            return 1
        print("SDD artifacts are valid.")
        return 0
    if arguments.command == "status":
        output = status_markdown(root)
        if arguments.write:
            target = root / "docs" / "issues" / "status.md"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(output, encoding="utf-8")
            print(f"Wrote {target.relative_to(root)}")
        else:
            print(output, end="")
        return 0
    raise SddError(f"Unknown command: {arguments.command}")


def main() -> int:
    try:
        return run(build_parser().parse_args(), repository_root())
    except SddError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
