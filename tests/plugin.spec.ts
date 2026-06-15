import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("company-wizard", () => {
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

  it("reports available plugin updates", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ version: "0.4.3" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({ manifest, capabilities: manifest.capabilities });
    await plugin.definition.setup(harness.ctx);

    const result = (await harness.performAction("check-update", {})) as {
      ok?: boolean;
      currentVersion?: string;
      latestVersion?: string;
      updateAvailable?: boolean;
      url?: string;
    };

    expect(result.ok).toBe(true);
    expect(result.currentVersion).toBe("0.4.2");
    expect(result.latestVersion).toBe("0.4.3");
    expect(result.updateAvailable).toBe(true);
    expect(result.url).toContain("npmjs.com/package/@starlein/paperclip-plugin-company-wizard");
  });

  it("resolves an Anthropic API key from an environment variable reference", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      return new Response(JSON.stringify({ content: [{ text: "ok" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-env");

    const harness = createTestHarness({
      manifest,
      capabilities: manifest.capabilities,
      config: { anthropicApiKey: "env:ANTHROPIC_API_KEY" },
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction("ai-chat", {
      messages: [{ role: "user", content: "hello" }],
    }) as { text?: string; error?: string };

    expect(result).toEqual({ text: "ok" });
    expect(fetchMock).toHaveBeenCalledOnce();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-test-env");
  });

  it("returns a clear error for Paperclip secret UUIDs in plugin settings", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      capabilities: manifest.capabilities,
      config: { anthropicApiKey: "77777777-7777-4777-8777-777777777777" },
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction("ai-chat", {
      messages: [{ role: "user", content: "hello" }],
    }) as { text?: string; error?: string };

    expect(result.text).toBe("");
    expect(result.error).toContain("cannot use a Paperclip secret UUID");
    expect(result.error).toContain("env:ANTHROPIC_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
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
      config: { anthropicApiKey: "sk-ant-test-job" },
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

  it("does not expose an enriched-personas toggle", () => {
    const props = (manifest.instanceConfigSchema as any).properties;
    expect(props.enableEnrichedPersonas).toBeUndefined();
  });

  it("reports healthy", async () => {
    const health = await plugin.definition.onHealth!();
    expect(health.status).toBe("ok");
  });
});
