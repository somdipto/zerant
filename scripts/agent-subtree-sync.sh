#!/usr/bin/env bash
set -euo pipefail

# Sync updates from BrowserOS-agent into BrowserOS via git subtree (no --squash).
#
# This script:
#   1) fetches the agent remote
#   2) pulls a branch or tag into ./agent (or custom prefix)
#   3) commits with a message containing the upstream SHA
#   4) prints a concise changelog range (based on last sync marker)
#
# Usage:
#   ./agent-subtree-sync.sh [REF] [PREFIX] [REMOTE_NAME]
# Examples:
#   ./agent-subtree-sync.sh main
#   ./agent-subtree-sync.sh v0.23.0 agent agent
#
# Tip: Set defaults via env:
#   AGENT_REMOTE_URL=git@github.com:browseros-ai/BrowserOS-agent.git ./agent-subtree-sync.sh main

REF="${1:-main}"
PREFIX="${2:-agent}"
REMOTE_NAME="${3:-agent}"
REMOTE_URL="${AGENT_REMOTE_URL:-https://github.com/browseros-ai/BrowserOS-agent.git}"

# Ensure remote exists & points to REMOTE_URL
echo ">>> Ensuring remote '$REMOTE_NAME' -> $REMOTE_URL"
git remote add "$REMOTE_NAME" "$REMOTE_URL" 2>/dev/null || true
git remote set-url "$REMOTE_NAME" "$REMOTE_URL"

# Fetch branch/tag & tags for changelog
echo ">>> Fetching $REMOTE_NAME $REF"
git fetch "$REMOTE_NAME" "$REF" --tags

# Resolve upstream SHA we’re syncing to
UPSTREAM_REF="$REMOTE_NAME/$REF"
UPSTREAM_SHA="$(git rev-parse "$UPSTREAM_REF")"
echo ">>> Upstream target: $UPSTREAM_REF @ $UPSTREAM_SHA"

# Find the last upstream SHA we synced (from commit messages we write below)
# Falls back to none (full log) if not found.
LAST_MARK="$(git log -n 1 --grep="subtree(sync): $PREFIX ->" --pretty=format:%s -- 2>/dev/null || true)"
PREV_SHA=""
if [[ -n "${LAST_MARK}" ]]; then
  # message format: "subtree(sync): agent -> <sha>"
  PREV_SHA="$(sed -E 's/.* -> ([0-9a-f]{7,40}).*/\1/' <<<"$LAST_MARK" || true)"
fi

# Do the subtree pull (NO --squash)
echo ">>> Pulling subtree into '$PREFIX' from $UPSTREAM_REF (full history)"
git subtree pull --prefix="$PREFIX" "$REMOTE_NAME" "$REF" -m "Update BrowserOS-agent: $PREFIX -> $UPSTREAM_SHA"

# Show a concise changelog range if we have a previous SHA
echo ">>> Changelog upstream ($([[ -n "$PREV_SHA" ]] && echo "$PREV_SHA.." )$UPSTREAM_SHA):"
if [[ -n "$PREV_SHA" ]]; then
  # Print upstream commits between PREV_SHA and UPSTREAM_SHA
  git log --no-merges --pretty="* %h %s" "$PREV_SHA..$UPSTREAM_SHA" --first-parent "$UPSTREAM_REF" || true
else
  # First sync: just show the last 30 upstream commits for context
  git log --no-merges --pretty="* %h %s" "$UPSTREAM_REF" -n 30 || true
fi

echo ">>> Done. Commit created with upstream marker."

# -----------------------------------------
# Below is the code for init subtree
# -----------------------------------------

# #!/usr/bin/env bash
# set -euo pipefail

# # One-time initialization: add BrowserOS-agent as a subtree under ./agent (default)
# # Usage:
# #   ./agent-subtree-init.sh [REMOTE_URL] [REF] [PREFIX]
# # Example:
# #   ./agent-subtree-init.sh https://github.com/browseros-ai/BrowserOS-agent.git main agent

# REMOTE_URL="${1:-https://github.com/browseros-ai/BrowserOS-agent.git}"
# REF="${2:-main}"
# PREFIX="${3:-agent}"
# REMOTE_NAME="agent"

# echo ">>> Ensuring remote '$REMOTE_NAME' -> $REMOTE_URL"
# git remote add "$REMOTE_NAME" "$REMOTE_URL" 2>/dev/null || true
# git remote set-url "$REMOTE_NAME" "$REMOTE_URL"

# echo ">>> Fetching $REMOTE_NAME $REF"
# git fetch "$REMOTE_NAME" "$REF" --tags

# # IMPORTANT: no --squash (we keep full upstream history in BrowserOS)
# echo ">>> Adding subtree into '$PREFIX' from $REMOTE_NAME/$REF"
# git subtree add --prefix="$PREFIX" "$REMOTE_NAME" "$REF" -m "subtree(init): add $PREFIX from $REMOTE_NAME/$REF (full history)"
# echo ">>> Done."
