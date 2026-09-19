# OH I SEE — Secrets Management

## Never commit

- `JWT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` / `GEMINI_API_KEY`
- `RAZORPAY_*`
- `SMTP_PASS`
- `k8s/base/secrets.yaml`

## Local development

Copy `.env.example` → `.env`

## Docker Compose

`.env` file loaded by `docker-compose.yml` for backend. Frontend receives only browser-safe vars.

## Kubernetes

```bash
cp k8s/base/secrets.example.yaml k8s/base/secrets.yaml
# fill values
kubectl apply -f k8s/base/secrets.yaml -n ohisee
```

Production options:

- Sealed Secrets
- External Secrets Operator + cloud vault
- Cloud provider secret manager (AWS SM, GCP SM, Azure KV)

## Frontend vs backend

| Variable | Frontend | Backend |
|----------|----------|---------|
| `SUPABASE_ANON_KEY` | Yes | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **Never** | Yes |
| `OPENAI_API_KEY` | **Never** | Yes |
| `JWT_SECRET` | **Never** | Yes |

## Rotation

1. Generate new secret in vault
2. Update K8s Secret or `.env`
3. Rolling restart: `kubectl rollout restart deployment/ohisee-api -n ohisee`
