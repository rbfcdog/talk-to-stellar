import 'dotenv/config';
import { EvolutionService } from '../src/api/services/evolution.service';

function maskWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.searchParams.has('secret')) url.searchParams.set('secret', '***');
    return url.toString();
  } catch {
    return value;
  }
}

async function main() {
  const result = await EvolutionService.configureWebhook();
  console.log(JSON.stringify({
    success: true,
    webhookUrl: maskWebhookUrl(result.webhookUrl),
    message: 'Evolution webhook configured for MESSAGES_UPSERT.',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
