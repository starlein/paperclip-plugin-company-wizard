Respond with ONLY a JSON object (no markdown fences):
{
  "reasoning": "Brief explanation of why you chose this configuration (2-3 sentences)",
  "name": "CompanyName",
  "goal": "Goal title",
  "goalDescription": "One paragraph goal description",
  "preset": "preset-name",
  "extraModules": ["module-a", "module-b"],
  "extraRoles": ["role-a", "role-b"]
}

Rules:
- extraModules should only list modules NOT already in the preset.
- extraRoles should only list roles NOT already in the preset.
- Be pragmatic — don't over-engineer. Match the config to the actual needs described.
- If the user mentions speed/MVP/prototype, lean toward fast or rad.
- If the user mentions quality/production/enterprise, lean toward quality or full.
- If the user mentions research/exploration/validation, lean toward research.
