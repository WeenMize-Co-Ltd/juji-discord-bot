#!/usr/bin/env bash
set -euo pipefail
umask 077

# This script is uploaded into a disposable directory, never run from the checkout.
stage_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ "${stage_dir##*/}" =~ ^\.deploy-[0-9]+-[0-9]+$ ]] || exit 1
deploy_root="$(dirname -- "$stage_dir")"
registry_user="${1:?Missing registry username}"
[[ "$registry_user" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_-]*(\[bot\])?$ ]] || exit 1

export DOCKER_CONFIG
DOCKER_CONFIG="$(mktemp -d "$stage_dir/docker.XXXXXX")"
activated=false
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 ]] && "$activated"; then
    echo 'Deployment failed; inspect readiness and review migrations before manual recovery.' >&2
    "${compose[@]}" ps --all >&2 || true
    "${compose[@]}" logs --no-color --tail 50 juji-discord-bot >&2 || true
  fi
  rm -rf -- "$stage_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

chmod 700 "$deploy_root" "$stage_dir" "$DOCKER_CONFIG"
chmod 600 "$stage_dir/.env" "$stage_dir/docker-compose.yml"
# Lavalink runs as a different UID and must read this bind-mounted configuration.
# Runtime credentials stay in .env/environment; the host directory stays private.
chmod 644 "$stage_dir/application.yml"

# Validation and pulls finish before the active configuration is replaced. Quiet
# validation avoids printing resolved credentials. A stable project name prevents
# Compose from creating a different stack for each staging directory.
staged=(docker compose --project-name juji-discord-bot --project-directory "$stage_dir"
  --env-file "$stage_dir/.env" -f "$stage_dir/docker-compose.yml")
"${staged[@]}" config --quiet
docker login ghcr.io --username "$registry_user" --password-stdin
"${staged[@]}" pull

previous="$deploy_root/.previous"
pending="$deploy_root/.deployment-pending"
mkdir -p "$previous"
chmod 700 "$previous"
# A failed attempt leaves its active files in place. Preserve the earlier backup
# across retries until one attempt actually passes readiness.
if [[ ! -e "$pending" ]]; then
  for file in docker-compose.yml application.yml .env; do
    if [[ -f "$deploy_root/$file" ]]; then
      cp -- "$deploy_root/$file" "$previous/$file.tmp"
      chmod 600 "$previous/$file.tmp"
      mv -f -- "$previous/$file.tmp" "$previous/$file"
    fi
  done
fi
touch "$pending"
for file in docker-compose.yml application.yml .env; do
  mv -f -- "$stage_dir/$file" "$deploy_root/$file"
done

compose=(docker compose --project-name juji-discord-bot --project-directory "$deploy_root"
  --env-file "$deploy_root/.env" -f "$deploy_root/docker-compose.yml")
activated=true
# Atomic file replacement changes the bind mount's inode. Recreate Lavalink so it
# mounts the new application.yml even when its image and environment are unchanged.
"${compose[@]}" up -d --no-deps --force-recreate --pull never lavalink
"${compose[@]}" up --wait --wait-timeout 300
rm -f -- "$pending"
