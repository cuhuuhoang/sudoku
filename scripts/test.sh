#!/usr/bin/env bash
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
[ -f "$HOME/.bashrc" ] && \. "$HOME/.bashrc"

# Run vitest suite via npm so it uses the project-local version
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to run the test suite." >&2
  exit 127
fi

node -v

if [ ! -d node_modules ]; then
  npm install
fi

npm run test -- "$@"
npm run build
