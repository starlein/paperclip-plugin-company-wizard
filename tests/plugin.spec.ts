import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("resolves the configured Anthropic secret ref before calling Anthropic", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      return new Response(JSON.stringify({ content: [{ text: "ok" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      capabilities: manifest.capabilities,
      config: { anthropicApiKey: "anthropic-secret-ref" },
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction("ai-chat", {
      messages: [{ role: "user", content: "hello" }],
    }) as { text?: string; error?: string };

    expect(result).toEqual({ text: "ok" });
    expect(fetchMock).toHaveBeenCalledOnce();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(
      "resolved:anthropic-secret-ref",
    );
  });

  it("runs ai-chat as an async job (start → poll) for long generations", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ content: [{ text: "generated-config" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      capabilities: manifest.capabilities,
      config: { anthropicApiKey: "anthropic-secret-ref" },
    });
    await plugin.definition.setup(harness.ctx);

    const start = (await harness.performAction("ai-chat", {
      mode: "start",
      messages: [{ role: "user", content: "generate" }],
    })) as { jobId?: string; status?: string };

    expect(typeof start.jobId).toBe("string");
    expect(start.status).toBe("pending");

    // Poll until the background generation resolves.
    let result: { status?: string; text?: string; error?: string } = {};
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 0));
      result = (await harness.performAction("ai-chat", {
        mode: "poll",
        jobId: start.jobId,
      })) as { status?: string; text?: string; error?: string };
      if (result.status !== "pending") break;
    }

    expect(result.status).toBe("done");
    expect(result.text).toBe("generated-config");

    // The job is consumed after a terminal poll — a second poll reports it gone.
    const second = (await harness.performAction("ai-chat", {
      mode: "poll",
      jobId: start.jobId,
    })) as { status?: string };
    expect(second.status).toBe("error");
  });

  it("reports healthy", async () => {
    const health = await plugin.definition.onHealth!();
    expect(health.status).toBe("ok");
  });
});
