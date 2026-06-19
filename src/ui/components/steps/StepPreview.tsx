import { useEffect, useRef, useState } from 'react';
import { useWizard, useWizardDispatch, getAllRoles } from '../../context/WizardContext';
import { usePluginAction } from '@paperclipai/plugin-sdk/ui';
import { Button } from '../ui/button';
import { Loader2, UserPlus, RefreshCw, UserMinus, CheckCircle, AlertCircle } from 'lucide-react';

interface AgentDiff {
  role: string;
  title: string;
  action: string;
}

interface RoutineDiff {
  title: string;
  action: string;
  assignTo?: string;
}

interface DesiredSkillsPreserved {
  agentId: string;
  agentName: string;
  skills: string[];
}

interface PreviewDiff {
  companyId: string;
  companyName: string;
  agents: AgentDiff[];
  routines: RoutineDiff[];
  desiredSkillsPreserved: DesiredSkillsPreserved[];
  plannedFiles: number;
}

function AgentActionIcon({ action }: { action: string }) {
  switch (action) {
    case 'hire':
      return <UserPlus className="h-4 w-4 text-green-500 shrink-0" />;
    case 'update':
      return <RefreshCw className="h-4 w-4 text-blue-500 shrink-0" />;
    case 'retire':
      return <UserMinus className="h-4 w-4 text-red-500 shrink-0" />;
    default:
      return null;
  }
}

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    hire: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    update: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    retire: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    create: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  };
  const cls = colorMap[action] || 'bg-muted text-muted-foreground border-border';
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {action}
    </span>
  );
}

export function StepPreview() {
  const state = useWizard();
  const dispatch = useWizardDispatch();
  const previewAction = usePluginAction('preview-company-update');
  const [diff, setDiff] = useState<PreviewDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const allRoles = getAllRoles(state);

    previewAction({
      existingCompanyId: state.existingCompanyId,
      companyName: state.companyName || undefined,
      presetName: state.presetName,
      selectedModules: state.selectedModules,
      selectedRoles: state.selectedRoles,
      goals: state.goals.length > 0 ? state.goals : undefined,
      projects: state.projects.length > 0 ? state.projects : undefined,
      issues: state.issues.length > 0 ? state.issues : undefined,
      allRoles,
    })
      .then((result: any) => {
        if (result?.error) {
          setError(result.error);
          setLoading(false);
          return;
        }
        setDiff(result?.diff ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Preview failed');
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading preview...
          </h2>
          <p className="text-sm text-muted-foreground">
            Comparing your configuration against the existing company.
          </p>
        </div>
      </div>
    );
  }

  if (error || !diff) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">Preview failed</h2>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Could not load preview</p>
              <p className="text-sm text-muted-foreground">{error || 'No diff data returned.'}</p>
            </div>
          </div>
          <div className="pl-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'GO_TO', step: 'summary' })}
            >
              Back to Summary
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasRetire = diff.agents.some((a) => a.action === 'retire');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Preview changes</h2>
        <p className="text-sm text-muted-foreground">
          Review what will change when you update{' '}
          <span className="font-medium">{diff.companyName}</span>.
        </p>
      </div>

      {/* Agents section */}
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Agents ({diff.agents.length})</h3>
        <ul className="space-y-2">
          {diff.agents.map((agent) => (
            <li key={`${agent.role}-${agent.action}`} className="flex items-center gap-2">
              <AgentActionIcon action={agent.action} />
              <span className="text-sm flex-1">{agent.title}</span>
              <ActionBadge action={agent.action} />
            </li>
          ))}
        </ul>
      </div>

      {/* Routines section */}
      {diff.routines.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Routines ({diff.routines.length})</h3>
          <ul className="space-y-2">
            {diff.routines.map((routine) => (
              <li key={routine.title} className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1">{routine.title}</span>
                <ActionBadge action={routine.action} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Desired Skills Preserved section */}
      {diff.desiredSkillsPreserved.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Preserved skills</h3>
          <p className="text-xs text-muted-foreground">
            The following agents have individually-assigned skills that will be preserved during the
            update.
          </p>
          <ul className="space-y-2">
            {diff.desiredSkillsPreserved.map((entry) => (
              <li key={entry.agentId} className="text-sm">
                <span className="font-medium">{entry.agentName}</span>
                <span className="text-muted-foreground"> — {entry.skills.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Retired roles notice */}
      {hasRetire && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5 p-4">
          <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Retired agents will not be auto-terminated
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Roles removed from the configuration are marked for retirement, but the corresponding
              agents will not be terminated automatically. A review issue will be created so you can
              decide whether to terminate each agent.
            </p>
          </div>
        </div>
      )}

      {/* Files summary */}
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{diff.plannedFiles}</span> file
          {diff.plannedFiles !== 1 ? 's' : ''} will be generated in the company workspace.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => dispatch({ type: 'GO_TO', step: 'summary' })}>
          Back
        </Button>
        <Button onClick={() => dispatch({ type: 'GO_TO', step: 'provision' })}>Apply Update</Button>
      </div>
    </div>
  );
}
