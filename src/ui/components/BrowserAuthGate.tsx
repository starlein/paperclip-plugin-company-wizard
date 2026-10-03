import { createContext, useEffect, useState, type ReactNode } from 'react';
import { usePluginAction } from '@paperclipai/plugin-sdk/ui';
import { usesLegacyConnection, type BoardAuthOptions } from '../lib/board-action';
import { Button } from './ui/button';

export const BoardAuthConsentContext = createContext(false);

export const BoardAuthWarningContext = createContext<(message: string) => void>((message) =>
  console.warn(message),
);

export function BrowserAuthorizationConsent({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 p-6 text-sm">
      <h2 className="text-lg font-semibold">Use your current Paperclip login</h2>
      <p>No login email or password needs to be stored in plugin settings.</p>
      <p>
        Company Wizard will create a temporary API key for each board action. The key has your full
        board permissions and is not restricted to one company or action. Only continue if you trust
        this installed plugin.
      </p>
      <p>
        Keys stay in memory, are revoked after the action, and expire after at most one hour if
        cleanup fails. Your password and browser session cookie are never sent to the worker.
      </p>
      <p className="text-muted-foreground">
        This uses Paperclip’s board-key REST API, not a delegated-authorization SDK capability.
        Older hosts or separately configured instances can still use the optional legacy login
        settings. Do not blindly retry provisioning after a timeout; first check whether the company
        was created.
      </p>
      <Button onClick={onContinue}>Use current login</Button>
    </div>
  );
}

/** Consent lasts only for this mounted wizard; no key or consent is persisted. */
export function BrowserAuthGate({ children }: { children?: ReactNode }) {
  const optionsAction = usePluginAction('auth-options');
  const [state, setState] = useState<'checking' | 'consent' | 'ready'>('checking');
  const [hasBrowserConsent, setHasBrowserConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setState('checking');
    void (async () => {
      try {
        const options = (await optionsAction({})) as BoardAuthOptions;
        let needsConsent = !usesLegacyConnection(options, window.location.origin);
        if (needsConsent) {
          if (options.mode !== 'browser')
            throw new Error('Reload the plugin to update its authentication support.');
          const response = await fetch('/api/health', {
            credentials: 'same-origin',
            redirect: 'error',
            cache: 'no-store',
          });
          if (!response.ok)
            throw new Error('Could not check Paperclip authentication. Sign in again and retry.');
          needsConsent = (await response.json()).deploymentMode !== 'local_trusted';
        }
        if (!cancelled) setState(needsConsent ? 'consent' : 'ready');
      } catch {
        if (!cancelled)
          setError(
            'Could not check authorization. Sign in again, reload the plugin, or configure the optional legacy login in plugin settings.',
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [optionsAction, attempt]);
  if (error)
    return (
      <div role="alert" className="space-y-3 p-6 text-sm">
        <p>{error}</p>
        <Button onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
      </div>
    );
  if (state === 'checking')
    return <p className="p-6 text-sm text-muted-foreground">Checking authorization…</p>;
  if (state === 'consent')
    return (
      <BrowserAuthorizationConsent
        onContinue={() => {
          setHasBrowserConsent(true);
          setState('ready');
        }}
      />
    );
  return (
    <BoardAuthWarningContext.Provider value={setWarning}>
      {warning && (
        <p role="alert" className="p-4 text-sm">
          {warning}
        </p>
      )}
      <BoardAuthConsentContext.Provider value={hasBrowserConsent}>
        {children}
      </BoardAuthConsentContext.Provider>
    </BoardAuthWarningContext.Provider>
  );
}
