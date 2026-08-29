# Development Entry Points

Run commands from the project that owns the code being changed.

## Backend

```bash
cd Backend
uv sync
source .venv/bin/activate
python run_agent.py --help
```

Useful backend references:

- [Backend README](../../Backend/README.md)
- [Backend contributing guide](../../Backend/CONTRIBUTING.md)
- [Backend agent guide](../../Backend/AGENTS.md)
- [Backend docs index](../../Backend/docs/README.md)

## Frontend

```bash
cd Frontend
npm install
npm run dev
```

Useful frontend references:

- [Frontend README](../../Frontend/README.md)
- [Frontend development guide](../../Frontend/DEVELOPMENT.md)
- [Frontend architecture](../../Frontend/ARCHITECTURE.md)
- [Frontend agent guide](../../Frontend/AGENTS.md)
- [Frontend docs index](../../Frontend/docs/README.md)

## Validation

Validation is project-specific:

- Backend: follow the test and lint instructions in
  `Backend/CONTRIBUTING.md` and `Backend/scripts/run_tests.sh`.
- Frontend: use `npm run harness:check`, `npm run test`, `npm run test:e2e`,
  and `npm run build` as appropriate for the change.

Do not run a root-level command that assumes one shared dependency environment.
The root git repository provides version control; each child project owns its
runtime and package tooling.
