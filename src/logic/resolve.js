import { createHash } from 'node:crypto';

/**
 * Resolve capability ownership based on present roles.
 * Returns structured data for display and assembly.
 */
export function resolveCapabilities(modules, selectedModules, allRoles) {
  const resolved = [];
  for (const mod of modules) {
    if (!selectedModules.includes(mod.name) || !mod.capabilities?.length) continue;
    for (const cap of mod.capabilities) {
      const primaryOwner = cap.owners.find((r) => allRoles.has(r));
      const fallbacks = cap.owners.filter((r) => r !== primaryOwner && allRoles.has(r));
      if (primaryOwner) {
        resolved.push({
          skill: cap.skill,
          module: mod.name,
          primary: primaryOwner,
          fallbacks,
        });
      }
    }
  }
  return resolved;
}

/**
 * Build the full set of roles from base + extra.
 * @param {Array<{name: string, base?: boolean}>} availableRoles - All loaded roles
 * @param {string[]} extraRoleNames - Extra roles selected by user
 */
export function buildAllRoles(availableRoles, extraRoleNames) {
  const baseRoles = availableRoles.filter((r) => r.base).map((r) => r.name);
  const allRoles = new Set([...baseRoles, ...extraRoleNames]);
  return allRoles;
}

/**
 * Build a map of module name → required module names (from `requires` field).
 * Also computes a reverse map: module name → modules that depend on it.
 */
export function buildModuleDeps(modules) {
  const requires = new Map(); // module → [deps]
  const requiredBy = new Map(); // dep → [dependents]

  for (const mod of modules) {
    const deps = mod.requires || [];
    requires.set(mod.name, deps);
    for (const dep of deps) {
      if (!requiredBy.has(dep)) requiredBy.set(dep, []);
      requiredBy.get(dep).push(mod.name);
    }
  }

  return { requires, requiredBy };
}

/**
 * Given a set of selected modules, expand it to include all transitive
 * dependencies. Returns { expanded: string[], autoSelected: string[] }.
 */
export function expandModuleDeps(selected, requires) {
  const result = new Set(selected);
  const autoSelected = [];
  const queue = [...selected];

  while (queue.length > 0) {
    const mod = queue.shift();
    for (const dep of requires.get(mod) || []) {
      if (!result.has(dep)) {
        result.add(dep);
        autoSelected.push(dep);
        queue.push(dep);
      }
    }
  }

  return { expanded: [...result], autoSelected };
}

/**
 * Check if a module can be deselected — it cannot if any selected module
 * depends on it. Returns the list of dependents that block deselection.
 */
export function getBlockingDependents(moduleName, selected, requiredBy) {
  const dependents = requiredBy.get(moduleName) || [];
  return dependents.filter((d) => selected.includes(d));
}

/**
 * Pretty-print a role name: "product-owner" → "Product Owner"
 */
export function formatRoleName(role) {
  return role
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function skillSlug(baseName, variant) {
  return variant === 'fallback' ? `${baseName}-fallback` : baseName;
}

export function humanizeSkillName(baseName, variant) {
  const words = String(baseName)
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return variant === 'fallback' ? `${words} (fallback)` : words;
}

export function hashSkillContent(markdown) {
  return createHash('sha256').update(String(markdown), 'utf-8').digest('hex').slice(0, 16);
}

/**
 * Group per-role resolved skill records into deduped Company Skills.
 * Identical content under the same base slug collapses to one skill (shared).
 * Divergent content under the same base slug is disambiguated by appending
 * `-<representativeRole>` (lowest sorted role name in that content group).
 */
export function buildCompanySkillSet(records) {
  const byBaseSlug = new Map();
  for (const rec of records) {
    if (!byBaseSlug.has(rec.baseSlug)) byBaseSlug.set(rec.baseSlug, []);
    byBaseSlug.get(rec.baseSlug).push(rec);
  }

  const companySkills = [];
  const roleSkillSlugs = new Map();
  const addRoleSlug = (roleName, slug) => {
    if (!roleSkillSlugs.has(roleName)) roleSkillSlugs.set(roleName, []);
    const list = roleSkillSlugs.get(roleName);
    if (!list.includes(slug)) list.push(slug);
  };

  for (const baseSlug of [...byBaseSlug.keys()].sort()) {
    const byHash = new Map();
    for (const rec of byBaseSlug.get(baseSlug)) {
      const hash = hashSkillContent(rec.markdown);
      if (!byHash.has(hash)) byHash.set(hash, { hash, rec, roles: [] });
      byHash.get(hash).roles.push(rec.roleName);
    }
    const groups = [...byHash.values()]
      .map((g) => ({ ...g, repRole: [...g.roles].sort()[0] }))
      .sort((a, b) => a.repRole.localeCompare(b.repRole));

    groups.forEach((group, idx) => {
      const slug = idx === 0 ? baseSlug : `${baseSlug}-${group.repRole}`;
      companySkills.push({
        slug,
        name: group.rec.name,
        description: group.rec.description,
        categories: group.rec.categories,
        markdown: group.rec.markdown,
        contentHash: group.hash,
      });
      for (const roleName of group.roles) addRoleSlug(roleName, slug);
    });
  }

  return { companySkills, roleSkillSlugs };
}
