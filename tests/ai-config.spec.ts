import { describe, expect, it } from 'vitest';
import { AI_CONFIG_REPAIR_PROMPT, extractAiConfig } from '../src/ui/lib/ai-config';

describe('AI configuration extraction', () => {
  it('extracts a large config after recommendation prose', () => {
    const response = `## RECOMMENDATION

Use the secure preset with lean delivery.

{
  "name": "AegisSec",
  "companyDescription": "Preserve the Makerkit foundation.\\nBuild the scanner in phases.",
  "projects": [{
    "name": "AegisPlatform",
    "workspace": {
      "sourceType": "git_repo",
      "repoUrl": "https://github.com/starlein/AegisPlatform",
      "repoRef": "main"
    }
  }],
  "preset": "secure",
  "modules": ["security-audit", "lean-delivery"],
  "roles": ["engineer", "security-engineer"]
}`;

    expect(extractAiConfig(response)).toMatchObject({
      name: 'AegisSec',
      preset: 'secure',
      projects: [
        {
          workspace: { repoUrl: 'https://github.com/starlein/AegisPlatform' },
        },
      ],
    });
  });

  it('repairs raw string newlines, comments and trailing commas without corrupting URLs', () => {
    const response = `Recommendation first.
{
  "name": "AegisSec",
  "companyDescription": "First line
Second line",
  // Keep the existing repository.
  "projects": [{"workspace": {"repoUrl": "https://github.com/starlein/AegisPlatform"}}],
  "preset": "secure",
}`;

    expect(extractAiConfig(response)).toMatchObject({
      name: 'AegisSec',
      companyDescription: 'First line\nSecond line',
      preset: 'secure',
      projects: [
        {
          workspace: { repoUrl: 'https://github.com/starlein/AegisPlatform' },
        },
      ],
    });
  });

  it('accepts fenced JSON and rejects unrelated objects', () => {
    expect(
      extractAiConfig('metadata {"status":"ok"}\n```json\n{"name":"Acme","preset":"custom"}\n```'),
    ).toEqual({
      name: 'Acme',
      preset: 'custom',
    });
    expect(extractAiConfig('{"status":"ok"}')).toBeNull();
    expect(AI_CONFIG_REPAIR_PROMPT).toContain('Return ONLY the complete configuration JSON object');
  });
});
