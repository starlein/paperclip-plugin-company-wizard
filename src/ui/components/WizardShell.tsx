import { useEffect, useRef } from 'react';
import {
  useWizard,
  useWizardDispatch,
  getUserStepIndex,
  getTotalSteps,
} from '../context/WizardContext';
import type { Step, WizardPath } from '../context/WizardContext';
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
import { StepPreview } from './steps/StepPreview';
import { StepExistingCompany } from './steps/StepExistingCompany';
import { StepDone } from './steps/StepDone';
import { Button } from './ui/button';

const STEP_COMPONENTS = {
  onboarding: StepOnboarding,
  name: StepName,
  goal: StepGoal,
  repository: StepRepository,
  preset: StepPreset,
  modules: StepModules,
  roles: StepRoles,
  'existing-company': StepExistingCompany,
  summary: StepSummary,
  preview: StepPreview,
  'ai-wizard': StepAiWizard,
  provision: StepProvision,
  done: StepDone,
} as const;

const WIZARD_HISTORY_MARKER = 'company-wizard';

type WizardHistoryState = {
  __paperclipPlugin?: string;
  step?: Step;
  path?: WizardPath | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStep(value: unknown): value is Step {
  return typeof value === 'string' && value in STEP_COMPONENTS;
}

function isWizardPath(value: unknown): value is WizardPath | null {
  return value === null || value === 'manual' || value === 'ai' || value === 'update';
}

function readWizardHistoryState(value: unknown): WizardHistoryState | null {
  if (!isObject(value)) return null;
  if (value.__paperclipPlugin !== WIZARD_HISTORY_MARKER) return null;
  if (!isStep(value.step) || !isWizardPath(value.path)) return null;
  return { step: value.step, path: value.path };
}

function buildWizardHistoryState(
  currentState: unknown,
  path: WizardPath | null,
  step: Step,
): WizardHistoryState {
  return {
    ...(isObject(currentState) ? currentState : {}),
    __paperclipPlugin: WIZARD_HISTORY_MARKER,
    path,
    step,
  };
}

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
  const restoredFromHistory = useRef(false);
  const seededHistory = useRef(false);

  const StepComponent = STEP_COMPONENTS[state.step];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.step]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const historyState = readWizardHistoryState(event.state);
      if (!historyState?.step) return;

      restoredFromHistory.current = true;
      dispatch({
        type: 'RESTORE_NAV',
        path: historyState.path ?? null,
        step: historyState.step,
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dispatch]);

  useEffect(() => {
    if (!seededHistory.current) {
      seededHistory.current = true;
      window.history.replaceState(
        buildWizardHistoryState(window.history.state, state.path, state.step),
        '',
        window.location.href,
      );
      return;
    }

    if (restoredFromHistory.current) {
      restoredFromHistory.current = false;
      return;
    }

    window.history.pushState(
      buildWizardHistoryState(window.history.state, state.path, state.step),
      '',
      window.location.href,
    );
  }, [state.path, state.step]);

  return (
    <div className="flex flex-col">
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
