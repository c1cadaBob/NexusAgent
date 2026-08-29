# Project Docs

This repository contains two separate products that share one git root:

- `Backend/` - Hermes Agent runtime, CLI, gateway, cron, tools, plugins, and supporting docs
- `Frontend/` - Hermes Studio web UI, server, desktop shell, tests, and supporting docs

The purpose of this folder is to hold repository-level documentation that spans
both projects.

## Start Here

- [Repository layout](./project-layout.md)
- [Project boundaries](./architecture/repository-boundaries.md)
- [Development entry points](./development/README.md)
- [Documentation ownership map](./documentation-map.md)
- [Backend project notes](./backend/README.md)
- [Frontend project notes](./frontend/README.md)

## Documentation Rules

- Put backend-only documentation next to backend code under `Backend/`.
- Put frontend-only documentation next to frontend code under `Frontend/`.
- Put cross-project documentation in this folder.
- When a document describes both projects, prefer a repo-level file here instead
  of copying the same content into each project.
