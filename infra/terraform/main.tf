# =============================================================================
# DSCR Platform - GCP Infrastructure
# Architecture: Cloud Run + Firebase Auth + Neon + GCS + Pub/Sub + Upstash
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  # Uncomment for remote state (recommended for team use)
  # backend "gcs" {
  #   bucket = "dscr-platform-tfstate"
  #   prefix = "terraform/state"
  # }
}

# -----------------------------------------------------------------------------
# Provider Configuration
# -----------------------------------------------------------------------------

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# Enable Required APIs
# -----------------------------------------------------------------------------

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "pubsub.googleapis.com",
    "storage.googleapis.com",
    "compute.googleapis.com",
    "firebase.googleapis.com",
    "identitytoolkit.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# -----------------------------------------------------------------------------
# Artifact Registry (Container Images)
# -----------------------------------------------------------------------------

resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = "dscr-platform"
  description   = "Docker repository for DSCR Platform"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# Secret Manager - Store sensitive configuration
# -----------------------------------------------------------------------------

resource "google_secret_manager_secret" "neon_database_url" {
  secret_id = "neon-database-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "upstash_redis_url" {
  secret_id = "upstash-redis-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "firebase_config" {
  secret_id = "firebase-config"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# Note: You'll need to add secret versions manually or via CLI:
# echo -n "postgresql://..." | gcloud secrets versions add neon-database-url --data-file=-

# -----------------------------------------------------------------------------
# Cloud Storage - Document Storage
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "documents" {
  name          = "${var.project_id}-loan-documents"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 730 # 2 years
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  # CORS for direct uploads from frontend
  cors {
    origin          = var.allowed_origins
    method          = ["GET", "PUT", "POST", "DELETE"]
    response_header = ["Content-Type", "Authorization"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# Pub/Sub - Event Topics
# -----------------------------------------------------------------------------

resource "google_pubsub_topic" "lead_events" {
  name = "lead-events"

  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "application_events" {
  name = "application-events"

  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "workflow_events" {
  name = "workflow-events"

  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "document_events" {
  name = "document-events"

  depends_on = [google_project_service.apis]
}

# Dead letter topic for failed messages
resource "google_pubsub_topic" "dead_letter" {
  name = "dead-letter"

  depends_on = [google_project_service.apis]
}

# -----------------------------------------------------------------------------
# Service Account for Cloud Run
# -----------------------------------------------------------------------------

resource "google_service_account" "cloudrun_sa" {
  account_id   = "dscr-cloudrun-sa"
  display_name = "DSCR Platform Cloud Run Service Account"

  depends_on = [google_project_service.apis]
}

# Grant necessary permissions
resource "google_project_iam_member" "cloudrun_sa_roles" {
  for_each = toset([
    "roles/secretmanager.secretAccessor",
    "roles/storage.objectAdmin",
    "roles/pubsub.publisher",
    "roles/pubsub.subscriber",
    "roles/logging.logWriter",
    "roles/cloudtrace.agent",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# -----------------------------------------------------------------------------
# Cloud Run - API Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "api" {
  name     = "dscr-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloudrun_sa.email

    scaling {
      min_instance_count = var.environment == "prod" ? 1 : 0
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/dscr-platform/api:${var.api_image_tag}"

      ports {
        container_port = 3001
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
        cpu_idle = true # Scale to zero
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCS_BUCKET_DOCUMENTS"
        value = google_storage_bucket.documents.name
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.neon_database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.upstash_redis_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "FIREBASE_CONFIG"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.firebase_config.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 3001
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 3001
        }
        period_seconds    = 30
        failure_threshold = 3
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.main,
    google_project_iam_member.cloudrun_sa_roles,
  ]
}

# -----------------------------------------------------------------------------
# Cloud Run - Frontend Service
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "frontend" {
  name     = "dscr-frontend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloudrun_sa.email

    scaling {
      min_instance_count = var.environment == "prod" ? 1 : 0
      max_instance_count = 5
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/dscr-platform/frontend:${var.frontend_image_tag}"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = "https://${var.api_domain}"
      }

      env {
        name  = "NEXT_PUBLIC_FIREBASE_CONFIG"
        value = var.firebase_public_config
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.main,
  ]
}

# -----------------------------------------------------------------------------
# IAM - Allow public access to Cloud Run services
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  location = google_cloud_run_v2_service.frontend.location
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "api_url" {
  description = "URL of the API service"
  value       = google_cloud_run_v2_service.api.uri
}

output "frontend_url" {
  description = "URL of the frontend service"
  value       = google_cloud_run_v2_service.frontend.uri
}

output "documents_bucket" {
  description = "Name of the documents bucket"
  value       = google_storage_bucket.documents.name
}

output "artifact_registry" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/dscr-platform"
}
