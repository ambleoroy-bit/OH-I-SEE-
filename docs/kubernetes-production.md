# OH I SEE — Production Kubernetes

## Architecture

```
Internet → Ingress (TLS) → ohisee.com (frontend) | api.ohisee.com (API)
                              ↓                        ↓
                         frontend pods              API pods (HPA 2–10)
                                                        ↓
                                              Supabase + OpenAI/Gemini
```

Optional: `ohisee-design3d-worker` Deployment for Blender pipeline.

## Cluster requirements

- Kubernetes 1.28+
- NGINX Ingress Controller
- cert-manager (Let's Encrypt)
- Container registry (GHCR recommended)

## Deploy production

1. Update image tags in `k8s/overlays/production/kustomization.yaml`:

```yaml
images:
  - name: ohisee-api
    newName: ghcr.io/YOUR_ORG/ohisee-api
    newTag: git-<commit-sha>
```

2. Create secrets (never commit):

```bash
kubectl create namespace ohisee
kubectl apply -f k8s/base/secrets.yaml -n ohisee
```

3. Apply overlay:

```bash
kubectl apply -k k8s/overlays/production
```

4. Verify rollout:

```bash
kubectl rollout status deployment/ohisee-api -n ohisee
kubectl get ingress -n ohisee
```

## TLS

Ingress uses cert-manager annotation `cert-manager.io/cluster-issuer: letsencrypt-prod`.

Install cert-manager and create a ClusterIssuer before deploying.

## Resource limits (defaults)

| Service | CPU request | Memory request | Max replicas |
|---------|-------------|----------------|--------------|
| API | 250m | 512Mi | 10 (HPA) |
| Frontend | 50m | 128Mi | 2 |
| Design3D worker | 500m | 2Gi | 1–2 |

## Multi-replica notes

Apply Supabase migrations before scaling API beyond 1 replica. In-memory BIM/project fallbacks are not shared across pods — use database persistence.

## Rollback

```bash
kubectl rollout undo deployment/ohisee-api -n ohisee
kubectl rollout undo deployment/ohisee-frontend -n ohisee
kubectl rollout history deployment/ohisee-api -n ohisee
```
