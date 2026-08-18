# NexusAgent

NexusAgent is an independent, product-facing AI Agent platform. Hermes, OpenClaw, and DeepSeek Harness are internal implementation dependencies only; their native APIs and concepts are not part of the public platform contract.

## Current status

The repository is in the P0 project-initialization and feasibility-planning stage. This stage contains the project skeleton, upstream snapshots, platform contract placeholders, and implementation planning documentation. It does not contain production business logic.

## Repository map

- `platform/`: platform kernel and internal anti-corruption adapters.
- `product/`: public API, management console, channel management, SDK, and developer-facing material.
- `vendor/`: pinned, locally copied upstream source snapshots. Do not edit the original source directories under `/opt/project/`.
- `deploy/`: development and production orchestration.
- `tests/`: smoke, contract, integration, security, fault-injection, and evaluation tests.
- `docs/`: staged implementation plan and operational documentation.

See [the implementation plan](docs/planning/integrated-platform-plan.md) for the phase gates and delivery criteria.
