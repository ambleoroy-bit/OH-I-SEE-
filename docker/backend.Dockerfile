# OH I SEE — Backend API (Express)
# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -g 1001 ohisee \
  && adduser -u 1001 -G ohisee -D ohisee \
  && mkdir -p /app/.data/design3d \
  && chown -R ohisee:ohisee /app

COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
# Shared modules required by API routes (path: ../../../frontend/js from src/routes)
COPY frontend/js /frontend/js

USER ohisee

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
