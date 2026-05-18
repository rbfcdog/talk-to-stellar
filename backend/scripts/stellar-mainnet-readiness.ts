/**
 * Prints the isolated Stellar Mainnet readiness report.
 *
 * This script does not instantiate the product runtime, does not submit
 * transactions, and does not change STELLAR_NETWORK. It only validates the
 * namespaced STELLAR_MAINNET_* configuration.
 */

import dotenv from 'dotenv';
import path from 'path';

import { getStellarMainnetReadinessReport } from '../src/infrastructure/stellar';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const jsonOutput = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
const report = getStellarMainnetReadinessReport(process.env);

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Stellar Mainnet infrastructure readiness');
  console.log(`- active runtime network: ${report.config.activeRuntimeNetwork}`);
  console.log(`- mainnet enabled: ${report.config.enabled}`);
  console.log(`- runtime activation guard open: ${report.config.allowRuntimeActivation}`);
  console.log(`- safe for current Testnet runtime: ${report.safeForCurrentTestnetRuntime}`);
  console.log(`- configuration ready: ${report.configurationReady}`);
  console.log(`- ready for activation: ${report.readyForActivation}`);
  console.log('');

  report.checks.forEach((check) => {
    console.log(`[${check.status.toUpperCase()}] ${check.key}: ${check.detail}`);
  });
}

if (strict && !report.readyForActivation) {
  process.exitCode = 1;
}
