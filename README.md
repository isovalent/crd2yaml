# crd2yaml
A CRD to YAML visual config generator

## How run it?

1. Run it in the cloud. 

For example, in GCP Cloud Run.

export PROJECT_ID=<PROJECT_ID>

export REGION=<REGION eg. us-central1>

export LOCAL_BUILD=true

export LOCAL_BUILD_TOOL=<podman|docker>

export LOCAL_PREBUILD=true

bash deploy-cloudrun.sh

2. Run it locally on a PC.

npm install
npm run dev

3. Run it as a container/pod.

Build a container's image locally.
The image ready to use: pjablonski123/visual-crd:latest

## How to use it?

1. Upload or search for a CRD on GitHub. A GH token is stored on the client side only.
2. Upload or search for config YAML examples. 
3. Familiarise yourself with the parameters of the specific CRD through a form or/and a mermaid graph.
4. Modify parameters as needed.
5. Download a YAML configuration file.