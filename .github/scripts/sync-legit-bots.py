#!/usr/bin/env python3
"""Refresh the IP-based entries in whitelists/benign_bots/legit_bots/ from their
upstream vendor sources.

Driven by .github/legit-bots-sources.json. Each entry names the target bot, the
user_agent regex and file comment to keep, and one or more URLs to pull ranges
from. JSON sources are reduced with `jq_filter`; sources without one are read as
plain text, one address or CIDR per line.

Entries verified by reverse DNS (googlebot, seznam, linkedin, ...) have nothing
to poll and are deliberately absent from the config - this script never touches
them.

Writes GitHub Actions outputs (changed, names, files) when GITHUB_OUTPUT is set.
Exits non-zero only if every source failed, so one broken vendor endpoint cannot
block the others from updating.
"""
import ipaddress
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG = os.environ.get("LEGIT_BOTS_CONFIG") or os.path.join(
    ROOT, ".github", "legit-bots-sources.json")
TARGET_DIR = os.environ.get("LEGIT_BOTS_TARGET_DIR") or os.path.join(
    ROOT, "whitelists", "benign_bots", "legit_bots")

# A vendor serving a truncated or half-broken list would otherwise silently gut a
# whitelist. Below this ratio the change is still applied but called out loudly in
# the PR body for a human to confirm - a real shrink does happen (Perplexity went
# from 254 stale entries to the 8 they actually publish), so this must not hard-fail.
SHRINK_RATIO = 0.5
SHRINK_FLOOR = 10

UA = "Mozilla/5.0 (compatible; crowdsec-sec-lists-sync)"


def fetch(url):
    r = subprocess.run(
        ["curl", "-fsSL", "--max-time", "60", "--retry", "3", "--retry-delay", "5",
         "-A", UA, url],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"fetch failed ({r.returncode}): {r.stderr.strip()[:200]}")
    return r.stdout


def apply_jq(payload, expr):
    r = subprocess.run(["jq", "-er", expr], input=payload,
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"jq filter failed: {r.stderr.strip()[:200]}")
    return r.stdout


def parse_ranges(text):
    """Normalise a newline-separated list of addresses/CIDRs to canonical CIDRs."""
    out = []
    for raw in text.splitlines():
        line = raw.strip().strip('"').strip(",").strip('"')
        if not line or line.startswith("#"):
            continue
        try:
            if "/" in line:
                net = ipaddress.ip_network(line, strict=True)
            else:
                addr = ipaddress.ip_address(line)
                net = ipaddress.ip_network(f"{addr}/{addr.max_prefixlen}")
        except ValueError as ex:
            raise RuntimeError(f"invalid address {line!r}: {ex}")
        if not net.is_global:
            raise RuntimeError(f"refusing non-public range {line!r}")
        out.append(net)
    # deterministic order so a vendor reshuffling its list produces no diff
    uniq = sorted(set(out), key=lambda n: (n.version, n.network_address, n.prefixlen))
    return [str(n) for n in uniq]


def render(entry, ranges):
    body = json.dumps(
        {"name": entry["name"], "user_agent": entry["user_agent"], "ranges": ranges},
        separators=(",", ":"), ensure_ascii=False,
    )
    return f"# {entry['comment']}\n{body}\n"


def current_range_count(path):
    try:
        with open(path) as fh:
            line = [l for l in fh.read().splitlines() if not l.startswith("#")][0]
        return len(json.loads(line).get("ranges", []))
    except (OSError, IndexError, ValueError):
        return 0


def main():
    with open(CONFIG) as fh:
        config = json.load(fh)

    changed, warnings, errors, skipped = [], [], [], []

    for entry in config:
        name = entry["name"]
        if entry.get("disabled"):
            skipped.append(name)
            print(f"-- {name}: disabled ({entry.get('note', 'no reason given')})")
            continue

        path = os.path.join(TARGET_DIR, f"{name}.json")
        try:
            ranges = []
            for url in entry["urls"]:
                payload = fetch(url)
                if "jq_filter" in entry:
                    payload = apply_jq(payload, entry["jq_filter"])
                ranges.extend(parse_ranges(payload))
            ranges = parse_ranges("\n".join(ranges))  # merge + re-sort across URLs
        except RuntimeError as ex:
            errors.append(f"{name}: {ex}")
            print(f"!! {name}: {ex}", file=sys.stderr)
            continue

        if not ranges:
            errors.append(f"{name}: source returned no ranges, keeping existing file")
            print(f"!! {name}: empty result, refusing to write", file=sys.stderr)
            continue

        before = current_range_count(path)
        if before >= SHRINK_FLOOR and len(ranges) < before * SHRINK_RATIO:
            warnings.append(
                f"`{name}` shrank sharply: {before} -> {len(ranges)} ranges. "
                f"Confirm the vendor really retired these before merging."
            )

        new = render(entry, ranges)
        old = open(path).read() if os.path.exists(path) else None
        if old == new:
            print(f"   {name}: unchanged ({len(ranges)} ranges)")
            continue

        with open(path, "w") as fh:
            fh.write(new)
        changed.append((name, before, len(ranges)))
        print(f"++ {name}: {before} -> {len(ranges)} ranges")

    if errors and not changed and len(errors) == len([e for e in config if not e.get("disabled")]):
        print("\nevery source failed", file=sys.stderr)
        return 1

    lines = []
    if changed:
        lines.append("Automated refresh of `whitelists/benign_bots/legit_bots/` "
                     "from upstream vendor sources.\n")
        lines.append("| bot | ranges before | ranges after |")
        lines.append("| --- | ---: | ---: |")
        for name, before, after in changed:
            lines.append(f"| `{name}` | {before} | {after} |")
    if warnings:
        lines.append("\n**Review carefully:**\n")
        lines.extend(f"- {w}" for w in warnings)
    if errors:
        lines.append("\n**Sources that failed this run** (their files were left "
                     "untouched):\n")
        lines.extend(f"- {e}" for e in errors)
    if skipped:
        lines.append(f"\nNot polled (no stable URL): {', '.join(f'`{s}`' for s in skipped)}.")
    body = "\n".join(lines)

    out = os.environ.get("GITHUB_OUTPUT")
    # only materialise the PR body under CI, and outside the checkout, so running
    # this locally never leaves a stray file in the working tree
    body_file = os.path.join(os.environ.get("RUNNER_TEMP") or ROOT, "pr-body.md")
    if body and out:
        with open(body_file, "w") as fh:
            fh.write(body + "\n")
    elif body:
        print("\n--- PR body ---\n" + body)

    if out:
        with open(out, "a") as fh:
            fh.write(f"changed={'true' if changed else 'false'}\n")
            fh.write(f"names={' '.join(n for n, _, _ in changed)}\n")
            fh.write(f"files={' '.join(f'whitelists/benign_bots/legit_bots/{n}.json' for n, _, _ in changed)}\n")
            fh.write(f"body_file={body_file}\n")

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary and body:
        with open(summary, "a") as fh:
            fh.write(body + "\n")

    print(f"\n{len(changed)} changed, {len(warnings)} warning(s), "
          f"{len(errors)} error(s), {len(skipped)} skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
