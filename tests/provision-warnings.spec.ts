import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepDone } from '../src/ui/components/steps/StepDone';
import { StepProvision } from '../src/ui/components/steps/StepProvision';

vi.mock('../src/ui/use-wizard-action', () => ({ useWizardAction: () => async () => ({}) }));

let warnings: string[] = [];
vi.mock('../src/ui/context/WizardContext', () => ({
  useWizard: () => ({
    companyName: 'Existing',
    existingCompanyId: 'co',
    goals: [],
    selectedModules: [],
    roles: [],
    presetName: '',
    provisioning: false,
    provisionLog: [],
    error: null,
    provisionResult: { companyId: 'co', agentIds: {}, issueIds: [], warnings },
  }),
  useWizardDispatch: () => vi.fn(),
  getAllRoles: () => [],
}));
describe('provisioning result warnings', () => {
  it('shows partial skill reconciliation prominently instead of unconditional success', () => {
    warnings = ['Could not reconcile company skill "backlog-health" (HTTP 409).'];
    const html = renderToStaticMarkup(createElement(StepDone));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Completed with warnings');
    expect(html).toContain('backlog-health');
    expect(html).toContain('before starting bootstrap');
    const progress = renderToStaticMarkup(createElement(StepProvision));
    expect(progress).toContain('Provisioned with warnings');
    expect(progress).not.toContain('Company created.');
    warnings = [];
    expect(renderToStaticMarkup(createElement(StepDone))).not.toContain('Completed with warnings');
  });
});
