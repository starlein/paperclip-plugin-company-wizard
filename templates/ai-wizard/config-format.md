Respond with ONLY a JSON object using this shape. Use exactly one project object for a single-project setup. For a fresh/new repository, use workspace.sourceType=local_path, defaultRef=main unless another initial branch was requested, setupCommand=git init -b <defaultRef>, and isPrimary=true, and do NOT include executionWorkspacePolicy. For an existing external repo, use workspace.sourceType=git_repo, include repoUrl plus repoRef/defaultRef only when the user or repository context provides one. Do not force a branch name or remote prefix. Do not include executionWorkspacePolicy; the assembler applies isolated worktrees only when Paperclip's experimental isolated-workspaces setting is enabled.
{
  "name": "CompanyName",
  "companyDescription": "Comprehensive 2-4 paragraph description of what this company does, what it is building, who it is for, key technical decisions, priorities, constraints, and any special context. This is the company's permanent record — be thorough and specific.",
  "goals": [
    {
      "title": "Main user-specific goal title",
      "description": "THOROUGH description with ALL requirements, specs, acceptance criteria, constraints, edge cases, and every detail the user provided. This is the primary brief for all agents — preserve every detail, do NOT summarize. Multiple paragraphs expected. Lead with the primary deliverable or operating outcome; put side constraints under Constraints / quality bars unless one is explicitly the main project."
    },
    {
      "title": "Additional user-specific goal if needed",
      "description": "Sub-goal or parallel objective description...",
      "parentGoal": "Main user-specific goal title"
    }
  ],
  "projects": [
    {
      "name": "ProjectName",
      "description": "Concrete project description — what is being built and key technical details.",
      "goals": [
        "Main user-specific goal title",
        "Additional user-specific goal if needed"
      ],
      "workspace": {
        "sourceType": "local_path",
        "defaultRef": "main",
        "setupCommand": "git init -b main",
        "isPrimary": true
      }
    }
  ],
  "issues": [
    {
      "title": "Concrete, project-specific first work item taken straight from the brief",
      "description": "What to build and the acceptance criteria, grounded in the user's actual spec — NOT generic scaffolding.",
      "priority": "critical | high | medium | low",
      "assignTo": "engineer"
    }
  ],
  "preset": "preset-name",
  "modules": [
    "all-modules-to-activate-including-preset-ones"
  ],
  "roles": [
    "all-non-base-roles-needed-including-preset-ones-engineer-is-not-base"
  ],
  "explanation": "2-3 sentences explaining WHY this configuration fits the described company."
}

## Workspace and role contract

- No external URL does not imply a new repository. For non-code work (research, writing, operations), use a plain local folder unless the user requests Git.
- Plain folder or explicit existing local directory reuse without initialization: use `workspace.sourceType: "local_path"`, preserve the user's explicit `workspace.cwd`, set `workspace.setupCommand: null`, and `workspace.isPrimary: true`. Omit repoUrl, repoRef and defaultRef. Do not invent a cwd if none was provided. Null explicitly disables initialization; omission retains the legacy Git default.
- New Git repository only when appropriate/requested: use local_path, defaultRef (main unless specified), and setupCommand `git init -b <defaultRef>`.
- External Git repository: use git_repo and repoUrl, with repoRef/defaultRef only when supplied. Never include credentials or executionWorkspacePolicy.
- The applied team is the union of chosenPreset.roles and supplied roles, plus base roles. List only non-base roles in roles. Choose an appropriate preset for non-code work: omitting engineer from roles cannot remove an engineer already included by the preset. Include engineer when code is required, not merely because files exist.
