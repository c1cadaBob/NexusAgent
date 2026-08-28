# P8 Docker Build Entrypoints

P8-02 only publishes container images for services with real runtime entrypoints in this repository:

- `platform-api`: Node HTTP runtime from `product/api/server.mjs` plus platform modules.
- `web-console`: Vite static build served by the production static server in this directory.

The remaining P8-01 internal services stay as external production image references in Compose and Kubernetes templates until their production runtimes are supplied by later tasks or deployment owners. Release manifests must keep those references explicit and must not promote them as locally publishable images.
