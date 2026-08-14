FROM node:22-bookworm-slim

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json

RUN pnpm install --frozen-lockfile

COPY backend backend
COPY shared shared

RUN pnpm --filter @inbot/backend build

USER node

CMD ["pnpm", "--filter", "@inbot/backend", "start:api"]
