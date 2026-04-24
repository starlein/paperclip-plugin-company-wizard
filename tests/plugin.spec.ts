import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("plugin-clipper", () => {
  it("registers templates data handler", async () => {
    const harness = createTestHarness({ manifest, capabilities: manifest.capabilities });
    await plugin.definition.setup(harness.ctx);

    const data = await harness.getData<{
      presets: unknown[];
      modules: Array<{ issues?: unknown[]; tasks?: unknown[] }>;
      roles: unknown[];
      loadErrors?: string[];
    }>("templates");

    // Templates may be empty if templates dir doesn't exist in test env, but handler should respond
    expect(data).toHaveProperty("presets");
    expect(data).toHaveProperty("modules");
    expect(data).toHaveProperty("roles");
    expect(Array.isArray(data.loadErrors ?? [])).toBe(true);

    // Compatibility guarantee: modules exposing issues should also expose tasks for older UI callers.
    const withIssues = data.modules.find((m) => Array.isArray(m.issues) && m.issues.length > 0);
    if (withIssues) {
      expect(Array.isArray(withIssues.tasks)).toBe(true);
    }
  });

  it("registers start-provision action", async () => {
    const harness = createTestHarness({ manifest, capabilities: manifest.capabilities });
    await plugin.definition.setup(harness.ctx);

    // Should return graceful error without a companyName (no longer throws)
    const result = await harness.performAction("start-provision", {}) as { error?: string };
    expect(result.error).toBe("companyName is required");
  });

  it("reports healthy", async () => {
    const health = await plugin.definition.onHealth!();
    expect(health.status).toBe("ok");
  });
});
