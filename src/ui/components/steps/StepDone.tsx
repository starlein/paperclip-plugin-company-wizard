import { useWizard, useWizardDispatch, getAllRoles } from '../../context/WizardContext';
import { usePluginAction } from '@paperclipai/plugin-sdk/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { CheckCircle2, RotateCcw, ExternalLink, ShieldCheck, Loader2 } from 'lucide-react';

type PendingHire = { id: string; name: string; createdAt: string };

/**
 * Governed hires stay pending until the board decides, and a pending agent is not
 * invokable — so a freshly provisioned company cannot run its bootstrap heartbeat
 * while these are outstanding. Surfacing them here (and letting the operator, who
 * is the board member, approve them in place) closes the loop without weakening
 * governance: provisioning itself still never auto-approves.
 */
function PendingHires({ companyId }: { companyId: string }) {
  const listPendingHires = usePluginAction('list-pending-hires');
  const approvePendingHires = usePluginAction('approve-pending-hires');

  const [hires, setHires] = useState<PendingHire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const requested = useRef(false);

  const load = useCallback(() => {
    setError(null);
    listPendingHires({ companyId })
      .then((res: any) => {
        if (res?.error) {
          setError(res.error);
          return;
        }
        setHires(Array.isArray(res?.approvals) ? res.approvals : []);
      })
      .catch((err: any) => setError(err?.message || 'Could not load pending hires'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    load();
  }, [load]);

  const approveAll = () => {
    setApproving(true);
    setError(null);
    approvePendingHires({ companyId })
      .then((res: any) => {
        if (res?.error) {
          setError(res.error);
          return;
        }
        if (Array.isArray(res?.failed) && res.failed.length > 0) {
          setError(`${res.failed.length} hire(s) could not be approved: ${res.failed[0]?.error}`);
        }
        load();
      })
      .catch((err: any) => setError(err?.message || 'Could not approve hires'))
      .finally(() => setApproving(false));
  };

  // Nothing pending (or not loaded yet) → stay out of the way.
  if (!error && (!hires || hires.length === 0)) return null;

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
              A pending agent is not invokable, so the bootstrap heartbeat cannot start until these
              are approved.
            </p>
          </div>
        </div>

        {hires && hires.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hires.map((h) => (
              <Badge key={h.id} variant="outline" className="text-xs">
                {h.name || h.id.slice(0, 8)}
              </Badge>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-600 wrap-break-word">{error}</p>}

        {hires && hires.length > 0 && (
          <Button size="sm" onClick={approveAll} disabled={approving}>
            {approving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {approving ? 'Approving…' : 'Approve all hires'}
          </Button>
        )}
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

      {result?.companyId && <PendingHires companyId={result.companyId} />}

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
