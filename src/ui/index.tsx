import {
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
  type PluginWidgetProps,
} from '@paperclipai/plugin-sdk/ui';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { WizardShell } from './components/WizardShell';
import { WizardProvider } from './context/WizardContext';
import './index.css';
import type { TemplateData } from './types';

const PLUGIN_ID = 'yesterday-ai.paperclip-plugin-company-wizard';

export function WizardPage(_props: PluginPageProps) {
  const { data: templates, loading, error } = usePluginData<TemplateData>('templates');

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
            Checking your templates directory. If no local templates are found, they'll be
            downloaded from GitHub — this may take a moment.
          </p>
        </div>
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
