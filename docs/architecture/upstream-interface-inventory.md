# 上游接口摸底登记

本文件只登记当前快照中已确认存在的入口，不把文件名推断为既定运行行为。P0-02 至 P0-04 必须补充调用关系、启动命令、输入输出、失败语义和测试证据。

| 上游 | 当前版本 | 已确认路径 | 规划用途 | 当前状态 |
|---|---|---|---|---|
| Hermes | 0.20.1 | `vendor/hermes-agent-main/tools/memory_tool.py`、`agent/conversation_loop.py`、`agent/tool_executor.py`、`agent/memory_manager.py`、`agent/memory_provider.py`、`hermes_cli/loops.py`、`hermes_cli/gateway.py` | planner-only 和 Memory Gateway 代理 | 待 P0 实验确认 |
| OpenClaw | 2026.8.1 | `vendor/openclaw-main/src/gateway/agent-turn/agent-request-routing.ts`、`agent-run-dispatch.ts`、`agent-run-execution-phase.ts`、`agent-turn-service.ts`、`src/channels/inbound-event/envelope.ts` | gateway-only 渠道适配 | 待 P0 实验确认 |
| DSH | 0.1.0-rc.5 | `vendor/deepseek-harness-master/packages/core/agent-loop/src/agent.ts`、`constants.ts`、`index.ts`、`runtime-context.ts`、`tool-calls.ts`、`packages/core/agent/src/dispatch.ts` | executor-only 沙箱 | 待 P0 实验确认 |

当前三个原始目录均未提供可读取的 Git 元数据，因此 `vendor/MANIFEST.yaml` 的 commit/remote 字段保留【待确认问题】。所有上游行为、可删除逻辑和补丁边界必须以 P0 的源码扫描和测试结果为准。
