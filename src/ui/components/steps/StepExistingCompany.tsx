import { useEffect, useRef, useState } from 'react';
import { useWizard, useWizardDispatch } from '../../context/WizardContext';
import { usePluginAction } from '@paperclipai/plugin-sdk/ui';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ArrowRight, Building2, Check, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CompanyOption {
  id: string;
  name: string;
  description?: string;
}

export function StepExistingCompany() {
  const state = useWizard();
  const dispatch = useWizardDispatch();
  const listCompanies = usePluginAction('list-companies');

  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [touched, setTouched] = useState(false);
  const requested = useRef(false);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    listCompanies({})
      .then((result: any) => {
        if (result?.error) {
          setLoadError(result.error);
          setCompanies(null);
          return;
        }
        setCompanies(Array.isArray(result?.companies) ? result.companies : []);
      })
      .catch((err: any) => {
        setLoadError(err?.message || 'Could not load companies');
        setCompanies(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCompany = (company: CompanyOption) => {
    dispatch({ type: 'SET_EXISTING_COMPANY_ID', value: company.id });
    // Carry the real company name forward so the summary shows it (read-only) instead
    // of "(unnamed)", and so assembly targets the matching workspace directory.
    dispatch({ type: 'SET_COMPANY_NAME', value: company.name || '' });
  };

  const isEmpty = !state.existingCompanyId.trim();

  const handleNext = () => {
    if (isEmpty) {
      setTouched(true);
      return;
    }
    dispatch({ type: 'GO_TO', step: 'preset' });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Update existing company</h2>
        <p className="text-sm text-muted-foreground">
          Pick the company you want to update. The wizard re-syncs its agent instructions, docs,
          modules, roles, and routines — the company name, goals, and repository stay untouched.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your companies…
        </div>
      )}

      {/* Load error → offer manual entry */}
      {!loading && loadError && !manual && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Could not load companies
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 wrap-break-word">
                {loadError}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={load}>
                  <RefreshCw className="h-3 w-3 mr-1.5" />
                  Retry
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setManual(true)}
                >
                  Enter ID manually
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Company list */}
      {!loading && !manual && companies && (
        <div className="space-y-3">
          {companies.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No companies found on this instance.
              <button
                type="button"
                onClick={() => setManual(true)}
                className="ml-1 underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                Enter an ID manually
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {companies.map((company) => {
                const selected = state.existingCompanyId === company.id;
                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => selectCompany(company)}
                    className={cn(
                      'w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                      selected
                        ? 'border-foreground/30 bg-accent'
                        : 'border-border hover:border-foreground/20 hover:bg-accent/50',
                    )}
                  >
                    <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{company.name || '(unnamed)'}</p>
                      {company.description ? (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {company.description}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {company.id}
                        </p>
                      )}
                    </div>
                    {selected && <Check className="h-4 w-4 text-foreground shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          )}

          {companies.length > 0 && (
            <button
              type="button"
              onClick={() => setManual(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
            >
              Company not listed? Enter an ID manually
            </button>
          )}
        </div>
      )}

      {/* Manual ID entry (fallback) */}
      {!loading && manual && (
        <div className="space-y-3">
          <Input
            placeholder="e.g. 42a5aea0-1234-5678-90ab-cdef12345678"
            value={state.existingCompanyId}
            onChange={(e) => dispatch({ type: 'SET_EXISTING_COMPANY_ID', value: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            autoFocus
            className="text-base h-11 font-mono"
          />
          {touched && isEmpty && (
            <p className="text-sm text-destructive">Please enter a company ID.</p>
          )}
          {companies && companies.length > 0 && (
            <button
              type="button"
              onClick={() => setManual(false)}
              className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2"
            >
              Back to the company list
            </button>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => dispatch({ type: 'GO_TO', step: 'onboarding' })}>
          Back
        </Button>
        <Button onClick={handleNext} disabled={isEmpty}>
          Next
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
