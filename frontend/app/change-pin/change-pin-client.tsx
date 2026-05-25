'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { idempotentFetch } from '@/lib/idempotency';
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from '@/lib/web-feedback';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/shared/feedback';

interface ChangePinPageState {
  stage: 'verify' | 'change' | 'success' | 'error';
  token: string | null;
  userId: string | null;
  newPin: string;
  confirmPin: string;
  currentPin: string;
  message: string;
  isLoading: boolean;
  errorMessage: string;
}

export default function ChangePinClient() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<ChangePinPageState>({
    stage: 'verify',
    token: null,
    userId: null,
    newPin: '',
    confirmPin: '',
    currentPin: '',
    message: 'Checking your link...',
    isLoading: true,
    errorMessage: '',
  });

  useEffect(() => {
    const token = searchParams.get('token');
    const userId = searchParams.get('user_id');

    if (!token || !userId) {
      setState((prev) => ({
        ...prev,
        stage: 'error',
        isLoading: false,
        errorMessage: 'Invalid or expired link.',
      }));
      return;
    }

    verifyToken(token, userId);
  }, [searchParams]);

  const verifyToken = async (token: string, userId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await idempotentFetch(`${apiUrl}/api/security/reset-pin-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, user_id: userId }),
      });

      const data = await response.json();

      if (!data.success) {
        setState((prev) => ({
          ...prev,
          stage: 'error',
          isLoading: false,
          errorMessage: data.message || 'Invalid or expired link.',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        stage: 'change',
        token,
        userId,
        isLoading: false,
        message: 'Create a new PIN (4-8 digits)',
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        stage: 'error',
        isLoading: false,
        errorMessage: `Error checking link: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (state.newPin.length < 4 || state.newPin.length > 8) {
      setState((prev) => ({ ...prev, errorMessage: 'PIN must be 4 to 8 characters long' }));
      return;
    }
    if (state.newPin !== state.confirmPin) {
      setState((prev) => ({ ...prev, errorMessage: 'PINs do not match' }));
      return;
    }
    if (!/^\d+$/.test(state.newPin)) {
      setState((prev) => ({ ...prev, errorMessage: 'PIN must contain numbers only' }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, errorMessage: '' }));

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await idempotentFetch(`${apiUrl}/api/security/reset-pin-finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: state.token,
          user_id: state.userId,
          new_pin: state.newPin,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          errorMessage: data.message || 'Error changing PIN',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        stage: 'success',
        isLoading: false,
        message: 'PIN changed successfully.',
      }));

      enqueueWebChatFeedback('PIN changed successfully.\nYour new PIN is now active.');
      closeIntermediatePage();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        errorMessage: `Error finishing: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
  };

  if (state.stage === 'verify') {
    return (
      <AuthShell title="Verificando seu link" description={state.message}>
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      </AuthShell>
    );
  }

  if (state.stage === 'success') {
    return (
      <AuthShell
        title="PIN alterado com sucesso"
        description={
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tts-confirm">
              Concluído
            </p>
            <p className="mt-3 text-sm leading-relaxed text-tts-muted">{state.message}</p>
            <p className="mt-2 text-xs text-tts-muted">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
          </>
        }
      >
        <div />
      </AuthShell>
    );
  }

  if (state.stage === 'error') {
    return (
      <AuthShell
        title="Não foi possível continuar"
        description={state.errorMessage}
      >
        <Button
          type="button"
          size="lg"
          onClick={() => (window.location.href = '/')}
          className="w-full bg-tts-deep text-tts-surface hover:bg-tts-deep/90"
        >
          Voltar
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Redefinir PIN"
      description="O PIN deve conter apenas números e ter de 4 a 8 dígitos."
    >
      <form onSubmit={handleChangePinSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-tts-muted">{state.message}</p>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-tts-deep">Novo PIN</span>
          <Input
            id="newPin"
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={state.newPin}
            onChange={(e) =>
              setState((prev) => ({
                ...prev,
                newPin: e.target.value.replace(/\D/g, ''),
                errorMessage: '',
              }))
            }
            placeholder="Digite seu novo PIN"
            disabled={state.isLoading}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-tts-deep">Confirmar PIN</span>
          <Input
            id="confirmPin"
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={state.confirmPin}
            onChange={(e) =>
              setState((prev) => ({
                ...prev,
                confirmPin: e.target.value.replace(/\D/g, ''),
                errorMessage: '',
              }))
            }
            placeholder="Confirme seu novo PIN"
            disabled={state.isLoading}
          />
        </label>

        {state.errorMessage && (
          <p className="rounded-lg border-l-4 border-tts-error bg-tts-error/10 px-3 py-2 text-xs text-tts-error">
            {state.errorMessage}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={state.isLoading || !state.newPin || !state.confirmPin}
          className="w-full bg-tts-deep text-tts-surface hover:bg-tts-deep/90"
        >
          {state.isLoading ? 'Processando...' : 'Confirmar novo PIN'}
        </Button>
      </form>
    </AuthShell>
  );
}
