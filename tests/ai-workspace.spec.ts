import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeWorkspaceConfig as normalize } from '../src/ui/components/steps/StepAiWizard';
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('AI workspace contract', () => {
  it('preserves explicit null without changing omitted legacy initialization', () => {
    expect(normalize({ sourceType: 'local_path', cwd: '/work/docs', setupCommand: null })).toEqual({
      sourceType: 'local_path',
      cwd: '/work/docs',
      setupCommand: null,
    });
    expect(normalize({ sourceType: 'local_path' })).not.toHaveProperty('setupCommand');
    expect(normalize({ setupCommand: ' git init -b main ' })).toEqual({
      setupCommand: 'git init -b main',
    });
  });
  it('exposes the no-Git choice in both real UI entry points', () => {
    for (const path of [
      'src/ui/components/steps/StepRepository.tsx',
      'src/ui/components/ConfigReview.tsx',
    ]) {
      expect(read(path)).toContain('Plain folder (no Git)');
      expect(read(path)).toContain("'directory'");
    }
  });
  it('keeps published prompts identical to the canonical UI source', () => {
    for (const name of ['interview-system.md', 'single-shot-system.md', 'messages.json']) {
      expect(read('templates/ai-wizard/' + name)).toBe(read('src/ui/prompts/' + name));
    }
    const messages = JSON.parse(read('src/ui/prompts/messages.json'));
    expect(read('templates/ai-wizard/config-format.md').trim()).toBe(messages.configFormat.trim());
  });
  it('rejects the obsolete Git-only primary project rule', () => {
    for (const path of [
      'src/ui/prompts/interview-system.md',
      'templates/ai-wizard/interview-system.md',
    ]) {
      const prompt = read(path);
      expect(prompt).not.toMatch(
        /MUST state whether it uses a fresh local Git repository or an external Git repository/,
      );
      const rule = prompt.split('\n').find((line) => line.startsWith('- The primary project MUST'));
      expect(rule).toMatch(/plain.*folder|directory/i);
      expect(rule).toContain('cwd');
      expect(rule).toContain('setupCommand: null');
      expect(rule).toMatch(/new.*Git.*external.*Git/i);
    }
  });
  it('documents directory reuse, role union and array fields without legacy contradictions', () => {
    for (const name of ['interview-system.md', 'single-shot-system.md', 'messages.json']) {
      const prompt = read('src/ui/prompts/' + name);
      expect(prompt).toContain('setupCommand');
      expect(prompt).toContain('null');
      expect(prompt).toContain('cwd');
      expect(prompt).toContain('union');
      expect(prompt).toContain('non-code');
      expect(prompt).not.toMatch(
        /does NOT auto-add roles|does not auto-add preset roles|"goal"\s*:|"project"\s*:/,
      );
    }
  });
});
