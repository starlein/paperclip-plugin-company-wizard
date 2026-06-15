Respond with ONLY a JSON object (no markdown fences):
{
  "name": "CompanyName",
  "companyDescription": "Comprehensive 2-4 paragraph description of what this company does, what it is building, who it is for, key technical decisions, priorities, constraints, and any special context. This is the company's permanent record — be thorough and specific.",
  "goals": [
    { "title": "Top-level company goal", "description": "Detailed paragraph: scope, success criteria, key constraints and context." },
    { "title": "Additional business/product/technical goal if needed", "description": "Concrete success criteria. Do not omit user-specific goals just because a preset/module also has template goals." }
  ],
  "projects": [
    { "name": "Project name", "description": "Concrete project description — what is being built and key technical details.", "goals": ["Goal titles linked to this project"], "workspace": { "sourceType": "local_path", "defaultRef": "main", "setupCommand": "git init -b main", "isPrimary": true } }
  ],
  "preset": "preset-name",
  "modules": ["all-modules-to-activate-including-preset-ones"],
  "roles": ["all-non-base-roles-needed-including-preset-ones-engineer-is-not-base"],
  "explanation": "2-3 sentences explaining WHY this configuration fits the described company."
}

Rules:
- modules should list ALL modules to activate (including preset ones).
- goals should list the user's concrete objectives. The first goal must be outcome-first/product-first: title the primary deliverable or operating outcome, not a supporting constraint. Preserve constraints in the description under "Constraints / quality bars" unless the constraint is explicitly the main project. When the brief lists secondary facts as sub-goals, keep their weight lower unless they are true independent workstreams. Preset/module template goals are added later by the wizard; do not replace the user's goal with a generic preset goal unless that is truly the whole objective.
- projects should link to the relevant goal titles in `goals`. Include enough project detail for agents to start work. The primary project MUST say whether Paperclip should create a fresh local Git repository or use an external repo:
  - Fresh/new repo: use `workspace.sourceType: "local_path"`, `workspace.defaultRef: "main"` unless another initial branch was requested, `workspace.setupCommand: "git init -b <defaultRef>"`, and `workspace.isPrimary: true`. Do not include `executionWorkspacePolicy`.
  - Existing external repo (GitHub/GitLab/etc.): use `workspace.sourceType: "git_repo"`, include `repoUrl`, and include `repoRef`/`defaultRef` exactly when the user or repository context provides one. Do not force a branch name or remote prefix. Do not include `executionWorkspacePolicy`; isolated worktrees are applied later only when Paperclip's experimental isolated-workspaces setting is enabled.
  - Do not put credentials or tokens in repository URLs or project text.
- roles should list ALL non-base roles the company needs (including preset ones). Engineer is NOT a base role — include it if the project involves code.
- Be pragmatic — don't over-engineer. Match the config to the actual needs described.
- If the user mentions speed/MVP/prototype, lean toward fast or rad.
- If the user mentions quality/production/enterprise, lean toward quality or full.
- If the user mentions research/exploration/validation, lean toward research.
