# Project Boundaries

NexusAgent is a monorepo with two related projects. The directory names are
intentionally kept stable:

- `Backend/` is the Hermes Agent project.
- `Frontend/` is the Hermes Studio project.

They are related at runtime, but they are not interchangeable codebases.

## Backend Ownership

```text
Backend/
├── agent/              # Agent internals and provider adapters
├── gateway/            # Messaging gateway and platform adapters
├── tools/              # Agent-callable tools and environments
├── plugins/            # Runtime extension packages
├── skills/             # Bundled skills
├── cron/               # Scheduler and job execution
├── hermes_cli/         # CLI support modules
├── ui-tui/             # Hermes terminal UI
├── web/                # Hermes web surface
├── website/            # Hermes documentation website
├── apps/               # Hermes desktop and installer applications
├── tests/              # Python and runtime tests
└── docs/               # Backend-only documentation
```

`Backend/ui-tui`, `Backend/web`, `Backend/website`, and
`Backend/apps/desktop` are Hermes Agent's own delivery surfaces. They should
not be confused with the Hermes Studio project in `Frontend/`.

## Frontend Ownership

```text
Frontend/
├── packages/client/    # Vue client, routes, stores, API helpers, i18n
├── packages/server/    # Koa server, APIs, persistence, runtime adapters
├── packages/ekko-agent/ # Ekko runtime and related package APIs
├── packages/desktop/   # Hermes Studio Electron application
├── packages/esp32-c3/  # Device firmware packages
├── bin/                # Studio command-line entry points
├── scripts/            # Build, development, and validation scripts
├── tests/              # Client, server, shared, and E2E tests
└── docs/               # Frontend-only documentation
```

`Frontend/` owns the Studio product experience and its supporting server. It
integrates with Hermes Agent through runtime and profile interfaces; it does not
replace the Hermes Agent runtime.

## Shared Root Ownership

```text
docs/
├── architecture/       # Cross-project ownership and integration decisions
├── backend/            # Navigation for Backend docs
├── frontend/           # Navigation for Frontend docs
└── development/        # Cross-project developer workflows
```

Only repository-wide material belongs in the root `docs/` directory. A document
that describes one project's implementation should remain beside that project.

## Change Routing

Use the following routing rules when adding or moving files:

| Change | Location |
| --- | --- |
| Agent loop, model provider, gateway, tool, skill, plugin, or cron behavior | `Backend/` |
| Hermes Studio UI, Studio API, Studio persistence, Ekko integration, or desktop shell | `Frontend/` |
| Cross-project protocol, shared workflow, repository layout, or release coordination | Root `docs/` |
| Generated build output, caches, local runtime state, or credentials | Ignore; do not commit |

Avoid introducing imports or build-time dependencies between the two projects
just to share documentation or small helpers. Coordinate at the documented
interfaces instead.
