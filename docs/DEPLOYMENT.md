# OH I SEE — Deployment Guide

## Pipeline overview

```
Git push → CI tests → Docker build → Security scan → Push GHCR
       → Deploy staging → Smoke tests → Manual approval → Production
```

## Image tags

Use immutable tags in production:

- `ohisee-api:git-<sha>`
- `ohisee-frontend:git-<sha>`

Do **not** deploy `latest` to production.

## Pre-deploy checklist

1. Run `npm test` in `backend/`
2. Apply database migrations in Supabase (manual SQL)
3. Build images: `docker compose build`
4. Push to registry
5. Update Kustomize image tags
6. `kubectl apply -k k8s/overlays/staging`
7. Smoke test health endpoints
8. Promote to production overlay

## Smoke tests

```bash
curl -f https://api.staging.ohisee.com/api/health
curl -f https://api.staging.ohisee.com/api/ready
curl -f https://staging.ohisee.com/health
```

## Database migrations

Run **before** application deploy:

1. `database/schema_v2.sql` (if needed)
2. `database/apply_projects_bim.sql`

Never run destructive migrations automatically on pod startup.

## Docker-only deploy (single VM)

```bash
cp .env.example .env
docker compose up -d --build
```

Suitable for demos; use Kubernetes for production HA.
