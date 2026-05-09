'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';

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

export default function ChangePinPage() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<ChangePinPageState>({
    stage: 'verify',
    token: null,
    userId: null,
    newPin: '',
    confirmPin: '',
    currentPin: '',
    message: 'Verificando token...',
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
        errorMessage: 'Token ou usuário inválido. Link expirou ou é inválido.',
      }));
      return;
    }

    // Verify token with backend
    verifyToken(token, userId);
  }, [searchParams]);

  const verifyToken = async (token: string, userId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/security/reset-pin-verify`, {
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
          errorMessage: data.message || 'Token inválido ou expirado.',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        stage: 'change',
        token,
        userId,
        isLoading: false,
        message: 'Crie um novo PIN (4-8 dígitos)',
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        stage: 'error',
        isLoading: false,
        errorMessage: `Erro ao verificar token: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (state.newPin.length < 4 || state.newPin.length > 8) {
      setState((prev) => ({
        ...prev,
        errorMessage: 'PIN deve ter entre 4 e 8 caracteres',
      }));
      return;
    }

    if (state.newPin !== state.confirmPin) {
      setState((prev) => ({
        ...prev,
        errorMessage: 'Os PINs não coincidem',
      }));
      return;
    }

    if (!/^\d+$/.test(state.newPin)) {
      setState((prev) => ({
        ...prev,
        errorMessage: 'PIN deve conter apenas números',
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      errorMessage: '',
    }));

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/security/reset-pin-finalize`, {
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
          errorMessage: data.message || 'Erro ao mudar PIN',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        stage: 'success',
        isLoading: false,
        message: 'PIN alterado com sucesso!',
      }));

      // Redirect to home after 3 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 3000);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        errorMessage: `Erro ao finalizar: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>🔐 Redefinir PIN</h1>

        {state.stage === 'verify' && (
          <div className={styles.loading}>
            <p>{state.message}</p>
            <div className={styles.spinner}></div>
          </div>
        )}

        {state.stage === 'change' && (
          <form onSubmit={handleChangePinSubmit} className={styles.form}>
            <p className={styles.description}>{state.message}</p>

            <div className={styles.formGroup}>
              <label htmlFor="newPin">Novo PIN</label>
              <input
                id="newPin"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={state.newPin}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    newPin: e.target.value,
                    errorMessage: '',
                  }))
                }
                placeholder="Digite seu novo PIN"
                disabled={state.isLoading}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="confirmPin">Confirmar PIN</label>
              <input
                id="confirmPin"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={state.confirmPin}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    confirmPin: e.target.value,
                    errorMessage: '',
                  }))
                }
                placeholder="Confirme seu novo PIN"
                disabled={state.isLoading}
              />
            </div>

            {state.errorMessage && (
              <div className={styles.error}>{state.errorMessage}</div>
            )}

            <button
              type="submit"
              className={styles.button}
              disabled={state.isLoading || !state.newPin || !state.confirmPin}
            >
              {state.isLoading ? 'Processando...' : 'Confirmar Novo PIN'}
            </button>

            <p className={styles.hint}>
              O PIN deve ter entre 4 e 8 dígitos numéricos
            </p>
          </form>
        )}

        {state.stage === 'success' && (
          <div className={styles.success}>
            <div className={styles.checkmark}>✓</div>
            <h2>PIN Alterado com Sucesso!</h2>
            <p>{state.message}</p>
            <p className={styles.redirectMessage}>
              Você será redirecionado em alguns segundos...
            </p>
          </div>
        )}

        {state.stage === 'error' && (
          <div className={styles.errorBox}>
            <h2>❌ Erro</h2>
            <p>{state.errorMessage}</p>
            <button
              onClick={() => (window.location.href = '/')}
              className={styles.button}
            >
              Voltar para Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
