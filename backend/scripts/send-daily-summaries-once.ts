import dotenv from 'dotenv';
import { DailySummaryService } from '../src/api/services/daily-summary.service';

dotenv.config();

async function main(): Promise<void> {
  const result = await DailySummaryService.sendDailySummaries();
  console.log(`daily summaries: processed=${result.processed} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
}

main().catch((error) => {
  console.error(`Script failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

