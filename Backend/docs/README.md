# Backend Docs Index

This directory holds backend-specific documentation for the Hermes Agent
runtime that lives under `Backend/`.

## Start Here

- [Backend README](../README.md)
- [Backend agent guide](../AGENTS.md)

## Main Topics

- Runtime and agent behavior: `session-lifecycle.md`, `profile-routing.md`,
  `micro-compaction.md`
- Platform and integration contracts: `relay-connector-contract.md`,
  `streaming-tts.md`, `chronos-managed-cron-contract.md`
- Operational follow-up notes: `rca-ssl-cacert-post-git-pull.md`,
  `billing-lifecycle.md`
- Architecture and design decisions: `ADR.md`

## Rule of Thumb

Keep backend-only docs here. If a document explains both Backend and Frontend
or describes the repository as a whole, place it in the root `docs/` folder.
