import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginPageProps } from '@paperclipai/plugin-sdk/ui';
import type { TemplateData } from '../src/ui/types';

const state = vi.hoisted(() => ({
  data: null as TemplateData | null,
  loading: false,
  error: null as Error | null,
}));
vi.mock('@paperclipai/plugin-sdk/ui', () => ({
  usePluginData: () => state,
  usePluginAction: () => vi.fn(),
}));
vi.mock('../src/ui/components/WizardShell', () => ({ WizardShell: () => 'wizard-ready' }));
vi.mock('../src/ui/context/WizardContext', () => ({
  WizardProvider: ({ children }: { children: unknown }) => children,
}));
import { WizardPage } from '../src/ui/index';

const render = () => renderToStaticMarkup(createElement(WizardPage, {} as PluginPageProps));
beforeEach(() => {
  state.data = { presets: [], modules: [], roles: [], loadErrors: [] };
  state.loading = false;
  state.error = null;
});

describe('wizard template error boundary', () => {
  it('blocks the legacy empty catalog instead of showing the Custom-only wizard', () => {
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain('Clear templatesPath');
    expect(html).not.toContain('wizard-ready');
  });

  it('shows the actionable error returned by the worker', () => {
    state.data!.error = 'Configured templatesPath /operator/templates: directory does not exist';
    expect(render()).toContain(state.data!.error);
    expect(render()).not.toContain('wizard-ready');
  });

  it('allows a valid CEO-only custom catalog', () => {
    state.data!.roles = [{ name: 'ceo', title: 'CEO', description: '', _base: true }];
    expect(render()).toContain('wizard-ready');
  });

  it.each([true, false])('offers explicit sync only with a configured URL (%s)', (canSync) => {
    state.data!.syncOffer = { targetDir: '/empty/templates', token: 'confirmation', canSync };
    const html = render();
    expect(html).toContain('Template directory is empty');
    expect(html.includes('Confirm sync from configured template URL')).toBe(canSync);
    expect(html).not.toContain('wizard-ready');
  });

  it('keeps transport failures visible', () => {
    state.error = new Error('network unavailable');
    expect(render()).toContain('Failed to load templates: network unavailable');
  });
});
