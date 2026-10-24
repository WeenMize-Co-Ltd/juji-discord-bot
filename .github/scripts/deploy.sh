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
cleanup() {
  local status=$?
  trap - EXIT
  rm -rf -- "$stage_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

chmod 700 "$deploy_root" "$stage_dir" "$DOCKER_CONFIG"
chmod 600 "$stage_dir/.env" "$stage_dir/docker-compose.yml" "$stage_dir/application.yml"

# Validation and pulls finish before the active configuration is replaced. Quiet
# validation avoids printing resolved credentials. A stable project name prevents
# Compose from creating a different stack for each staging directory.
staged=(docker compose --project-name juji-discord-bot --project-directory "$stage_dir"
  --env-file "$stage_dir/.env" -f "$stage_dir/docker-compose.yml")
"${staged[@]}" config --quiet
docker login ghcr.io --username "$registry_user" --password-stdin
"${staged[@]}" pull

previous="$deploy_root/.previous"
mkdir -p "$previous"
chmod 700 "$previous"
for file in docker-compose.yml application.yml .env; do
  if [[ -f "$deploy_root/$file" ]]; then
    cp -- "$deploy_root/$file" "$previous/$file.tmp"
    chmod 600 "$previous/$file.tmp"
    mv -f -- "$previous/$file.tmp" "$previous/$file"
  fi
  mv -f -- "$stage_dir/$file" "$deploy_root/$file"
done

compose=(docker compose --project-name juji-discord-bot --project-directory "$deploy_root"
  --env-file "$deploy_root/.env" -f "$deploy_root/docker-compose.yml")
"${compose[@]}" up -d
