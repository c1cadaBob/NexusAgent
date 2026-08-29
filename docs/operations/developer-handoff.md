# P8-04 Developer Handoff

> Marker: `P8-04_DEVELOPER_HANDOFF`.

P8-04 is a delivery and governance task. It does not add public REST routes, SDK methods, console routes, or OpenAPI resources.

## Public Contract

Marker: `openapi_contract`.
Marker: `P8-04_PUBLIC_API_STABILITY`.

- `docs/contracts/openapi.yaml` remains the product API contract.
- Runtime calls continue to use `/v1/*` platform endpoints only.
- Provider and plugin replacement is internal release governance; public request and response schemas must stay stable.
- New delivery files live under `docs/`, `config/`, `scripts/quality/`, and `tests/`.

## SDK And Examples

Marker: `typescript_sdk_examples`.

- The TypeScript SDK remains the only P5/P7 public SDK package in this repository.
- P8-04 does not add SDK methods for delivery, legal, backup, restore, or provider rollout.
- Existing examples continue to use dev bearer tokens and local platform API fixtures.

## Developer Validation

```bash
node scripts/quality/validate-p8-delivery-docs.mjs
node scripts/quality/validate-p8-legal-notice.mjs
node --test tests/deployment/p8-delivery-docs.test.mjs tests/security/p8-delivery-public-surface.test.mjs tests/security/p8-legal-notice-isolation.test.mjs
bash tests/smoke/P8.sh
```

If a provider or plugin changes, update the compatibility matrix first, then rerun the validators and P8 smoke before opening a release review.
