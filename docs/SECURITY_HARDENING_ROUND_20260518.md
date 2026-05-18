# Security Hardening Round - 2026-05-18

## O que foi corrigido

- Removido o uso runtime de `exec_sql` e criada a migração `backend/migrations/20260518_01_security_hardening_public_surface.sql` para derrubar a RPC perigosa em produção.
- RPCs de Vault (`store_private_key` e `get_private_key`) agora ficam restritas ao `service_role`; roles públicas (`anon`/`authenticated`) perdem acesso.
- Migrações antigas que desligavam RLS foram ajustadas para manter `ROW LEVEL SECURITY` ligado.
- Scripts legados que dependem de `exec_sql` agora recusam ambiente hospedado/produção e exigem opt-in explícito.
- Endpoints financeiros, chat e logout que aceitavam apenas `session_id` agora exigem também `session_token`.
- Reset de PIN via agente exige `session_token` antes de gerar link sensível.
- `JWT_SECRET` fraco, ausente ou placeholder agora falha no runtime.
- Confirmação de e-mail deixou de ter bypass silencioso em fluxos de criação/login.
- Short links públicos passaram a aceitar apenas URLs first-party de passkey/login/criação, bloqueando open redirect.
- Webhook da Evolution exige segredo em ambiente production-like.
- `/notify` do adapter Telegram exige segredo em ambiente production-like.
- `.env` reais do Evolution e Telegram foram removidos do versionamento.
- Frontend atualizado para Next 16 e `npm audit` zerado no frontend e backend.

## Migração obrigatória

Aplicar manualmente no Supabase SQL Editor:

```sql
backend/migrations/20260518_01_security_hardening_public_surface.sql
```

Essa migração remove `public.exec_sql`, revoga execução pública das RPCs de Vault, liga RLS nas tabelas sensíveis e garante grants para `service_role`.

## Variáveis obrigatórias em produção

- `JWT_SECRET`: valor aleatório com pelo menos 32 caracteres.
- `SUPABASE_SERVICE_ROLE_KEY`: backend não deve operar com anon key.
- `FRONTEND_URL` ou `PUBLIC_APP_URL`: origem oficial do frontend.
- `CORS_ORIGINS`: origens permitidas separadas por vírgula.
- `INTERNAL_API_SECRET`: segredo interno compartilhado.
- `EVOLUTION_WEBHOOK_SECRET`: segredo enviado pela Evolution no webhook.
- `TELEGRAM_NOTIFY_SECRET`: segredo do endpoint `/notify` do adapter Telegram.

Não habilitar em produção:

- `RUN_LEGACY_STARTUP_MIGRATIONS`
- `ALLOW_LEGACY_SUPABASE_MIGRATIONS`
- `ALLOW_LEGACY_EXEC_SQL_MIGRATIONS`

## Validação executada

- `backend`: `npm run build`
- `backend`: `npm audit --audit-level=moderate`
- `backend`: testes focados de hardening e fluxos afetados
- `frontend`: `npm run build`
- `frontend`: `npm audit --audit-level=moderate`

Observação: a suíte backend completa ainda possui testes antigos que dependem de servidor local em `127.0.0.1:3000`, Friendbot/Testnet ao vivo e snapshots de recibo desatualizados.
