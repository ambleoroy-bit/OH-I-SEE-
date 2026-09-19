# OH I SEE — Frontend (Vite MPA → nginx)
# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine AS production
RUN apk add --no-cache gettext wget \
  && rm -rf /var/cache/apk/*

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/frontend-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

COPY --from=build /app/dist /usr/share/nginx/html

# nginx runs as root to bind 8080; worker processes drop privileges
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

ENV API_UPSTREAM=backend:3001
ENTRYPOINT ["/bin/sh", "/docker-entrypoint.sh"]
