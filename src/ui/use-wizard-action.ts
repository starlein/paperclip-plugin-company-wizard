import { useCallback, useContext } from 'react';
import { usePluginAction } from '@paperclipai/plugin-sdk/ui';
import { invokeBoardAction, type BoardAuthOptions } from './lib/board-action.js';
import { BoardAuthConsentContext, BoardAuthWarningContext } from './components/BrowserAuthGate';

const BOARD_ACTIONS = new Set([
  'prepare-plugin-update',
  'preview-files',
  'preview-company-update',
  'check-auth',
  'list-companies',
  'list-pending-hires',
  'approve-pending-hires',
  'start-bootstrap',
  'start-provision',
]);

export function useWizardAction(key: string) {
  const action = usePluginAction(key);
  const authOptions = usePluginAction('auth-options');
  const onWarning = useContext(BoardAuthWarningContext);
  const hasBrowserConsent = useContext(BoardAuthConsentContext);
  return useCallback(
    async (params: Record<string, unknown> = {}) => {
      if (!BOARD_ACTIONS.has(key)) return action(params);
      const options = (await authOptions({})) as BoardAuthOptions;
      return invokeBoardAction(
        action,
        options,
        params,
        window.location.origin,
        onWarning,
        hasBrowserConsent,
      );
    },
    [key, action, authOptions, onWarning, hasBrowserConsent],
  );
}
