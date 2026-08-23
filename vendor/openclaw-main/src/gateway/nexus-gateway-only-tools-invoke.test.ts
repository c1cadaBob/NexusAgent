import { afterEach, describe, expect, it } from "vitest";
import {
  NEXUS_GATEWAY_ONLY_NATIVE_TOOL_BLOCKED_MESSAGE,
  NEXUS_OPENCLAW_GATEWAY_ONLY_ENV,
} from "./agent-turn/nexus-gateway-only-experiment.js";
import { invokeGatewayTool } from "./tools-invoke-shared.js";

describe("NexusAgent gateway-only tools.invoke guard", () => {
  const originalExperimentFlag = process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV];

  afterEach(() => {
    if (originalExperimentFlag === undefined) {
      delete process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV];
    } else {
      process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV] = originalExperimentFlag;
    }
  });

  it.each(["agents_list", "memory_search"])("blocks native tool invocation for %s", async (name) => {
    process.env[NEXUS_OPENCLAW_GATEWAY_ONLY_ENV] = "1";

    await expect(
      invokeGatewayTool({
        cfg: {} as never,
        input: { name },
        toolCallIdPrefix: "rpc",
      }),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      toolName: name,
      error: {
        type: "tool_call_blocked",
        message: NEXUS_GATEWAY_ONLY_NATIVE_TOOL_BLOCKED_MESSAGE,
      },
    });
  });
});
