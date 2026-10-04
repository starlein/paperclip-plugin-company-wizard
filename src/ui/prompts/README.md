# Canonical AI wizard prompts

This directory is the canonical runtime source imported by StepAiWizard. Published copies in templates/ai-wizard mirror interview-system.md, single-shot-system.md and messages.json exactly. config-format.md mirrors messages.json configFormat. Update both together; tests/ai-workspace.spec.ts enforces parity and the workspace/role contract. All prompts use goals/projects arrays and English template text.
