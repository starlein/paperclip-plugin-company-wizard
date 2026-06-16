import { useEffect, useState } from 'react';
import { usePluginAction } from '@paperclipai/plugin-sdk/ui';
import {
  useWizard,
  useWizardDispatch,
  prevStep,
  getUserStepIndex,
  getTotalSteps,
} from '../context/WizardContext';
import { StepOnboarding } from './steps/StepOnboarding';
import { StepName } from './steps/StepName';
import { StepGoal } from './steps/StepGoal';
import { StepRepository } from './steps/StepRepository';
import { StepPreset } from './steps/StepPreset';
import { StepModules } from './steps/StepModules';
import { StepRoles } from './steps/StepRoles';
import { StepSummary } from './steps/StepSummary';
import { StepAiWizard } from './steps/StepAiWizard';
import { StepProvision } from './steps/StepProvision';
import { StepDone } from './steps/StepDone';
import { Button } from './ui/button';
import { AlertTriangle, ExternalLink } from 'lucide-react';

type UpdateInfo = {
  ok?: boolean;
  updateAvailable?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  url?: string;
};

const STEP_COMPONENTS = {
  onboarding: StepOnboarding,
  name: StepName,
  goal: StepGoal,
  repository: StepRepository,
  preset: StepPreset,
  modules: StepModules,
  roles: StepRoles,
  summary: StepSummary,
  'ai-wizard': StepAiWizard,
  provision: StepProvision,
  done: StepDone,
} as const;

function StepIndicator() {
  const state = useWizard();
  const current = getUserStepIndex(state);
  const total = getTotalSteps(state);

  if (
    current < 1 ||
    state.step === 'provision' ||
    state.step === 'done' ||
    state.step === 'ai-wizard'
  )
    return null;

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i + 1 <= current ? 'w-6 bg-foreground' : 'w-1.5 bg-muted-foreground/30'
          }`}
        />
      ))}
      <span className="ml-2 text-xs text-muted-foreground">
        {current}/{total}
      </span>
    </div>
  );
}

export function WizardShell() {
  const state = useWizard();
  const dispatch = useWizardDispatch();
  const checkUpdate = usePluginAction('check-update');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const StepComponent = STEP_COMPONENTS[state.step];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.step]);

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

  return (
    <div className="flex flex-col">
      {/* Plugin update notice — compact, and only on the onboarding (plugin entry) page. */}
      {updateInfo?.ok && updateInfo.updateAvailable && state.step === 'onboarding' && (
        <div className="px-6 pt-4">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
            <span>
              <span className="font-medium text-foreground">Company Wizard plugin</span> update:{' '}
              {updateInfo.currentVersion} → {updateInfo.latestVersion}
            </span>
            {updateInfo.url && (
              <a
                href={updateInfo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline"
                title="Update the plugin package, then reload Paperclip"
              >
                npm
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Step indicator (compact, no standalone header) */}
      {getUserStepIndex(state) >= 1 && state.step !== 'provision' && state.step !== 'done' && (
        <div className="flex items-center justify-end px-6 py-3">
          <StepIndicator />
        </div>
      )}

      {/* Content */}
      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-2xl">
          <StepComponent />
        </div>
      </main>

      {/* Error bar */}
      {state.error && (
        <div className="fixed bottom-0 inset-x-0 bg-destructive/10 border-t border-destructive/20 px-6 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{state.error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'SET_ERROR', error: null })}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
