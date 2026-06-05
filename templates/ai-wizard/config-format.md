Respond with ONLY a JSON object (no markdown fences):
{
  "name": "CompanyName",
  "companyDescription": "Comprehensive 2-4 paragraph description of what this company does, what it is building, who it is for, key technical decisions, priorities, constraints, and any special context. This is the company's permanent record — be thorough and specific.",
  "goals": [
    { "title": "Top-level company goal", "description": "Detailed paragraph: scope, success criteria, key constraints and context." },
    { "title": "Additional business/product/technical goal if needed", "description": "Concrete success criteria. Do not omit user-specific goals just because a preset/module also has template goals." }
  ],
  "projects": [
    { "name": "Project name", "description": "Concrete project description — what is being built and key technical details.", "goals": ["Goal titles linked to this project"], "workspace": { "sourceType": "local_path", "defaultRef": "main", "setupCommand": "git init -b main", "isPrimary": true }, "executionWorkspacePolicy": { "defaultMode": "isolated_workspace", "workspaceStrategy": { "type": "git_worktree", "baseRef": "main" } } }
  ],
  "preset": "preset-name",
  "modules": ["all-modules-to-activate-including-preset-ones"],
  "roles": ["all-non-base-roles-needed-including-preset-ones-engineer-is-not-base"],
  "explanation": "2-3 sentences explaining WHY this configuration fits the described company."
}

Rules:
- modules should list ALL modules to activate (including preset ones).
- goals should list the user's concrete objectives. Preset/module template goals are added later by the wizard; do not replace the user's goal with a generic preset goal such as "Build a REST API" unless that is truly the whole objective.
- projects should link to the relevant goal titles in `goals`. Include enough project detail for agents to start work. The primary project MUST say whether Paperclip should create a fresh local Git repository or use an external repo:
  - Fresh/new repo: use `workspace.sourceType: "local_path"`, `workspace.defaultRef: "main"`, `workspace.setupCommand: "git init -b main"`, and `workspace.isPrimary: true`.
  - Existing external repo (GitHub/GitLab/etc.): use `workspace.sourceType: "git_repo"`, include `repoUrl`, `repoRef`/`defaultRef` when known (default `origin/main`), and prefer isolated git worktrees via `executionWorkspacePolicy`.
  - Do not put credentials or tokens in repository URLs or project text.
- roles should list ALL non-base roles the company needs (including preset ones). Engineer is NOT a base role — include it if the project involves code.
- Be pragmatic — don't over-engineer. Match the config to the actual needs described.
- If the user mentions speed/MVP/prototype, lean toward fast or rad.
- If the user mentions quality/production/enterprise, lean toward quality or full.
- If the user mentions research/exploration/validation, lean toward research.
