import { describe, expect, it } from 'vitest';
import { createElement, isValidElement, type ReactNode } from 'react';
import { AgentSetupFields } from '../src/ui/components/AgentSetup';
import { Input } from '../src/ui/components/ui/input';
import { renderToStaticMarkup } from 'react-dom/server';
import { WizardProvider, useWizard } from '../src/ui/context/WizardContext';
import { StepName } from '../src/ui/components/steps/StepName';
import { readFileSync } from 'node:fs';

const templates = { presets: [], modules: [], roles: [] };

describe('agent setup defaults', () => {
  it('keeps the existing-agent checkbox unchecked and propagates explicit choices', () => {
    const adapter = { type: 'codex_local', model: '', cwd: '', updateExistingAgents: false };
    const changes: any[] = [];
    const tree = AgentSetupFields({
      value: adapter,
      existingCompany: true,
      onChange: (change) => changes.push(change),
    });
    const elements: any[] = [];
    function walk(node: ReactNode) {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!isValidElement<{ children?: ReactNode }>(node)) return;
      elements.push(node);
      walk(node.props.children);
    }
    walk(tree);
    const checkbox = elements.find((e) => e.type === 'input' && e.props.type === 'checkbox');
    expect(checkbox.props.checked).toBe(false);
    checkbox.props.onChange({ target: { checked: true } });
    checkbox.props.onChange({ target: { checked: false } });
    const model = elements.find(
      (e) => e.type === Input && e.props.placeholder === 'Adapter default',
    );
    expect(model.props.required).toBeUndefined();
    expect(model.props.list).toBeUndefined();
    model.props.onChange({ target: { value: 'operator/custom-model' } });
    model.props.onChange({ target: { value: '' } });
    expect(changes).toEqual([
      { updateExistingAgents: true },
      { updateExistingAgents: false },
      { model: 'operator/custom-model' },
      { model: '' },
    ]);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('Existing agents keep their adapter, model, and runtime settings');
    expect(html).toContain('Warning:');
    expect(html).toContain('runtime cwd, not the generated files destination');
    expect(html).toContain('Leave blank to keep an existing cwd');
    expect(readFileSync('src/ui/components/steps/StepProvision.tsx', 'utf8')).toContain(
      'ceoAdapter: state.ceoAdapter',
    );
    expect(readFileSync('src/ui/context/WizardContext.tsx', 'utf8')).toContain(
      'ceoAdapter: { ...state.ceoAdapter, ...action.adapter }',
    );
  });
  it('has no model suggestions or stale per-agent override promise in shared UI sources', () => {
    for (const path of [
      'src/ui/components/AgentSetup.tsx',
      'src/ui/components/steps/StepName.tsx',
      'src/ui/context/WizardContext.tsx',
    ]) {
      expect(readFileSync(path, 'utf8')).not.toMatch(
        /MODEL_SUGGESTIONS|gpt-\d|claude-(opus|sonnet|fable|mythos)|datalist|override per agent/,
      );
    }
  });
  it('exposes shared team settings with a host-default model in manual and review paths', () => {
    const html = renderToStaticMarkup(
      createElement(WizardProvider, { templates, children: createElement(StepName) }),
    );
    expect(html).toContain('Agent setup');
    expect(html).toContain('Adapter default');
    expect(readFileSync('src/ui/components/ConfigReview.tsx', 'utf8')).toContain('<AgentSetup');
    expect(html).not.toMatch(
      /CEO Agent Setup|gpt-\d|claude-(opus|sonnet)|datalist|override per agent/,
    );
  });
  it('leaves the model to the host and requires explicit existing-agent consent', () => {
    let adapter: ReturnType<typeof useWizard>['ceoAdapter'] | undefined;
    function Probe() {
      adapter = useWizard().ceoAdapter;
      return null;
    }
    renderToStaticMarkup(
      createElement(WizardProvider, { templates, children: createElement(Probe) }),
    );
    expect(adapter).toEqual({
      type: 'codex_local',
      cwd: '',
      model: '',
      updateExistingAgents: false,
    });
  });
});
