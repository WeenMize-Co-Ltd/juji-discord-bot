FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS release
ENV NODE_ENV=production

COPY --from=install /temp/prod/node_modules node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
EXPOSE 3000
USER bun
ENTRYPOINT ["sh", "-c", "bun run deploy && bunx drizzle-kit migrate && bun run start"]
