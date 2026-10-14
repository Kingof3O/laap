#!/usr/bin/env bash
set -euo pipefail
: "${GH_REPO:?GH_REPO is required}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"
response=$(mktemp)
errors=$(mktemp)
trap 'rm -f "$response" "$errors"' EXIT
if gh api --include "repos/$GH_REPO/releases/tags/$RELEASE_TAG" --jq '.draft' >"$response" 2>"$errors"; then
  state=$(tail -n 1 "$response" | tr -d '\r')
  if [[ "$state" != true ]]; then
    echo 'Refusing to modify an already published release.' >&2
    exit 1
  fi
elif ! grep -Eq '^HTTP/[0-9.]+[[:space:]]+404([[:space:]]|$)' "$response"; then
  cat "$errors" >&2
  echo 'Unable to confirm the release state; refusing to upload.' >&2
  exit 1
fi
