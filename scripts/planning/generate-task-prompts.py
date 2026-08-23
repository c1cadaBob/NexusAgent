#!/usr/bin/env python3
"""Validate or generate NexusAgent task implementation prompt documents.

Safe default: running the script without flags performs coverage and governance
checks only. Use ``--write`` to create missing prompt documents. Use
``--write --overwrite`` only when a deliberate regeneration review is intended.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "docs/planning/integrated-platform-plan.md"
SCHEDULE = ROOT / "docs/planning/development-schedule.md"
TRACEABILITY = ROOT / "docs/traceability/requirements-matrix.md"
RISKS = ROOT / "docs/risks/risk-register.md"
OPEN_QUESTIONS_REGISTER = ROOT / "docs/planning/open-questions-register.md"
OPEN_QUESTIONS_DIR = ROOT / "docs/planning/open-questions"
OUT_DIR = ROOT / "docs/planning/task-prompts"
GENERATED_UTC = "2026-08-23"

READONLY_UPSTREAM_PATHS = (
    "/opt/project/hermes-agent-main",
    "/opt/project/openclaw-main",
    "/opt/project/deepseek-harness-master",
)

ALLOWED_WRITE_PATHS = (
    "vendor/",
    "platform/",
    "product/",
    "docs/",
    "tests/",
    "deploy/",
    "config/",
    "scripts/",
)

PHASE_RULES = {
    "P0": "先证据后结论；不写生产业务代码；所有上游行为必须有源码路径、行号、调用图或实验命令；未确认内容必须登记或引用 OQ 台账；阶段结束前必须回扫历史问题。",
    "P1": "优先建立 contracts、状态机、Coordinator、Policy-Gate、Clock、Event Bus 和最小本地存储；先跑通 mock adapter 生命周期，再接真实上游；基础设施选型仍需绑定 OQ 关闭证据。",
    "P2": "DSH 只能 executor-only；不得暴露 DSH 原生 API/URL/错误码；必须安排沙箱越权、stdout/stderr 脱敏、artifact 引用和 provider 回滚验证。",
    "P3": "Hermes 只能 planner-only；不得执行工具或启动原生网关；Memory 读写必须通过平台代理；skills/MCP/Agent Plugins 只能经 Plugin Bridge 白名单变成 planner hint 或 ToolIntent。",
    "P4": "OpenClaw 只能 gateway-only；渠道消息必须经过 Coordinator 和 Policy-Gate；继续/重做/取消必须映射为平台 attempt/task 语义；渠道插件必须经白名单启用。",
    "P5": "产品层只暴露平台 API、控制台、渠道管理、插件治理和 SDK；公共响应、日志、错误码、控制台和 SDK 不得出现上游原生概念。",
    "P6": "主攻 E2E、安全、防绕过、故障注入、恶意插件和降级路线；不得新增非必要功能；正向链路和负向链路都必须可重复验收。",
    "P7": "P7 是可裁剪阶段；每项高级能力必须有开关、指标、资源预算和回退路径，不得阻塞 MVP。",
    "P8": "生产交付必须关闭热更新和调试端口；内部 adapter 不得直接对外暴露；备份恢复、告警、provider/插件升级回滚和交付手册必须可验收。",
}

ROLE_KEYWORDS = (
    ("P0-01", "项目初始化与 vendor 快照治理工程师"),
    ("P0-02", "OpenClaw gateway-only 剥离实验工程师"),
    ("P0-03", "Hermes planner-only 剥离实验工程师"),
    ("P0-04", "DSH executor-only 剥离实验工程师"),
    ("P0-05", "上游接口摸底与兼容性登记工程师"),
    ("P0-06", "平台 OpenAPI 契约设计工程师"),
    ("P0-07", "十个基础服务蓝图架构师"),
    ("P0-08", "开发排期与资源计划工程师"),
    ("P0-09", "AI 排期提示词与待确认问题治理工程师"),
    ("P0-10", "任务提示词文档与生成器治理工程师"),
    ("P0-11", "P0 待确认问题同步修复工程师"),
    ("OpenClaw", "OpenClaw gateway-only 与渠道插件治理工程师"),
    ("Hermes", "Hermes planner-only 与记忆隔离工程师"),
    ("DSH", "DSH executor-only 与沙箱执行工程师"),
    ("Coordinator", "Coordinator 与 Policy-Gate 平台内核工程师"),
    ("Policy-Gate", "Coordinator 与 Policy-Gate 平台内核工程师"),
    ("Artifact", "Artifact/Memory/Credential 平台服务工程师"),
    ("Memory", "Artifact/Memory/Credential 平台服务工程师"),
    ("凭据", "Credential Center 安全工程师"),
    ("REST", "平台 API 与契约测试工程师"),
    ("gRPC", "平台 API 与契约测试工程师"),
    ("Web", "Web 管理控制台与插件治理前端工程师"),
    ("渠道", "渠道管理与插件白名单工程师"),
    ("SDK", "SDK 与开发者文档工程师"),
    ("安全", "安全、防绕过与越权测试工程师"),
    ("故障", "故障注入与降级路径工程师"),
    ("生产", "生产编排与 SRE 交付工程师"),
    ("CI/CD", "CI/CD、发布与上游追踪工程师"),
    ("告警", "告警、备份与恢复工程师"),
    ("交付文档", "交付文档、升级迁移与回滚手册工程师"),
)


@dataclass(frozen=True)
class Task:
    task_id: str
    name: str
    stage: str
    paths: str
    change: str
    inputs: str
    outputs: str
    acceptance: str
    estimate: str
    dependencies: str
    blockers: str


@dataclass(frozen=True)
class Requirement:
    req_id: str
    summary: str
    phase: str
    tasks: str
    tests: str


@dataclass(frozen=True)
class Risk:
    risk_id: str
    risk: str
    level: str
    status: str
    phase: str


@dataclass(frozen=True)
class OpenQuestion:
    oq_id: str
    status: str
    category: str
    description: str
    owner: str
    deadline: str
    solution_docs: str
    close_commit: str


def split_row(line: str) -> list[str]:
    text = line.strip()
    if not (text.startswith("|") and text.endswith("|")):
        return []
    return [part.strip() for part in text.strip("|").split("|")]


def phase_number(phase: str) -> int:
    match = re.search(r"P([0-8])", phase)
    return int(match.group(1)) if match else 8


def phase_in_spec(spec: str, phase: str) -> bool:
    target = phase_number(phase)
    normalized = spec.replace(" ", "")
    for match in re.finditer(r"P(\d)(?:-P?(\d))?", normalized):
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else start
        if start <= target <= end:
            return True
    return False


def parse_plan_open_questions(plan_text: str) -> dict[str, list[str]]:
    questions: dict[str, list[str]] = {}
    current_phase: str | None = None
    in_questions = False
    for line in plan_text.splitlines():
        heading = re.match(r"### (P\d) 阶段待确认问题", line)
        if heading:
            current_phase = heading.group(1)
            questions.setdefault(current_phase, [])
            in_questions = True
            continue
        if in_questions and line.startswith("## "):
            current_phase = None
            in_questions = False
            continue
        if in_questions and current_phase and line.startswith("- "):
            questions[current_phase].append(line[2:].strip())
    return questions


def parse_open_questions_register(register_text: str) -> list[OpenQuestion]:
    by_id: dict[str, OpenQuestion] = {}
    for line in register_text.splitlines():
        cells = split_row(line)
        if not cells or not cells[0].startswith("OQ-"):
            continue
        if len(cells) >= 13:
            question = OpenQuestion(
                oq_id=cells[0],
                status=cells[1],
                category=cells[2],
                description=cells[4],
                owner=cells[6],
                deadline=cells[7],
                solution_docs=cells[9],
                close_commit=cells[11],
            )
        elif len(cells) >= 7:
            question = OpenQuestion(
                oq_id=cells[0],
                status=cells[1],
                category=cells[2],
                description=cells[3],
                owner=cells[5],
                deadline=cells[4],
                solution_docs=cells[6],
                close_commit="待补齐",
            )
        else:
            continue
        if question.oq_id not in by_id or len(cells) >= 13:
            by_id[question.oq_id] = question
    return sorted(by_id.values(), key=lambda q: q.oq_id)


def parse_tasks(plan_text: str, plan_questions: dict[str, list[str]]) -> list[Task]:
    tasks: list[Task] = []
    for line in plan_text.splitlines():
        if not re.match(r"\| P\d-\d{2} \|", line):
            continue
        cells = split_row(line)
        task_id = cells[0]
        phase = task_id.split("-")[0]
        phase_questions = "；".join(plan_questions.get(phase, [])) or "【待确认问题】"
        if len(cells) >= 11:
            tasks.append(Task(*cells[:11]))
        elif len(cells) == 5 and phase == "P7":
            tasks.append(
                Task(
                    task_id=task_id,
                    name=cells[1],
                    stage=phase,
                    paths=cells[2],
                    change=f"按 P7 可裁剪阶段要求实施 {cells[1]}；必须具备独立开关、指标、回退路径和资源预算。",
                    inputs=cells[3],
                    outputs=f"{cells[1]} 能力包、开关配置、指标、测试和回退说明",
                    acceptance=cells[4],
                    estimate="【待确认问题】（P7 阶段总估算 20 人天，任务表未拆分单项人天）",
                    dependencies=cells[3],
                    blockers=phase_questions,
                )
            )
        elif len(cells) == 5 and phase == "P8":
            tasks.append(
                Task(
                    task_id=task_id,
                    name=cells[1],
                    stage=phase,
                    paths=cells[2],
                    change=f"按 P8 生产交付要求完成 {cells[1]}，确保生产配置、交付文档和验收命令可重复。",
                    inputs="P6 验收结果、P7 可选结果、生产环境约束和企业基础设施标准",
                    outputs=cells[3],
                    acceptance=cells[4],
                    estimate="【待确认问题】（P8 阶段总估算 20 人天，任务表未拆分单项人天）",
                    dependencies="P6，P7 可选",
                    blockers=phase_questions,
                )
            )
    return tasks


def parse_schedule(schedule_text: str) -> dict[str, dict[str, str]]:
    phases: dict[str, dict[str, str]] = {}
    for line in schedule_text.splitlines():
        cells = split_row(line)
        if len(cells) >= 8 and re.fullmatch(r"P\d", cells[0]):
            phases[cells[0]] = {
                "person_days": cells[1],
                "window": cells[2],
                "weeks": cells[3],
                "owners": cells[4],
                "outputs": cells[5],
                "entry": cells[6],
                "exit": cells[7],
            }
    return phases


def parse_traceability(trace_text: str) -> list[Requirement]:
    rows: list[Requirement] = []
    for line in trace_text.splitlines():
        cells = split_row(line)
        if len(cells) == 7 and cells[0].startswith("REQ-"):
            rows.append(Requirement(cells[0], cells[1], cells[2], cells[3], cells[5]))
    return rows


def parse_risks(risks_text: str) -> list[Risk]:
    rows: list[Risk] = []
    for line in risks_text.splitlines():
        cells = split_row(line)
        if len(cells) == 5 and cells[0].startswith("R-"):
            rows.append(Risk(cells[0], cells[1], cells[2], cells[3], cells[4]))
    return rows


def related_requirements(task: Task, requirements: list[Requirement]) -> list[str]:
    phase = task.task_id.split("-")[0]
    related = [
        f"{req.req_id}：{req.summary}（验收：{req.tests}）"
        for req in requirements
        if task.task_id in req.tasks or phase_in_spec(req.phase, phase)
    ]
    return related or ["【待确认问题】未在需求追踪矩阵中找到直接映射"]


def related_risks(task: Task, risks: list[Risk]) -> list[str]:
    phase = task.task_id.split("-")[0]
    selected = [
        f"{risk.risk_id}（{risk.level}）：{risk.risk}；状态：{risk.status}"
        for risk in risks
        if phase_in_spec(risk.phase, phase)
    ]
    return selected or ["【待确认问题】未在风险登记册中找到阶段风险映射"]


def related_open_questions(task: Task, questions: list[OpenQuestion]) -> list[str]:
    task_phase = phase_number(task.task_id)
    selected: list[OpenQuestion] = []
    task_blob = f"{task.task_id} {task.name} {task.paths} {task.change} {task.blockers}"
    for question in questions:
        due = phase_number(question.deadline)
        if due <= task_phase or question.oq_id in task_blob or question.category in task_blob:
            selected.append(question)
    if not selected:
        selected = [q for q in questions if q.status in {"打开", "自动确认", "人工确认"}][:5]
    return [
        f"{q.oq_id}（{q.status}/{q.category}）：{q.description}；最晚确认：{q.deadline}；责任：{q.owner}；解决说明：{q.solution_docs}；关闭：{q.close_commit}"
        for q in selected[:12]
    ] or ["当前无相关 OQ；执行中发现不确定项必须新增到集中台账"]


def bullet_lines(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items)


def role_profile(task: Task) -> str:
    blob = f"{task.task_id} {task.name} {task.paths} {task.change}"
    title = f"{task.stage} 阶段实施工程师"
    for key, candidate in ROLE_KEYWORDS:
        if key in blob:
            title = candidate
            break
    return (
        f"你是 {title}，负责执行任务 `{task.task_id}`：{task.name}。"
        f"你的工作重点是：{task.change}。你必须保持任务 ID、阶段边界、审计记录和验收命令可追踪，"
        "不得把底层上游能力暴露给产品层，也不得用通用提示词替代本任务的具体目标。"
    )


def audit_record_package(task_id: str) -> str:
    return f"""# {task_id} 修改记录包

> 审计规则：开始实现任务前填写“修改前分析”；修改过程中持续补充“修改过程记录”；完成验证后补齐“修改后验证与总结”。无法填写的字段必须写明原因、影响和补救计划，不能留空。

## 1. 修改前分析

- 任务与验收条件：...
- 源码证据：...（文件路径+行号+行为）
- 基线测试：...（命令+结果）
- 影响面分析：...
- 修改计划与回滚：...
- 待确认问题：...

## 2. 修改过程记录

- 实际变更文件：...
- 关键改动点：...
- 遇到的问题与决策：...
- 与计划偏离：...
- 新增测试：...
- 依赖变更：...
- 上游补丁登记：...

## 3. 修改后验证与总结

- 验收条件核对：...
- 测试结果：...
- 防绕过测试：...
- 回归测试：...
- 质量门禁：...
- 文档更新：...
- 风险更新：...
- 待确认问题关闭：...
- 历史问题回扫结果：...
- 回滚验证：...
- 总结与遗留事项：...
"""


def prompt_document(
    task: Task,
    schedule: dict[str, str],
    reqs: list[str],
    risks: list[str],
    open_questions: list[str],
) -> str:
    phase = task.task_id.split("-")[0]
    smoke_script = f"tests/smoke/{phase}.sh"
    readonly = "、".join(f"`{path}`" for path in READONLY_UPSTREAM_PATHS)
    allowed = "、".join(f"`{path}`" for path in ALLOWED_WRITE_PATHS)
    phase_rule = PHASE_RULES.get(phase, "遵循实施规划、排期基线和阶段门禁。")
    fence = "```"
    return f"""# {task.task_id} {task.name} 实施规划提示词

> 生成状态：P0-10 安全生成器输出。
>
> 生成基准日期：{GENERATED_UTC} UTC。
>
> 来源文档：`AGENTS.md`、`docs/planning/integrated-platform-plan.md`、`docs/planning/ai-schedule-prompt-template.md`、`docs/planning/development-schedule.md`、`docs/planning/open-questions-register.md`、`docs/planning/open-questions/`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`。
>
> 使用方式：复制“完整提示词”代码块执行；若是已有人工优化文档，禁止无审查覆盖。

## 任务元数据

| 字段 | 内容 |
|---|---|
| 任务ID | {task.task_id} |
| 任务名称 | {task.name} |
| 所属阶段 | {task.stage} |
| 阶段窗口 | {schedule.get('window', '【待确认问题】')} |
| 日历周 | {schedule.get('weeks', '【待确认问题】')} |
| 主责工作流 | {schedule.get('owners', '【待确认问题】')} |
| 涉及文件开发路径 | {task.paths} |
| 预估人天 | {task.estimate} |
| 前置依赖 | {task.dependencies} |
| 潜在卡点 | {task.blockers} |

## 审计记录模板

{audit_record_package(task.task_id)}

## 完整提示词

{fence}text
# 角色设定
{role_profile(task)}

# 项目背景
NexusAgent 是一个独立一体化 AI Agent 平台。终端用户只接触统一平台 API、Web 管理控制台、租户/用户/任务/技能/记忆/审批/预算/审计能力。

平台内部依赖三个上游组件：
- OpenClaw：仅用于 gateway-only 渠道适配。
- Hermes：仅用于 planner-only 规划与记忆推理。
- DeepSeek Harness（DSH）：仅用于 executor-only 沙箱执行。

这三个组件是内部实现依赖，对外不可见、不可直接访问，其原生 API、错误码、类型、URL、存储路径和品牌命名不得出现在平台公共 API、SDK、控制台、公共错误码或对外日志中。

# 当前任务信息
- 任务ID：{task.task_id}
- 任务名称：{task.name}
- 所属阶段：{task.stage}
- 阶段窗口：{schedule.get('window', '【待确认问题】')}
- 日历周：{schedule.get('weeks', '【待确认问题】')}
- 主责工作流：{schedule.get('owners', '【待确认问题】')}
- 涉及文件开发路径：{task.paths}
- 修改说明：{task.change}
- 输入：{task.inputs}
- 输出：{task.outputs}
- 验收条件：{task.acceptance}
- 预估人天：{task.estimate}（人天仅为工程估算，会受上游开源版本变更影响）
- 前置依赖：{task.dependencies}
- 潜在卡点：{task.blockers}

# 必读资料
执行前必须按顺序读取并引用以下资料：
1. `AGENTS.md`
2. `docs/planning/integrated-platform-plan.md`
3. `docs/planning/ai-schedule-prompt-template.md`
4. `docs/planning/development-schedule.md`
5. `docs/planning/open-questions-register.md`
6. `docs/planning/open-questions/README.md` 以及相关阶段确认文件
7. `docs/architecture/service-blueprint.md`
8. `docs/traceability/requirements-matrix.md`
9. `docs/risks/risk-register.md`
10. 本任务涉及的源码、配置、测试或文档路径：{task.paths}

# 不可违反的核心约束
1. 实际开发根目录唯一为 `/opt/project/NexusAgent`。
2. 原始上游目录只读：{readonly}。任何修改只能发生在允许路径：{allowed}。
3. 所有底层调用必须经过 `platform/adapters/`、Coordinator 和 Policy-Gate，禁止 Hermes/OpenClaw/DSH 两两直连。
4. 全局统一使用 `tenant_id`、`user_id`、`agent_id`、`task_id`、`attempt_id`、`execution_id`、`conversation_id`、`artifact_id`、`trace_id`。
5. 所有时间字段使用 UTC；超时、重试和排序必须使用平台单调时钟，禁止用墙上时钟计算持续时间。
6. 所有上游行为必须基于源码证据和实测，禁止凭文件名、README 或经验猜测。涉及上游源码时必须输出源码路径、行号或可复现实验命令。
7. 未确认事项必须优先登记或引用 `docs/planning/open-questions-register.md`，保留 `OQ-*` ID、状态、责任工作流、最晚确认阶段、确认结论、解决说明文档和关闭任务/commit；推荐处理方式和关闭证据必须写入 `docs/planning/open-questions/`。
8. `自动确认` 不等于 `已关闭`；只有确认结论、解决说明文档和关闭任务/commit 全部补齐后才能关闭。
9. 每个阶段结束前必须回扫当前阶段及其之前阶段的历史 `OQ-*`、任务修改记录包、风险登记册、需求追踪矩阵和专业文档；若仍有问题，必须先修复、关闭，或排入后续实时规划提示词。
10. 每个任务完成前必须提供可重复验收命令；不能只写代码或文档而不验证。
11. 阶段特化规则：{phase_rule}

# 相关需求追踪
{bullet_lines(reqs)}

# 相关风险
{bullet_lines(risks)}

# 当前阶段待确认问题
{bullet_lines(open_questions)}

# 执行目标
请在不违反上述约束的前提下，完成 `{task.task_id}` 的实施工作。你需要实际修改任务要求范围内的代码、文档、配置或测试；如果发现缺少前置依赖或验收无法执行，必须先记录阻塞证据和最小补救计划，不能用假实现或跳过测试掩盖问题。

# 审计记录要求
对应任务 ID 文档路径为 `docs/planning/task-prompts/{phase}/{task.task_id}.md`。开始实现前，必须先填写该文档中的 `# {task.task_id} 修改记录包` 第 1 节“修改前分析”；修改过程中持续补充第 2 节“修改过程记录”；完成验证后补齐第 3 节“修改后验证与总结”。提交或交付前不得保留空白字段；无法填写的字段必须说明原因、影响和补救计划。

# 推荐执行步骤
1. 核对当前分支和工作树：运行 `git status --short --branch`，确认是否存在无关未提交变更。
2. 打开 `docs/planning/task-prompts/{phase}/{task.task_id}.md`，填写“修改记录包”的“修改前分析”，至少包括任务与验收条件、源码证据、基线测试、影响面、修改计划与回滚、待确认问题。
3. 读取集中台账和确认文件；如果存在 `打开`、缺少确认文件、或已 `自动确认` 但尚未同步修复的问题，必须先处理或创建后续实时规划提示词。
4. 阅读任务相关文档和路径，列出你将修改的具体文件，确认不包含只读上游目录。
5. 对涉及上游的任务，先建立源码证据：使用 `rg`、源码路径和必要测试记录真实行为，禁止先改后猜。
6. 按最小可验收单元实施变更，优先保持既有目录结构、命名、契约和阶段边界；同步补充“修改过程记录”。
7. 更新或新增必要测试：单元、契约、集成、安全、防绕过、故障注入或阶段冒烟脚本，按任务性质选择。
8. 更新必要文档：实施规划、排期、服务蓝图、风险登记册、需求追踪矩阵、决策记录或 README。
9. 运行验收命令；若失败，修复后重跑，直到通过或形成明确阻塞报告。
10. 回扫当前阶段及其之前阶段的历史问题，补齐“修改后验证与总结”。
11. 输出完成报告，说明文件变更、验证结果、风险、待确认问题和历史问题回扫结果。

# 明确禁止事项
- 不要修改 `/opt/project/hermes-agent-main`、`/opt/project/openclaw-main`、`/opt/project/deepseek-harness-master` 下任何文件。
- 不要在公共 API、SDK、控制台、公共错误码或对外日志中暴露 Hermes/OpenClaw/DSH 原生类型、URL、错误码、存储路径或品牌命名。
- 不要让底层组件绕过 Coordinator、Policy-Gate 或 `platform/adapters/` 直接通信。
- 不要使用 `Date.now()`、本地时间或 Python `datetime.now()` 计算超时/重试/持续时间。
- 不要自定义替代 ID 字段破坏统一追踪。
- 不要省略负向测试、安全测试、冒烟脚本或可重复验收命令。
- 不要把待确认问题写成已确认事实或已关闭事实。
- 不要扩大任务范围，不要顺手做无关重构。

# 最低验收命令
以下命令是最低验收基线；如任务新增了更具体的测试，必须一并运行：
1. `git status --short --branch`
2. `git diff --check -- . ':!vendor/**'`
3. `bash {smoke_script}`（若该阶段脚本尚未存在，本任务涉及该阶段脚本时必须创建）
4. 与任务直接相关的单元、契约、集成、安全或故障注入测试命令。

# 完成报告格式
请用 Markdown 输出完成报告，必须包含：
- 任务 `{task.task_id}` 是否完成，以及对应验收条件逐条状态。
- 修改/新增文件清单。
- 源码证据或实测证据摘要，包含文件路径、行号或命令输出摘要。
- 运行过的验收命令和结果。
- 新增或仍未关闭的【待确认问题】。
- 当前阶段及其之前阶段历史问题回扫结果。
- 新增或变化的风险。
- 与原规划不一致的地方及原因。
- 对应任务 ID 文档中的修改记录包是否已填写完整。

现在，请开始执行任务 `{task.task_id}`。
{fence}
"""


def index_document(tasks: list[Task]) -> str:
    lines = [
        "# 任务实施规划提示词索引",
        "",
        "> 本目录由 `scripts/planning/generate-task-prompts.py` 校验和补齐。每个任务 ID 对应一份完整可复制的实施规划提示词。",
        "",
        "## 生成与审计规则",
        "",
        "- 默认运行 `scripts/planning/generate-task-prompts.py --check` 只做覆盖率和治理检查，不覆盖人工优化文档。",
        "- 只有显式运行 `scripts/planning/generate-task-prompts.py --write` 才会创建缺失文档；覆盖已有文档必须额外传入 `--overwrite` 并经过人工复核。",
        "- 任务文档的角色设定必须根据任务目标和实现节点差异化；禁止回退为同一套通用角色描述。",
        "- 开始实现任务前必须填写修改前分析；修改过程中补充过程记录；完成验证后补齐修改后验证与总结。",
        "- 每个阶段结束前必须回扫当前阶段及其之前阶段的 `OQ-*`、任务修改记录包、风险登记册和需求追踪矩阵。",
        "",
        "## 任务清单",
        "",
        "| 阶段 | 任务ID | 任务名称 | 提示词文档 |",
        "|---|---|---|---|",
    ]
    for task in tasks:
        phase = task.task_id.split("-")[0]
        rel = f"{phase}/{task.task_id}.md"
        lines.append(f"| {phase} | {task.task_id} | {task.name} | [{rel}]({rel}) |")
    lines.append("")
    return "\n".join(lines)


def load_inputs() -> tuple[list[Task], dict[str, dict[str, str]], list[Requirement], list[Risk], list[OpenQuestion]]:
    plan_text = PLAN.read_text(encoding="utf-8")
    schedule_text = SCHEDULE.read_text(encoding="utf-8")
    trace_text = TRACEABILITY.read_text(encoding="utf-8")
    risks_text = RISKS.read_text(encoding="utf-8")
    oq_text = OPEN_QUESTIONS_REGISTER.read_text(encoding="utf-8")

    plan_questions = parse_plan_open_questions(plan_text)
    tasks = parse_tasks(plan_text, plan_questions)
    if not tasks:
        raise SystemExit("No task rows found in integrated-platform-plan.md")
    return (
        tasks,
        parse_schedule(schedule_text),
        parse_traceability(trace_text),
        parse_risks(risks_text),
        parse_open_questions_register(oq_text),
    )


def validate_prompt_doc(task: Task, path: Path) -> list[str]:
    if not path.exists():
        return [f"missing task prompt document: {path.relative_to(ROOT)}"]
    text = path.read_text(encoding="utf-8")
    required_markers = [
        f"任务ID：{task.task_id}",
        "原始上游目录只读",
        "最低验收命令",
        f"# {task.task_id} 修改记录包",
        "## 1. 修改前分析",
        "## 2. 修改过程记录",
        "## 3. 修改后验证与总结",
    ]
    issues = [
        f"{path.relative_to(ROOT)} missing marker: {marker}"
        for marker in required_markers
        if marker not in text
    ]
    role_lines = [line for line in text.splitlines() if line.startswith("你是 ")]
    if role_lines and "资深 AI 开发工程师" in role_lines[0]:
        issues.append(f"{path.relative_to(ROOT)} still uses generic role wording")
    return issues


def check_role_diversity(prompt_paths: list[Path]) -> list[str]:
    role_lines: list[str] = []
    generic_count = 0
    for path in prompt_paths:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("你是 "):
                role_lines.append(line)
                if "资深 AI 开发工程师" in line:
                    generic_count += 1
                break
    if not role_lines:
        return ["no role profile lines found in task prompts"]
    unique_count = len(set(role_lines))
    issues: list[str] = []
    if unique_count < min(12, len(role_lines)):
        issues.append(f"role profiles are insufficiently differentiated: {unique_count}/{len(role_lines)} unique")
    if generic_count:
        issues.append(f"{generic_count} task prompts still use generic role wording")
    return issues


def run(args: argparse.Namespace) -> int:
    tasks, schedule, requirements, risks, open_questions = load_inputs()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    issues: list[str] = []
    prompt_paths: list[Path] = []
    written = 0
    skipped_existing = 0

    for task in tasks:
        phase = task.task_id.split("-")[0]
        prompt_path = OUT_DIR / phase / f"{task.task_id}.md"
        prompt_paths.append(prompt_path)
        generated = prompt_document(
            task,
            schedule.get(phase, {}),
            related_requirements(task, requirements),
            related_risks(task, risks),
            related_open_questions(task, open_questions),
        )
        if args.write:
            prompt_path.parent.mkdir(parents=True, exist_ok=True)
            if prompt_path.exists() and not args.overwrite:
                skipped_existing += 1
            else:
                prompt_path.write_text(generated, encoding="utf-8")
                written += 1
        issues.extend(validate_prompt_doc(task, prompt_path))

    if args.write:
        index_path = OUT_DIR / "README.md"
        if args.overwrite or not index_path.exists():
            index_path.write_text(index_document(tasks), encoding="utf-8")
            written += 1

    issues.extend(check_role_diversity(prompt_paths))

    if not OPEN_QUESTIONS_DIR.exists():
        issues.append("open questions confirmation directory is missing")
    if not open_questions:
        issues.append("open questions register has no OQ rows")
    if any(q.status == "已关闭" and ("待补齐" in q.close_commit or not q.close_commit) for q in open_questions):
        issues.append("closed open questions must include closing task/commit")

    action = "write" if args.write else "check"
    print(
        f"P0-10 task prompt generator {action}: tasks={len(tasks)}, "
        f"written={written}, skipped_existing={skipped_existing}, issues={len(issues)}"
    )
    if issues:
        for issue in issues:
            print(f"FAIL: {issue}", file=sys.stderr)
        return 1
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate task prompt coverage and governance markers; this is the default",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="create missing task prompt documents; existing files are preserved unless --overwrite is also set",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="with --write, overwrite existing prompt documents and index after manual approval",
    )
    args = parser.parse_args(argv)
    if args.overwrite and not args.write:
        parser.error("--overwrite requires --write")
    return args


def main(argv: list[str] | None = None) -> int:
    return run(parse_args(sys.argv[1:] if argv is None else argv))


if __name__ == "__main__":
    raise SystemExit(main())
