FROM node:22-bookworm-slim

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json

RUN pnpm install --frozen-lockfile

COPY frontend frontend

RUN pnpm --filter @inbot/frontend build

RUN chown -R node:node /workspace

USER node

CMD ["pnpm", "--filter", "@inbot/frontend", "preview", "--host", "0.0.0.0", "--port", "5173"]
