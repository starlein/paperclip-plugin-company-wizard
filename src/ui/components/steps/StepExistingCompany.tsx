import { useState } from 'react';
import { useWizard, useWizardDispatch } from '../../context/WizardContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ArrowRight } from 'lucide-react';

export function StepExistingCompany() {
  const state = useWizard();
  const dispatch = useWizardDispatch();
  const [touched, setTouched] = useState(false);

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
          Enter the ID of the company you want to update. This will load the existing configuration
          and allow you to modify modules, roles, and settings.
        </p>
      </div>

      <div className="space-y-3">
        <Input
          placeholder="e.g. 42a5aea0-1234-5678-90ab-cdef12345678"
          value={state.existingCompanyId}
          onChange={(e) => dispatch({ type: 'SET_EXISTING_COMPANY_ID', value: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleNext()}
          autoFocus
          className="text-base h-11"
        />
        {touched && isEmpty && (
          <p className="text-sm text-destructive">Please enter a company ID.</p>
        )}
      </div>

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
