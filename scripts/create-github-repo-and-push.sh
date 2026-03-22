#!/usr/bin/env bash
# Creates a public GitHub repo and pushes the current branch.
# Run ONLY on your machine — never commit tokens.
#
# 1. Revoke any token you pasted in chat; create a NEW PAT:
#    https://github.com/settings/tokens  (scope: repo)
# 2. export GITHUB_TOKEN="ghp_...."
# 3. From repo root: bash scripts/create-github-repo-and-push.sh

set -euo pipefail

OWNER="gypossible"
REPO="PrivatKnowCabbinAgent"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "Error: export GITHUB_TOKEN with a new PAT (repo scope)." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Creating https://github.com/${OWNER}/${REPO} (if it does not exist)..."
HTTP_CODE="$(
  curl -sS -o /tmp/pkb-gh-create.json -w "%{http_code}" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -X POST "https://api.github.com/user/repos" \
    -d "{\"name\":\"${REPO}\",\"private\":false,\"description\":\"Private NotebookLM-style knowledge base (Next.js + Supabase + RAG)\"}"
)"

if [[ "$HTTP_CODE" == "201" ]]; then
  echo "Repository created."
elif [[ "$HTTP_CODE" == "422" ]]; then
  echo "Repository may already exist (422). Continuing with push."
else
  echo "GitHub API returned HTTP ${HTTP_CODE}" >&2
  cat /tmp/pkb-gh-create.json >&2
  exit 1
fi

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${OWNER}/${REPO}.git"

echo "Pushing to origin (branch: $(git branch --show-current))..."
git push -u "https://x-access-token:${GITHUB_TOKEN}@github.com/${OWNER}/${REPO}.git" "$(git branch --show-current)"

echo "Done. Open: https://github.com/${OWNER}/${REPO}"
echo "Next: connect Vercel to this repo and set env vars — see README.md (Deploy)."
