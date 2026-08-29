# P8-04 Delivery Readiness

> Marker: `P8-04_DELIVERY_DOCS_COMPLETE`.

P8-04 closes the delivery documentation package for P8 Alpha. The package is designed so a new environment can deploy, upgrade, and roll back using repository instructions and repeatable gates.

## Delivery Paths

- `kubernetes_primary_path`: use `deploy/k8s/` and `docs/operations/production-orchestration.md` for standard production deployment.
- `compose_private_path`: use `deploy/docker-compose.prod.yml` for private single-node deployments and fault reproduction.
- `deploy_from_docs`: operators can follow the orchestration, release, alert, backup, restore, and handoff documents without changing public product contracts.

## Upgrade And Rollback

- `upgrade_from_docs`: upgrades follow `docs/operations/upgrade-migration.md`, candidate manifest generation, canary-first promotion, compatibility matrices, and P8 smoke.
- `rollback_from_docs`: rollbacks follow the previous image tag, provider rollback target, plugin rollback target, and backup/restore checkpoint.
- `provider_plugin_contract_stability`: provider and plugin changes stay behind platform adapters, Coordinator, Policy-Gate, and compatibility gates.

## Legal Package

- `legal_notice_closed`: `OQ-LEGAL-001` is closed for the P8 Alpha repository release package by `config/legal-notice.p8.json` and `docs/legal/THIRD_PARTY_NOTICE.md`.
- External legal opinions or customer contract review remain outside repository automation and must not be invented in docs.

## Validation

```bash
node scripts/quality/validate-p8-delivery-docs.mjs
node scripts/quality/validate-p8-legal-notice.mjs
node --test tests/deployment/p8-delivery-docs.test.mjs tests/security/p8-delivery-public-surface.test.mjs tests/security/p8-legal-notice-isolation.test.mjs
bash tests/smoke/P8.sh
```
