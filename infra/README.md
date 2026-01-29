# DSCR Platform Infrastructure

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Cloud Load Balancer                               │
│                         (SSL + Cloud CDN + Cloud Armor)                      │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
          ┌──────────────────────┴──────────────────────┐
          │                                             │
          ▼                                             ▼
┌──────────────────────┐                    ┌──────────────────────┐
│     Cloud Run        │                    │     Cloud Run        │
│     (Frontend)       │───────────────────►│     (API)            │
│     Next.js SSR      │                    │     Node.js          │
│     Scales to 0      │                    │     Scales to 0      │
└──────────────────────┘                    └──────────┬───────────┘
                                                       │
     ┌────────────────────┬────────────────────┬───────┴───────┬─────────────┐
     │                    │                    │               │             │
     ▼                    ▼                    ▼               ▼             ▼
┌──────────┐      ┌──────────────┐     ┌───────────┐   ┌───────────┐  ┌──────────┐
│ Firebase │      │    Neon      │     │   GCS     │   │  Pub/Sub  │  │ Upstash  │
│   Auth   │      │  (Postgres)  │     │  (Docs)   │   │ (Events)  │  │ (Redis)  │
│   Free   │      │   $0-25/mo   │     │  $5/mo    │   │  $1-5/mo  │  │  $0-10   │
└──────────┘      └──────────────┘     └───────────┘   └───────────┘  └──────────┘
```

## Estimated Costs

| Service | Monthly Cost |
|---------|-------------|
| Cloud Run (Frontend + API) | $20-50 (scales to 0) |
| Neon (Postgres) | $0-25 |
| Firebase Auth | $0 (free tier) |
| Upstash Redis | $0-10 |
| Cloud Storage | $1-5 |
| Pub/Sub | $1-5 |
| Load Balancer (optional) | $18 |
| **Total** | **$40-115/mo** |

## Quick Start

### Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
- [Terraform](https://www.terraform.io/downloads) >= 1.5.0
- [Node.js](https://nodejs.org/) >= 20

### 1. Initial Setup

```bash
# Run the setup script
chmod +x infra/scripts/setup.sh
./infra/scripts/setup.sh
```

### 2. Set Up External Services

#### Neon (Postgres)
1. Go to [neon.tech](https://neon.tech)
2. Create a project
3. Copy the connection string
4. Add to GCP Secret Manager:
```bash
echo -n "postgresql://user:pass@host/db?sslmode=require" | \
  gcloud secrets versions add neon-database-url --data-file=-
```

#### Upstash (Redis)
1. Go to [upstash.com](https://upstash.com)
2. Create a Redis database
3. Copy the Redis URL
4. Add to GCP Secret Manager:
```bash
echo -n "rediss://default:token@host:port" | \
  gcloud secrets versions add upstash-redis-url --data-file=-
```

#### Firebase
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create/link project
3. Enable Authentication > Email/Password
4. Get config from Project Settings > Your Apps
5. Add to GCP Secret Manager:
```bash
cat << 'EOF' | gcloud secrets versions add firebase-config --data-file=-
{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  ...
}
EOF
```

### 3. Deploy Infrastructure

```bash
cd infra/terraform

# Preview changes
terraform plan -var-file=environments/dev/terraform.tfvars

# Apply changes
terraform apply -var-file=environments/dev/terraform.tfvars
```

### 4. Deploy Application

```bash
# From project root
gcloud builds submit --config=cloudbuild.yaml --substitutions=_ENV=dev
```

## Directory Structure

```
infra/
├── terraform/
│   ├── main.tf              # Main infrastructure
│   ├── variables.tf         # Variable definitions
│   └── environments/
│       ├── dev/
│       │   └── terraform.tfvars
│       └── prod/
│           └── terraform.tfvars
├── docker/
│   ├── Dockerfile.api       # API container
│   └── Dockerfile.frontend  # Frontend container
└── scripts/
    └── setup.sh             # Initial setup script
```

## Deployment

### Automatic (CI/CD)

Push to `main` branch triggers automatic deployment to dev environment.

```bash
git push origin main
```

### Manual

```bash
# Deploy to dev
gcloud builds submit --config=cloudbuild.yaml --substitutions=_ENV=dev

# Deploy to prod
gcloud builds submit --config=cloudbuild.yaml --substitutions=_ENV=prod
```

## Environment Variables

### API Service

| Variable | Description | Source |
|----------|-------------|--------|
| `DATABASE_URL` | Neon Postgres URL | Secret Manager |
| `REDIS_URL` | Upstash Redis URL | Secret Manager |
| `FIREBASE_CONFIG` | Firebase admin config | Secret Manager |
| `GCP_PROJECT_ID` | GCP project ID | Cloud Run env |
| `GCS_BUCKET_DOCUMENTS` | Document storage bucket | Terraform output |

### Frontend Service

| Variable | Description | Source |
|----------|-------------|--------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | Build arg |
| `NEXT_PUBLIC_FIREBASE_CONFIG` | Firebase client config | Build arg |

## Scaling

### Cloud Run Auto-scaling

```hcl
# Adjust in main.tf
scaling {
  min_instance_count = 0   # Scale to zero
  max_instance_count = 10  # Max instances
}
```

### Production Settings

For production, consider:
- `min_instance_count = 1` (avoid cold starts)
- Custom domain with Cloud Load Balancer
- Cloud Armor for WAF/DDoS protection
- Cloud CDN for static assets

## Monitoring

### View Logs

```bash
# API logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=dscr-api" --limit=50

# Frontend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=dscr-frontend" --limit=50
```

### View Metrics

Go to [Cloud Console > Cloud Run](https://console.cloud.google.com/run)

## Troubleshooting

### Cold Start Issues

If experiencing slow first requests:
```bash
# Keep minimum instances warm
gcloud run services update dscr-api --min-instances=1
```

### Database Connection Issues

Check Neon is accessible:
```bash
# Test from Cloud Shell
psql "$(gcloud secrets versions access latest --secret=neon-database-url)"
```

### Build Failures

View build logs:
```bash
gcloud builds list --limit=5
gcloud builds log BUILD_ID
```

## Security Best Practices

### Secrets Management

- All secrets stored in GCP Secret Manager
- Never commit secrets to version control
- Rotate secrets regularly
- Use least-privilege IAM roles

### Network Security

- Cloud Run services are public (authenticated via Firebase)
- Consider VPC connector for private database access
- Enable Cloud Armor for production (DDoS protection)

### Access Control

- Firebase Authentication for user sessions
- Service accounts with minimal permissions
- Audit logging enabled for all services

## Terraform State

For team environments, configure remote state:

```hcl
# backend.tf
terraform {
  backend "gcs" {
    bucket = "your-project-terraform-state"
    prefix = "dscr-platform"
  }
}
```

## Related Documentation

- [Main Project README](../README.md)
- [Web Frontend README](../web/README.md)
- [System Overview](../docs/01-SYSTEM-OVERVIEW.md)
- [Architecture](../docs/02-HIGH-LEVEL-ARCHITECTURE.md)
