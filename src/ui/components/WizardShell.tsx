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
      {updateInfo?.ok && updateInfo.updateAvailable && (
        <div className="mx-6 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Company Wizard update available</p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                  Installed {updateInfo.currentVersion}; latest {updateInfo.latestVersion}. Update
                  the plugin package, then reload Paperclip.
                </p>
              </div>
            </div>
            {updateInfo.url && (
              <a
                href={updateInfo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 whitespace-nowrap font-medium hover:underline"
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
