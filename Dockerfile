FROM node:20-alpine AS base

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

WORKDIR /app

RUN corepack enable pnpm && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

FROM base AS dev

EXPOSE 5173

ENV PORT=5173
ENV HOST=0.0.0.0

CMD ["pnpm", "dev", "--host", "0.0.0.0"]

FROM base AS build

RUN pnpm build

CMD ["pnpm", "preview", "--host", "0.0.0.0"]

FROM base AS preview

EXPOSE 4173

ENV PORT=4173
ENV HOST=0.0.0.0

RUN pnpm build && rm -f index.html

FROM base AS smoke

CMD ["pnpm", "smoke:simulation"]

FROM base AS screenshot

EXPOSE 4173

ENV PORT=4173
ENV HOST=0.0.0.0

RUN pnpm build

CMD ["pnpm", "preview", "--host", "0.0.0.0"]
