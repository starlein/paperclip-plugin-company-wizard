#!/usr/bin/env bash
# Sync built plugin artifacts to the Paperclip plugins directory.
# Run after `pnpm build` to make the new version visible to the container.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTPAPERCLIP="${PAPERCLIP_DOTPAPERCLIP_HOST:-/home/docker/paperclip/data/docker/}"
PLUGIN_DIR="$DOTPAPERCLIP/plugins/@starlein/paperclip-plugin-company-wizard"
RUNTIME_PLUGIN_DIR="$DOTPAPERCLIP/plugins/node_modules/@starlein/paperclip-plugin-company-wizard"

sync_plugin_dir() {
  local target="$1"
  mkdir -p "$target"
  rsync -a --delete "$REPO_DIR/dist/"      "$target/dist/"
  rsync -a --delete "$REPO_DIR/templates/" "$target/templates/"
  cp "$REPO_DIR/package.json"              "$target/package.json"
}

sync_plugin_dir "$PLUGIN_DIR"

# The worker resolves templates from ~/.paperclip/plugin-templates FIRST when that
# dir exists (it's the GitHub download cache; see ensureTemplatesDir in worker.ts).
# That cache takes precedence over the bundled templates, so a stale cache silently
# masks every local template change. Keep it in sync with the local templates too,
# otherwise the running worker keeps generating bootstraps from old templates.
TEMPLATE_CACHE_DIR="${PAPERCLIP_PLUGIN_TEMPLATES_CACHE:-$HOME/.paperclip/plugin-templates}"
if [ -d "$TEMPLATE_CACHE_DIR" ]; then
  rsync -a --delete "$REPO_DIR/templates/" "$TEMPLATE_CACHE_DIR/"
  echo "Synced template cache to $TEMPLATE_CACHE_DIR"
fi

# Paperclip's worker manager launches packages from plugins/node_modules when the
# plugin has been installed through the registry/installer. Keep that runtime
# copy in sync too, otherwise the API can report the new manifest while the old
# worker code is still executed.
if [ -d "$RUNTIME_PLUGIN_DIR" ]; then
  sync_plugin_dir "$RUNTIME_PLUGIN_DIR"
  echo "Synced runtime package to $RUNTIME_PLUGIN_DIR"
fi

echo "Synced to $PLUGIN_DIR"

# Update manifest_json and reset status in DB so the server picks up schema changes on next restart
MANIFEST_JSON=$(node --input-type=module -e "
import manifest from '$PLUGIN_DIR/dist/manifest.js';
process.stdout.write(JSON.stringify(manifest));
" 2>/dev/null || echo "")

if [ -n "$MANIFEST_JSON" ]; then
  docker exec paperclip psql "postgresql://paperclip:paperclip@172.19.0.2:5432/paperclip" \
    -c "UPDATE plugins SET manifest_json = '$MANIFEST_JSON'::jsonb, package_name='@starlein/paperclip-plugin-company-wizard', status='ready', last_error=NULL, updated_at=now() WHERE plugin_key='starlein.paperclip-plugin-company-wizard';" \
    2>/dev/null && echo "DB manifest + status updated" || echo "DB update skipped (container not running?)"
else
  docker exec paperclip psql "postgresql://paperclip:paperclip@172.19.0.2:5432/paperclip" \
    -c "UPDATE plugins SET status='ready', last_error=NULL WHERE plugin_key='starlein.paperclip-plugin-company-wizard';" \
    2>/dev/null && echo "DB status reset to ready" || echo "DB reset skipped (container not running?)"
fi
