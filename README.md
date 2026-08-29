# NexusAgent

NexusAgent is a repository that stores two related but independently organized
projects:

- [Backend](./Backend/) - Hermes Agent runtime and backend services
- [Frontend](./Frontend/) - Hermes Studio web UI, server, and desktop client

Repository-level documentation is collected in [docs/](./docs/).

## Repository Map

```text
NexusAgent/
├── Backend/       # Hermes Agent runtime, gateway, CLI, tools, plugins, skills
├── Frontend/      # Hermes Studio client, server, desktop, and tests
└── docs/          # Shared architecture, development, and documentation indexes
```

The two projects keep their own dependency manifests, test suites, CI
configuration, and project-specific documentation. Run commands from the
project they belong to.

## Project Entry Points

### Backend

The backend project owns the Hermes Agent runtime and its surrounding
execution surfaces:

- agent loop and providers
- CLI and messaging gateway
- tools, skills, plugins, and memory
- cron and job execution
- Hermes TUI, web, desktop, and website surfaces

Start with [Backend/README.md](./Backend/README.md) and
[docs/backend/README.md](./docs/backend/README.md).

### Frontend

The frontend project owns Hermes Studio:

- Vue client and browser dashboard
- Koa server and Studio APIs
- Ekko Agent package
- Electron desktop distribution
- Studio tests, scripts, and release workflows

Start with [Frontend/README.md](./Frontend/README.md) and
[docs/frontend/README.md](./docs/frontend/README.md).

## Local Development

Backend commands:

```bash
cd Backend
uv sync
source .venv/bin/activate
python run_agent.py --help
```

Frontend commands:

```bash
cd Frontend
npm install
npm run dev
```

The commands above are entry points only. Each project README and development
guide contains its complete setup and validation instructions.

## Documentation

- [Repository layout](./docs/project-layout.md)
- [Project boundaries](./docs/architecture/repository-boundaries.md)
- [Development entry points](./docs/development/README.md)
- [Documentation ownership map](./docs/documentation-map.md)
- [Backend documentation index](./docs/backend/README.md)
- [Frontend documentation index](./docs/frontend/README.md)

## Version Control

The repository uses one root git history with `main` as the shared development
branch. Backend and Frontend changes may be committed together when they form a
single feature, but unrelated changes should remain in separate commits.
