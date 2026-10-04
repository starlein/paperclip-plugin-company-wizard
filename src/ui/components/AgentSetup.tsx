import { useWizard, useWizardDispatch, type CeoAdapter } from '../context/WizardContext';
import { Input } from './ui/input';

// Adapter names are conveniences, not model recommendations.
const ADAPTERS = [
  ['claude_local', 'Claude Code'],
  ['codex_local', 'Codex'],
  ['opencode_local', 'OpenCode'],
  ['cursor', 'Cursor'],
  ['openclaw_gateway', 'OpenClaw'],
  ['hermes_local', 'Hermes'],
  ['gemini_local', 'Gemini'],
  ['grok_local', 'Grok'],
  ['kimi_local', 'Kimi'],
  ['pi_local', 'Pi'],
];

export function AgentSetupFields({
  value,
  existingCompany,
  onChange,
}: {
  value: CeoAdapter;
  existingCompany: boolean;
  onChange: (adapter: Partial<CeoAdapter>) => void;
}) {
  return (
    <section className="rounded-lg border p-4 space-y-4" aria-label="Agent setup">
      <div>
        <h3 className="text-sm font-medium">Agent setup</h3>
        <p className="text-sm text-muted-foreground">
          Team settings for new agents. Model: {value.model.trim() || 'Adapter default'}.
        </p>
      </div>
      {existingCompany && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Existing agents keep their adapter, model, and runtime settings by default.
          </p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.updateExistingAgents === true}
              onChange={(e) => onChange({ updateExistingAgents: e.target.checked })}
            />
            Apply wizard settings to existing agents
          </label>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Warning: opting in changes existing agents’ adapter/model and applies wizard runtime
            settings. A blank model uses the adapter default, not their current model.
          </p>
        </div>
      )}
      <label className="block space-y-2 text-sm font-medium">
        <span>Adapter type</span>
        <select
          className="w-full min-h-11 rounded-md border border-input bg-background px-3"
          value={value.type}
          onChange={(e) => onChange({ type: e.target.value })}
        >
          {!ADAPTERS.some(([type]) => type === value.type) && (
            <option value={value.type}>{value.type}</option>
          )}
          {ADAPTERS.map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Custom model (optional)</span>
        <Input
          className="min-h-11"
          placeholder="Adapter default"
          value={value.model}
          onChange={(e) => onChange({ model: e.target.value })}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        Leave blank to use the host adapter default, or enter any model identifier supported by your
        adapter.
      </p>
      <label className="block space-y-2 text-sm font-medium">
        <span>Runtime working directory (optional)</span>
        <Input
          className="min-h-11"
          placeholder="/path/to/project"
          value={value.cwd}
          onChange={(e) => onChange({ cwd: e.target.value })}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        Agent runtime cwd, not the generated files destination. Leave blank to keep an existing cwd
        or use the default Paperclip workspace for new agents.
      </p>
    </section>
  );
}

export function AgentSetup() {
  const state = useWizard();
  const dispatch = useWizardDispatch();
  return (
    <AgentSetupFields
      value={state.ceoAdapter}
      existingCompany={state.path === 'update' || Boolean(state.existingCompanyId.trim())}
      onChange={(adapter) => dispatch({ type: 'SET_CEO_ADAPTER', adapter })}
    />
  );
}
