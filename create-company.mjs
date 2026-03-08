#!/usr/bin/env node

/**
 * Clipper — Bootstrap a Paperclip company workspace from modular templates.
 *
 * Usage:
 *   clipper                        (interactive, outputs to ./companies/)
 *   clipper --output /path/to/dir  (custom output directory)
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv } from 'node:process';
import { readdir, readFile, copyFile, mkdir, appendFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');

// Parse --output flag, default to ../companies/ (relative to clipper/)
function parseOutputDir() {
  const idx = argv.indexOf('--output');
  if (idx !== -1 && argv[idx + 1]) return resolve(argv[idx + 1]);
  return join(__dirname, '..', 'companies');
}

const OUTPUT_DIR = parseOutputDir();

// ── ANSI helpers ──

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const magenta = (s) => `\x1b[35m${s}\x1b[0m`;

// ── Filesystem helpers ──

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function appendToFile(filePath, content) {
  if (await exists(filePath)) {
    await appendFile(filePath, content);
  }
}

// ── Data loading ──

async function loadPresets() {
  const presetsDir = join(TEMPLATES_DIR, 'presets');
  const presets = [];
  if (!await exists(presetsDir)) return presets;
  const dirs = await readdir(presetsDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const presetFile = join(presetsDir, dir.name, 'preset.json');
    if (await exists(presetFile)) {
      const data = JSON.parse(await readFile(presetFile, 'utf-8'));
      presets.push(data);
    }
  }
  return presets;
}

async function loadModules() {
  const modulesDir = join(TEMPLATES_DIR, 'modules');
  const modules = [];
  if (!await exists(modulesDir)) return modules;
  const dirs = await readdir(modulesDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const readmePath = join(modulesDir, dir.name, 'README.md');
    let description = '';
    if (await exists(readmePath)) {
      const content = await readFile(readmePath, 'utf-8');
      const descLine = content.split('\n').find(l => l.length > 0 && !l.startsWith('#'));
      description = descLine?.trim() || '';
    }
    modules.push({ name: dir.name, description });
  }
  return modules;
}

// ── Assembly ──

async function assembleCompany(companyName, baseName, moduleNames) {
  const companyDir = join(OUTPUT_DIR, companyName);

  if (await exists(companyDir)) {
    throw new Error(`Company directory already exists: ${companyDir}`);
  }

  console.log('');
  console.log(bold('Assembling company workspace...'));
  console.log('');

  // 1. Copy base template
  const baseDir = join(TEMPLATES_DIR, baseName);
  if (!await exists(baseDir)) {
    throw new Error(`Base template not found: ${baseName}`);
  }

  const baseRoles = await readdir(baseDir, { withFileTypes: true });
  for (const role of baseRoles) {
    if (!role.isDirectory()) continue;
    const src = join(baseDir, role.name);
    const dest = join(companyDir, 'agents', role.name);
    await copyDir(src, dest);
    console.log(`  ${green('+')} agents/${role.name}/ ${dim('(from base)')}`);
  }

  // 2. Apply modules
  for (const moduleName of moduleNames) {
    const moduleDir = join(TEMPLATES_DIR, 'modules', moduleName);
    if (!await exists(moduleDir)) {
      console.log(`  ${yellow('!')} module ${moduleName} not found, skipping`);
      continue;
    }

    // Copy shared docs
    const docsDir = join(moduleDir, 'docs');
    if (await exists(docsDir)) {
      await copyDir(docsDir, join(companyDir, 'docs'));
      const docs = await readdir(docsDir);
      for (const doc of docs) {
        console.log(`  ${green('+')} docs/${doc} ${dim(`(from ${moduleName})`)}`);
      }
    }

    // Copy role-specific agent skills
    const agentsDir = join(moduleDir, 'agents');
    if (await exists(agentsDir)) {
      const roles = await readdir(agentsDir, { withFileTypes: true });
      for (const role of roles) {
        if (!role.isDirectory()) continue;
        const skillsDir = join(agentsDir, role.name, 'skills');
        if (await exists(skillsDir)) {
          const destSkillsDir = join(companyDir, 'agents', role.name, 'skills');
          await copyDir(skillsDir, destSkillsDir);
          const skills = await readdir(skillsDir);
          for (const skill of skills) {
            console.log(`  ${green('+')} agents/${role.name}/skills/${skill} ${dim(`(from ${moduleName})`)}`);

            // Append skill reference to AGENTS.md
            const agentsMd = join(companyDir, 'agents', role.name, 'AGENTS.md');
            await appendToFile(agentsMd, `\nRead and follow: \`$AGENT_HOME/skills/${skill}\`\n`);
          }
        }
      }
    }

    // Copy new roles (e.g., pr-review adds code-reviewer, product-owner)
    const rolesDir = join(moduleDir, 'roles');
    if (await exists(rolesDir)) {
      const newRoles = await readdir(rolesDir, { withFileTypes: true });
      for (const role of newRoles) {
        if (!role.isDirectory()) continue;
        const dest = join(companyDir, 'agents', role.name);
        await copyDir(join(rolesDir, role.name), dest);
        console.log(`  ${green('+')} agents/${role.name}/ ${dim(`(from ${moduleName})`)}`);
      }
    }
  }

  // 3. Add shared doc references to all AGENTS.md files
  const docsDir = join(companyDir, 'docs');
  if (await exists(docsDir)) {
    const docs = await readdir(docsDir);
    if (docs.length > 0) {
      const agentsBaseDir = join(companyDir, 'agents');
      const agentRoles = await readdir(agentsBaseDir, { withFileTypes: true });
      for (const role of agentRoles) {
        if (!role.isDirectory()) continue;
        const agentsMd = join(agentsBaseDir, role.name, 'AGENTS.md');
        if (await exists(agentsMd)) {
          let docRefs = '\n## Shared Documentation\n';
          for (const doc of docs) {
            docRefs += `\nRead: \`docs/${doc}\`\n`;
          }
          await appendToFile(agentsMd, docRefs);
        }
      }
    }
  }

  return companyDir;
}

// ── Interactive prompts ──

async function prompt(rl, question, validate) {
  while (true) {
    let answer;
    try {
      answer = (await rl.question(question)).trim();
    } catch {
      process.exit(1);
    }
    if (validate) {
      const error = validate(answer);
      if (error) { console.log(`  ${red(error)}`); continue; }
    }
    return answer;
  }
}

async function selectOne(rl, label, options) {
  console.log('');
  console.log(bold(label));
  console.log('');
  options.forEach((opt, i) => {
    console.log(`  ${cyan(`${i + 1})`)} ${bold(opt.name)}`);
    if (opt.description) console.log(`     ${dim(opt.description)}`);
    if (opt.constraints?.length) {
      opt.constraints.forEach(c => console.log(`     ${yellow('!')} ${c}`));
    }
  });
  console.log('');

  const answer = await prompt(
    rl,
    `  ${dim('Enter number')} [1-${options.length}]: `,
    (a) => {
      const n = parseInt(a);
      if (isNaN(n) || n < 1 || n > options.length) return `Pick 1-${options.length}`;
    }
  );
  return options[parseInt(answer) - 1];
}

async function selectMany(rl, label, options, preselected = []) {
  console.log('');
  console.log(bold(label));
  console.log('');
  options.forEach((opt, i) => {
    const pre = preselected.includes(opt.name) ? green(' [included]') : '';
    console.log(`  ${cyan(`${i + 1})`)} ${bold(opt.name)}${pre}`);
    if (opt.description) console.log(`     ${dim(opt.description)}`);
  });
  console.log('');

  const available = options.filter(o => !preselected.includes(o.name));
  if (available.length === 0) {
    console.log(`  ${dim('All modules already included by preset.')}`);
    return preselected;
  }

  const answer = await prompt(
    rl,
    `  ${dim('Add extra modules (comma-separated numbers, or Enter to skip)')}: `,
    () => null
  );

  if (!answer) return preselected;

  const selected = [...preselected];
  for (const part of answer.split(',')) {
    const n = parseInt(part.trim());
    if (n >= 1 && n <= options.length && !selected.includes(options[n - 1].name)) {
      selected.push(options[n - 1].name);
    }
  }
  return selected;
}

// ── Main ──

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log('');
    console.log(magenta('  ╔═══════════════════════════════════════╗'));
    console.log(magenta('  ║') + bold('   Clipper                              ') + magenta('║'));
    console.log(magenta('  ╚═══════════════════════════════════════╝'));
    console.log('');

    // 1. Company name
    const companyName = await prompt(
      rl,
      `  ${bold('Company name')}: `,
      (a) => {
        if (!a) return 'Name is required';
        if (!/^[a-zA-Z][a-zA-Z0-9 _-]*$/.test(a)) return 'Use letters, numbers, spaces, hyphens, or underscores';
      }
    );

    // 2. Load presets and modules
    const presets = await loadPresets();
    const allModules = await loadModules();

    // 3. Select preset or custom
    const presetOptions = [
      ...presets,
      { name: 'custom', description: 'Pick modules manually' }
    ];

    const choice = await selectOne(rl, 'Select a preset:', presetOptions);

    let baseName, moduleNames;

    if (choice.name === 'custom') {
      baseName = 'base';
      const selected = await selectMany(rl, 'Select modules:', allModules);
      moduleNames = selected;
    } else {
      baseName = choice.base;
      moduleNames = [...choice.modules];

      // Offer to add extra modules
      const extraModules = allModules.filter(m => !moduleNames.includes(m.name));
      if (extraModules.length > 0) {
        moduleNames = await selectMany(rl, 'Modules included + available:', allModules, moduleNames);
      }
    }

    // 4. Confirm
    console.log('');
    console.log(bold('  Summary:'));
    console.log(`    Company:  ${cyan(companyName)}`);
    console.log(`    Base:     ${cyan(baseName)}`);
    console.log(`    Modules:  ${moduleNames.length > 0 ? moduleNames.map(m => cyan(m)).join(', ') : dim('none')}`);
    console.log(`    Output:   ${dim(`companies/${companyName}/`)}`);
    console.log('');

    const confirm = await prompt(
      rl,
      `  ${bold('Create?')} [Y/n]: `,
      () => null
    );

    if (confirm.toLowerCase() === 'n') {
      console.log(`\n  ${dim('Cancelled.')}\n`);
      return;
    }

    // 5. Assemble
    const companyDir = await assembleCompany(companyName, baseName, moduleNames);

    // 6. Done
    console.log('');
    console.log(green(bold('  Done!')));
    console.log('');
    console.log(bold('  Next steps:'));
    console.log(`    1. Create the company in the Paperclip UI`);
    console.log(`    2. Create the CEO agent with:`);
    console.log(`       ${dim(`cwd = ${companyDir}`)}`);
    console.log(`       ${dim(`instructionsFilePath = agents/ceo/AGENTS.md`)}`);
    console.log(`    3. Create the Engineer agent with:`);
    console.log(`       ${dim(`cwd = ${companyDir}`)}`);
    console.log(`       ${dim(`instructionsFilePath = agents/engineer/AGENTS.md`)}`);

    // Show extra roles if pr-review module was selected
    if (moduleNames.includes('pr-review')) {
      console.log(`    4. Create the Code Reviewer agent with:`);
      console.log(`       ${dim(`cwd = ${companyDir}`)}`);
      console.log(`       ${dim(`instructionsFilePath = agents/code-reviewer/AGENTS.md`)}`);
      console.log(`    5. Create the Product Owner agent with:`);
      console.log(`       ${dim(`cwd = ${companyDir}`)}`);
      console.log(`       ${dim(`instructionsFilePath = agents/product-owner/AGENTS.md`)}`);
    }

    console.log('');

  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(`\n  ${red('Error:')} ${err.message}\n`);
  process.exit(1);
});
