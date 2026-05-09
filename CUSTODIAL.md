# Arquitetura não-custodial com PIN + Passkey

## Objetivo

Converter o TalkToStellar para um modelo não-custodial, onde:

- o usuário é o único dono da chave Stellar;
- o servidor nunca recebe a chave privada em texto claro;
- a assinatura acontece no dispositivo do usuário;
- o Supabase guarda apenas metadados, estado da conta e blobs criptografados sem valor isolado.

## Princípio central

A regra é simples:

- chave privada Stellar nunca é armazenada em claro no backend;
- o backend pode armazenar a chave pública Stellar;
- a recuperação/autenticação usa Passkey e, como fallback, PIN;
- qualquer segredo sensível precisa estar criptografado no dispositivo do usuário ou protegido por uma chave que o servidor não conhece.

## Fluxo recomendado

### 1. Primeiro acesso

1. O usuário manda a primeira mensagem no WhatsApp ou Telegram.
2. O bot responde com um link para onboarding em um browser nativo.
3. O browser gera uma carteira Stellar no cliente.
4. O usuário registra uma Passkey no dispositivo.
5. O usuário define um PIN local como fallback.
6. A chave privada Stellar é criptografada localmente.
7. O backend recebe apenas a chave pública Stellar e os metadados necessários.

### 2. Uso normal

1. O usuário pede uma ação no WhatsApp ou Telegram.
2. O bot abre a tela de confirmação no browser nativo.
3. O usuário autentica com Passkey ou PIN.
4. O dispositivo recupera a chave privada Stellar localmente.
5. A transação é assinada no dispositivo.
6. O backend apenas envia a transação assinada para a rede.

### 3. Recuperação

1. Se o usuário trocar de aparelho, a Passkey pode ser restaurada pelo ecossistema do SO quando disponível.
2. Se não houver Passkey, o fluxo de recuperação usa PIN e mecanismo de reemissão de acesso controlado por política de risco.
3. SEP-30 pode ser usado como camada adicional de recuperação, mas não substitui o fato de que a assinatura deve ocorrer fora do servidor.

## Onde cada coisa fica

| Item | Onde fica | Quem controla |
| --- | --- | --- |
| Chave privada Stellar | Dispositivo do usuário, criptografada | Usuário |
| Chave pública Stellar | Supabase e rede Stellar | Público |
| Passkey privada | Secure Enclave / TPM / cofre do SO | Usuário |
| Passkey pública | Supabase | Backend |
| PIN | Apenas no dispositivo, nunca em claro | Usuário |
| Blob criptografado da chave Stellar | Pode ficar no Supabase e/ou no dispositivo | Inútil sem Passkey ou PIN |
| Estado da conta | Supabase | Backend |

## Como usar Passkey

A Passkey não deve ser tratada como uma chave que você guarda manualmente.

O fluxo correto é:

- o sistema operacional cria o par de chaves da Passkey;
- a chave privada fica protegida no dispositivo;
- o seu sistema guarda apenas a chave pública da Passkey e os metadados da credencial;
- quando o usuário autentica, o SO libera a operação com biometria ou desbloqueio do aparelho.

Se o dispositivo suportar PRF/WebAuthn extension, a Passkey também pode ser usada para derivar material criptográfico local e desbloquear a chave Stellar sem expor segredos ao backend.

## Como usar PIN

O PIN é o fallback local para dispositivos sem Passkey ou para usuários que prefiram um segundo fator simples.

Regras:

- o PIN nunca deve ser enviado ao Supabase;
- o PIN nunca deve ser salvo em claro;
- o PIN deve servir apenas para derivar uma chave local de criptografia;
- essa derivação deve usar um KDF forte, como Argon2id ou PBKDF2 com parâmetros altos.

No fluxo prático:

1. o usuário define um PIN;
2. o browser deriva uma chave de criptografia local;
3. a chave privada Stellar é criptografada com essa derivação;
4. o blob criptografado é salvo;
5. na próxima autenticação, o PIN recria a chave e libera a assinatura local.

## O que armazenar no Supabase

### Pode armazenar

- `user_id` interno do app;
- telefone ou identificador do canal, se necessário para onboarding;
- `stellar_public_key`;
- `passkey_credential_id`;
- `passkey_public_key`;
- `passkey_counter` ou `sign_count` se a lib usar;
- `wallet_status`;
- `recovery_status`;
- `encrypted_wallet_blob` se você quiser persistir a carteira criptografada no servidor;
- `encrypted_wallet_blob_iv` ou outros metadados de criptografia;
- timestamps de criação e atualização;
- flags de risco, bloqueio, revogação e device binding;
- logs operacionais sem segredos.

### Não deve armazenar

- chave privada Stellar em claro;
- PIN em claro;
- senha em claro;
- seed phrase em claro;
- token secreto que permita assinar sozinho;
- material de recuperação que reconstrua a chave sem a participação do usuário;
- biometria;
- qualquer segredo reutilizável sem criptografia forte.

## Estrutura mínima de tabelas no Supabase

### users

Guarda identidade do usuário e o vínculo com o canal de entrada.

Campos sugeridos:

- `id`
- `channel`
- `channel_user_id`
- `phone_number`
- `created_at`
- `updated_at`

### wallets

Guarda o estado da carteira do usuário.

Campos sugeridos:

- `id`
- `user_id`
- `stellar_public_key`
- `wallet_status`
- `encrypted_wallet_blob`
- `encrypted_wallet_blob_iv`
- `encryption_scheme`
- `created_at`
- `updated_at`

### passkeys

Guarda as credenciais WebAuthn registradas.

Campos sugeridos:

- `id`
- `user_id`
- `credential_id`
- `public_key`
- `sign_count`
- `transports`
- `device_label`
- `created_at`
- `last_used_at`
- `revoked_at`

### recovery_sessions

Guarda o estado de recuperação sem guardar segredo recuperável em claro.

Campos sugeridos:

- `id`
- `user_id`
- `recovery_type`
- `status`
- `challenge_hash`
- `expires_at`
- `created_at`

## O que fazer com o blob criptografado

Se você decidir armazenar a carteira criptografada no Supabase, o blob deve ser tratado como dado opaco.

Isso significa:

- o backend nunca interpreta o conteúdo;
- o blob só é útil com a chave derivada localmente;
- sem Passkey ou PIN, o blob deve ser inútil;
- o algoritmo de criptografia e o IV precisam ser versionados.

Se quiser máxima segurança, deixe o blob apenas no dispositivo e mantenha no Supabase somente os metadados da carteira e da Passkey.

## Como lidar com dispositivos sem Passkey

Nem todo aparelho terá suporte adequado a Passkey.

Fallback recomendado:

1. tentar Passkey primeiro;
2. se não houver suporte, liberar PIN local;
3. se o usuário estiver em um aparelho novo, usar recuperação controlada;
4. se necessário, obrigar reonboarding.

O ponto importante é não misturar fallback com custódia.

Mesmo com PIN, o servidor não deve conseguir assinar sozinho.

## SEP-30 no cenário do projeto

SEP-30 pode entrar como camada de recuperação, mas não como modelo principal de custódia.

Na prática, ele ajuda mais em:

- recuperação de acesso;
- rotas de emergência;
- políticas de quorum ou aprovação adicional;
- desenho de fallback para usuário que perdeu o dispositivo.

Não use SEP-30 como desculpa para guardar a chave privada no servidor.

## Arquitetura resumida

```text
WhatsApp / Telegram
        ↓
Bot do TalkToStellar
        ↓
Browser nativo do usuário
        ↓
Passkey ou PIN
        ↓
Descriptografia local da chave Stellar
        ↓
Assinatura local da transação
        ↓
Backend envia a transação assinada para a Stellar
```

## Mudanças necessárias no projeto

### Frontend

- criar fluxo de onboarding em browser nativo;
- registrar Passkey no primeiro acesso;
- implementar fallback de PIN local;
- assinar transações no cliente;
- impedir que a chave privada saia do dispositivo em claro.

### Backend

- parar de gerar carteiras com controle exclusivo do servidor;
- armazenar apenas chave pública, credenciais e estado;
- aceitar transações já assinadas;
- validar sessão e autorização sem assumir custódia da chave.

### Banco de dados

- adicionar tabela de wallets não-custodiais;
- adicionar tabela de passkeys;
- adicionar tabela de recovery sessions;
- remover qualquer coluna ou fluxo que dependa de seed privada em claro.

## Regra final

Se o backend consegue assinar sozinho, o sistema ainda é custodial.

Se o backend só armazena metadados e o dispositivo do usuário faz a assinatura local, o sistema é não-custodial.
