# P8-04 Administrator Handoff

> Marker: `P8-04_ADMIN_HANDOFF`.

This handoff is for platform administrators operating the P8 Alpha production templates. It does not add product routes, tenant self-service plugin installation, real channel delivery, or new credentials.

## Platform Admin Controls

Marker: `platform_admin_controls`.

- Deploy with the Kubernetes primary path from `deploy/k8s/`, or use `deploy/docker-compose.prod.yml` only for single-node private deployments and fault reproduction.
- Keep only `platform-api` and `web-console` on the public edge; all adapters and data services stay internal-only.
- Manage plugins through the existing platform admin governance API and console actions: import metadata, approve, disable, reject, and confirm `sha256`, `license`, `notice_status`, `risk_level`, and `rollback_target`.
- Promotion remains canary-first. Provider or plugin changes update compatibility matrices and release manifests, not public API shapes.
- Use `docs/legal/THIRD_PARTY_NOTICE.md` and `config/legal-notice.p8.json` as the P8 Alpha repository legal package.

## Tenant Admin Controls

Marker: `tenant_admin_controls`.

- Tenant admins can manage their tenant-scoped users, channels, memory retention, skill evaluations, budget policy views, memory conflict decisions, and scheduled goals according to existing RBAC.
- Tenant admins cannot import or install arbitrary third-party plugins.
- Tenant-visible screens must show only platform fields and platform errors. Raw provider payloads, native paths, sessions, and secret values stay outside user-visible surfaces.

## Release Review Checklist

- Run `bash tests/smoke/P8.sh` after any delivery package edit.
- Confirm `OQ-LEGAL-001` remains closed by the P8-04 legal package.
- Confirm `OQ-UPSTREAM-001`, `OQ-UPSTREAM-002`, and `OQ-UPSTREAM-003` remain release-paused until upstream identity is confirmed.
- Confirm rollback targets exist before promoting a candidate provider, plugin, or image set.
