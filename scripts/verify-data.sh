#!/usr/bin/env bash
# Verifies static data integrity, and optionally scans a built site for
# content that must never be deployed (LFS pointers, local paths, secrets).
#
# Usage: scripts/verify-data.sh [dataRoot] [distDir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_ROOT="${1:-public/data}"
DIST_DIR="${2:-}"

node "$SCRIPT_DIR/verify-data.mjs" "$DATA_ROOT"

if [ -n "$DIST_DIR" ]; then
  echo "Scanning $DIST_DIR for forbidden deployed content…"

  if grep -rl "git-lfs.github.com/spec" "$DIST_DIR" 2>/dev/null; then
    echo "ERROR: Git LFS pointer files found in $DIST_DIR" >&2
    exit 1
  fi

  if grep -rlE '(C:\\Users\\|/home/[a-z0-9_-]+/|/Users/[a-z0-9_-]+/)' "$DIST_DIR" 2>/dev/null; then
    echo "ERROR: absolute local filesystem paths found in $DIST_DIR" >&2
    exit 1
  fi

  # Common secret shapes: OpenAI-style, AWS access keys, GitHub tokens.
  if grep -rlE '(sk-[A-Za-z0-9]{24,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})' "$DIST_DIR" 2>/dev/null; then
    echo "ERROR: possible secret material found in $DIST_DIR" >&2
    exit 1
  fi

  echo "Forbidden-content scan passed for $DIST_DIR"
fi
