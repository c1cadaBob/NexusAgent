# NexusAgent Platform API

P5-01 delivers the local REST MVP for platform resources. The service uses Node built-ins and existing platform modules only; no root package manager dependency is required.

## Local runtime

```bash
PORT=8080 node product/api/server.mjs
```

The service exposes `/v1/health` without authentication. All other routes require one of the local development bearer tokens:

- `dev-platform-admin`: platform administration and plugin governance.
- `dev-tenant-admin-alpha`: tenant-scoped administration.
- `dev-operator-alpha`: task, memory, approval, and budget operations.
- `dev-viewer-alpha`: read-only tenant visibility.

## P5-01 scope

- REST is the executable contract for P5-01; gRPC and streaming remain documented follow-up work.
- API state is local and in-memory for alpha contract tests.
- Plugin governance imports metadata, approval state, risk, license, notice, hash, and capability projections only. It does not fetch packages, run plugins, or contact external services.
- Public responses are checked before return so blocked implementation details, local paths, endpoint references, session identifiers, and secret material fail closed.
