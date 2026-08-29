# Repository Layout

The repository is organized around two independently maintained projects:

```text
/
├── Backend/   # Hermes Agent runtime, CLI, gateway, plugins, cron, and docs
├── Frontend/  # Hermes Studio web UI, server, desktop shell, tests, and docs
└── docs/      # Repository-level documentation and coordination notes
```

## Ownership

| Path | Responsibility |
| --- | --- |
| `Backend/` | Backend runtime, agent loop, CLI, gateway, cron, tools, plugins, scripts, and backend-specific documentation. |
| `Frontend/` | Web UI, server, desktop shell, shared frontend packages, tests, and frontend-specific documentation. |
| `docs/` | Repository-wide docs that explain the split, the directory map, and cross-project workflows. |

## Current Doc Placement

- Backend product and maintenance docs stay under `Backend/README.md`,
  `Backend/AGENTS.md`, and `Backend/docs/`.
- Frontend product and maintenance docs stay under `Frontend/README.md`,
  `Frontend/AGENTS.md`, `Frontend/DEVELOPMENT.md`, `Frontend/ARCHITECTURE.md`,
  and `Frontend/docs/`.
- Shared guidance lives here in `docs/`.

## Maintenance Rule

If a future document applies to only one project, keep it inside that project.
If it applies to both projects or explains how they fit together, place it in
`docs/`.
