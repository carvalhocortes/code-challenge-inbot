FROM node:22-bookworm-slim

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json

RUN pnpm install --frozen-lockfile

COPY frontend frontend
COPY shared shared

RUN pnpm --filter @inbot/shared build
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @inbot/frontend build

RUN chown -R node:node /workspace

USER node

CMD ["pnpm", "--filter", "@inbot/frontend", "preview", "--host", "0.0.0.0", "--port", "5173"]
