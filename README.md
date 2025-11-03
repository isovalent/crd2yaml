# 🧩 crd2yaml
A CRD → YAML visual configuration generator


![Demo](./visual-crd-demo.gif)


---

## 🚀 How to Run

### 1️⃣ Run it in the Cloud (e.g., GCP Cloud Run)

```bash
export PROJECT_ID=<PROJECT_ID>
export REGION=<REGION>            # e.g. us-central1
export LOCAL_BUILD=true           # build locally instead of Cloud Build
export LOCAL_BUILD_TOOL=<podman|docker>
export LOCAL_PREBUILD=true        # run npm install && npm run build locally

bash deploy-cloudrun.sh
```
Open https://[cloudrun-url] in your browser.

### Note: Requirements to run deploy-cloudrun.sh

#### Prerequisites

- gcloud (Google Cloud SDK) installed
- Docker or Podman if using `LOCAL_BUILD=true`
- Billing enabled on the project

#### Authenticate and set project

```bash
gcloud auth login
gcloud config set project "$PROJECT_ID"
# Optional for Docker auth (Container Registry):
gcloud auth configure-docker gcr.io
```

#### APIs

- Script enables these automatically (idempotent):
  - `run.googleapis.com`
  - `cloudbuild.googleapis.com`
  - `artifactregistry.googleapis.com`

#### Required permissions (for your user)

- Enable services:
  - `roles/serviceusage.serviceUsageAdmin`
- Deploy to Cloud Run:
  - `roles/run.admin`
  - `roles/iam.serviceAccountUser` on the runtime service account (if using a non-default SA or specifying one)
- Cloud Build (if not using `LOCAL_BUILD=true`):
  - `roles/cloudbuild.builds.editor`
- Push/pull container images:
  - If using Container Registry (gcr.io): `roles/storage.admin` (or at least `roles/storage.objectAdmin`) on the project’s GCR bucket
  - If using Artifact Registry: `roles/artifactregistry.writer` to push
  - Cloud Run runtime SA needs `roles/artifactregistry.reader` (if using AR)

#### Script IAM changes

- The script attempts to grant on the Cloud Build source bucket:
  - `roles/storage.objectAdmin` to the Cloud Build SA
  - `roles/storage.objectViewer` to the Compute Engine default SA
- If your user lacks storage admin on that bucket, the script will warn and those bindings may not apply.

#### Local build mode (`LOCAL_BUILD=true`)

- Requires Docker/Podman installed
- Auth to gcr.io via your gcloud token, e.g. (Podman):
  ```bash
  podman login gcr.io -u oauth2accesstoken -p "$(gcloud auth print-access-token)"

#### Push permissions

- Your user must have permission to push images (see roles below).

#### Quick checklist

```bash
gcloud auth login
gcloud config set project "$PROJECT_ID"
# Ensure billing is enabled on the project

# Optional for Docker auth (Container Registry):
gcloud auth configure-docker gcr.io
```

#### Roles

- `roles/run.admin`
- `roles/serviceusage.serviceUsageAdmin`
- `roles/cloudbuild.builds.editor`
- `roles/storage.admin` (or `roles/artifactregistry.writer`)
- `roles/iam.serviceAccountUser` on runtime SA (if applicable)

### 2️⃣ Run it Locally

```bash
npm install
npm run dev
```
Open http://localhost:5173 in your browser.

### 3️⃣ Run it as a Container/Pod

Build the image locally or use the prebuilt version.

- Local build

```bash
# Example:
# docker build -t <repo>/<image>:<tag> .
```

- Run a pod on a local Kubernetes cluster

```bash
kubectl apply -f k8s-visual-crd.yaml
kubectl port-forward svc/visual-crd 8080:12080
```
Open http://localhost:12080 in your browser.

- Prebuilt image

```bash
docker pull pjablonski123/visual-crd:latest
docker run -p 8080:12080 pjablonski123/visual-crd:latest
```
Open http://localhost:12080 in your browser.

---

## 🧠 How to Use

- Upload or search for a CRD on GitHub.
  - The GitHub token is optional and stored on the client side only.
- Upload or search for configuration YAML examples.
- Explore CRD parameters via an auto-generated form and a Mermaid diagram.
- Modify parameters as needed using the generated form.
- Download the generated YAML configuration file.

---

## 🧾 Example Workflow

```mermaid
flowchart TD
    A[Upload CRD] --> B[Parse CRD Schema]
    B --> C[Generate Form / Graph View]
    C --> D[Modify Parameters]
    D --> E[Export YAML Config]
```

---

## 🧰 Technologies Used

- Node.js / React – UI and logic
- Mermaid.js – CRD visualization
- GitHub API – CRD and YAML discovery
- Cloud Run / Docker / Podman – deployment

---

## 🪪 License

This project is released under the Apache License 2.0.  
You are free to use, modify, and distribute it under the terms of that license.  
See the LICENSE file for details.

---

## 🤖 AI Generation Note

Human-led project development. The project’s code and documentation were generated using an LLM. Then human edits focused on testing, deployment, and formatting.

---

## 👥 Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/my-change`
3. Make your changes and add tests if applicable.
4. Commit and push: `git push origin feat/my-change`
5. Open a Pull Request and describe the changes.
