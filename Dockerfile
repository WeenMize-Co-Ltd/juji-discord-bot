FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS release
ENV NODE_ENV=production
ENV DENO_DIR=/usr/src/app/.deno

# System tools for the music feature:
#   ffmpeg  — audio extraction for yt-dlp
#   python3 — runs the yt-dlp zipapp (arch-independent vs. a prebuilt binary)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl \
  && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno
COPY --from=install /temp/prod/node_modules node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN mkdir -p music_cache "$DENO_DIR" && chown bun:bun music_cache "$DENO_DIR"
EXPOSE 3000
USER bun
ENTRYPOINT ["sh", "-c", "bun run deploy && bun run start"]
