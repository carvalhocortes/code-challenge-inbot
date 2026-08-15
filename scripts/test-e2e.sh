#!/usr/bin/env bash

set -euo pipefail

readonly e2e_project="inbot-e2e"

cleanup() {
  docker compose --env-file .env.example --project-name "$e2e_project" down --volumes --remove-orphans
}

cleanup
trap cleanup EXIT

API_PORT=3100 \
FRONTEND_PORT=5174 \
CORS_ORIGIN=http://localhost:5174 \
HOLIDAY_PROVIDER_MODE=success \
docker compose --env-file .env.example --project-name "$e2e_project" up --build --wait

E2E_API_BASE_URL=http://localhost:3100 \
E2E_BASE_URL=http://localhost:5174 \
corepack pnpm --dir frontend test:e2e
