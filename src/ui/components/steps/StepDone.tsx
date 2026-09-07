import { useWizard, useWizardDispatch, getAllRoles } from '../../context/WizardContext';
import { usePluginAction } from '@paperclipai/plugin-sdk/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { CheckCircle2, RotateCcw, ExternalLink, ShieldCheck, Loader2, Play } from 'lucide-react';

type PendingHire = { id: string; name: string; createdAt: string };
type HireActionResult = {
  error?: string;
  approvals?: PendingHire[];
  approved?: string[];
  failed?: { id: string; error: string }[];
};
type BootstrapActionResult = {
  error?: string;
  warnings?: string[];
  started?: boolean;
  message?: string;
};

/**
 * Governed hires stay pending until the board decides, and a pending agent is not
 * invokable — so a freshly provisioned company cannot run its bootstrap heartbeat
 * while its approval is outstanding. Show only this run's hires, and submit only
 * the rows the operator explicitly selected. Paperclip enforces board access.
 */
export function PendingHires({
  companyId,
  approvalIds,
}: {
  companyId: string;
  approvalIds: string[];
}) {
  const listPendingHires = usePluginAction('list-pending-hires');
  const approvePendingHires = usePluginAction('approve-pending-hires');

  const [hires, setHires] = useState<PendingHire[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const mounted = useRef(false);
  const loadSequence = useRef(0);
  const listAction = useRef(listPendingHires);
  listAction.current = listPendingHires;
  const scopeKey = JSON.stringify(approvalIds);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = (await listAction.current({
        companyId,
        approvalIds: JSON.parse(scopeKey),
      })) as HireActionResult;
      if (!mounted.current || sequence !== loadSequence.current) return;
      if (res?.error) throw new Error(String(res.error));
      const approvals = Array.isArray(res?.approvals) ? (res.approvals as PendingHire[]) : [];
      setHires(approvals);
      setSelectedIds((previous) =>
        previous.filter((id) => approvals.some((hire) => hire.id === id)),
      );
    } catch (err) {
      if (mounted.current && sequence === loadSequence.current) {
        setLoadError(err instanceof Error ? err.message : 'Could not load pending hires');
      }
    } finally {
      if (mounted.current && sequence === loadSequence.current) setLoading(false);
    }
  }, [companyId, scopeKey]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      ++loadSequence.current;
    };
  }, [load]);

  const approveSelected = async () => {
    // Capture the reviewed set; a hire arriving after this render is never added.
    const approvalIds = selectedIds.filter((id) => hires?.some((hire) => hire.id === id));
    if (approving || loading || approvalIds.length === 0) return;
    setApproving(true);
    setActionError(null);
    setMessage(null);
    try {
      const res = (await approvePendingHires({ companyId, approvalIds })) as HireActionResult;
      if (!mounted.current) return;
      if (res?.error) throw new Error(String(res.error));
      if (Array.isArray(res?.failed) && res.failed.length > 0) {
        setActionError(
          `${res.failed.length} hire(s) could not be approved: ${res.failed[0]?.error}`,
        );
      }
      if (Array.isArray(res?.approved) && res.approved.length > 0) {
        setMessage(
          `${res.approved.length} hire(s) approved. Start bootstrap when the team is ready.`,
        );
      }
      await load();
    } catch (err) {
      if (mounted.current)
        setActionError(err instanceof Error ? err.message : 'Could not approve hires');
    } finally {
      if (mounted.current) setApproving(false);
    }
  };

  if (!loading && !loadError && !actionError && !message && hires?.length === 0) return null;

  return (
    <Card className="border-amber-500/40">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {hires && hires.length > 0
                ? `${hires.length} hire${hires.length === 1 ? '' : 's'} awaiting board approval`
                : 'Pending hires'}
            </p>
            <p className="text-xs text-muted-foreground">
              These hire requests were created by this wizard run. Review and select the hires to
              approve. Pending agents cannot run; approval does not start bootstrap automatically.
            </p>
          </div>
        </div>

        {hires && hires.length > 0 && (
          <div className="space-y-2">
            {hires.map((h) => (
              <label key={h.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(h.id)}
                  disabled={approving || loading}
                  onChange={(event) =>
                    setSelectedIds((previous) =>
                      event.target.checked
                        ? [...previous, h.id]
                        : previous.filter((id) => id !== h.id),
                    )
                  }
                />
                {h.name || h.id.slice(0, 8)}
              </label>
            ))}
          </div>
        )}

        {loading && (
          <p className="text-xs text-muted-foreground" role="status">
            Loading pending hires…
          </p>
        )}
        {loadError && (
          <p className="text-xs text-red-600 wrap-break-word" role="alert">
            {loadError}
          </p>
        )}
        {actionError && (
          <p className="text-xs text-red-600 wrap-break-word" role="alert">
            {actionError}
          </p>
        )}
        {message && (
          <p className="text-xs text-muted-foreground" role="status">
            {message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {hires && hires.length > 0 && (
            <Button
              size="sm"
              onClick={approveSelected}
              disabled={approving || loading || selectedIds.length === 0}
            >
              {approving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {approving ? 'Approving…' : `Approve selected (${selectedIds.length})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={approving || loading}
          >
            <RotateCcw className="h-4 w-4" />
            Refresh hires
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function BootstrapStart({
  companyId,
  agentId,
  issueId,
}: {
  companyId: string;
  agentId: string;
  issueId: string;
}) {
  const startBootstrap = usePluginAction('start-bootstrap');
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const start = async () => {
    if (starting || started) return;
    setStarting(true);
    setError(null);
    setMessage(null);
    setWarnings([]);
    try {
      const res = (await startBootstrap({ companyId, agentId, issueId })) as BootstrapActionResult;
      setWarnings(Array.isArray(res?.warnings) ? (res.warnings as string[]) : []);
      if (res?.error) throw new Error(String(res.error));
      setStarted(res?.started === true);
      setMessage(
        res?.started
          ? 'Bootstrap queued. Follow the CEO’s progress in Paperclip.'
          : String(res?.message || 'Bootstrap was not started.'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start bootstrap');
    } finally {
      setStarting(false);
    }
  };
  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <p className="text-sm font-medium">Start company bootstrap</p>
        <p className="text-xs text-muted-foreground">
          Once the hires are approved, start the CEO to carry out the bootstrap task.
        </p>
        <Button size="sm" disabled={starting || started} onClick={() => void start()}>
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {starting ? 'Starting…' : started ? 'Bootstrap queued' : 'Start bootstrap'}
        </Button>
        {error && (
          <p className="text-xs text-red-600 wrap-break-word" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="text-xs text-muted-foreground" role="status">
            {message}
          </p>
        )}
        {warnings.map((warning) => (
          <p key={warning} className="text-xs text-amber-600 wrap-break-word">
            {warning}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

export function StepDone() {
  const state = useWizard();
  const dispatch = useWizardDispatch();
  const allRoles = getAllRoles(state);
  const result = state.provisionResult;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{state.companyName}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {state.existingCompanyId
              ? 'Workspace has been assembled and bootstrap tasks were added to the existing Paperclip company.'
              : 'Company has been assembled and registered with Paperclip.'}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {state.goals[0]?.title && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Goal
              </p>
              <p className="text-sm">{state.goals[0].title}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Team ({allRoles.length} agents)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allRoles.map((r) => {
                const role = state.roles.find((ro) => ro.name === r);
                return (
                  <Badge key={r} variant="outline" className="text-xs">
                    {role?.title || r}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Modules ({state.selectedModules.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {state.selectedModules.map((m) => (
                <Badge key={m} variant="secondary" className="text-xs">
                  {m}
                </Badge>
              ))}
            </div>
          </div>

          {result?.issueIds && result.issueIds.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Issues
              </p>
              <p className="text-sm">{result.issueIds.length} issues provisioned</p>
            </div>
          )}

          {state.presetName && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Preset
              </p>
              <p className="text-sm capitalize">{state.presetName}</p>
            </div>
          )}

          {result?.companyId && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Company ID
              </p>
              <p className="font-mono text-xs">{result.companyId}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {result?.companyId && (result.pendingApprovalIds?.length ?? 0) > 0 && (
        <PendingHires
          key={`${result.companyId}:${result.pendingApprovalIds!.join(',')}`}
          companyId={result.companyId}
          approvalIds={result.pendingApprovalIds!}
        />
      )}
      {result?.companyId && result.bootstrapIssueId && result.agentIds.ceo && (
        <BootstrapStart
          key={result.bootstrapIssueId}
          companyId={result.companyId}
          agentId={result.agentIds.ceo}
          issueId={result.bootstrapIssueId}
        />
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => dispatch({ type: 'RESET' })}>
          <RotateCcw className="h-4 w-4" />
          Create another
        </Button>
        <Button asChild>
          <a
            href={
              result?.paperclipUrl && result?.issuePrefix
                ? `${result.paperclipUrl}/${result.issuePrefix}/dashboard`
                : result?.paperclipUrl || 'http://localhost:3100'
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" />
            Open Paperclip
          </a>
        </Button>
      </div>
    </div>
  );
}
