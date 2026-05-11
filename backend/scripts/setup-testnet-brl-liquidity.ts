import dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  throw new Error(
    'Script desativado. O projeto não cria mais issuer BRL local nem liquidez BRL/USDC fixa. ' +
      'Use apenas os issuers configurados no backend (USDC_ISSUER e BRL_ISSUER_PUBLIC/BRL_ISSUER_TESTNET).'
  );
}

main().catch((error) => {
  console.error(`Script failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
