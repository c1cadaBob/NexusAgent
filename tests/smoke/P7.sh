#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

required_files=(
  platform/coordinator/plan-quality.ts
  platform/coordinator/scheduled-goals.ts
  platform/coordinator/token-budget.ts
  platform/coordinator/index.ts
  platform/memory-gateway/index.ts
  platform/skill-evaluation/index.ts
  platform/observability/index.ts
  product/api/index.ts
  product/sdk/src/index.ts
  product/web-console/src/apiClient.ts
  product/web-console/src/main.tsx
  product/web-console/src/viewModel.ts
  product/docs-site/src/catalog.ts
  docs/contracts/openapi.yaml
  tests/unit/plan-quality.test.mjs
  tests/unit/memory-retention.test.mjs
  tests/unit/token-budget.test.mjs
  tests/unit/memory-conflict.test.mjs
  tests/evaluation/p7-skill-regression.test.mjs
  tests/integration/p7-plan-quality-observability.test.mjs
  tests/integration/p7-memory-retention-api.test.mjs
  tests/integration/p7-skill-evaluation-api.test.mjs
  tests/integration/p7-token-budget-api.test.mjs
  tests/integration/p7-memory-conflict-api.test.mjs
  tests/integration/p7-budget-coordinator-enforcement.test.mjs
  tests/contract/p7-token-budget-memory-conflict-openapi.test.mjs
  tests/contract/p7-scheduled-goals-openapi.test.mjs
  tests/security/p7-plan-quality-leakage.test.mjs
  tests/security/p7-memory-retention-leakage.test.mjs
  tests/security/p7-skill-evaluation-leakage.test.mjs
  tests/security/p7-token-budget-memory-conflict-leakage.test.mjs
  tests/security/p7-scheduled-goals-leakage.test.mjs
  tests/unit/scheduled-goals.test.mjs
  tests/integration/p7-scheduled-goals-api.test.mjs
  tests/integration/p7-scheduled-goals-coordinator.test.mjs
  tests/smoke/P7.sh
  docs/planning/task-prompts/P7/P7-01.md
  docs/planning/task-prompts/P7/P7-02.md
  docs/planning/task-prompts/P7/P7-03.md
  docs/planning/task-prompts/P7/P7-04.md
  docs/planning/task-prompts/P7/P7-05.md
  docs/planning/open-questions-register.md
  docs/planning/open-questions/P3-resolution-plan.md
  docs/planning/open-questions/P6-resolution-plan.md
  docs/planning/open-questions/P7-resolution-plan.md
  docs/planning/phase-gates/P7-gate-review.md
  docs/traceability/requirements-matrix.md
  docs/risks/risk-register.md
  docs/README.md
  tests/smoke/README.md
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing P7 required file: $file"
done

for task_id in P7-01 P7-02 P7-03 P7-04 P7-05; do
  audit_block="$(sed -n "/^# ${task_id} 修改记录包$/,/^## 完整提示词$/p" "docs/planning/task-prompts/P7/${task_id}.md")"
  [[ -n "$audit_block" ]] || fail "$task_id audit record package is missing"
  if printf '%s\n' "$audit_block" | rg -q '\.\.\.'; then
    fail "$task_id audit record package still contains placeholder ellipses"
  fi
  for audit_marker in \
    '任务与验收条件' \
    '源码证据' \
    '基线测试' \
    '影响面分析' \
    '修改计划与回滚' \
    '待确认问题' \
    '实际变更文件' \
    '关键改动点' \
    '新增测试' \
    '测试结果' \
    '防绕过测试' \
    '回滚验证'; do
    printf '%s\n' "$audit_block" | rg -q "$audit_marker" || fail "$task_id audit marker missing: $audit_marker"
  done
done

for marker in \
  'nexus.scheduled_goal.p7.v1' \
  'SCHEDULED_GOALS_DEFAULT_ENABLED' \
  'cron_like_utc' \
  'manual_tick' \
  'alpha_in_memory_limits' \
  'LocalScheduledGoals' \
  'source: { kind: "scheduler" }' \
  'scheduled_goal.blocked' \
  'SCHEDULED_GOAL_RETRIED'; do
  rg -F -q "$marker" platform/coordinator/scheduled-goals.ts platform/coordinator/index.ts tests/unit/scheduled-goals.test.mjs tests/integration/p7-scheduled-goals-coordinator.test.mjs || fail "P7 scheduled goal runtime marker missing: $marker"
done

for marker in \
  '/v1/scheduled-goals/config' \
  '/v1/scheduled-goals' \
  '/v1/scheduled-goals/{scheduled_goal_id}' \
  '/v1/scheduled-goals/{scheduled_goal_id}/cancel' \
  '/v1/scheduled-goals/{scheduled_goal_id}/retry' \
  '/v1/scheduled-goals/run-due' \
  'createScheduledGoal' \
  'runDueScheduledGoals' \
  'Scheduled Goals'; do
  rg -F -q "$marker" docs/contracts/openapi.yaml product/api/index.ts product/sdk/src/index.ts product/web-console/src/apiClient.ts product/web-console/src/main.tsx product/web-console/src/viewModel.ts product/docs-site/src/catalog.ts tests/integration/p7-scheduled-goals-api.test.mjs tests/security/p7-scheduled-goals-leakage.test.mjs || fail "P7 scheduled goals API SDK console marker missing: $marker"
done

for marker in \
  'nexus.plan_quality.p7.v1' \
  'PLAN_QUALITY_DEFAULT_ENABLED' \
  'deterministic_static' \
  'not_applicable_p7_01' \
  'evaluateExecutionPlanQuality' \
  'recordPlanQualityEvaluation' \
  'recordPlanQualityWarning' \
  'PLAN_EXECUTOR_POLICY_CONTROLLED'; do
  rg -q "$marker" platform/coordinator/plan-quality.ts tests/unit/plan-quality.test.mjs tests/security/p7-plan-quality-leakage.test.mjs || fail "P7 plan quality marker missing: $marker"
done

for marker in \
  'nexus.memory_retention.p7.v1' \
  'MEMORY_RETENTION_DEFAULT_ENABLED' \
  'MEMORY_RETENTION_POLICY_MODE' \
  'manual_sweep' \
  'softDeleteMemory' \
  'sweepRetention' \
  'audit_snapshot' \
  'MEMORY_RETENTION_EXPIRED'; do
  rg -q "$marker" platform/memory-gateway/index.ts tests/unit/memory-retention.test.mjs tests/security/p7-memory-retention-leakage.test.mjs || fail "P7 memory retention marker missing: $marker"
done

for marker in \
  'nexus.token_budget.p7.v1' \
  'TOKEN_BUDGET_DEFAULT_ENABLED' \
  'TOKEN_BUDGET_DIMENSION_MODE' \
  'all_configured' \
  'TOKEN_BUDGET_ENFORCEMENT_SCOPE' \
  'task_adapter_api' \
  'LocalTokenBudget' \
  'estimateTokenBudgetUnits' \
  'budget.degraded'; do
  rg -F -q "$marker" platform/coordinator/token-budget.ts platform/coordinator/index.ts tests/unit/token-budget.test.mjs tests/integration/p7-budget-coordinator-enforcement.test.mjs || fail "P7 token budget marker missing: $marker"
done

for marker in \
  'nexus.memory_conflict.p7.v1' \
  'MEMORY_CONFLICT_DEFAULT_ENABLED' \
  'MEMORY_CONFLICT_RESOLUTION_MODE' \
  'admin_resolve_queue' \
  'listConflicts' \
  'getConflict' \
  'decideConflict' \
  'memory.conflict_detected' \
  'memory.conflict_decided'; do
  rg -F -q "$marker" platform/memory-gateway/index.ts tests/unit/memory-conflict.test.mjs tests/integration/p7-memory-conflict-api.test.mjs || fail "P7 memory conflict marker missing: $marker"
done

for marker in \
  'nexus.skill_evaluation.p7.v1' \
  'SKILL_EVALUATION_DEFAULT_ENABLED' \
  'approved_rejected_disabled' \
  'deterministic_regression' \
  'LocalSkillEvaluation' \
  'skill_evaluation.completed' \
  'SKILL_EVALUATION_RUNNER_ERROR'; do
  rg -q "$marker" platform/skill-evaluation/index.ts tests/evaluation/p7-skill-regression.test.mjs tests/security/p7-skill-evaluation-leakage.test.mjs || fail "P7 skill evaluation marker missing: $marker"
done

for marker in \
  '/v1/memory/retention' \
  '/v1/memory/retention/sweep' \
  '/v1/memory/{memory_id}/delete' \
  'getMemoryRetentionPolicy' \
  'updateMemoryRetentionPolicy' \
  'sweepMemoryRetention' \
  'deleteMemory'; do
  rg -F -q "$marker" docs/contracts/openapi.yaml product/api/index.ts product/sdk/src/index.ts product/web-console/src/apiClient.ts product/web-console/src/main.tsx product/docs-site/src/catalog.ts tests/integration/p7-memory-retention-api.test.mjs || fail "P7 memory API SDK console marker missing: $marker"
done

for marker in \
  '/v1/skill-evaluations/config' \
  '/v1/skill-evaluations/runs' \
  '/v1/skill-evaluations/runs/{run_id}' \
  'getSkillEvaluationConfig' \
  'updateSkillEvaluationConfig' \
  'runSkillEvaluation' \
  'listSkillEvaluationRuns' \
  'getSkillEvaluationRun' \
  'Evaluations'; do
  rg -F -q "$marker" docs/contracts/openapi.yaml product/api/index.ts product/sdk/src/index.ts product/web-console/src/apiClient.ts product/web-console/src/main.tsx product/web-console/src/viewModel.ts product/docs-site/src/catalog.ts tests/integration/p7-skill-evaluation-api.test.mjs || fail "P7 skill evaluation API SDK console marker missing: $marker"
done

for marker in \
  '/v1/budget/policy' \
  '/v1/budget/ledger' \
  '/v1/budget/check' \
  'getBudgetPolicy' \
  'updateBudgetPolicy' \
  'listBudgetLedger' \
  'checkBudget' \
  'TokenBudgetPolicy'; do
  rg -F -q "$marker" docs/contracts/openapi.yaml product/api/index.ts product/sdk/src/index.ts product/web-console/src/apiClient.ts product/web-console/src/main.tsx product/web-console/src/viewModel.ts product/docs-site/src/catalog.ts tests/integration/p7-token-budget-api.test.mjs || fail "P7 token budget API SDK console marker missing: $marker"
done

for marker in \
  '/v1/memory/conflicts' \
  '/v1/memory/conflicts/{conflict_id}' \
  '/v1/memory/conflicts/{conflict_id}/decision' \
  'listMemoryConflicts' \
  'getMemoryConflict' \
  'decideMemoryConflict' \
  'MemoryConflictRecord'; do
  rg -F -q "$marker" docs/contracts/openapi.yaml product/api/index.ts product/sdk/src/index.ts product/web-console/src/apiClient.ts product/web-console/src/main.tsx product/web-console/src/viewModel.ts product/docs-site/src/catalog.ts tests/integration/p7-memory-conflict-api.test.mjs || fail "P7 memory conflict API SDK console marker missing: $marker"
done

for marker in \
  'planQuality' \
  'PLAN_QUALITY_DEFAULT_ENABLED' \
  'adapter.kind !== "planner"' \
  'Plan quality is a P7 optional signal and must never block task dispatch'; do
  rg -q "$marker" platform/coordinator/index.ts tests/integration/p7-plan-quality-observability.test.mjs || fail "P7 Coordinator integration marker missing: $marker"
done

for marker in \
  '默认关闭' \
  '内部 Observability' \
  'ExecutionPlan' \
  'OQ-PRODUCT-001' \
  'OQ-MEMORY-001' \
  'OQ-BUDGET-001' \
  'P7-01' \
  'P7-02' \
  'P7-03' \
  'P7-04' \
  'P7-05' \
  'Token 预算计费维度' \
  'All configured' \
  'Admin resolve queue' \
  'Cron-like recurrence' \
  'Default Off + manual tick' \
  '定时长期目标任务' \
  'P7 阶段门禁报告' \
  'Conservative retention' \
  'Soft delete' \
  'Manual sweep' \
  '技能自动评测' \
  'Default Off' \
  'Approved + Rejected'; do
  rg -F -q "$marker" docs/planning/task-prompts/P7/P7-01.md docs/planning/task-prompts/P7/P7-02.md docs/planning/task-prompts/P7/P7-03.md docs/planning/task-prompts/P7/P7-04.md docs/planning/open-questions-register.md docs/planning/open-questions/P3-resolution-plan.md docs/planning/open-questions/P6-resolution-plan.md docs/planning/open-questions/P7-resolution-plan.md docs/traceability/requirements-matrix.md docs/risks/risk-register.md docs/README.md tests/smoke/README.md product/api/README.md product/sdk/README.md product/web-console/README.md || fail "P7 documentation marker missing: $marker"
done

if rg -n 'Date\.now\(|datetime\.now\(' platform/coordinator/plan-quality.ts platform/coordinator/scheduled-goals.ts platform/coordinator/token-budget.ts platform/coordinator/index.ts platform/memory-gateway/index.ts platform/skill-evaluation/index.ts product/api/index.ts product/sdk/src/index.ts product/web-console/src product/docs-site/src tests/unit/plan-quality.test.mjs tests/unit/memory-retention.test.mjs tests/unit/token-budget.test.mjs tests/unit/memory-conflict.test.mjs tests/unit/scheduled-goals.test.mjs tests/evaluation/p7-skill-regression.test.mjs tests/integration/p7-plan-quality-observability.test.mjs tests/integration/p7-memory-retention-api.test.mjs tests/integration/p7-skill-evaluation-api.test.mjs tests/integration/p7-token-budget-api.test.mjs tests/integration/p7-memory-conflict-api.test.mjs tests/integration/p7-budget-coordinator-enforcement.test.mjs tests/integration/p7-scheduled-goals-api.test.mjs tests/integration/p7-scheduled-goals-coordinator.test.mjs tests/security/p7-plan-quality-leakage.test.mjs tests/security/p7-memory-retention-leakage.test.mjs tests/security/p7-skill-evaluation-leakage.test.mjs tests/security/p7-token-budget-memory-conflict-leakage.test.mjs tests/security/p7-scheduled-goals-leakage.test.mjs tests/smoke/P7.sh; then
  fail 'wall-clock duration helper detected in P7 optional capability surface'
fi

if rg -n 'platform/adapters|vendor/|Hermes|OpenClaw|DeepSeek|\bDSH\b|Date\.now\(' product/api product/sdk/src product/web-console/src product/docs-site/src; then
  fail 'P7 public product surface contains upstream imports, internal brands, or wall-clock helpers'
fi

if rg -n 'nexus\.plan_quality|plan_quality|plan-quality' docs/contracts product/api product/sdk product/web-console product/docs-site product/channel-management; then
  fail 'P7 plan quality leaked into public product API SDK console docs or OpenAPI surfaces'
fi

node --test \
  tests/unit/plan-quality.test.mjs \
  tests/integration/p7-plan-quality-observability.test.mjs \
  tests/security/p7-plan-quality-leakage.test.mjs \
  tests/unit/memory-retention.test.mjs \
  tests/integration/p7-memory-retention-api.test.mjs \
  tests/security/p7-memory-retention-leakage.test.mjs \
  tests/evaluation/p7-skill-regression.test.mjs \
  tests/integration/p7-skill-evaluation-api.test.mjs \
  tests/security/p7-skill-evaluation-leakage.test.mjs \
  tests/unit/token-budget.test.mjs \
  tests/unit/memory-conflict.test.mjs \
  tests/integration/p7-token-budget-api.test.mjs \
  tests/integration/p7-memory-conflict-api.test.mjs \
  tests/integration/p7-budget-coordinator-enforcement.test.mjs \
  tests/security/p7-token-budget-memory-conflict-leakage.test.mjs \
  tests/contract/p7-token-budget-memory-conflict-openapi.test.mjs \
  tests/unit/scheduled-goals.test.mjs \
  tests/integration/p7-scheduled-goals-api.test.mjs \
  tests/integration/p7-scheduled-goals-coordinator.test.mjs \
  tests/security/p7-scheduled-goals-leakage.test.mjs \
  tests/contract/p7-scheduled-goals-openapi.test.mjs \
  tests/integration/web-console-api-client.test.mjs \
  tests/security/web-console-leakage.test.mjs \
  tests/integration/sdk-typescript-client.test.mjs \
  tests/contract/docs-site-openapi-alignment.test.mjs \
  tests/contract/web-console-openapi-alignment.test.mjs \
  tests/contract/p5-sdk-openapi-contract.test.mjs

echo 'PASS: P7-01 plan quality, P7-02 memory retention, P7-03 skill evaluation regression, P7-04 token budget plus memory conflict controls, and P7-05 scheduled goal task controls, API SDK console integration, leakage guard, docs, and smoke checks'
