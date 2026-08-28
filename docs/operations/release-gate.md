# P8-02 Release Gate

P8-02 defines the production release gate for NexusAgent without changing public REST, SDK, or console behavior.

## Decisions

- Schema marker: `nexus.release_gate.p8.v1`.
- Release behavior: `tag_push_ghcr`.
- Tag pattern: `v*`.
- Promotion strategy: `canary_first`.
- Upstream check mode: `optional_remote`.
- Image publish scope: `real_runtime_only`.
- Release pause marker: `P8-02_RELEASE_PAUSE_CANARY_ONLY`.

## Quality Gate

The GitHub Actions workflow at `.github/workflows/p8-release-gate.yml` blocks release work behind the same local checks used by engineers:

- `scripts/planning/generate-task-prompts.py --check`.
- `git diff --check` and non-vendor diff check.
- `node scripts/quality/validate-p8-release-gate.mjs`.
- `node scripts/upstream-tracking/validate-provider-compatibility.mjs`.
- `node scripts/upstream-tracking/weekly-upstream-check.mjs`.
- P8-02 targeted deployment/security tests.
- `bash tests/smoke/P0.sh` through `bash tests/smoke/P8.sh`.

Failed gates prevent the release job from running because `build-and-push-ghcr` depends on `quality-gate`.

## GHCR Publishing

Tag pushes matching `v*` publish only the repository runtimes that have real build entries:

- `ghcr.io/c1cadabob/nexusagent/platform-api` from `deploy/docker/platform-api.Dockerfile`.
- `ghcr.io/c1cadabob/nexusagent/web-console` from `deploy/docker/web-console.Dockerfile`.

The workflow uses the GitHub Actions `GITHUB_TOKEN` through `docker/login-action@v3`; no registry token or local credential is committed. Candidate images are tagged with the release tag and source commit SHA.

The remaining P8-01 internal services must be supplied through explicit production image references before production default promotion. The release manifest keeps those services under `external_image_refs` and sets production default promotion to blocked.

## Canary And Rollback

P8-02 does not automatically promote any provider, plugin, or image set to production default. A tag release can publish candidate images, but production promotion remains blocked until a canary review confirms:

- all quality gates passed;
- provider and plugin compatibility matrices have rollback targets;
- upstream identity is confirmed or accepted with documented release pause override;
- internal service image references are supplied for production templates.

Rollback uses the previous default image tag plus provider/plugin `rollback_target` entries in the compatibility matrices. If any rollback target is missing, release validation must fail closed.

## Local Commands

```bash
node scripts/quality/validate-p8-release-gate.mjs
node scripts/upstream-tracking/validate-provider-compatibility.mjs
node scripts/upstream-tracking/weekly-upstream-check.mjs
node scripts/upstream-tracking/generate-release-manifest.mjs
node --test tests/deployment/p8-release-gate.test.mjs tests/deployment/p8-provider-compatibility.test.mjs tests/security/p8-release-supply-chain.test.mjs
bash tests/smoke/P8.sh
```
