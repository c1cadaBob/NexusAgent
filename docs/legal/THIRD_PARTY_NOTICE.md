# THIRD_PARTY_NOTICE

> Marker: `P8-04_LEGAL_NOTICE_PACKAGE`.
>
> Scope: P8 Alpha repository release package for `OQ-LEGAL-001`.

This document records the repository-level third-party notice evidence used by P8-04. It does not grant tenant self-service plugin installation, does not include secret values, and does not replace customer-specific legal review.

## Included Provider Sources

| Component | Role | License Evidence | Notice Status | Hash Evidence |
|---|---|---|---|---|
| Hermes | planner-only internal provider | `vendor/hermes-agent-main/LICENSE` | recorded | `7407f4aa1c4b7058c4df8bad02b07be45e0bc2d321804095a3873550dad46d3a` |
| OpenClaw | gateway-only internal provider | `vendor/openclaw-main/LICENSE` | recorded | `ba6799694e6aabe947b110bd1091cac0c015c1b008d96ca924fc6daa45422a91` |
| DSH | executor-only internal provider | `vendor/deepseek-harness-master/LICENSE` | recorded | `e73c0ee88a4d5522e8d37a8ffc9cc3204d777a829810d302267a10c9c1048b25` |

## Nested Notice Evidence

P8-04 records nested license and notice evidence for bundled plugin, package, and native-support directories through `config/legal-notice.p8.json`. The validator confirms those referenced files exist before P8 smoke can pass.

## Governed Plugin Evidence

The P8 plugin compatibility matrix records each default governed plugin with `plugin_id`, `capability_id`, `source_kind`, `version`, `sha256`, `license`, `notice_status`, `risk_level`, `allowlist_status`, `rollback_target`, and required tests. Missing license, missing notice, missing hash, missing rollback target, unapproved status, or breaking-change state keeps promotion paused.

## Closure Statement

`OQ-LEGAL-001` is closed for the P8 Alpha repository release package because provider root licenses, nested notice evidence, plugin license metadata, plugin notice metadata, hashes, release pause policy, rollback targets, and validation gates are all present. Upstream remote identity remains a separate release-pause issue tracked by `OQ-UPSTREAM-001`, `OQ-UPSTREAM-002`, and `OQ-UPSTREAM-003`.

## Validation

Run `node scripts/quality/validate-p8-legal-notice.mjs` and `bash tests/smoke/P8.sh` before release review.
