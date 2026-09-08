import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-ignore — plain-JS logic module
import { routineConcurrencyPolicy, routineTitle } from '../src/logic/routines.js';

// Values the shipped templates may use must match what Paperclip's validators
// accept, otherwise provisioning silently drops the object (routine creation is
// non-fatal) or renders an `undefined` heading into the CEO's bootstrap issue.
const ROUTINE_CONCURRENCY_POLICIES = ['coalesce_if_active', 'always_enqueue', 'skip_if_active'];
const ISSUE_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const GOAL_LEVELS = ['company', 'team', 'agent', 'task'];

const templatesDir = join(fileURLToPath(new URL('../', import.meta.url)), 'templates');

const readMeta = (path: string) => JSON.parse(readFileSync(path, 'utf-8'));
const dirsIn = (path: string) =>
  readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const roleNames = new Set(dirsIn(join(templatesDir, 'roles')));
const moduleNames = dirsIn(join(templatesDir, 'modules'));
const presetNames = dirsIn(join(templatesDir, 'presets'));

const modules = moduleNames.map((name) => ({
  name,
  meta: readMeta(join(templatesDir, 'modules', name, 'module.meta.json')),
}));
const presets = presetNames.map((name) => ({
  name,
  meta: readMeta(join(templatesDir, 'presets', name, 'preset.meta.json')),
}));

const assignableTarget = (assignTo: unknown) =>
  typeof assignTo !== 'string' ||
  assignTo.startsWith('capability:') ||
  assignTo === 'user' ||
  roleNames.has(assignTo);

describe('shipped template metadata matches the Paperclip API contract', () => {
  it.each(modules)('module $name declares provisionable routines', ({ meta }) => {
    for (const routine of meta.routines ?? []) {
      // A routine keyed only by the legacy `name` used to render as "### undefined".
      expect(routineTitle(routine)).not.toBe('');
      expect(routine.title).toBeTypeOf('string');
      if (routine.concurrencyPolicy !== undefined) {
        expect(ROUTINE_CONCURRENCY_POLICIES).toContain(routine.concurrencyPolicy);
      }
      expect(routineConcurrencyPolicy(routine)).toBeOneOf(ROUTINE_CONCURRENCY_POLICIES);
      expect(assignableTarget(routine.assignTo)).toBe(true);
      if (routine.priority !== undefined) expect(ISSUE_PRIORITIES).toContain(routine.priority);
    }
  });

  it.each(modules)('module $name declares resolvable issues and dependencies', ({ meta }) => {
    for (const dependency of meta.requires ?? []) expect(moduleNames).toContain(dependency);
    for (const role of meta.activatesWithRoles ?? []) expect(roleNames).toContain(role);
    for (const issue of meta.issues ?? []) {
      expect(issue.title).toBeTypeOf('string');
      expect(assignableTarget(issue.assignTo)).toBe(true);
      if (issue.priority !== undefined) expect(ISSUE_PRIORITIES).toContain(issue.priority);
    }
    for (const goal of [meta.goal, ...(meta.goals ?? [])].filter(Boolean)) {
      for (const subgoal of goal.subgoals ?? []) {
        if (subgoal.level !== undefined) expect(GOAL_LEVELS).toContain(subgoal.level);
      }
    }
  });

  it.each(presets)('preset $name references known modules, roles and enums', ({ meta }) => {
    for (const moduleName of meta.modules ?? []) expect(moduleNames).toContain(moduleName);
    for (const role of meta.roles ?? []) expect(roleNames).toContain(role);
    for (const issue of meta.issues ?? []) {
      expect(assignableTarget(issue.assignTo)).toBe(true);
      if (issue.priority !== undefined) expect(ISSUE_PRIORITIES).toContain(issue.priority);
    }
    for (const routine of meta.routines ?? []) {
      expect(routineTitle(routine)).not.toBe('');
      expect(routineConcurrencyPolicy(routine)).toBeOneOf(ROUTINE_CONCURRENCY_POLICIES);
    }
    for (const goal of meta.goals ?? []) {
      for (const subgoal of goal.subgoals ?? []) {
        if (subgoal.level !== undefined) expect(GOAL_LEVELS).toContain(subgoal.level);
      }
    }
  });
});
