# OH I SEE — Troubleshooting

## Docker

### Backend won't start

```bash
docker compose logs backend
```

Common causes: missing `JWT_SECRET`, invalid Supabase URL.

### Frontend shows API errors

- Verify `API_UPSTREAM=backend:3001` in frontend container
- Check `OHISEE_API_BASE=/api` in runtime config

### Health check failing

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/ready
```

## Kubernetes

```bash
kubectl get pods -n ohisee
kubectl describe pod <name> -n ohisee
kubectl logs <pod> -n ohisee
kubectl get events -n ohisee --sort-by=.lastTimestamp
```

### ImagePullBackOff

Load images into kind: `kind load docker-image ohisee-api:local`

Or set registry credentials for GHCR.

### Ingress not routing

```bash
kubectl get ingress -n ohisee
kubectl describe ingress ohisee-ingress -n ohisee
```

## Application

| Symptom | Likely cause |
|---------|--------------|
| Projects won't save | `projects` table missing in Supabase |
| BIM empty after restart | In-memory cache — apply BIM SQL migrations |
| Design3D stuck | Worker not running or Blender unavailable |
| 401 on API | Expired JWT — re-login |

## Rollback

```bash
kubectl rollout undo deployment/ohisee-api -n ohisee
docker compose down && docker compose up -d --build
```
