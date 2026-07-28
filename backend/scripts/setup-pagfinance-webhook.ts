import 'dotenv/config';
import { initPagfinanceService, loadPagfinanceConfig, validatePagfinanceConfig } from '../src/integrations/pagfinance';

const HELP = `
Registers this deployment as the PagFinance webhook destination.

Usage:
  npm run pagfinance:setup-webhook            # uses APP_PUBLIC_WEBHOOK_URL
  npm run pagfinance:setup-webhook -- --url https://api.example.com

Requires PAGFINANCE_PARTNER_ID, PAGFINANCE_RAW_SECRET and PAGFINANCE_ENABLED=true.
Run once per environment (sandbox and production have separate credentials).
`;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(HELP.trim());
    return;
  }

  const config = loadPagfinanceConfig();
  const missing = validatePagfinanceConfig(config);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }

  const baseUrl = String(argValue('--url') || config.appPublicWebhookUrl || '').replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('Set APP_PUBLIC_WEBHOOK_URL (or pass --url) to the public base URL of this backend.');
  }

  const service = initPagfinanceService();
  if (!service.enabled) {
    throw new Error('PagFinance integration is disabled — set PAGFINANCE_ENABLED=true and the credential envs.');
  }

  const destination = `${baseUrl}/webhook/pagfinance`;
  const result = await service.registerWebhookConfig(destination, ['CASHIN_COMPLETED']);
  console.log(
    JSON.stringify(
      {
        success: true,
        registered_url: destination,
        events: result?.events ?? ['CASHIN_COMPLETED'],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
