import { Horizon, Asset } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import { getAssetIssuer } from '../src/config/assets';
import { assertTestnetOnlyScript } from './stellar-script-safety';

dotenv.config();

const server = new Horizon.Server('https://horizon-testnet.stellar.org');
assertTestnetOnlyScript('test-usdc-issuer', 'https://horizon-testnet.stellar.org');
const USDC_ISSUER = String(getAssetIssuer('USDC') || '').trim();
const TESOURO_ISSUER = String(getAssetIssuer('TESOURO') || '').trim();

async function testIssuer(issuer: string, code: string) {
  console.log(`\nTesting ${code} issuer: ${issuer}`);
  console.log('='.repeat(60));
  
  try {
    const account = await server.accounts().accountId(issuer).call();
    console.log(`✓ Account exists on testnet`);
    console.log(`  Sequence: ${account.sequence}`);
    console.log(`  Balances:`);
    
    account.balances.forEach((balance: any) => {
      if (balance.asset_type === 'native') {
        console.log(`    - XLM: ${balance.balance}`);
      } else {
        console.log(`    - ${balance.asset_code} (issuer: ${balance.asset_issuer}): ${balance.balance}`);
      }
    });

    // Check if this issuer has the token
    const hasToken = account.balances.some((b: any) => b.asset_code === code);
    if (hasToken) {
      console.log(`✓ ${code} found in issuer balances`);
    } else {
      console.log(`✗ ${code} NOT found in issuer balances - issuer may not have trustline or balance`);
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log(`✗ Account NOT found on testnet`);
      console.log(`  The issuer account must be created and funded first`);
    } else {
      console.log(`✗ Error: ${error.message}`);
    }
  }
}

async function testAssetCreation() {
  console.log('\nTesting Asset object creation:');
  console.log('='.repeat(60));
  
  try {
    const usdc = new Asset('USDC', USDC_ISSUER);
    console.log(`✓ Asset('USDC', '${USDC_ISSUER}') created successfully`);
    console.log(`  Code: ${usdc.getCode()}`);
    console.log(`  Issuer: ${usdc.getIssuer()}`);
  } catch (error: any) {
    console.log(`✗ Asset creation failed: ${error.message}`);
  }

  try {
    const tesouro = new Asset('TESOURO', TESOURO_ISSUER);
    console.log(`✓ Asset('TESOURO', '${TESOURO_ISSUER}') created successfully`);
    console.log(`  Code: ${tesouro.getCode()}`);
    console.log(`  Issuer: ${tesouro.getIssuer()}`);
  } catch (error: any) {
    console.log(`✗ Asset creation failed: ${error.message}`);
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Testing USDC and TESOURO Issuer Configuration');
  console.log('='.repeat(60));
  
  if (!USDC_ISSUER) {
    throw new Error('USDC_ISSUER not configured');
  }
  if (!TESOURO_ISSUER) {
    throw new Error('TESOURO_ISSUER not configured');
  }

  await testIssuer(USDC_ISSUER, 'USDC');
  await testIssuer(TESOURO_ISSUER, 'TESOURO');
  await testAssetCreation();
  
  console.log('\n' + '='.repeat(60));
  console.log('Test Complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
