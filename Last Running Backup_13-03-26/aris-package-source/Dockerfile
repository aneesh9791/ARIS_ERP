FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=production
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
COPY package*.json ./
RUN npm install --omit=dev

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN apt-get update     && apt-get install -y --no-install-recommends dumb-init ca-certificates curl tzdata     && rm -rf /var/lib/apt/lists/*     && useradd -r -u 10001 -g users aris     && mkdir -p /app/uploads     && chown -R aris:users /app     && chmod +x /app/docker-entrypoint.sh
USER aris
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 CMD curl -fsS http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]
