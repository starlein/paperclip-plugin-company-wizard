import {
  usePluginData,
  usePluginAction,
  type PluginPageProps,
  type PluginSidebarProps,
  type PluginWidgetProps,
} from '@paperclipai/plugin-sdk/ui';
import { useState } from 'react';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { WizardShell } from './components/WizardShell';
import { WizardProvider } from './context/WizardContext';
import './index.css';
import type { TemplateData } from './types';

const PLUGIN_ID = 'starlein.paperclip-plugin-company-wizard';

export function WizardPage(_props: PluginPageProps) {
  const { data: templates, loading, error, refresh } = usePluginData<TemplateData>('templates');
  const syncTemplates = usePluginAction('sync-empty-templates');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const handleSync = async () => {
    if (syncing || !templates?.syncOffer?.canSync) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const result = (await syncTemplates({ confirmation: templates.syncOffer.token })) as {
        ok?: boolean;
        error?: string;
      };
      if (!result.ok) throw new Error(result.error || 'Template sync failed.');
      await refresh();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Template sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-sm text-destructive">
        Failed to load templates: {error.message}
      </div>
    );
  }

  if (loading || !templates) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Loading templates</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Checking bundled or operator-managed templates. A custom GitHub source may need to be
            downloaded — this may take a moment.
          </p>
        </div>
      </div>
    );
  }

  // Also guard against the silent empty response returned by older workers.
  if (templates.error || !templates.roles.some((role) => role.name === 'ceo')) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center min-h-[400px] gap-3 px-6 text-sm text-center"
      >
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p className="font-medium">
          {templates.syncOffer ? 'Template directory is empty' : 'Templates are unavailable'}
        </p>
        {templates.syncOffer?.canSync && (
          <>
            <p className="text-muted-foreground">
              Sync downloads and validates the configured template URL into this empty directory.
              Existing files are never overwritten.
            </p>
            <button
              type="button"
              disabled={syncing}
              onClick={handleSync}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              {syncing ? 'Syncing templates…' : 'Confirm sync from configured template URL'}
            </button>
          </>
        )}
        {syncError && (
          <p role="alert" className="text-destructive">
            {syncError}
          </p>
        )}
        <p className="max-w-2xl text-destructive">
          {templates.error || 'No CEO template was loaded.'}
        </p>
        <p className="max-w-2xl text-muted-foreground">
          Open Company Wizard plugin settings. Clear templatesPath to use bundled templates or your
          custom GitHub source, or point it to a populated template root. The local path overrides
          the GitHub URL. Only the explicit sync offer can populate an empty local directory. Test
          Configuration, save, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {templates.loadErrors && templates.loadErrors.length > 0 && (
        <div className="mx-4 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Some template files could not be loaded</p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                {templates.loadErrors.length} parse warning
                {templates.loadErrors.length > 1 ? 's' : ''} detected. Check worker logs for
                file-level details.
              </p>
            </div>
          </div>
        </div>
      )}
      <WizardProvider templates={templates}>
        <WizardShell />
      </WizardProvider>
    </div>
  );
}

export function ToolbarButton({ context }: PluginWidgetProps) {
  const companyPrefix = (context as any).companyPrefix;
  const href = companyPrefix ? `/${companyPrefix}/company-creator` : '#';

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (href !== '#') window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.625rem',
        fontSize: '12px',
        fontWeight: 500,
        borderRadius: '0.375rem',
        border: '1px solid var(--border)',
        color: 'inherit',
        textDecoration: 'none',
        transition: 'background-color 0.15s',
      }}
    >
      + Company
    </a>
  );
}

export function SidebarLink({ context }: PluginSidebarProps) {
  const href = context.companyPrefix ? `/${context.companyPrefix}/company-creator` : '#';
  const isActive =
    typeof window !== 'undefined' && window.location.pathname.endsWith('/company-creator');

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (href !== '#') window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-current={isActive ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.5rem 0.75rem',
        fontSize: '13px',
        fontWeight: 500,
        borderRadius: '0.375rem',
        color: 'inherit',
        textDecoration: 'none',
        transition: 'background-color 0.15s',
        backgroundColor: isActive ? 'var(--accent)' : 'transparent',
      }}
    >
      <Sparkles style={{ width: 16, height: 16, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Create Company
      </span>
    </a>
  );
}
