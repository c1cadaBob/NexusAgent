# Documentation Ownership Map

The repository now has three documentation layers.

## Root Documentation

Use the root `docs/` directory for information that applies to both projects:

- repository layout
- Backend and Frontend ownership boundaries
- cross-project development workflows
- documentation conventions

Current root entry points:

- `docs/README.md`
- `docs/project-layout.md`
- `docs/architecture/repository-boundaries.md`
- `docs/development/README.md`

## Backend Documentation

Backend-only documentation stays in `Backend/`:

- `Backend/README*.md` for product and user-facing entry points
- `Backend/AGENTS.md` for backend coding-agent guidance
- `Backend/CONTRIBUTING*.md` for contributor workflow
- `Backend/docs/` for backend design, operations, and contracts

The backend docs were kept in place because their references and examples are
specific to Hermes Agent internals.

## Frontend Documentation

Frontend-only documentation stays in `Frontend/`:

- `Frontend/README*.md` for Studio product entry points
- `Frontend/AGENTS.md` for frontend coding-agent guidance
- `Frontend/ARCHITECTURE.md` for package and runtime boundaries
- `Frontend/DEVELOPMENT.md` for development and validation rules
- `Frontend/docs/` for Studio architecture, harness, planning, and operations

The frontend docs were kept in place because they describe Studio packages,
routes, tests, and release workflows.

## Adding New Documentation

Before creating a document, decide whether its examples and commands target
Backend, Frontend, or both:

1. Backend-only: add it under `Backend/docs/`.
2. Frontend-only: add it under `Frontend/docs/`.
3. Cross-project: add it under the root `docs/`.

Prefer linking to an existing source document over copying its content into
another directory.
