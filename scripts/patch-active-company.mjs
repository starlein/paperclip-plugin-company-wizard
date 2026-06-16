#!/usr/bin/env node
/**
 * Patch an already-provisioned ("active") company in place to match the current
 * wizard defaults:
 *
 *   1. Worker (non-CEO) agents: set thinking level to `medium` (CEO stays as-is).
 *   2. Assign the orphaned governance issues ("Board Operations", "Hiring Plan")
 *      to the CEO so they are actionable instead of unassigned.
 *
 * Re-running is safe: agents already at `medium` and issues already assigned to
 * the CEO are skipped.
 *
 * Usage (run where the Paperclip instance is reachable):
 *
 *   PAPERCLIP_URL=http://localhost:3100 \
 *   node scripts/patch-active-company.mjs <companyId> [--dry-run] [--thinking=medium]
 *
 * Authenticated instances also need:
 *   PAPERCLIP_EMAIL=...  PAPERCLIP_PASSWORD=...
 */

import { PaperclipClient } from '../src/api/client.js';

const args = process.argv.slice(2);
const companyId = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const thinkingArg = args.find((a) => a.startsWith('--thinking='));
const targetThinking = thinkingArg ? thinkingArg.split('=')[1].trim() : 'medium';

if (!companyId) {
  console.error('Usage: node scripts/patch-active-company.mjs <companyId> [--dry-run] [--thinking=medium]');
  process.exit(1);
}

const baseUrl = process.env.PAPERCLIP_URL || process.env.PAPERCLIP_PUBLIC_URL || 'http://localhost:3100';
const email = process.env.PAPERCLIP_EMAIL || '';
const password = process.env.PAPERCLIP_PASSWORD || '';

const GOVERNANCE_ISSUE_TITLES = ['board operations', 'hiring plan'];

function asArray(maybe) {
  if (Array.isArray(maybe)) return maybe;
  if (Array.isArray(maybe?.issues)) return maybe.issues;
  if (Array.isArray(maybe?.data)) return maybe.data;
  return [];
}

async function main() {
  console.log(`Connecting to ${baseUrl} ...`);
  const client = new PaperclipClient(baseUrl, email && password ? { email, password } : {});
  await client.connect();
  console.log('✓ Connected');

  // --- Agents ----------------------------------------------------------------
  const agents = await client.listAgents(companyId);
  if (!Array.isArray(agents)) {
    throw new Error('listAgents did not return an array.');
  }
  const ceo = agents.find((a) => a?.role === 'ceo' && a?.status !== 'terminated');
  if (!ceo?.id) {
    console.warn('⚠ No active CEO agent found — governance issues cannot be reassigned.');
  } else {
    console.log(`CEO agent: ${ceo.title || ceo.name || ceo.id} (${ceo.id})`);
  }

  const workers = agents.filter((a) => a?.role !== 'ceo' && a?.status !== 'terminated');
  console.log(`\nWorker agents to check: ${workers.length}`);
  for (const agent of workers) {
    const cfg = { ...(agent.adapterConfig || {}) };
    const current = cfg.thinkingLevel || cfg.modelReasoningEffort || '(unset)';
    if (cfg.thinkingLevel === targetThinking && cfg.modelReasoningEffort === targetThinking) {
      console.log(`  • ${agent.title || agent.name} — already ${targetThinking}, skip`);
      continue;
    }
    cfg.thinkingLevel = targetThinking;
    cfg.modelReasoningEffort = targetThinking;
    console.log(`  • ${agent.title || agent.name} — ${current} → ${targetThinking}${dryRun ? ' (dry-run)' : ''}`);
    if (!dryRun) {
      await client.updateAgent(agent.id, { adapterConfig: cfg });
    }
  }

  // --- Governance issues -----------------------------------------------------
  if (ceo?.id) {
    console.log('\nGovernance issues:');
    let issues = [];
    try {
      issues = asArray(await client._fetch(`/api/companies/${companyId}/issues`, { method: 'GET' }));
    } catch (err) {
      console.warn(`⚠ Could not list issues (${err.message}).`);
      console.warn('  Assign "Board Operations" and "Hiring Plan" to the CEO manually in the board.');
    }
    const targets = issues.filter((i) =>
      GOVERNANCE_ISSUE_TITLES.includes(String(i?.title || '').trim().toLowerCase()),
    );
    if (targets.length === 0 && issues.length > 0) {
      console.log('  (no Board Operations / Hiring Plan issues found)');
    }
    for (const issue of targets) {
      const assigned = issue.assigneeAgentId || issue.assigneeUserId;
      if (issue.assigneeAgentId === ceo.id) {
        console.log(`  • ${issue.title} — already assigned to CEO, skip`);
        continue;
      }
      console.log(
        `  • ${issue.title} — ${assigned ? `reassigning from ${assigned}` : 'assigning'} to CEO${dryRun ? ' (dry-run)' : ''}`,
      );
      if (!dryRun) {
        await client.updateIssue(issue.id, { assigneeAgentId: ceo.id });
      }
    }
  }

  console.log(`\n${dryRun ? 'Dry-run complete — no changes written.' : 'Done.'}`);
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
