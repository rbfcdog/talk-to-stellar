import { Horizon, Networks, Asset } from '@stellar/stellar-sdk';

const server = new Horizon.Server('https://horizon-testnet.stellar.org');
const USDC_ISSUER = 'GBZ46DBWTLU45IU75G5NR2EY3DEC5ZGJCVYCNGVRBU57WV6DC4OPI7PK';
const BRL_ISSUER = 'GCKG7UJA4YHCL6MBEVGCWO42CDONOTYU64E53X2SWAHS2CWHXDAKXOL5';

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
    const brl = new Asset('BRL', BRL_ISSUER);
    console.log(`✓ Asset('BRL', '${BRL_ISSUER}') created successfully`);
  } catch (error: any) {
    console.log(`✗ Asset creation failed: ${error.message}`);
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Testing USDC and BRL Issuer Configuration');
  console.log('='.repeat(60));
  
  await testIssuer(USDC_ISSUER, 'USDC');
  await testIssuer(BRL_ISSUER, 'BRL');
  await testAssetCreation();
  
  console.log('\n' + '='.repeat(60));
  console.log('Test Complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
