# OH I SEE — Local Kubernetes (kind)

## Prerequisites

- [kind](https://kind.sigs.k8s.io/)
- kubectl
- Docker

## 1. Create cluster

```bash
kind create cluster --name ohisee
```

## 2. Build and load images

```bash
docker compose build
kind load docker-image ohisee-api:local --name ohisee
kind load docker-image ohisee-frontend:local --name ohisee
```

Tag images if needed:

```bash
docker tag ohisee-api:local ohisee-api:latest
docker tag ohisee-frontend:local ohisee-frontend:latest
kind load docker-image ohisee-api:latest --name ohisee
kind load docker-image ohisee-frontend:latest --name ohisee
```

## 3. Create secrets

```bash
cp k8s/base/secrets.example.yaml k8s/base/secrets.yaml
# Edit secrets.yaml with real values
```

## 4. Deploy (dev overlay)

```bash
kubectl apply -f k8s/base/secrets.yaml -n ohisee-dev
kubectl apply -k k8s/overlays/dev
```

## 5. Port forward

```bash
kubectl port-forward -n ohisee-dev svc/ohisee-frontend 3000:80
kubectl port-forward -n ohisee-dev svc/ohisee-api 3001:3001
```

Open http://localhost:3000

## Debugging

```bash
kubectl get pods -n ohisee-dev
kubectl get svc -n ohisee-dev
kubectl logs -n ohisee-dev -l app.kubernetes.io/name=ohisee-api -f
kubectl describe pod -n ohisee-dev -l app.kubernetes.io/name=ohisee-api
kubectl rollout status deployment/ohisee-api -n ohisee-dev
```

## Cleanup

```bash
kind delete cluster --name ohisee
```
