# OH I SEE — Docker Local Development

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Node 20+ (optional — only if running without Docker)
- Supabase project credentials

## Quick start

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET, SUPABASE_*, optional AI keys

docker compose up --build
```

| URL | Service |
|-----|---------|
| http://localhost:3000 | Frontend (nginx → static MPA) |
| http://localhost:3000/api/health | API via nginx proxy |
| http://localhost:3001/api/health | API direct |
| http://localhost:3001/api/ready | Readiness (Supabase check) |

## Commands

```bash
docker compose down
docker compose logs -f backend
docker compose logs -f frontend
docker compose exec backend sh
docker compose --profile design3d up --build   # include Blender worker
```

## Environment

- Secrets go in `.env` (never commit)
- Frontend `runtime-config.js` is generated at container start from `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OHISEE_API_BASE`
- Backend uses full `.env` via `env_file`

## Database

OH I SEE uses **managed Supabase** — no Postgres container in compose.

Apply SQL from `database/apply_projects_bim.sql` in Supabase SQL Editor if projects/BIM tables are missing.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS errors | Set `FRONTEND_URL=http://localhost:3000` in `.env` |
| API 401 | Set `JWT_SECRET` and valid Supabase keys |
| Frontend blank | Check `docker compose logs frontend` |
| BIM "project not found" | Apply DB migrations or use local project cache |

See also: [infrastructure-analysis.md](./infrastructure-analysis.md), [troubleshooting.md](./troubleshooting.md)
