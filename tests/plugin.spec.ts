import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin, { prepareLocalProjectWorkspace } from "../src/worker.js";

afterEach(() => {
  vi.unstubAllGlobals();
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
      return new Response(JSON.stringify({ version: "0.4.11" }), {
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
    expect(result.currentVersion).toBe("0.4.10");
    expect(result.latestVersion).toBe("0.4.11");
    expect(result.updateAvailable).toBe(true);
    expect(result.url).toContain("npmjs.com/package/@starlein/paperclip-plugin-company-wizard");
  });

  it("prepares fresh local project workspaces before provisioning", async () => {
    const root = await mkdtemp(join(tmpdir(), "company-wizard-workspace-"));
    const companyDir = join(root, "FlowBoard");
    const projectDir = join(companyDir, "projects", "FlowBoard");

    try {
      prepareLocalProjectWorkspace(
        {
          name: "FlowBoard",
          workspace: {
            sourceType: "local_path",
            cwd: projectDir,
            defaultRef: "main",
          },
        },
        companyDir,
      );

      const head = execFileSync("git", ["-C", projectDir, "rev-parse", "--verify", "main"], {
        encoding: "utf-8",
      }).trim();
      expect(head).toMatch(/^[a-f0-9]{40}$/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

  it("does not expose an enriched-personas toggle", () => {
    const props = (manifest.instanceConfigSchema as any).properties;
    expect(props.enableEnrichedPersonas).toBeUndefined();
  });

  it("creates governance records as unassigned todo issues for existing-company provisioning", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "company-wizard-existing-"));
    const issueBodies: any[] = [];

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";

      if (url.endsWith("/api/companies") && method === "GET") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/instance/settings/experimental") && method === "GET") {
        return new Response(JSON.stringify({ enableIsolatedWorkspaces: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/companies/company-existing") && method === "GET") {
        return new Response(JSON.stringify({ id: "company-existing", name: "Onboarding" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/companies/company-existing/issues") && method === "POST") {
        const body = JSON.parse(String(init?.body || "{}"));
        issueBodies.push(body);
        return new Response(
          JSON.stringify({
            id: body.title === "Board Operations" ? "issue-board" : "issue-hiring",
            identifier: body.title === "Board Operations" ? "ONB-1" : "ONB-2",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/issues/") && url.includes("/documents/") && method === "PUT") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "stop after governance records" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const harness = createTestHarness({
        manifest,
        capabilities: manifest.capabilities,
        config: { companiesDir: tmp, paperclipUrl: "http://paperclip.test" },
      });
      await plugin.definition.setup(harness.ctx);

      await harness.performAction("start-provision", {
        companyName: "Onboarding",
        existingCompanyId: "company-existing",
        selectedModules: [],
        selectedRoles: [],
      });

      expect(issueBodies).toHaveLength(2);
      expect(issueBodies.map((body) => body.title)).toEqual(["Board Operations", "Hiring Plan"]);
      for (const body of issueBodies) {
        expect(body.status).toBe("todo");
        expect(body.assigneeAgentId).toBeUndefined();
        expect(body.assigneeUserId).toBeUndefined();
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("reports healthy", async () => {
    const health = await plugin.definition.onHealth!();
    expect(health.status).toBe("ok");
  });
});
