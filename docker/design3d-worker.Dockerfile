# OH I SEE — Design3D worker (Node + Blender headless)
# Requires Blender 3.x+ for production DESIGN3D_WORKER_MODE=headless
# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends blender wget ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --gid 1001 ohisee \
  && adduser --uid 1001 --gid 1001 --disabled-password ohisee \
  && mkdir -p /app/.data/design3d \
  && chown -R ohisee:ohisee /app

COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY backend/blender ./blender
COPY frontend/js /frontend/js

USER ohisee

ENV NODE_ENV=production
ENV DESIGN3D_WORKER_MODE=headless
ENV DESIGN3D_STORAGE=supabase
ENV BLENDER_EXECUTABLE=/usr/bin/blender

# Long-running poller — no HTTP port
CMD ["node", "src/workers/design3d.js"]
