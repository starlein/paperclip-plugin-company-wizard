import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { pluginManifestV1Schema } from "@paperclipai/shared";
import manifest from "../src/manifest.js";
import plugin, { prepareLocalProjectWorkspace, provisionCompanySkills } from "../src/worker.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("company-wizard", () => {
  it("ships a manifest accepted by the latest stable Paperclip schema", () => {
    expect(() => pluginManifestV1Schema.parse(manifest)).not.toThrow();
  });

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
    const [major, minor, patch] = manifest.version.split(".").map((part) => Number.parseInt(part, 10));
    const newerVersion = `${major}.${minor}.${patch + 1}`;
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ version: newerVersion }), {
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
    expect(result.currentVersion).toBe(manifest.version);
    expect(result.latestVersion).toBe(newerVersion);
    expect(result.updateAvailable).toBe(true);
    expect(result.url).toContain("npmjs.com/package/@starlein/paperclip-plugin-company-wizard");
  });

  it("does not report an update when the installed plugin is current", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ version: manifest.version }), {
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
    };

    expect(result.ok).toBe(true);
    expect(result.currentVersion).toBe(manifest.version);
    expect(result.latestVersion).toBe(manifest.version);
    expect(result.updateAvailable).toBe(false);
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

  it("resolves the configured object-shaped Anthropic secret ref before calling Anthropic", async () => {
    const companyId = "11111111-1111-4111-8111-111111111111";
    const secretRef = {
      type: "secret_ref",
      secretId: "22222222-2222-4222-8222-222222222222",
    };
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      return new Response(JSON.stringify({
        content: [
          { type: "thinking", thinking: "internal" },
          { type: "text", text: "ok" },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      capabilities: manifest.capabilities,
      config: { anthropicApiKey: secretRef },
    });
    const resolveSecret = vi
      .spyOn(harness.ctx.secrets, "resolve")
      .mockResolvedValue("resolved-anthropic-key");
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction("ai-chat", {
      companyId,
      messages: [{ role: "user", content: "hello" }],
    }) as { text?: string; error?: string };

    expect(result).toEqual({ text: "ok" });
    expect(resolveSecret).toHaveBeenCalledWith(secretRef, {
      companyId,
      configPath: "anthropicApiKey",
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("resolved-anthropic-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "claude-opus-5",
      thinking: { type: "adaptive" },
      output_config: { effort: "max" },
    });
  });

  it("uses a governed OpenAI key with GPT-5.6 Sol at high reasoning effort", async () => {
    const companyId = "11111111-1111-4111-8111-111111111111";
    const secretRef = {
      type: "secret_ref",
      secretId: "33333333-3333-4333-8333-333333333333",
    };
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      return new Response(JSON.stringify({ output_text: "openai-ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      capabilities: manifest.capabilities,
      config: { aiProvider: "openai", openaiApiKey: secretRef },
    });
    const resolveSecret = vi
      .spyOn(harness.ctx.secrets, "resolve")
      .mockResolvedValue("resolved-openai-key");
    await plugin.definition.setup(harness.ctx);

    await expect(harness.performAction("check-ai-config", { companyId })).resolves.toEqual({
      ok: true,
      provider: "openai",
      model: "gpt-5.6-sol",
    });

    const result = await harness.performAction("ai-chat", {
      companyId,
      system: "Build the company.",
      messages: [{ role: "user", content: "hello" }],
    }) as { text?: string; error?: string };

    expect(result).toEqual({ text: "openai-ok" });
    expect(resolveSecret).toHaveBeenCalledWith(secretRef, {
      companyId,
      configPath: "openaiApiKey",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.openai.com/v1/responses");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer resolved-openai-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: { effort: "high" },
      instructions: "Build the company.",
      input: [{ role: "user", content: "hello" }],
    });
  });

  it("rejects truncated Anthropic generations instead of accepting partial config", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            stop_reason: "max_tokens",
            content: [{ type: "text", text: "partial config" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const harness = createTestHarness({
      manifest,
      capabilities: manifest.capabilities,
      config: { anthropicApiKey: "sk-ant-test" },
    });
    await plugin.definition.setup(harness.ctx);

    const start = (await harness.performAction("ai-chat", {
      mode: "start",
      messages: [{ role: "user", content: "generate" }],
    })) as { jobId?: string; status?: string };
    expect(start.status).toBe("pending");

    let result: { status?: string; text?: string; error?: string } = {};
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      result = (await harness.performAction("ai-chat", {
        mode: "poll",
        jobId: start.jobId,
      })) as { status?: string; text?: string; error?: string };
      if (result.status !== "pending") break;
    }
    expect(result).toEqual({
      status: "error",
      text: "",
      error: "Anthropic generation stopped before completion (max_tokens).",
    });
  });

  it.each([
    {
      caseName: "incomplete response",
      response: {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: "partial config",
      },
      error: "OpenAI generation stopped before completion (max_output_tokens).",
    },
    {
      caseName: "refusal",
      response: {
        status: "completed",
        output: [{ content: [{ type: "refusal", refusal: "Cannot comply" }] }],
      },
      error: "OpenAI refused the generation request.",
    },
  ])("rejects an OpenAI $caseName instead of accepting empty or partial config", async ({
    response,
    error,
  }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const harness = createTestHarness({
      manifest,
      capabilities: manifest.capabilities,
      config: { aiProvider: "openai", openaiApiKey: "sk-openai-test" },
    });
    await plugin.definition.setup(harness.ctx);

    await expect(
      harness.performAction("ai-chat", {
        messages: [{ role: "user", content: "generate" }],
      }),
    ).resolves.toEqual({ text: "", error });
  });

  it("runs ai-chat as an async job (start → poll) for long generations", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ content: [{ type: "text", text: "generated-config" }] }), {
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

  it("declares the Anthropic key as a Paperclip secret reference", () => {
    const props = (manifest.instanceConfigSchema as any).properties;
    expect(props.anthropicApiKey.format).toBe("secret-ref");
  });

  it("allows Paperclip's governed secret binding object in Anthropic config", () => {
    const props = (manifest.instanceConfigSchema as any).properties;
    expect(props.anthropicApiKey.type).toEqual(["string", "object"]);
  });

  it("exposes OpenAI as a governed AI-wizard provider", () => {
    const props = (manifest.instanceConfigSchema as any).properties;
    expect(props.aiProvider).toMatchObject({
      type: "string",
      enum: ["anthropic", "openai"],
      default: "anthropic",
    });
    expect(props.openaiApiKey).toMatchObject({
      type: ["string", "object"],
      format: "secret-ref",
    });
  });

  it("uses the npm host package version floor for installation compatibility", () => {
    expect(manifest.minimumHostVersion).toBe("0.3.1");
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

  it("lists companies for the update dropdown", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/companies")) {
        return new Response(
          JSON.stringify([
            { id: "company-a", name: "Acme", description: "First" },
            { id: "company-b", name: "Globex" },
            { id: null, name: "ignored" },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      capabilities: manifest.capabilities,
      config: { paperclipUrl: "http://list-companies.test" },
    });
    await plugin.definition.setup(harness.ctx);

    const result = (await harness.performAction("list-companies", {})) as {
      companies?: Array<{ id: string; name: string; description: string }>;
      error?: string;
    };

    expect(result.error).toBeUndefined();
    expect(result.companies).toEqual([
      { id: "company-a", name: "Acme", description: "First" },
      { id: "company-b", name: "Globex", description: "" },
    ]);
  });

  it("reports healthy", async () => {
    const health = await plugin.definition.onHealth!();
    expect(health.status).toBe("ok");
  });

  it("provisions Company Skills and passes desiredSkills on hire", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "company-wizard-skills-"));
    const templatesPath = join(tmp, "templates");

    for (const role of ["ceo", "engineer"]) {
      const roleDir = join(templatesPath, "roles", role);
      await mkdir(roleDir, { recursive: true });
      await writeFile(
        join(roleDir, "role.meta.json"),
        JSON.stringify({ name: role, base: role === "ceo" }),
      );
      await writeFile(join(roleDir, "AGENTS.md"), `# ${role}\n\n## Skills\n`);
      await writeFile(join(roleDir, "SOUL.md"), `# ${role} soul\n`);
    }
    const modDir = join(templatesPath, "modules", "ci-cd");
    await mkdir(join(modDir, "skills"), { recursive: true });
    await writeFile(
      join(modDir, "module.meta.json"),
      JSON.stringify({ name: "ci-cd", capabilities: [{ skill: "ci-cd", owners: ["engineer"] }] }),
    );
    await writeFile(join(modDir, "skills", "ci-cd.md"), "# CI/CD\n");

    const skillCreateBodies: any[] = [];
    const hireBodies: any[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

      if (url.endsWith("/api/companies") && method === "GET") return json([]);
      if (url.endsWith("/api/instance/settings/experimental")) return json({ enableIsolatedWorkspaces: false });
      if (url.endsWith("/api/companies") && method === "POST") return json({ id: "co-1", name: "Acme" }, 201);
      if (url.endsWith("/api/companies/co-1/skills") && method === "GET") return json([]);
      if (url.endsWith("/api/companies/co-1/skills") && method === "POST") {
        const body = JSON.parse(String(init?.body || "{}"));
        skillCreateBodies.push(body);
        return json({ id: `skill-${body.slug}`, key: `key-${body.slug}`, slug: body.slug }, 201);
      }
      if (url.endsWith("/api/companies/co-1/issues") && method === "POST") {
        const body = JSON.parse(String(init?.body || "{}"));
        return json({ id: body.title === "Board Operations" ? "issue-board" : "issue-hiring" }, 201);
      }
      if (url.includes("/documents/") && method === "PUT") return json({ ok: true });
      if (url.endsWith("/api/companies/co-1/agent-hires") && method === "POST") {
        hireBodies.push(JSON.parse(String(init?.body || "{}")));
        return json({ agent: { id: `agent-${hireBodies.length}` } }, 201);
      }
      // Generic success for anything else the flow touches (bundle files, routines, etc.)
      return json({ ok: true, id: "x", key: "x", slug: "x" });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const harness = createTestHarness({
        manifest,
        capabilities: manifest.capabilities,
        config: { companiesDir: tmp, templatesPath, paperclipUrl: "http://paperclip.test" },
      });
      await plugin.definition.setup(harness.ctx);

      await harness.performAction("start-provision", {
        companyName: "Acme",
        selectedModules: ["ci-cd"],
        selectedRoles: ["engineer"],
      });

      // A Company Skill was created for the module capability.
      expect(skillCreateBodies.map((b) => b.slug)).toContain("ci-cd");
      // The engineer hire carried the skill key in desiredSkills.
      const engineerHire = hireBodies.find((b) => b.role === "general" || b.title === "Engineer" || b.name === "Engineer");
      expect(engineerHire).toBeTruthy();
      expect(engineerHire.desiredSkills).toContain("key-ci-cd");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("updates existing Company Skills through current file, rename, and metadata routes", async () => {
    const calls: Array<[string, unknown]> = [];
    const client = {
      async listCompanySkills() {
        return [
          {
            id: "skill-1",
            key: "company/ci-cd",
            slug: "ci-cd",
            name: "Old CI",
            description: "old",
            markdown: "# Old CI",
            categories: ["old"],
          },
        ];
      },
      async updateCompanySkillFile(_companyId: string, _skillId: string, body: unknown) {
        calls.push(["file", body]);
      },
      async renameCompanySkill(_companyId: string, _skillId: string, body: unknown) {
        calls.push(["rename", body]);
      },
      async updateCompanySkill(_companyId: string, _skillId: string, body: unknown) {
        calls.push(["metadata", body]);
      },
    };

    const keys = await provisionCompanySkills(
      client,
      "company-1",
      [
        {
          slug: "ci-cd",
          name: "CI/CD",
          description: "current",
          markdown: "# CI/CD",
          categories: ["delivery"],
        },
      ],
      () => undefined,
    );

    expect(keys.get("ci-cd")).toBe("company/ci-cd");
    expect(calls).toEqual([
      ["file", { path: "SKILL.md", content: "# CI/CD" }],
      ["rename", { name: "CI/CD" }],
      ["metadata", { description: "current", categories: ["delivery"] }],
    ]);
  });
});
