import { useWizard, useWizardDispatch, nextStep } from '../../context/WizardContext';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useCallback } from 'react';

export function StepGoal() {
  const state = useWizard();
  const dispatch = useWizardDispatch();

  const handleNext = useCallback(() => {
    dispatch({ type: 'GO_TO', step: nextStep(state) });
  }, [state, dispatch]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Company goal</h2>
        <p className="text-sm text-muted-foreground">
          What's the top-level outcome? Lead with the primary deliverable or operating result; put
          secondary constraints such as compliance, security, or accessibility in the description as
          quality bars.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Goal title</label>
          <Input
            placeholder="e.g. Build and launch the core product"
            value={state.goals[0]?.title || ''}
            onChange={(e) =>
              dispatch({
                type: 'SET_GOALS',
                goals: [{ title: e.target.value, description: state.goals[0]?.description || '' }],
              })
            }
            onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            placeholder="Primary outcome and scope first. Then add constraints / quality bars such as compliance, security, accessibility, or performance."
            value={state.goals[0]?.description || ''}
            onChange={(e) =>
              dispatch({
                type: 'SET_GOALS',
                goals: [{ title: state.goals[0]?.title || '', description: e.target.value }],
              })
            }
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={handleNext}>
          Skip
        </Button>
        <Button onClick={handleNext}>Continue</Button>
      </div>
    </div>
  );
}
