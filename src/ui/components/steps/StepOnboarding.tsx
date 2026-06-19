import { useEffect, useState } from 'react';
import { useWizardDispatch } from '../../context/WizardContext';
import { usePluginAction } from '@paperclipai/plugin-sdk/ui';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Building2, Sparkles, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';

type UpdateInfo = {
  ok?: boolean;
  updateAvailable?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  url?: string;
};

function PathCard({
  icon: Icon,
  title,
  description,
  details,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  details: string[];
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200',
        'hover:border-foreground/20 hover:shadow-md',
        'active:scale-[0.98]',
      )}
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {details.map((d, i) => (
            <li key={i} className="text-sm text-muted-foreground flex items-baseline gap-2">
              <span className="text-foreground/40 shrink-0">-</span>
              {d}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function StepOnboarding() {
  const dispatch = useWizardDispatch();
  const refreshTemplates = usePluginAction('refresh-templates');
  const checkUpdate = usePluginAction('check-update');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkUpdate({})
      .then((result: unknown) => {
        if (!cancelled) setUpdateInfo(result as UpdateInfo);
      })
      .catch(() => {
        if (!cancelled) setUpdateInfo(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const result = (await refreshTemplates({})) as { ok?: boolean; error?: string };
      if (result?.error) {
        setRefreshMsg(result.error);
      } else {
        setRefreshMsg('Templates updated — reload the page to use them.');
      }
    } catch (err) {
      setRefreshMsg(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create a company</h1>
        <p className="text-muted-foreground">
          Choose how you'd like to set up your AI agent organization.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <PathCard
          icon={Building2}
          title="Setup my own org"
          description="Configure step by step"
          details={[
            'Choose team preset or go custom',
            'Pick modules and roles',
            'Define goal and first project',
            'Full control over every detail',
          ]}
          onClick={() => dispatch({ type: 'SET_PATH', path: 'manual' })}
        />
        <PathCard
          icon={Sparkles}
          title="Autonomous from idea"
          description="Describe it, we'll configure it"
          details={[
            'Describe your company in plain English',
            'AI selects optimal team and modules',
            'Review and adjust before creating',
            'Fastest way to get started',
          ]}
          onClick={() => dispatch({ type: 'SET_PATH', path: 'ai' })}
        />
        <PathCard
          icon={RefreshCw}
          title="Update existing company"
          description="Re-provision or modify an existing org"
          details={[
            'Select company by ID',
            'Choose preset, modules, and roles',
            'Preview changes before applying',
            'Preserves individual skill assignments',
          ]}
          onClick={() => dispatch({ type: 'SET_PATH', path: 'update' })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
          {refreshing ? 'Updating templates…' : 'Update templates'}
        </button>
        {updateInfo?.ok && updateInfo.updateAvailable && (
          <>
            <span className="text-xs text-muted-foreground/40">|</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Company Wizard plugin update: {updateInfo.currentVersion} → {updateInfo.latestVersion}
              {updateInfo.url && (
                <a
                  href={updateInfo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline"
                  title="Update the Company Wizard plugin package, then reload Paperclip"
                >
                  npm
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </span>
          </>
        )}
        {refreshMsg && <span className="text-xs text-muted-foreground">{refreshMsg}</span>}
      </div>
    </div>
  );
}
