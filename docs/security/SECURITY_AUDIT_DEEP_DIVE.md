# Auditoria de Segurança Profunda - TalkToStellar

Data da auditoria: 2026-05-18  
Escopo: backend Express, agente/LLM tools, frontend Next.js, Telegram bot, Evolution/WhatsApp webhook, migrations Supabase/Postgres, configuracao de deploy, dependencias npm e arquivos de ambiente versionados.

## Resumo executivo

Esta auditoria encontrou mais de uma vulnerabilidade com severidade critica. O risco mais importante nao esta em uma tela especifica, mas na combinacao entre banco de dados, migrations e funcoes RPC: o projeto cria uma funcao `SECURITY DEFINER` chamada `public.exec_sql(sql text)` que executa SQL arbitrario, tambem cria funcoes `SECURITY DEFINER` para ler segredos do Vault, e ainda desabilita RLS em tabelas sensiveis durante o startup do backend. Essa combinacao pode transformar uma exposicao pequena, como uma chave anonima ou uma RPC acessivel indevidamente, em comprometimento completo de dados, sessoes, carteiras e chaves privadas.

Tambem foram encontrados problemas relevantes em autenticacao de passkey, controle de acesso por `session_id`, reset de PIN pelo agente, links publicos, rate limiting, fallbacks de segredo JWT/PIN, armazenamento de tokens no navegador, webhook Evolution opcionalmente sem segredo, endpoints Telegram internos sem obrigatoriedade de segredo e dependencias frontend com vulnerabilidades conhecidas.

Observacao importante: por solicitacao, esta etapa **nao implementa correcoes no codigo de producao**. O documento abaixo e um relatorio completo com evidencias e plano de correcao. Para o formulario do desafio, o melhor candidato a correcao critica e o grupo "DB-01/DB-02/DB-03", porque e demonstravelmente critico, tem alto impacto e a correcao e objetiva.

## Metodologia

Foram revisados manualmente os principais pontos de entrada e de persistencia:

- Rotas Express em `backend/src/app.ts`, `backend/src/api/routes/*`, `backend/src/api/controllers/*` e `backend/src/agent/routes.ts`.
- Tools do agente em `backend/src/agent/tools.ts`, principalmente operacoes de sessao, PIN, wallet e pagamentos.
- Servicos de autenticacao, passkey, PIN reset, Vault, Evolution e integracoes externas.
- Repositorios Supabase e migrations SQL/TypeScript.
- Frontend Next.js em `frontend/app` e `frontend/lib`, incluindo proxies API, armazenamento de sessao e links de confirmacao.
- Telegram bot em `telegram/src`.
- Arquivos `.env`, `.gitignore`, `railway.json`, Docker/deploy e dependencias npm.

Levantamento quantitativo relevante:

- 182 arquivos relevantes revisados no escopo principal (`backend/src`, `frontend/app`, `frontend/lib`, `telegram/src`, `backend/migrations`, `evolution`) excluindo `node_modules`, `.next` e `dist`.
- 50.188 linhas em arquivos TS/TSX/JS/SQL nos principais diretorios revisados.
- `npm audit --omit=dev`:
  - Backend: 0 vulnerabilidades produtivas reportadas.
  - Telegram: 0 vulnerabilidades produtivas reportadas.
  - Frontend: `next@14.2.16` reportou 1 pacote direto com severidade critica e 1 transitive moderada (`postcss` via Next), com multiplos advisories de Next.js.

## Escala de severidade usada

- **Critica**: pode causar takeover de conta, leitura/escrita ampla no banco, exposicao de chave privada, assinatura de transacao indevida ou comprometimento sistemico.
- **Alta**: permite bypass de autenticacao/autorizacao relevante, exfiltracao de dados sensiveis, abuso financeiro condicionado a outro fator, ou degradacao importante de seguranca.
- **Media**: aumenta muito a superficie de ataque, facilita phishing, enumera dados, causa DoS ou reduz defesa em profundidade.
- **Baixa**: melhoria de hardening, higiene operacional ou risco dependente de condicoes especificas.

## Achados prioritarios

| ID | Severidade | Area | Achado |
| --- | --- | --- | --- |
| DB-01 | Critica | Supabase/Postgres | RPC `public.exec_sql(sql text)` executa SQL arbitrario como `SECURITY DEFINER`. |
| DB-02 | Critica | Supabase Vault | RPCs `store_private_key` e `get_private_key` sao `SECURITY DEFINER` sem revogacao explicita. |
| DB-03 | Critica | RLS/migrations | Backend roda migrations no startup e desabilita RLS em tabelas sensiveis. |
| AUTH-01 | Critica | Passkeys | Cadastro de passkey pode ser iniciado/concluido apenas com `email` ou `user_id`. |
| AUTH-02 | Alta | APIs de sessao | Varios endpoints usam `session_id` como credencial suficiente. |
| AUTH-03 | Alta | Agent tools | Tool `reset_pin` gera link de reset apenas com `session_id`, bypassando a rota segura. |
| AUTH-04 | Alta | JWT/config | Segredos JWT tem fallbacks previsiveis ou vazios. |
| AUTH-05 | Alta | PIN/OTP | Sem rate limit consistente para PIN, OTP, passkey, link e login. |
| WEB-01 | Alta | Links publicos | Criacao publica de short link aceita qualquer URL HTTP(S), gerando open redirect no dominio da aplicacao. |
| FRONT-01 | Alta | Frontend | `sessionToken` fica em `localStorage`, ficando exposto a XSS/extensoes/dependencias. |
| DEP-01 | Alta/Critica | Dependencias | `next@14.2.16` possui advisories criticos/altos no audit. |
| CFG-01 | Alta | Config/env | `.env` reais de `evolution` e `telegram` estao versionados. |
| DOC-01 | Media/Alta | Documentacao | Exemplos locais de docs podem conter `session_id/session_token` reais se placeholders forem substituidos. |
| API-01 | Media/Alta | Backend | CORS aberto e ausencia de headers de seguranca/rate limit global. |
| API-02 | Media/Alta | Logout | `/api/agent/logout` pode limpar sessao por `session_id` sem token quando chamado sem token JWT. |
| EXT-01 | Media/Alta | Email/PIN | Confirmacao de email existe, mas esta desligada por `return true`. |
| EXT-02 | Media | OTP | OTP usa `Math.random`, fallback `dev-otp-secret` e nao bloqueia por tentativas. |
| EXT-03 | Media | Evolution | Webhook Evolution aceita qualquer chamada se `EVOLUTION_WEBHOOK_SECRET` nao estiver setado. |
| TG-01 | Media | Telegram | Endpoint `/notify` autoriza tudo se segredo interno nao estiver configurado. |
| DATA-01 | Media | Recibos | Recibos por hash/code sao publicos e persistem dados de pagamento sem autenticacao. |
| LOG-01 | Media | Observabilidade | Logs contem `provider_user_id`, `chat_id`, `session_id`, email e erros internos. |
| FRONT-02 | Media | Build | Next build ignora lint e erros TypeScript. |
| PROXY-01 | Baixa/Media | Frontend API proxy | Proxies retornam URL interna `target` em erro 502. |

## Cadeias de ataque mais importantes

### Cadeia A: comprometimento do banco e chaves de carteira

1. Atacante consegue chamar RPC Supabase exposta ou obter uma chave de acesso ao projeto.
2. A funcao `public.exec_sql(sql text)` executa SQL arbitrario com privilegios do dono da funcao.
3. Como RLS e desabilitado em tabelas sensiveis, o atacante consegue consultar tabelas como `wallets`, `agent_sessions`, `external_accounts`, `payment_confirmations` e `agent_messages`.
4. A tabela `wallets` guarda `vault_secret_id`.
5. A funcao `public.get_private_key(secret_id uuid)` retorna o segredo descriptografado do Vault.
6. Resultado: exfiltracao de private keys, takeover de wallets e possibilidade de assinar transacoes fora do fluxo do produto.

Impacto: critico, porque combina exposicao de dados, credenciais de sessao, segredos de carteira e integridade financeira.

### Cadeia B: takeover via passkey registrada por email

1. Atacante conhece o email da vitima.
2. Chama `/api/passkeys/register-init` com `email`.
3. Completa `/api/passkeys/register-complete` com uma credencial controlada pelo atacante.
4. Depois usa `/api/passkeys/auth-init` e `/api/passkeys/auth-complete`.
5. O backend retorna token JWT e dados da ultima sessao do usuario.

Impacto: critico/alto, porque uma passkey nova vira fator de login da vitima sem exigir sessao autenticada, PIN atual, link one-time valido ou reautenticacao.

### Cadeia C: IDOR por `session_id` + reset de PIN pelo agente

1. `session_id` aparece em URLs, localStorage, logs e respostas de API.
2. Diversas rotas retornam dados por `session_id` sem `session_token`.
3. A tool `reset_pin` do agente gera link de reset com `session_id`.
4. Uma pessoa com `session_id` pode obter historico, mensagens, metadados e possivelmente iniciar troca de PIN pelo caminho do agente.

Impacto: alto, podendo evoluir para takeover dependendo do fluxo exposto e do canal.

### Cadeia D: phishing com dominio confiavel

1. Atacante chama endpoint publico de short links com URL externa.
2. Recebe um link `https://dominio/r/<code>`.
3. O frontend redireciona para a URL arbitraria.
4. Usuario confia no dominio inicial e pode entregar PIN, token ou seed em pagina falsa.

Impacto: alto para engenharia social, especialmente em produto financeiro.

## Achados detalhados

### DB-01 - RPC `public.exec_sql` executa SQL arbitrario como `SECURITY DEFINER`

**Severidade:** Critica  
**Componente:** Supabase/Postgres migrations  
**Evidencia:**

- `backend/src/db/legacy-agent-bootstrap.ts:8-30` cria `public.exec_sql(sql TEXT)`.
- `backend/src/db/legacy-agent-bootstrap.ts:12` define `SECURITY DEFINER`.
- `backend/src/db/legacy-agent-bootstrap.ts:21-26` executa dinamicamente o SQL recebido por parametro.
- `backend/src/utils/migrate.ts:77-90` tenta criar/usar essa RPC no boot e ate imprime a SQL para criacao manual caso a funcao nao exista.

**Por que e critico:** `SECURITY DEFINER` faz a funcao executar com privilegio do dono da funcao, nao do caller. Uma RPC generica que recebe texto SQL e executa esse texto e equivalente a um painel administrativo exposto se `EXECUTE` nao estiver estritamente revogado de `PUBLIC`, `anon` e `authenticated`.

**Impacto possivel:**

- Ler, alterar ou apagar dados sensiveis.
- Desabilitar controles do banco.
- Criar novas funcoes, triggers ou policies maliciosas.
- Consultar `wallets`, `agent_sessions`, `payment_logs`, `external_accounts`, `agent_messages`.
- Em conjunto com DB-02, acessar segredos de wallets.

**Correcao recomendada:**

1. Remover `public.exec_sql` de producao.
2. Executar migrations por Supabase CLI, migration runner interno restrito ou pipeline CI/CD com credencial administrativa fora da superficie HTTP.
3. Rodar imediatamente:
   - `REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC;`
   - `REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon;`
   - `REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM authenticated;`
4. Se for indispensavel manter temporariamente, conceder apenas a uma role administrativa nao usada por clientes e nao expor pelo PostgREST.
5. Auditar logs de chamadas RPC e rotacionar segredos caso haja qualquer suspeita.

### DB-02 - Funcoes de Vault retornam chave privada descriptografada

**Severidade:** Critica  
**Componente:** Supabase Vault / Wallet custody  
**Evidencia:**

- `backend/src/db/legacy-agent-bootstrap.ts:255-282` cria `store_private_key` e `get_private_key`.
- `backend/src/db/legacy-agent-bootstrap.ts:266` e `:275` usam `SECURITY DEFINER`.
- `backend/src/db/legacy-agent-bootstrap.ts:278-280` faz `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = secret_id`.
- `backend/src/services/vault.service.ts:92-101` chama `supabase.rpc('get_private_key', { secret_id })`.
- Nao foi encontrado `REVOKE EXECUTE` explicito para essas funcoes nas migrations revisadas.

**Por que e critico:** uma funcao publica que retorna `vault.decrypted_secrets` transforma `vault_secret_id` em bearer secret. Se `wallets.vault_secret_id` for legivel por erro de RLS, logs, API ou `exec_sql`, a private key pode ser recuperada.

**Impacto possivel:**

- Roubo de fundos ou assets custodiais.
- Assinatura de transacoes sem passar pelo produto.
- Comprometimento irreversivel de contas Stellar se as keys forem de producao.

**Correcao recomendada:**

1. Revogar `EXECUTE` de `PUBLIC`, `anon` e `authenticated`.
2. Manter leitura de segredo exclusivamente no backend, com service role e autorizacao de negocio previa.
3. Trocar funcoes genericas por RPCs especificas e nao exportadas ao PostgREST.
4. Considerar migrar para assinatura isolada, KMS/HSM ou signer service que nunca retorna private key em plaintext.
5. Rotacionar wallets/chaves se houver chance de exposicao.

### DB-03 - Backend desabilita RLS de tabelas sensiveis no startup

**Severidade:** Critica  
**Componente:** Supabase RLS / migrations runtime  
**Evidencia:**

- `backend/src/app.ts:20-24` chama `runMigrations(supabase)` no startup da API.
- `backend/src/utils/migrate.ts:153-158` executa a fase "Disable RLS on Agent Tables".
- `backend/src/db/legacy-agent-bootstrap.ts:629-648` desabilita RLS em `agent_sessions`, `wallets`, `operations`, `agent_states`, `agent_messages`, `external_accounts`, `contacts`, `recovery_otps`, `user_passkeys`, `passkey_challenges`, `conversion_rules`, `audit_events`, `scheduled_payments`, `whitelisted_assets`, `financial_insights`, `financial_events`, `invoices` e `global_profiles`.
- Busca global encontrou multiplas migrations com `DISABLE ROW LEVEL SECURITY`, incluindo `backend/migrations/20260513_99_full_setup_from_zero.sql`, `backend/migrations/20260512_99_financial_assistant_all_in_one.sql`, `backend/migrations/disable_rls.sql`, `backend/migrations/20260512_06_global_idempotency_uniqueness.sql`, `backend/migrations/20260512_00_payment_infra_prereqs.sql`, `backend/migrations/fix_pin_reset_schema_20260509.sql`, entre outras.

**Por que e critico:** RLS e o principal limite de seguranca em Supabase quando existem roles `anon`/`authenticated`. Desabilita-lo em tabelas financeiras e de sessao cria dependencia total no backend. Qualquer uso indevido da anon key, service role vazada, RPC exposta ou cliente Supabase acidental pode virar vazamento amplo.

**Impacto possivel:**

- Leitura de sessoes, tokens, mensagens, contas externas, contatos, historico financeiro e invoices.
- Atualizacao/delecao de dados sensiveis se permissoes permitirem.
- Enumeracao de `vault_secret_id`.
- Quebra de isolamento entre usuarios.

**Correcao recomendada:**

1. Separar migrations de desenvolvimento e producao.
2. Remover a fase de `DISABLE RLS` do startup.
3. Reativar RLS em tabelas sensiveis.
4. Criar policies por `auth.uid()`, `session_token` validado server-side ou roles internas especificas.
5. Adicionar teste automatizado que falha se migration produtiva contiver `DISABLE ROW LEVEL SECURITY` sem allowlist.

### AUTH-01 - Cadastro de passkey sem prova de posse da conta

**Severidade:** Critica  
**Componente:** Passkey/WebAuthn  
**Evidencia:**

- `backend/src/api/routes/passkey.router.ts:6-9` expoe `register-init`, `register-complete`, `auth-init`, `auth-complete` sem middleware de autenticacao.
- `backend/src/api/controllers/passkey.controller.ts:6-13` inicia registro usando `req.body.user_id` ou `req.body.email`.
- `backend/src/api/controllers/passkey.controller.ts:19-31` conclui registro usando novamente `req.body.user_id` ou `req.body.email`.
- `backend/src/services/passkey.service.ts:155-177` resolve usuario por email ou user_id buscando `agent_sessions`.
- `backend/src/services/passkey.service.ts:266-290` gera desafio de registro para o userId resolvido.
- `backend/src/services/passkey.service.ts:348-365` salva a credencial em `user_passkeys`.
- `backend/src/services/passkey.service.ts:369-416` autenticacao por passkey retorna token e ultima sessao.

**Por que e critico:** registrar uma nova passkey e uma operacao de alta sensibilidade. Ela nao pode depender apenas de identificador publico como email. O fluxo atual permite criar um fator de autenticacao para um usuario sem provar posse da sessao, do email, do PIN atual ou de um link one-time valido.

**Impacto possivel:**

- Account takeover por email conhecido.
- Login persistente via autenticator controlado pelo atacante.
- Acesso a sessoes e fluxos financeiros que confiam no login.

**Correcao recomendada:**

1. Exigir sessao autenticada com `session_id` + `session_token` para registro de passkey.
2. Para cadastro inicial, permitir passkey apenas apos finalizar onboarding por token one-time ainda valido e vinculado ao mesmo usuario.
3. Para adicionar nova passkey em conta existente, exigir reautenticacao forte: PIN atual, passkey existente ou email OTP.
4. Nunca aceitar `email` isolado como autorizacao para registro.
5. Invalidar desafios antigos e rate-limit por usuario/IP/device.

### AUTH-02 - IDOR: endpoints usam `session_id` como credencial

**Severidade:** Alta  
**Componente:** APIs de sessao, financeiro e agente  
**Evidencia:**

- `backend/src/api/routes/financial.router.ts:10-24` expoe rotas por `:session_id` sem middleware de auth.
- `backend/src/api/controllers/financial.controller.ts:78-82` le `session_id` de body/query/params.
- `backend/src/api/controllers/financial.controller.ts:269-337` retorna insights, contatos inteligentes, replay, economia e invoices com base em `session_id`.
- `backend/src/api/controllers/financial.controller.ts:454-462` retorna transacoes por `session_id`.
- `backend/src/agent/routes.ts:772-783` retorna detalhes da sessao e contagem de mensagens.
- `backend/src/agent/routes.ts:791-829` retorna conteudo de mensagens por `session_id`.
- `backend/src/agent/routes.ts:1000-1023` retorna saldo da conta por `session_id`.
- `frontend/app/api/chat/route.ts:159-184` encaminha leitura de mensagens por `session_id`, com fallback se `browser_id` nao estiver vinculado.

**Por que e alto:** UUID nao e autenticacao. Mesmo que seja dificil adivinhar, ele vaza naturalmente em localStorage, logs, URLs, payloads, suporte, screenshots e links. Qualquer endpoint que aceite apenas `session_id` cria IDOR.

**Impacto possivel:**

- Leitura de mensagens com o agente.
- Exposicao de email, public key, status de wallet, historico, contatos e insights financeiros.
- Preparacao de ataques sociais com dados reais.

**Correcao recomendada:**

1. Exigir `session_token` em todos os endpoints de sessao privada.
2. Criar middleware unico `requireSessionAuth`.
3. Tratar `session_id` como identificador publico, nunca como segredo.
4. Auditar todas as chamadas `.eq('session_id', ...)` em controllers/tools.
5. Retornar 401 generico para sessao inexistente/expirada/token invalido.

### AUTH-03 - Tool `reset_pin` bypassa a rota segura de reset

**Severidade:** Alta  
**Componente:** Agent tools / PIN reset  
**Evidencia:**

- `backend/src/api/controllers/pin-reset.controller.ts:84-94` exige `session_token` ou segredo interno para iniciar reset de PIN.
- `backend/src/agent/tools.ts:4364-4448` implementa `executeResetPin`.
- `backend/src/agent/tools.ts:4368-4375` exige apenas `session_id`.
- `backend/src/agent/tools.ts:4381-4385` resolve usuario por `agent_sessions`.
- `backend/src/agent/tools.ts:4439-4447` gera e retorna `reset_url` usando `PinResetService.generateResetToken`.

**Por que e alto:** a rota HTTP de reset foi endurecida, mas o agente ainda tem um caminho alternativo que nao exige o mesmo segredo. Isso cria bypass de controle de acesso.

**Impacto possivel:**

- Pessoa com `session_id` pode acionar link de reset.
- Reset de PIN vira dependente de controle do canal/agente e nao da sessao autenticada.
- Pode ser combinado com AUTH-02.

**Correcao recomendada:**

1. Fazer a tool chamar o mesmo fluxo seguro da controller.
2. Exigir `session_token` ou autorizacao interna assinada para `reset_pin`.
3. Nao retornar `reset_url` em texto livre para canais nao autenticados.
4. Registrar auditoria de quem pediu reset, canal, IP e device.

### AUTH-04 - Fallbacks previsiveis de JWT secret

**Severidade:** Alta  
**Componente:** Autenticacao/JWT/config  
**Evidencia:**

- `backend/src/api/middlewares/auth.middleware.ts:19` usa `process.env.JWT_SECRET || 'your-secret-key'`.
- `backend/src/services/external.service.ts:11-13` usa `dev-secret-change-me`.
- `backend/src/api/controllers/external-validate.controller.ts:7-9` usa `dev-secret-change-me`.
- `backend/src/services/passkey.service.ts:27` usa `dev-secret-change-me`.
- `backend/src/services/pin-reset.service.ts:253` e `:276` usam `dev-secret-change-me`.
- `backend/src/api/services/auth.service.ts:4` usa `process.env.JWT_SECRET || ''`.
- Busca global tambem encontrou fallbacks em `external.controller.ts`, `external-finalize.controller.ts`, `pay-link.controller.ts`, `agent/routes.ts` e outros.

**Por que e alto:** se a variavel falhar em Railway ou outro ambiente, o sistema continua rodando com segredo conhecido ou vazio. Isso permite forjar JWTs e links assinados se o atacante conhece o fallback.

**Impacto possivel:**

- Tokens de login forjados.
- Links de pagamento/onboarding/logout/reset forjados.
- Bypass de validacao de token.

**Correcao recomendada:**

1. Criar helper central `getRequiredJwtSecret()`.
2. Falhar startup se `JWT_SECRET` ausente, curto ou igual a fallback.
3. Rotacionar tokens depois da mudanca.
4. Remover todos os fallbacks de segredo em codigo produtivo.

### AUTH-05 - Sem rate limiting para PIN, OTP, passkey e links

**Severidade:** Alta  
**Componente:** API publica / brute force protection  
**Evidencia:**

- Busca por `express-rate-limit`, `helmet`, `csrf` e `rateLimit` nao encontrou middleware global relevante.
- `backend/src/app.ts:26-30` registra CORS, parser JSON e idempotencia, mas nao rate limiting.
- PIN usa PBKDF2 com salt global em varias rotas:
  - `backend/src/api/controllers/external.controller.ts:510-512`
  - `backend/src/api/controllers/external-finalize.controller.ts:1386-1392`
  - `backend/src/api/controllers/external-finalize.controller.ts:1933-1939`
  - `backend/src/api/controllers/pin-reset.controller.ts:206-208`
  - `backend/src/api/controllers/pay-link.controller.ts:30-38`
- `backend/src/api/controllers/external-recovery.controller.ts:157-164` incrementa `attempts`, mas nao bloqueia por limite.

**Por que e alto:** PINs de 4 a 8 caracteres e OTPs de 6 digitos exigem limitacao agressiva. Sem rate limit, lockout e backoff, endpoints publicos viram superficie de brute force online.

**Impacto possivel:**

- Tentativa massiva de PIN.
- Tentativa massiva de OTP.
- Abuso de passkey challenges.
- Custo e indisponibilidade por chamadas repetidas.

**Correcao recomendada:**

1. Rate limit por IP, usuario, `session_id`, provider, phone/email e endpoint.
2. Lockout temporario por PIN/OTP falho.
3. Backoff exponencial.
4. Erros genericos que nao diferenciem existencia de conta.
5. Monitorar alertas por padrao de tentativa.

### WEB-01 - Open redirect via short links publicos

**Severidade:** Alta  
**Componente:** Links publicos / frontend redirect  
**Evidencia:**

- `backend/src/api/routes/external.router.ts:23` expoe `POST /api/external/short-links`.
- `backend/src/api/controllers/short-link.controller.ts:8-31` aceita qualquer `url` com `http://` ou `https://`.
- `frontend/app/r/[code]/route.ts:42` faz `NextResponse.redirect(String(payload.url))`.

**Por que e alto:** o atacante consegue criar links no dominio do produto que redirecionam para qualquer lugar. Em produto financeiro, isso facilita phishing com alta credibilidade.

**Impacto possivel:**

- Roubo de PIN, passkey prompt falso, seed phrase ou token.
- Phishing em WhatsApp/Telegram usando dominio legitimo.
- Danos reputacionais.

**Correcao recomendada:**

1. Tornar criacao de short link interna/autenticada.
2. Allowlist de dominios e paths esperados.
3. Armazenar `purpose` estrito e validar destino por tipo.
4. Exibir pagina intermediaria para destinos externos, se externos forem realmente necessarios.

### FRONT-01 - Tokens de sessao em localStorage

**Severidade:** Alta  
**Componente:** Frontend/session storage  
**Evidencia:**

- `frontend/lib/session.ts:13-24` salva `sessionId` e `sessionToken` em `localStorage`.
- `frontend/app/pay-anyone/pay-anyone-client.tsx`, `frontend/app/claim-payment/claim-payment-client.tsx`, `frontend/app/pix-ramp/pix-ramp-client.tsx`, `frontend/app/u/[username]/page.tsx` e outros leem esses valores para chamadas sensiveis.
- `frontend/app/create-account/create-account-client.tsx` tambem grava `sessionToken` diretamente em `localStorage` em multiplos trechos.

**Por que e alto:** `localStorage` e acessivel por qualquer JavaScript executando na origem. Um XSS, dependencia comprometida, extensao maliciosa ou bug de renderizacao pode roubar `sessionToken`.

**Impacto possivel:**

- Tomada de sessao.
- Geração de links financeiros em nome do usuario.
- Acesso a historico e dados privados.

**Correcao recomendada:**

1. Mover `sessionToken` para cookie `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
2. Manter no browser apenas identificador nao sensivel quando necessario.
3. Vincular token a device e rotacionar em login/logout.
4. Adicionar CSP forte e remover scripts desnecessarios.

### DEP-01 - Next.js desatualizado com advisories criticos

**Severidade:** Alta/Critica  
**Componente:** Dependencias frontend  
**Evidencia:**

- `frontend/package.json` usa `next@14.2.16`.
- `npm audit --omit=dev` no frontend reportou:
  - `Authorization Bypass in Next.js Middleware` (`GHSA-f82v-jwr5-mffw`), severidade critica, range `>=14.0.0 <14.2.25`.
  - Multiplos DoS/SSRF/cache poisoning/XSS/request smuggling em ranges que afetam a versao instalada.
  - `postcss` transitive moderada via Next.

**Por que e alto:** framework web vulneravel pode impactar autorizacao, SSRF, cache, DoS e XSS, dependendo das features usadas e deploy.

**Correcao recomendada:**

1. Atualizar Next para versao corrigida compativel.
2. Rodar `npm audit --omit=dev` novamente.
3. Remover `ignoreBuildErrors` e `ignoreDuringBuilds` antes de promover.
4. Testar rotas App Router, proxies API e paginas de token.

### CFG-01 - Arquivos `.env` reais versionados

**Severidade:** Alta  
**Componente:** Configuracao/secrets  
**Evidencia:**

- `git ls-files` mostrou `evolution/.env` e `telegram/.env` versionados.
- `.gitignore:68-71` ignora `.env` e `.env.*`, mas arquivos ja rastreados continuam no historico.
- `evolution/.gitignore:7-10` explicitamente mantem `.env` local de dev commitado.
- `telegram/.gitignore:7-10` ignora `.env`, mas o arquivo segue rastreado.

**Por que e alto:** qualquer segredo real em arquivo versionado deve ser considerado comprometido. Mesmo que hoje contenha valores de teste, o padrao incentiva copiar segredos reais para Git.

**Impacto possivel:**

- Vazamento de tokens Telegram/Evolution/API.
- Controle de bot, webhook ou API externa.
- Pivot para ambientes Railway/Supabase se chaves reais entrarem no arquivo.

**Correcao recomendada:**

1. Remover `.env` rastreados do Git.
2. Manter apenas `.env.example`.
3. Rotacionar qualquer valor que ja tenha sido real.
4. Adicionar secret scanning em CI.

### DOC-01 - Tokens de sessao podem vazar em exemplos de documentacao

**Severidade:** Media/Alta
**Componente:** Documentacao operacional / demos
**Evidencia:**

- Durante a auditoria, a working tree local ja tinha `docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md` modificado antes deste relatorio.
- O diff local desse arquivo mostrava exemplos `curl` com `session_id` e `session_token` concretos no lugar de placeholders.
- Esse arquivo nao foi incluido no commit deste relatorio, mas o risco existe se esse tipo de alteracao for commitado ou compartilhado em video, print, PR ou chat.

**Por que e relevante:** `session_id` ja e usado por varias rotas como identificador suficiente para leitura de dados, e `session_token` e credencial de sessao. Mesmo em testnet, publicar esses valores ensina um padrao inseguro e pode expor contas de demo.

**Impacto possivel:**

- Reuso de sessao de demo por terceiros.
- Leitura de dados por rotas que aceitam apenas `session_id`.
- Vazamento acidental em video de entrega ou commit.

**Correcao recomendada:**

1. Nunca commitar valores reais de `session_id`, `session_token`, JWT, API key ou private key em docs.
2. Manter `SESSION_ID_AQUI` e `SESSION_TOKEN_AQUI` como placeholders.
3. Antes de gravar video, usar ambiente descartavel e rotacionar credenciais depois.
4. Adicionar secret scanning que detecte UUIDs em campos sensiveis de docs quando o nome da chave for `session_token`, `api_key`, `secret`, `token` ou similar.

### API-01 - CORS aberto e ausencia de hardening HTTP

**Severidade:** Media/Alta  
**Componente:** Express API  
**Evidencia:**

- `backend/src/app.ts:26-27` usa `cors()` sem allowlist.
- Busca nao encontrou `helmet`, CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options` ou rate limit global.
- `backend/src/app.ts:69-80` retorna mensagem de erro interna diretamente para o cliente.

**Impacto possivel:**

- Maior superficie para abuso cross-origin.
- Exposicao de detalhes internos em erro.
- Falta de headers defensivos basicos.

**Correcao recomendada:**

1. Definir allowlist de origens por ambiente.
2. Adicionar `helmet` e politicas explicitas.
3. Retornar erro generico em producao.
4. Rate limit global e por endpoint sensivel.

### API-02 - Logout/clear session por `session_id` sem exigir token

**Severidade:** Media/Alta  
**Componente:** `/api/agent/logout`  
**Evidencia:**

- `backend/src/agent/routes.ts:841-950` implementa logout.
- `backend/src/agent/routes.ts:848-882` valida token se ele vier.
- `backend/src/agent/routes.ts:884-907` aceita `session_id` do body e chama `repository.clearSession(sessionId)` mesmo sem token.
- `backend/src/agent/routes.ts:908-915` desvincula `external_accounts` por `session_id`.

**Por que e relevante:** mesmo que nao roube fundos, permite denial-of-service de sessao e desvinculo de canal externo se `session_id` vazar.

**Correcao recomendada:**

1. Exigir token de logout assinado ou `session_token`.
2. Nao aceitar logout por `session_id` puro.
3. Fazer unlink de conta externa apenas se o token pertencer ao mesmo provider/user.

### EXT-01 - Confirmacao de email existe, mas esta desligada

**Severidade:** Media/Alta  
**Componente:** Login/link externo/onboarding  
**Evidencia:**

- `backend/src/api/controllers/external.controller.ts:88-101` retorna `true` antes de executar validacao real.
- `backend/src/api/controllers/external-finalize.controller.ts:230-243` repete o mesmo padrao.

**Impacto possivel:**

- Fluxos de vincular conta existente dependem mais de email+PIN.
- Com PIN curto e sem rate limit, ausencia de email OTP aumenta risco de takeover.

**Correcao recomendada:**

1. Reativar confirmacao de email para login/link/create.
2. Se email provider nao estiver configurado, falhar fechado em producao.
3. Remover codigo morto ou controlar por feature flag segura.

### EXT-02 - OTP fraco: `Math.random`, fallback dev e sem lockout

**Severidade:** Media  
**Componente:** Recuperacao externa  
**Evidencia:**

- `backend/src/api/controllers/external-recovery.controller.ts:11-17` usa `OTP_SECRET || JWT_SECRET || 'dev-otp-secret'` e `Math.random`.
- `backend/src/api/controllers/external-recovery.controller.ts:82-96` gera/upserta OTP.
- `backend/src/api/controllers/external-recovery.controller.ts:157-164` incrementa tentativas, mas nao bloqueia.
- `backend/src/api/controllers/external-recovery.controller.ts:134-136` permite nova senha com 4 caracteres.

**Impacto possivel:**

- Brute force de OTP.
- Previsibilidade inferior ao necessario para codigo de recuperacao.
- Reset de senha/PIN com senha fraca.

**Correcao recomendada:**

1. Usar `crypto.randomInt(100000, 1000000)`.
2. Exigir `OTP_SECRET` forte em producao.
3. Bloquear apos 5 tentativas, com cooldown.
4. Aumentar politica minima de segredo/PIN conforme modelo de risco.

### EXT-03 - Webhook Evolution aceita chamadas sem segredo configurado

**Severidade:** Media  
**Componente:** WhatsApp/Evolution webhook  
**Evidencia:**

- `backend/src/api/services/evolution.service.ts:511-515` retorna `true` se `EVOLUTION_WEBHOOK_SECRET` estiver vazio.
- `backend/src/app.ts:59-60` expoe rotas `/api/evolution` e `/webhook/evolution`.

**Impacto possivel:**

- Qualquer origem pode simular mensagem se endpoint estiver publico e segredo ausente.
- Abuso de resposta automatica, custo de LLM e spam.
- Possivel manipulacao de contexto se payload malicioso passar pelo parser.

**Correcao recomendada:**

1. Em producao, falhar startup se `EVOLUTION_WEBHOOK_SECRET` estiver vazio.
2. Validar header assinado e instancia esperada.
3. Rate limit por origem/remoteJid/messageId.
4. Logar rejeicoes sem expor payload completo.

### TG-01 - Telegram `/notify` autoriza tudo se segredo nao existir

**Severidade:** Media  
**Componente:** Telegram bot internal API  
**Evidencia:**

- `telegram/src/health-server.js:28-33` retorna autorizado se `secret` estiver vazio.
- `telegram/src/health-server.js:47-75` permite `/notify` enviar texto/imagem para `chat_id`.
- `telegram/src/index.js:353` usa `TELEGRAM_NOTIFY_SECRET || INTERNAL_API_SECRET || ''`.

**Impacto possivel:**

- Se o servico ficar publico sem segredo, qualquer pessoa pode usar o bot para enviar mensagens.
- Phishing, spam e abuso de reputacao do bot.

**Correcao recomendada:**

1. Exigir segredo em producao.
2. Vincular service a rede interna quando possivel.
3. Rate limit e allowlist de origem.

### DATA-01 - Recibos publicos por hash/code

**Severidade:** Media  
**Componente:** Recibos/privacidade  
**Evidencia:**

- `backend/src/api/routes/external.router.ts:26-29` expoe rotas publicas de recibo.
- `backend/src/api/controllers/receipt-image.controller.ts:39-73` consulta pagamento por `payment_hash`.
- `backend/src/api/controllers/receipt-image.controller.ts:75-97` consulta receipt image por `code`.
- `backend/src/api/controllers/receipt-image.controller.ts:182-231` persiste recibo e short link sem `session_id/user_id`.
- `backend/src/api/controllers/receipt-image.controller.ts:310-331` retorna imagem e metadados do recibo.

**Impacto possivel:**

- Quem tiver hash ou code acessa comprovante.
- Dados de valor, destino, remetente, fee e data podem aparecer sem autenticacao.

**Correcao recomendada:**

1. Definir se recibo deve ser publico por design.
2. Se publico, usar code aleatorio longo e expiracao.
3. Evitar derivar code de hash deterministicamente.
4. Minimizar dados exibidos e permitir revogacao.

### LOG-01 - Logs sensiveis e respostas com detalhe interno

**Severidade:** Media  
**Componente:** Observabilidade/API errors  
**Evidencia:**

- `telegram/src/index.js:370-395` loga `provider_user_id`, `chat_id`, `session_id` e status de onboarding.
- `telegram/src/bot.js:105-139` loga chat, sessao e identidade.
- `backend/src/api/controllers/external.controller.ts:500-503` inclui provider, email e prefixo de provider_user_id em logs.
- `backend/src/app.ts:76-79` retorna `errorMessage` cru para o cliente.
- `frontend/app/api/chat/route.ts:150-155` retorna mensagem de erro interna para o cliente.

**Impacto possivel:**

- Logs viram fonte de PII e identificadores de sessao.
- Mensagens internas ajudam atacantes a mapear sistema.

**Correcao recomendada:**

1. Redacao estruturada de logs.
2. Nao logar `session_id` completo, provider IDs completos, emails completos ou tokens.
3. Erro generico em producao.
4. Retencao curta e acesso minimo aos logs.

### FRONT-02 - Build ignora lint e erros TypeScript

**Severidade:** Media  
**Componente:** Frontend CI/build  
**Evidencia:**

- `frontend/next.config.mjs:3-8` define:
  - `eslint.ignoreDuringBuilds: true`
  - `typescript.ignoreBuildErrors: true`

**Impacto possivel:**

- Bugs de tipo/autorizacao podem chegar em producao.
- Refactors de seguranca podem quebrar silenciosamente.

**Correcao recomendada:**

1. Remover ignores.
2. Corrigir erros existentes.
3. Fazer CI falhar em lint/typecheck.

### PROXY-01 - Proxies frontend vazam URL interna em erro

**Severidade:** Baixa/Media  
**Componente:** Next API routes/proxies  
**Evidencia:**

- `frontend/app/api/external/[...path]/route.ts:49-56` retorna `target`.
- `frontend/app/api/financial/[...path]/route.ts:45-52` retorna `target`.

**Impacto possivel:**

- Exposicao de URL interna backend/Railway.
- Facilita reconhecimento de ambiente.

**Correcao recomendada:**

1. Em producao, retornar apenas erro generico.
2. Logar `target` apenas server-side.

### AUTH-06 - Login legado por email sem senha/PIN

**Severidade:** Alta se rota estiver publicada  
**Componente:** `/api/actions` legado  
**Evidencia:**

- `backend/src/api/routes/actions.router.ts:22-24` expoe `/login` e `/onboard-user` antes de `authenticateToken`.
- `backend/src/api/controllers/actions.controller.ts:16-25` login recebe apenas `email` e chama `AuthService.login(email)`.
- `backend/src/api/services/auth.service.ts:7-16` gera JWT para usuario encontrado por email.
- `backend/src/api/controllers/actions.controller.ts:36-44` permite onboarding sem auth.

**Impacto possivel:**

- Se a tabela `users` estiver ativa, qualquer email conhecido pode gerar token.
- Endpoint legado pode coexistir com fluxo novo e burlar controles.

**Correcao recomendada:**

1. Desabilitar `/api/actions/login` em producao ou exigir senha/PIN/passkey.
2. Mover rotas legadas para namespace interno.
3. Adicionar teste que garante que login sem fator nao existe.

### AUTH-07 - Comparacao de tokens/PIN nem sempre usa timing-safe

**Severidade:** Baixa/Media  
**Componente:** Sessao e PIN  
**Evidencia:**

- `backend/src/api/controllers/pay-link.controller.ts:36-38` compara `stored === providedToken`.
- `backend/src/api/controllers/financial.controller.ts:400-402` compara `storedToken !== sessionToken`.
- Ha uso correto em `backend/src/api/controllers/pin-reset.controller.ts:8-13`, mas nao padronizado.

**Impacto possivel:** risco pratico menor em rede, mas e uma inconsistencia facil de corrigir.

**Correcao recomendada:** criar helper unico `timingSafeEqualString` e usar em todos os tokens bearer/sessao.

### DB-04 - Cliente Supabase do backend aceita anon key como fallback

**Severidade:** Media/Alta  
**Componente:** Config Supabase  
**Evidencia:**

- `backend/src/config/supabase.ts:6-10` usa `SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || SUPABASE_KEY`.
- `backend/src/config/supabase.ts:16-17` aceita explicitamente `SUPABASE_ANON_KEY / SUPABASE_KEY`.

**Impacto possivel:**

- Backend pode subir com permissao insuficiente e gerar workaround inseguro.
- Pode mascarar ambiente incorreto.
- Se combinado com RLS desabilitado, anon key pode ter impacto inesperado.

**Correcao recomendada:**

1. Backend produtivo deve exigir `SUPABASE_SERVICE_ROLE_KEY`.
2. Nao aceitar anon key para operacoes server-side sensiveis.
3. Separar cliente admin e cliente anon por finalidade.

### AGENT-01 - Limite de autorizacao entre prompt e tools precisa ser reforcado

**Severidade:** Media/Alta  
**Componente:** LLM agent tools  
**Evidencia:**

- `backend/src/agent/routes.ts:451-620` aceita `/api/agent/query` publico e escolhe/cria sessao por `session_id`, source e metadata.
- `backend/src/agent/tools.ts` contem varias queries em `wallets`, `agent_sessions`, `external_accounts` e `payment_logs` usando `session_id`.
- `backend/src/agent/tools.ts:4364-4448` demonstra tool sensivel com autorizacao insuficiente.

**Impacto possivel:**

- Prompt injection ou chamadas manipuladas podem acionar tools que dependem de `session_id`.
- Dados financeiros podem ser expostos pelo agente antes de uma prova forte de posse da sessao.

**Correcao recomendada:**

1. Definir matriz de permissao por tool.
2. Tools de leitura privada exigem `session_token`.
3. Tools de escrita/pagamento exigem `session_token` + PIN/passkey/token one-time.
4. O LLM nunca deve decidir autorizacao; apenas passar parametros para uma camada deterministica.

## Plano de correcao priorizado

### P0 - Corrigir antes de qualquer avaliacao publica

1. Remover/revogar `public.exec_sql`.
2. Revogar `store_private_key` e `get_private_key` para `PUBLIC`, `anon` e `authenticated`.
3. Parar de desabilitar RLS no startup.
4. Reativar RLS e policies minimas para tabelas sensiveis.
5. Travar cadastro de passkey atras de sessao autenticada ou token one-time de onboarding.
6. Corrigir tool `reset_pin` para exigir `session_token` ou auth interna.
7. Exigir `session_token` em endpoints de dados privados por `session_id`.
8. Remover fallbacks de JWT secret e falhar startup se segredo estiver ausente.
9. Adicionar rate limit/lockout para PIN, OTP, passkey e links.

### P1 - Alta prioridade

1. Corrigir open redirect de short links.
2. Mover `sessionToken` para cookie `HttpOnly`.
3. Atualizar Next.js e rodar audit.
4. Remover `.env` versionados e rotacionar segredos.
5. Reativar confirmacao de email ou falhar fechado em producao.
6. Exigir `EVOLUTION_WEBHOOK_SECRET` e `TELEGRAM_NOTIFY_SECRET/INTERNAL_API_SECRET`.
7. Bloquear logout por `session_id` puro.

### P2 - Hardening

1. CORS allowlist e `helmet`.
2. Respostas de erro genericas em producao.
3. Redacao de logs.
4. Recibos com token aleatorio longo e expiracao.
5. Build sem `ignoreBuildErrors`.
6. Remover URL interna dos erros do proxy.

## Melhor achado para o formulario do desafio

**Achado critico sugerido:** Banco Supabase exposto por RPC `SECURITY DEFINER` de SQL arbitrario, combinada com RLS desabilitado automaticamente e RPC de Vault que retorna private keys descriptografadas.

**Relato tecnico resumido para o formulario:**

Foi identificada uma vulnerabilidade critica na camada de banco de dados. O backend/migrations criavam a funcao `public.exec_sql(sql text)` com `SECURITY DEFINER`, permitindo executar SQL dinamico recebido por parametro. Em paralelo, o backend executava migrations no startup que desabilitavam Row Level Security em tabelas sensiveis como `agent_sessions`, `wallets`, `agent_messages`, `external_accounts`, `payment_confirmations` e outras. Tambem existiam funcoes `SECURITY DEFINER` para `store_private_key` e `get_private_key`, sendo que `get_private_key` consulta `vault.decrypted_secrets`. Na pratica, se uma role exposta conseguisse executar essas RPCs, um atacante poderia ler/alterar dados financeiros, enumerar `vault_secret_id` em wallets e recuperar private keys descriptografadas.

**Como corrigir de forma demonstravel:**

1. Remover `public.exec_sql` de producao ou revogar execucao para `PUBLIC`, `anon` e `authenticated`.
2. Revogar execucao publica de `store_private_key` e `get_private_key`, mantendo acesso apenas por role administrativa server-side.
3. Remover a fase de migration que roda `DISABLE ROW LEVEL SECURITY` no startup.
4. Reativar RLS nas tabelas sensiveis e criar policies adequadas.
5. Adicionar teste/checagem CI que falha se uma migration produtiva tentar criar RPC generica `SECURITY DEFINER` ou desabilitar RLS fora de uma allowlist.

**Texto pronto apos implementacao:**

> Identificamos uma vulnerabilidade critica no banco Supabase: a aplicacao criava uma RPC `public.exec_sql(sql text)` como `SECURITY DEFINER`, capaz de executar SQL arbitrario, enquanto as migrations de startup desabilitavam RLS em tabelas sensiveis. Alem disso, funcoes de Vault tambem `SECURITY DEFINER` permitiam recuperar private keys descriptografadas a partir de `vault_secret_id`. Corrigimos removendo/revogando a RPC generica, restringindo as funcoes de Vault a role server-side, removendo o `DISABLE ROW LEVEL SECURITY` do fluxo de producao e reativando RLS com policies por usuario/sessao. Tambem adicionamos validacao de migration/CI para impedir regressao desse padrao.

## Evidencias de arquivos principais

- `backend/src/db/legacy-agent-bootstrap.ts:8-30` - cria `exec_sql`.
- `backend/src/db/legacy-agent-bootstrap.ts:255-282` - cria funcoes de Vault.
- `backend/src/db/legacy-agent-bootstrap.ts:629-648` - desabilita RLS em tabelas sensiveis.
- `backend/src/utils/migrate.ts:73-158` - roda migrations e fase de desabilitar RLS.
- `backend/src/app.ts:20-30` - roda migrations no startup, CORS aberto, sem rate limit.
- `backend/src/api/routes/passkey.router.ts:6-9` - passkey endpoints publicos.
- `backend/src/api/controllers/passkey.controller.ts:6-31` - registro de passkey por email/user_id.
- `backend/src/services/passkey.service.ts:155-177` - resolve user por email/user_id.
- `backend/src/services/passkey.service.ts:369-416` - login por passkey retorna token/sessao.
- `backend/src/api/routes/financial.router.ts:10-24` - rotas privadas por `session_id`.
- `backend/src/agent/routes.ts:791-829` - mensagens por `session_id`.
- `backend/src/agent/tools.ts:4364-4448` - reset PIN por `session_id`.
- `backend/src/api/controllers/short-link.controller.ts:8-31` - cria short link para URL arbitraria.
- `frontend/app/r/[code]/route.ts:42` - redirect para URL resolvida.
- `frontend/lib/session.ts:13-24` - grava sessao em localStorage.
- `frontend/next.config.mjs:3-8` - ignora lint/type errors em build.
- `backend/src/api/services/evolution.service.ts:511-515` - webhook secret opcional.
- `telegram/src/health-server.js:28-33` - notify secret opcional.

## Conclusao

O produto tem boas tentativas de seguranca em alguns pontos, como idempotencia, tokens one-time em fluxos de pagamento e comparacao timing-safe no reset de PIN oficial. Mesmo assim, os achados criticos estao em camadas compartilhadas: banco, RLS, RPC, passkey e autorizacao por sessao. A correcao mais forte e mais "imponente" para o desafio e atacar o grupo DB-01/DB-02/DB-03, porque ele reduz risco sistemico real e e facil de demonstrar por diff, SQL de revogacao e teste de permissao.
