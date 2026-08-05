#!/usr/bin/env bash
# Fails if the built site exceeds the GitHub Pages 1 GB limit; warns at 80%.
set -euo pipefail

TARGET="${1:-dist}"
LIMIT_BYTES=$((1024 * 1024 * 1024))
WARN_BYTES=$((LIMIT_BYTES * 8 / 10))

if [ ! -d "$TARGET" ]; then
  echo "check-site-size: directory '$TARGET' does not exist" >&2
  exit 1
fi

SIZE=$(du -sb "$TARGET" | cut -f1)
HUMAN=$(du -sh "$TARGET" | cut -f1)
echo "Site size for $TARGET: $SIZE bytes ($HUMAN); GitHub Pages limit is 1 GB."

if [ "$SIZE" -ge "$LIMIT_BYTES" ]; then
  echo "ERROR: $TARGET exceeds the GitHub Pages 1 GB site limit." >&2
  exit 1
fi
if [ "$SIZE" -ge "$WARN_BYTES" ]; then
  echo "WARNING: $TARGET is above 80% of the GitHub Pages 1 GB site limit." >&2
fi
