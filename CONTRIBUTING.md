# Contributing

All work is performed inside `/opt/project/NexusAgent`.

## Branches and commits

- Create one branch per task: `feature/<TASK-ID>-<short-description>`.
- Include the task ID in every commit message, for example `P0-01: initialize project structure`.
- Do not merge a task until its documented acceptance checks and quality gates pass.
- The `main` branch is locked after P0 and receives changes only through reviewed merges.

## Dependency boundary

The directories under `vendor/` are platform-internal implementation dependencies. Public product code must call platform contracts and adapters, never a native Hermes, OpenClaw, or DSH interface directly.

## Required checks

Run the checks listed in the task's acceptance criteria and record the commands and results in the task documentation. Never commit credentials, local environment files, build output, or dependency caches.
