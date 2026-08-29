# Backend Project Notes

This section summarizes the backend project that lives in `Backend/`.

## What It Owns

- Hermes Agent runtime and conversation loop
- CLI and gateway orchestration
- cron scheduler and job execution
- tool, plugin, skill, and memory infrastructure
- backend scripts, tests, and backend-specific docs

## Primary References

- [Backend README](../../Backend/README.md)
- [Backend agent guide](../../Backend/AGENTS.md)
- [Backend docs index](../../Backend/docs/README.md)

## Doc Placement Guidance

Keep backend-specific documentation next to the backend code under `Backend/`.
Use `docs/` only for content that needs to describe the whole repository or the
relationship between the backend and the frontend.
