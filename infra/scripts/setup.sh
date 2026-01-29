#!/bin/bash
# =============================================================================
# DSCR Platform - Initial Setup Script
# Run this once to set up your GCP project
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}DSCR Platform - Initial Setup${NC}"
echo -e "${GREEN}========================================${NC}"

# -----------------------------------------------------------------------------
# Check prerequisites
# -----------------------------------------------------------------------------

echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    echo -e "${RED}Error: Terraform is not installed${NC}"
    echo "Install from: https://www.terraform.io/downloads"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites installed${NC}"

# -----------------------------------------------------------------------------
# Get configuration
# -----------------------------------------------------------------------------

echo -e "\n${YELLOW}Configuration${NC}"

read -p "Enter your GCP Project ID: " PROJECT_ID
read -p "Enter region (default: us-central1): " REGION
REGION=${REGION:-us-central1}
read -p "Enter environment (dev/staging/prod, default: dev): " ENV
ENV=${ENV:-dev}

# -----------------------------------------------------------------------------
# Authenticate with GCP
# -----------------------------------------------------------------------------

echo -e "\n${YELLOW}Authenticating with GCP...${NC}"

gcloud auth login
gcloud config set project $PROJECT_ID

echo -e "${GREEN}✓ Authenticated${NC}"

# -----------------------------------------------------------------------------
# Enable required APIs
# -----------------------------------------------------------------------------

echo -e "\n${YELLOW}Enabling GCP APIs...${NC}"

gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    pubsub.googleapis.com \
    storage.googleapis.com \
    compute.googleapis.com \
    firebase.googleapis.com \
    identitytoolkit.googleapis.com

echo -e "${GREEN}✓ APIs enabled${NC}"

# -----------------------------------------------------------------------------
# Create Artifact Registry repository
# -----------------------------------------------------------------------------

echo -e "\n${YELLOW}Creating Artifact Registry...${NC}"

gcloud artifacts repositories create dscr-platform \
    --repository-format=docker \
    --location=$REGION \
    --description="DSCR Platform Docker images" \
    2>/dev/null || echo "Repository may already exist"

echo -e "${GREEN}✓ Artifact Registry ready${NC}"

# -----------------------------------------------------------------------------
# Set up secrets
# -----------------------------------------------------------------------------

echo -e "\n${YELLOW}Setting up secrets...${NC}"

# Create secrets (empty initially)
gcloud secrets create neon-database-url --replication-policy="automatic" 2>/dev/null || true
gcloud secrets create upstash-redis-url --replication-policy="automatic" 2>/dev/null || true
gcloud secrets create firebase-config --replication-policy="automatic" 2>/dev/null || true

echo -e "${GREEN}✓ Secrets created${NC}"
echo -e "${YELLOW}Note: You need to add secret values manually:${NC}"
echo "  gcloud secrets versions add neon-database-url --data-file=- <<< 'your-neon-url'"
echo "  gcloud secrets versions add upstash-redis-url --data-file=- <<< 'your-redis-url'"
echo "  gcloud secrets versions add firebase-config --data-file=- <<< 'your-firebase-config'"

# -----------------------------------------------------------------------------
# Set up Cloud Build trigger
# -----------------------------------------------------------------------------

echo -e "\n${YELLOW}Setting up Cloud Build...${NC}"

# Grant Cloud Build permissions
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role="roles/secretmanager.secretAccessor"

echo -e "${GREEN}✓ Cloud Build configured${NC}"

# -----------------------------------------------------------------------------
# Initialize Terraform
# -----------------------------------------------------------------------------

echo -e "\n${YELLOW}Initializing Terraform...${NC}"

cd ../terraform

# Update tfvars with project ID
sed -i.bak "s/your-gcp-project-id/$PROJECT_ID/g" environments/$ENV/terraform.tfvars

terraform init

echo -e "${GREEN}✓ Terraform initialized${NC}"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Set up Neon database at https://neon.tech"
echo "   - Create a database and copy the connection string"
echo "   - Add to secret: gcloud secrets versions add neon-database-url --data-file=-"
echo ""
echo "2. Set up Upstash Redis at https://upstash.com"
echo "   - Create a Redis database and copy the URL"
echo "   - Add to secret: gcloud secrets versions add upstash-redis-url --data-file=-"
echo ""
echo "3. Set up Firebase at https://console.firebase.google.com"
echo "   - Create a project or link existing GCP project"
echo "   - Enable Authentication (Email/Password)"
echo "   - Copy config to secret: gcloud secrets versions add firebase-config --data-file=-"
echo ""
echo "4. Update Terraform variables in: infra/terraform/environments/$ENV/terraform.tfvars"
echo ""
echo "5. Deploy infrastructure:"
echo "   cd infra/terraform"
echo "   terraform plan -var-file=environments/$ENV/terraform.tfvars"
echo "   terraform apply -var-file=environments/$ENV/terraform.tfvars"
echo ""
echo "6. Build and deploy application:"
echo "   gcloud builds submit --config=cloudbuild.yaml --substitutions=_ENV=$ENV"
