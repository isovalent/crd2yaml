#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./deploy-cloudrun.sh [SERVICE_NAME]
# Env (override as needed):
#   PROJECT_ID (required)
#   REGION (default: us-central1)
#   IMAGE (optional; defaults to gcr.io/$PROJECT_ID/$SERVICE:latest)
#   ALLOW_UNAUTH (default: true)

SERVICE=${1:-visual-crd}
PROJECT_ID=${PROJECT_ID:-add-it}
REGION=${REGION:-us-central1}
ALLOW_UNAUTH=${ALLOW_UNAUTH:-true}
IMAGE=${IMAGE:-gcr.io/${PROJECT_ID}/${SERVICE}:latest}

echo "Project:   $PROJECT_ID"
echo "Region:    $REGION"
echo "Service:   $SERVICE"
echo "Image:     $IMAGE"

# Enable services (idempotent)
echo "Enabling required APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project "$PROJECT_ID"

# Ensure Cloud Build can read source from the project Cloud Build bucket
echo "Configuring IAM on Cloud Build source bucket..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
CE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CB_BUCKET="gs://${PROJECT_ID}_cloudbuild"

# Grant Cloud Build SA objectAdmin on the source bucket (to read/write build source)
if ! gcloud storage buckets add-iam-policy-binding "$CB_BUCKET" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/storage.objectAdmin" >/dev/null 2>&1; then
  echo "WARNING: Could not set roles/storage.objectAdmin for ${CB_SA} on ${CB_BUCKET}."
fi

# Also grant Compute Engine default SA viewer on the bucket (some orgs/tools resolve via this SA)
if ! gcloud storage buckets add-iam-policy-binding "$CB_BUCKET" \
  --member="serviceAccount:${CE_SA}" \
  --role="roles/storage.objectViewer" >/dev/null 2>&1; then
  echo "WARNING: Could not set roles/storage.objectViewer for ${CE_SA} on ${CB_BUCKET}."
fi

if [[ "${LOCAL_BUILD:-false}" == "true" ]]; then
  echo "LOCAL_BUILD=true: Building image locally and pushing to registry..."

  # Prefer podman if requested or Docker daemon seems unavailable
  if [[ "${LOCAL_BUILD_TOOL:-}" == "podman" ]] || { ! docker info >/dev/null 2>&1 && command -v podman >/dev/null 2>&1; }; then
    echo "Using podman for build/push"
    echo "Logging into gcr.io with podman via gcloud identity token..."
    if ! podman login gcr.io -u oauth2accesstoken -p "$(gcloud auth print-access-token)"; then
      echo "ERROR: podman login to gcr.io failed. Ensure podman is installed and gcloud is authenticated." >&2
      exit 1
    fi
    if [[ "${LOCAL_PREBUILD:-false}" == "true" ]]; then
      echo "LOCAL_PREBUILD=true: Building assets locally (npm run build)"
      npm ci || npm install
      npm run build
      echo "podman build --platform linux/amd64 -f Dockerfile.runtime -t $IMAGE ."
      podman build --platform linux/amd64 -f Dockerfile.runtime -t "$IMAGE" .
    else
      echo "podman build --platform linux/amd64 -t $IMAGE ."
      podman build --platform linux/amd64 -t "$IMAGE" .
    fi
    echo "podman push $IMAGE"
    podman push "$IMAGE"

  # Next, try docker buildx (BuildKit) if available
  elif docker buildx version >/dev/null 2>&1; then
    echo "Using docker buildx for build/push"
    echo "Authenticating Docker with gcloud for gcr.io..."
    gcloud auth configure-docker gcr.io -q || true
    if [[ "${LOCAL_PREBUILD:-false}" == "true" ]]; then
      echo "LOCAL_PREBUILD=true: Building assets locally (npm run build)"
      npm ci || npm install
      npm run build
      echo "docker buildx build --platform linux/amd64 -f Dockerfile.runtime --push -t $IMAGE ."
      docker buildx build --platform linux/amd64 -f Dockerfile.runtime --push -t "$IMAGE" .
    else
      echo "docker buildx build --platform linux/amd64 --push -t $IMAGE ."
      docker buildx build --platform linux/amd64 --push -t "$IMAGE" .
    fi

  # Fallback to classic docker
  else
    echo "Using classic docker build/push (note: legacy builder is deprecated)"
    echo "Authenticating Docker with gcloud for gcr.io..."
    gcloud auth configure-docker gcr.io -q || true
    echo "docker build -t $IMAGE ."
    docker build -t "$IMAGE" .
    echo "docker push $IMAGE"
    docker push "$IMAGE"
  fi
else
  # Build container with Cloud Build (default)
  echo "Building container with Cloud Build..."
  gcloud builds submit . \
    --tag "$IMAGE" \
    --project "$PROJECT_ID"
fi

# Deploy
echo "Deploying to Cloud Run..."
DEPLOY_FLAGS=(
  --image "$IMAGE"
  --region "$REGION"
  --platform managed
)
if [[ "$ALLOW_UNAUTH" == "true" ]]; then
  DEPLOY_FLAGS+=(--allow-unauthenticated)
fi

gcloud run deploy "$SERVICE" "${DEPLOY_FLAGS[@]}" --project "$PROJECT_ID"

# Ensure public access if requested
if [[ "$ALLOW_UNAUTH" == "true" ]]; then
  echo "Granting public invoker (allUsers) using beta command..."
  if ! gcloud beta run services add-iam-policy-binding "$SERVICE" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --member="allUsers" \
    --role="roles/run.invoker"; then
    echo "WARNING: Failed to add IAM binding for allUsers. Your org policy may block public services."
    echo "You can try again manually with:"
    echo "  gcloud beta run services add-iam-policy-binding $SERVICE --project $PROJECT_ID --region $REGION --member=\"allUsers\" --role=\"roles/run.invoker\""
  fi
fi

# Output URL
echo "Service URL:"
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)'
