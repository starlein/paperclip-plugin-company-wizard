import { createElement } from 'react';
import * as gate from '../src/ui/components/BrowserAuthGate';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BrowserAuthGate, BrowserAuthorizationConsent } from '../src/ui/components/BrowserAuthGate';
vi.mock('@paperclipai/plugin-sdk/ui', () => ({ usePluginAction: () => vi.fn() }));
describe('browser authorization consent', () => {
  it('defaults browser consent to false independently of gate readiness', () => {
    expect(gate).toHaveProperty('BoardAuthConsentContext');
    let consent: unknown;
    renderToStaticMarkup(
      createElement(gate.BoardAuthConsentContext.Consumer, {
        children: (value: boolean) => {
          consent = value;
          return null;
        },
      }),
    );
    expect(consent).toBe(false);
  });
  it('does not mount wizard actions before authorization is checked', () => {
    const html = renderToStaticMarkup(
      createElement(BrowserAuthGate, {}, createElement('span', {}, 'unsafe-child')),
    );
    expect(html).not.toContain('unsafe-child');
  });
  it('discloses full board authority and the bounded key lifetime before opt-in', () => {
    const html = renderToStaticMarkup(
      createElement(BrowserAuthorizationConsent, { onContinue: () => {} }),
    );
    expect(html).toContain('full board permissions');
    expect(html).toContain('one hour');
    expect(html).toContain('Use current login');
    expect(html).toContain('not restricted to one company');
  });
});
