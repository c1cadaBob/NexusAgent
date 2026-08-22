#!/usr/bin/env python3
"""Generate one complete implementation prompt document for each NexusAgent task ID."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "docs/planning/integrated-platform-plan.md"
SCHEDULE = ROOT / "docs/planning/development-schedule.md"
TRACEABILITY = ROOT / "docs/traceability/requirements-matrix.md"
RISKS = ROOT / "docs/risks/risk-register.md"
OUT_DIR = ROOT / "docs/planning/task-prompts"
GENERATED_UTC = "2026-08-22"

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
    "P0": "先证据后结论；不写生产业务代码；所有上游行为必须有源码路径、行号、调用图或实验命令；未确认内容必须保留为【待确认问题】。",
    "P1": "优先建立 contracts、状态机、Coordinator、Policy-Gate、Clock、Event Bus 和最小本地存储；先跑通 mock adapter 生命周期，再接真实上游。",
    "P2": "DSH 只能 executor-only；不得暴露 DSH 原生 API/URL/错误码；必须安排沙箱越权、stdout/stderr 脱敏和 artifact 引用测试。",
    "P3": "Hermes 只能 planner-only；不得执行工具或启动原生网关；Memory 读写必须通过平台代理，不得把 MEMORY.md/USER.md 当平台公共存储。",
    "P4": "OpenClaw 只能 gateway-only；渠道消息必须经过 Coordinator 和 Policy-Gate；继续/重做/取消必须映射为平台 attempt/task 语义。",
    "P5": "产品层只暴露平台 API、控制台、渠道管理和 SDK；公共响应、日志、错误码、控制台和 SDK 不得出现上游原生概念。",
    "P6": "主攻 E2E、安全、防绕过、故障注入和降级路线；不得新增非必要功能；正向链路和负向链路都必须可重复验收。",
    "P7": "P7 是可裁剪阶段；每项高级能力必须有开关、指标、资源预算和回退路径，不得阻塞 MVP。",
    "P8": "生产交付必须关闭热更新和调试端口；内部 adapter 不得直接对外暴露；备份恢复、告警、升级回滚和交付手册必须可验收。",
}


def split_row(line: str) -> list[str]:
    text = line.strip()
    if not (text.startswith("|") and text.endswith("|")):
        return []
    return [part.strip() for part in text.strip("|").split("|")]


def phase_in_spec(spec: str, phase: str) -> bool:
    target = int(phase[1:])
    normalized = spec.replace(" ", "")
    for match in re.finditer(r"P(\d)(?:-P?(\d))?", normalized):
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else start
        if start <= target <= end:
            return True
    return False


def parse_open_questions(plan_text: str) -> dict[str, list[str]]:
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


def parse_tasks(plan_text: str, open_questions: dict[str, list[str]]) -> list[dict[str, str]]:
    tasks: list[dict[str, str]] = []
    for line in plan_text.splitlines():
        if not re.match(r"\| P\d-\d{2} \|", line):
            continue
        cells = split_row(line)
        task_id = cells[0]
        phase = task_id.split("-")[0]
        phase_questions = "；".join(open_questions.get(phase, [])) or "【待确认问题】"
        if len(cells) >= 11:
            tasks.append(
                {
                    "task_id": task_id,
                    "task_name": cells[1],
                    "stage": cells[2],
                    "paths": cells[3],
                    "change": cells[4],
                    "inputs": cells[5],
                    "outputs": cells[6],
                    "acceptance": cells[7],
                    "estimate": cells[8],
                    "dependencies": cells[9],
                    "blockers": cells[10],
                }
            )
        elif len(cells) == 5 and phase == "P7":
            tasks.append(
                {
                    "task_id": task_id,
                    "task_name": cells[1],
                    "stage": phase,
                    "paths": cells[2],
                    "change": f"按 P7 可裁剪阶段要求实施 {cells[1]}；必须具备独立开关、指标、回退路径和资源预算。",
                    "inputs": cells[3],
                    "outputs": f"{cells[1]} 能力包、开关配置、指标、测试和回退说明",
                    "acceptance": cells[4],
                    "estimate": "【待确认问题】（P7 阶段总估算 20 人天，任务表未拆分单项人天）",
                    "dependencies": cells[3],
                    "blockers": phase_questions,
                }
            )
        elif len(cells) == 5 and phase == "P8":
            tasks.append(
                {
                    "task_id": task_id,
                    "task_name": cells[1],
                    "stage": phase,
                    "paths": cells[2],
                    "change": f"按 P8 生产交付要求完成 {cells[1]}，确保生产配置、交付文档和验收命令可重复。",
                    "inputs": "P6 验收结果、P7 可选结果、生产环境约束和企业基础设施标准",
                    "outputs": cells[3],
                    "acceptance": cells[4],
                    "estimate": "【待确认问题】（P8 阶段总估算 20 人天，任务表未拆分单项人天）",
                    "dependencies": "P6，P7 可选",
                    "blockers": phase_questions,
                }
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


def parse_traceability(trace_text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in trace_text.splitlines():
        cells = split_row(line)
        if len(cells) == 7 and cells[0].startswith("REQ-"):
            rows.append(
                {
                    "id": cells[0],
                    "summary": cells[1],
                    "phase": cells[2],
                    "tasks": cells[3],
                    "paths": cells[4],
                    "tests": cells[5],
                    "status": cells[6],
                }
            )
    return rows


def parse_risks(risks_text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in risks_text.splitlines():
        cells = split_row(line)
        if len(cells) == 5 and cells[0].startswith("R-"):
            rows.append(
                {
                    "id": cells[0],
                    "risk": cells[1],
                    "level": cells[2],
                    "status": cells[3],
                    "phase": cells[4],
                }
            )
    return rows


def related_requirements(task: dict[str, str], requirements: list[dict[str, str]]) -> list[str]:
    task_id = task["task_id"]
    phase = task_id.split("-")[0]
    related = []
    for req in requirements:
        if task_id in req["tasks"] or phase_in_spec(req["phase"], phase):
            related.append(f"{req['id']}：{req['summary']}（验收：{req['tests']}）")
    return related or ["【待确认问题】未在需求追踪矩阵中找到直接映射"]


def related_risks(task: dict[str, str], risks: list[dict[str, str]]) -> list[str]:
    phase = task["task_id"].split("-")[0]
    selected = []
    for risk in risks:
        if phase_in_spec(risk["phase"], phase):
            selected.append(f"{risk['id']}（{risk['level']}）：{risk['risk']}；状态：{risk['status']}")
    return selected or ["【待确认问题】未在风险登记册中找到阶段风险映射"]


def bullet_lines(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items)


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
- 回滚验证：...
- 总结与遗留事项：...
"""


def prompt_document(task: dict[str, str], schedule: dict[str, str], reqs: list[str], risks: list[str], open_questions: list[str]) -> str:
    task_id = task["task_id"]
    phase = task_id.split("-")[0]
    smoke_script = f"tests/smoke/{phase}.sh"
    readonly = "、".join(f"`{path}`" for path in READONLY_UPSTREAM_PATHS)
    allowed = "、".join(f"`{path}`" for path in ALLOWED_WRITE_PATHS)
    phase_rule = PHASE_RULES.get(phase, "遵循实施规划、排期基线和阶段门禁。")
    questions = open_questions or ["【待确认问题】当前阶段未登记待确认问题，但执行中发现不确定项必须新增记录"]
    fence = "```"
    return f"""# {task_id} {task['task_name']} 实施规划提示词

> 生成状态：P0-10 自动生成。
>
> 生成基准日期：{GENERATED_UTC} UTC。
>
> 来源文档：`docs/planning/integrated-platform-plan.md`、`docs/planning/ai-schedule-prompt-template.md`、`docs/planning/development-schedule.md`、`docs/traceability/requirements-matrix.md`、`docs/risks/risk-register.md`。
>
> 使用方式：复制“完整提示词”代码块，按实际执行日期、团队容量和当前阻塞补充变量后交给后续 AI 开发执行。

## 任务元数据

| 字段 | 内容 |
|---|---|
| 任务ID | {task_id} |
| 任务名称 | {task['task_name']} |
| 所属阶段 | {task['stage']} |
| 阶段窗口 | {schedule.get('window', '【待确认问题】')} |
| 日历周 | {schedule.get('weeks', '【待确认问题】')} |
| 主责工作流 | {schedule.get('owners', '【待确认问题】')} |
| 涉及文件开发路径 | {task['paths']} |
| 预估人天 | {task['estimate']} |
| 前置依赖 | {task['dependencies']} |
| 潜在卡点 | {task['blockers']} |

## 审计记录模板

{audit_record_package(task_id)}

## 完整提示词

{fence}text
# 角色设定
你是 NexusAgent 平台的资深 AI 开发工程师，负责执行任务 `{task_id}`：{task['task_name']}。你必须严格遵循项目规划、架构约束、当前排期和验收标准，不得擅自扩大或缩小任务范围，不得引入规划外依赖或方案。

# 项目背景
NexusAgent 是一个独立一体化 AI Agent 平台。终端用户只接触统一平台 API、Web 管理控制台、租户/用户/任务/技能/记忆/审批/预算/审计能力。

平台内部依赖三个上游组件：
- OpenClaw：仅用于 gateway-only 渠道适配。
- Hermes：仅用于 planner-only 规划与记忆推理。
- DeepSeek Harness（DSH）：仅用于 executor-only 沙箱执行。

这三个组件是内部实现依赖，对外不可见、不可直接访问，其原生 API、错误码、类型、URL、存储路径和品牌命名不得出现在平台公共 API、SDK、控制台、公共错误码或对外日志中。

# 当前任务信息
- 任务ID：{task_id}
- 任务名称：{task['task_name']}
- 所属阶段：{task['stage']}
- 阶段窗口：{schedule.get('window', '【待确认问题】')}
- 日历周：{schedule.get('weeks', '【待确认问题】')}
- 主责工作流：{schedule.get('owners', '【待确认问题】')}
- 涉及文件开发路径：{task['paths']}
- 修改说明：{task['change']}
- 输入：{task['inputs']}
- 输出：{task['outputs']}
- 验收条件：{task['acceptance']}
- 预估人天：{task['estimate']}（人天仅为工程估算，会受上游开源版本变更影响）
- 前置依赖：{task['dependencies']}
- 潜在卡点：{task['blockers']}

# 必读资料
执行前必须按顺序读取并引用以下资料：
1. `docs/planning/integrated-platform-plan.md`
2. `docs/planning/ai-schedule-prompt-template.md`
3. `docs/planning/development-schedule.md`
4. `docs/architecture/service-blueprint.md`
5. `docs/traceability/requirements-matrix.md`
6. `docs/risks/risk-register.md`
7. 本任务涉及的源码、配置、测试或文档路径：{task['paths']}

# 不可违反的核心约束
1. 实际开发根目录唯一为 `/opt/project/NexusAgent`。
2. 原始上游目录只读：{readonly}。任何修改只能发生在允许路径：{allowed}。
3. 所有底层调用必须经过 `platform/adapters/`、Coordinator 和 Policy-Gate，禁止 Hermes/OpenClaw/DSH 两两直连。
4. 全局统一使用 `tenant_id`、`user_id`、`agent_id`、`task_id`、`attempt_id`、`execution_id`、`conversation_id`、`artifact_id`、`trace_id`。
5. 所有时间字段使用 UTC；超时、重试和排序必须使用平台单调时钟，禁止用墙上时钟计算持续时间。
6. 所有上游行为必须基于源码证据和实测，禁止凭文件名、README 或经验猜测。涉及上游源码时必须输出源码路径、行号或可复现实验命令。
7. 未确认事项必须保留为【待确认问题】，并列出影响、选项和最晚确认时间，不得擅自当作事实。
8. 每个任务完成前必须提供可重复验收命令；不能只写代码或文档而不验证。
9. 阶段特化规则：{phase_rule}

# 相关需求追踪
{bullet_lines(reqs)}

# 相关风险
{bullet_lines(risks)}

# 当前阶段待确认问题
{bullet_lines(questions)}

# 执行目标
请在不违反上述约束的前提下，完成 `{task_id}` 的实施工作。你需要实际修改任务要求范围内的代码、文档、配置或测试；如果发现缺少前置依赖或验收无法执行，必须先记录阻塞证据和最小补救计划，不能用假实现或跳过测试掩盖问题。

# 审计记录要求
对应任务 ID 文档路径为 `docs/planning/task-prompts/{phase}/{task_id}.md`。开始实现前，必须先填写该文档中的 `# {task_id} 修改记录包` 第 1 节“修改前分析”；修改过程中持续补充第 2 节“修改过程记录”；完成验证后补齐第 3 节“修改后验证与总结”。提交或交付前不得保留空白字段；无法填写的字段必须说明原因、影响和补救计划。

# 推荐执行步骤
1. 核对当前分支和工作树：运行 `git status --short --branch`，确认是否存在无关未提交变更。
2. 打开 `docs/planning/task-prompts/{phase}/{task_id}.md`，填写“修改记录包”的“修改前分析”，至少包括任务与验收条件、源码证据、基线测试、影响面、修改计划与回滚、待确认问题。
3. 阅读任务相关文档和路径，列出你将修改的具体文件，确认不包含只读上游目录。
4. 对涉及上游的任务，先建立源码证据：使用 `rg`、源码路径和必要测试记录真实行为，禁止先改后猜。
5. 按最小可验收单元实施变更，优先保持既有目录结构、命名、契约和阶段边界；同步补充“修改过程记录”。
6. 更新或新增必要测试：单元、契约、集成、安全、防绕过、故障注入或阶段冒烟脚本，按任务性质选择。
7. 更新必要文档：实施规划、排期、服务蓝图、风险登记册、需求追踪矩阵、决策记录或 README。
8. 运行验收命令；若失败，修复后重跑，直到通过或形成明确阻塞报告。
9. 补齐“修改后验证与总结”，包含验收核对、测试结果、防绕过测试、回归测试、质量门禁、文档/风险更新、待确认问题关闭、回滚验证和遗留事项。
10. 输出完成报告，说明文件变更、验证结果、风险和待确认问题。

# 明确禁止事项
- 不要修改 `/opt/project/hermes-agent-main`、`/opt/project/openclaw-main`、`/opt/project/deepseek-harness-master` 下任何文件。
- 不要在公共 API、SDK、控制台、公共错误码或对外日志中暴露 Hermes/OpenClaw/DSH 原生类型、URL、错误码、存储路径或品牌命名。
- 不要让底层组件绕过 Coordinator、Policy-Gate 或 `platform/adapters/` 直接通信。
- 不要使用 `Date.now()`、本地时间或 Python `datetime.now()` 计算超时/重试/持续时间。
- 不要自定义替代 ID 字段破坏统一追踪。
- 不要省略负向测试、安全测试、冒烟脚本或可重复验收命令。
- 不要把待确认问题写成已确认事实。
- 不要扩大任务范围，不要顺手做无关重构。

# 最低验收命令
以下命令是最低验收基线；如任务新增了更具体的测试，必须一并运行：
1. `git status --short --branch`
2. `git diff --check`
3. `bash {smoke_script}`（若该阶段脚本尚未存在，本任务涉及该阶段脚本时必须创建；否则在报告中标记为【待确认问题】并说明替代验证命令）
4. 与任务直接相关的单元、契约、集成、安全或故障注入测试命令。

# 完成报告格式
请用 Markdown 输出完成报告，必须包含：
- 任务 `{task_id}` 是否完成，以及对应验收条件逐条状态。
- 修改/新增文件清单。
- 源码证据或实测证据摘要，包含文件路径、行号或命令输出摘要。
- 运行过的验收命令和结果。
- 新增或仍未关闭的【待确认问题】。
- 新增或变化的风险。
- 与原规划不一致的地方及原因。
- 对应任务 ID 文档中的修改记录包是否已填写完整。

现在，请开始执行任务 `{task_id}`。
{fence}
"""


def write_index(tasks: list[dict[str, str]]) -> None:
    lines = [
        "# 任务实施规划提示词索引",
        "",
        "> 本目录由 `scripts/planning/generate-task-prompts.py` 生成。每个任务 ID 对应一份完整可复制的实施规划提示词。",
        "",
        "## 任务清单",
        "",
        "| 阶段 | 任务ID | 任务名称 | 提示词文档 |",
        "|---|---|---|---|",
    ]
    for task in tasks:
        phase = task["task_id"].split("-")[0]
        rel = f"{phase}/{task['task_id']}.md"
        lines.append(f"| {phase} | {task['task_id']} | {task['task_name']} | [{rel}]({rel}) |")
    lines.append("")
    (OUT_DIR / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    plan_text = PLAN.read_text(encoding="utf-8")
    schedule_text = SCHEDULE.read_text(encoding="utf-8")
    trace_text = TRACEABILITY.read_text(encoding="utf-8")
    risks_text = RISKS.read_text(encoding="utf-8")

    open_questions = parse_open_questions(plan_text)
    tasks = parse_tasks(plan_text, open_questions)
    schedule = parse_schedule(schedule_text)
    requirements = parse_traceability(trace_text)
    risks = parse_risks(risks_text)

    if not tasks:
        raise SystemExit("No task rows found in integrated-platform-plan.md")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old_file in OUT_DIR.glob("P*/P*.md"):
        old_file.unlink()

    for task in tasks:
        phase = task["task_id"].split("-")[0]
        phase_dir = OUT_DIR / phase
        phase_dir.mkdir(parents=True, exist_ok=True)
        doc = prompt_document(
            task,
            schedule.get(phase, {}),
            related_requirements(task, requirements),
            related_risks(task, risks),
            open_questions.get(phase, []),
        )
        (phase_dir / f"{task['task_id']}.md").write_text(doc, encoding="utf-8")

    write_index(tasks)
    print(f"Generated {len(tasks)} task prompt documents under {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
