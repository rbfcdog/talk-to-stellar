# Correção de Segurança: Passkey/WebAuthn Enrollment

## Vulnerabilidade encontrada

O cadastro de uma nova passkey podia ser iniciado e concluído informando apenas `email` ou `user_id`. A validação criptográfica do WebAuthn estava correta, mas faltava provar que quem estava registrando a credencial controlava a conta.

## Risco

Um atacante que soubesse o email de uma vítima poderia tentar registrar uma passkey própria para aquela conta e depois usá-la como fator de login, caracterizando risco de account takeover.

## Como foi corrigida

Os endpoints `/api/passkeys/register-init` e `/api/passkeys/register-complete` agora exigem `session_id` e `session_token` válidos. O challenge de registro também fica vinculado à mesma sessão autenticada, impedindo iniciar o cadastro com uma sessão e concluir com outra. O frontend de criação de conta passou a enviar a sessão recém-criada ao ativar biometria.

## Commit

https://github.com/rbfcdog/talk-to-stellar/commits/main

Commit: `Require session proof for passkey enrollment`
