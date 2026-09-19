# OH I SEE — Monitoring & Observability

## Logging

Applications log to **stdout/stderr**. Collect with:

- Kubernetes: cluster logging (Loki, CloudWatch, Stackdriver)
- Docker: `docker compose logs -f`

Do not write persistent logs inside containers.

## Health endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Liveness — process up |
| `GET /api/ready` | Readiness — Supabase reachable |
| `GET /health` (frontend nginx) | Static server up |

## Recommended metrics

- API request rate, latency, 5xx rate
- Pod CPU/memory utilization
- HPA replica count
- Design3D job failures (Supabase `oh3d_jobs` table)
- BIM generation duration (add custom metric later)

## Tools (pick one stack)

- **Prometheus + Grafana** — metrics & dashboards
- **Sentry** — error tracking
- **Uptime monitoring** — external health checks on `/api/health`

## Alerts (production)

- API readiness failing > 2 min
- Error rate > 5% for 5 min
- Pod restart loop
- Design3D worker lease failures

## Request correlation (future)

Add `X-Request-Id` middleware to API for tracing across AI/BIM operations.
