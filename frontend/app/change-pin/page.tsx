'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

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
    message: 'Verificando seu link...',
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
        errorMessage: 'Link inválido ou expirado.',
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
          errorMessage: data.message || 'Link inválido ou expirado.',
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
        errorMessage: `Erro ao verificar o link: ${error instanceof Error ? error.message : String(error)}`,
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <section className="space-y-6">
            <div className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-cyan-200">
              Segurança
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Redefinir PIN
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Use este fluxo para verificar seu link e cadastrar um novo PIN com segurança.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
              O PIN deve conter apenas números e ter entre 4 e 8 dígitos.
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">

        {state.stage === 'verify' && (
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <p className="text-slate-200">{state.message}</p>
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-300"></div>
          </div>
        )}

        {state.stage === 'change' && (
          <form onSubmit={handleChangePinSubmit} className="space-y-4">
            <p className="text-sm text-slate-300">{state.message}</p>

            <div className="space-y-2">
              <label htmlFor="newPin" className="text-sm font-medium text-slate-200">Novo PIN</label>
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
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPin" className="text-sm font-medium text-slate-200">Confirmar PIN</label>
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
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
              />
            </div>

            {state.errorMessage && (
              <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{state.errorMessage}</div>
            )}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={state.isLoading || !state.newPin || !state.confirmPin}
            >
              {state.isLoading ? 'Processando...' : 'Confirmar Novo PIN'}
            </button>
          </form>
        )}

        {state.stage === 'success' && (
          <div className="space-y-3 py-8 text-center">
            <h2 className="text-2xl font-semibold text-emerald-300">PIN Alterado com Sucesso!</h2>
            <p className="text-slate-200">{state.message}</p>
            <p className="text-xs text-slate-400">Você será redirecionado em alguns segundos...</p>
          </div>
        )}

        {state.stage === 'error' && (
          <div className="space-y-3 py-8 text-center">
            <h2 className="text-2xl font-semibold text-rose-300">Erro</h2>
            <p className="text-slate-200">{state.errorMessage}</p>
            <button
              onClick={() => (window.location.href = '/')}
              className="inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Voltar para Home
            </button>
          </div>
        )}
          </section>
        </div>
      </div>
    </main>
  );
}
