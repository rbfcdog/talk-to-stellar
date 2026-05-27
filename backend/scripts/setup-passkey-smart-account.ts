import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

type Args = Record<string, string | boolean>;

const CONTRACT_ID_RE = /C[A-Z2-7]{20,}/g;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

function readString(args: Args, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(args: Args, key: string): boolean {
  return args[key] === true || readString(args, key) === 'true';
}

function usage() {
  console.log(`
Usage:
  npm --prefix backend run passkey:smart-account -- --user-id <user-id> --smart-account C... --verifier C... --context-rule-id 1 --write-env .env.passkey

With local WASM files and Stellar CLI:
  npm --prefix backend run passkey:smart-account -- --user-id <user-id> --source <stellar-cli-source> --account-wasm ./account.wasm --verifier-wasm ./verifier.wasm --context-rule-id 1 --write-env .env.passkey

Options:
  --user-id <id>              Required unless --print-only is used. User id saved in user_passkeys.
  --credential-id <id>        Optional. Defaults to the newest passkey for the user.
  --smart-account C...        Existing OpenZeppelin Stellar smart account contract id.
  --verifier C...             Existing WebAuthn/P-256 verifier contract id.
  --account-wasm <path>       Deploy this account WASM with Stellar CLI when --smart-account is absent.
  --verifier-wasm <path>      Deploy this verifier WASM with Stellar CLI when --verifier is absent.
  --context-rule-id <number>  Context rule id configured in the smart account.
  --source <alias|secret>     Stellar CLI source account used for contract deploy.
  --network <testnet|mainnet> Defaults to PASSKEY_SMART_ACCOUNT_NETWORK or testnet.
  --write-env <path>          Writes the generated PASSKEY_SMART_ACCOUNT_* env block.
  --build-command <command>   Optional command run before deploying local WASMs.
  --print-only                Only prints env output. Does not read or update Supabase.
  --dry-run                   Reads inputs and target passkey, but does not update Supabase.
  --env-file <path>           Defaults to .env in the backend working directory.
  --stellar-cli <path>        Defaults to stellar.
`);
}

function normalizeNetwork(input: string) {
  const value = input.trim().toLowerCase();
  if (value === 'mainnet' || value === 'public') {
    return 'mainnet';
  }
  return 'testnet';
}

function parseContextRuleId(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('--context-rule-id must be a non-negative integer');
  }
  return parsed;
}

function assertContractId(label: string, value: string) {
  if (!value) {
    return;
  }
  if (!CONTRACT_ID_RE.test(value)) {
    CONTRACT_ID_RE.lastIndex = 0;
    throw new Error(`${label} must look like a Soroban contract id starting with C...`);
  }
  CONTRACT_ID_RE.lastIndex = 0;
}

function extractContractId(output: string, label: string) {
  const matches = output.match(CONTRACT_ID_RE) || [];
  if (matches.length === 0) {
    throw new Error(`Could not find a contract id in ${label} deploy output:\n${output}`);
  }
  return matches[matches.length - 1];
}

function deployContract(input: {
  kind: string;
  wasmPath: string;
  source: string;
  network: string;
  stellarCli: string;
  rpcUrl: string;
  networkPassphrase: string;
}) {
  const absoluteWasm = path.resolve(process.cwd(), input.wasmPath);
  if (!fs.existsSync(absoluteWasm)) {
    throw new Error(`${input.kind} WASM not found: ${absoluteWasm}`);
  }
  if (!input.source) {
    throw new Error(`--source is required to deploy ${input.kind} WASM with Stellar CLI`);
  }

  const args = [
    'contract',
    'deploy',
    '--source',
    input.source,
    '--network',
    input.network,
    '--wasm',
    absoluteWasm,
  ];

  if (input.rpcUrl) {
    args.push('--rpc-url', input.rpcUrl);
  }
  if (input.networkPassphrase) {
    args.push('--network-passphrase', input.networkPassphrase);
  }

  try {
    const output = execFileSync(input.stellarCli, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const contractId = extractContractId(output, input.kind);
    console.log(`${input.kind} deployed: ${contractId}`);
    return contractId;
  } catch (error: any) {
    const stdout = error?.stdout ? String(error.stdout) : '';
    const stderr = error?.stderr ? String(error.stderr) : '';
    throw new Error(`Failed to deploy ${input.kind} contract.\n${stdout}${stderr}`);
  }
}

function runBuildCommand(command: string) {
  if (!command) {
    return;
  }
  console.log(`Running build command: ${command}`);
  execSync(command, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.env.SHELL || '/bin/sh',
  });
}

function renderEnv(input: {
  enabled: boolean;
  network: string;
  verifierAddress: string;
  contextRuleId: number | null;
}) {
  return [
    `PASSKEY_SMART_ACCOUNT_ENABLED=${input.enabled ? 'true' : 'false'}`,
    `PASSKEY_SMART_ACCOUNT_NETWORK=${input.network}`,
    `PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=${input.verifierAddress || ''}`,
    `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=${input.contextRuleId ?? ''}`,
  ].join('\n');
}

function requireSupabaseEnv() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url) {
    throw new Error('SUPABASE_URL is required to update user_passkeys');
  }
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to update user_passkeys');
  }
  return { url, key };
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function loadTargetPasskey(input: {
  supabase: any;
  userId: string;
  credentialId: string;
}) {
  const columns = [
    'user_id',
    'credential_id',
    'created_at',
    'updated_at',
    'credential_public_key_p256',
    'smart_account_metadata',
  ].join(', ');

  if (input.credentialId) {
    const { data, error } = await input.supabase
      .from('user_passkeys')
      .select(columns)
      .eq('user_id', input.userId)
      .eq('credential_id', input.credentialId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load passkey: ${error.message}`);
    }
    return data;
  }

  const { data, error } = await input.supabase
    .from('user_passkeys')
    .select(columns)
    .eq('user_id', input.userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to load passkeys: ${error.message}`);
  }
  return data?.[0] || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (readBoolean(args, 'help') || readBoolean(args, 'h')) {
    usage();
    return;
  }

  const envFile = readString(args, 'env-file') || '.env';
  dotenv.config({ path: path.resolve(process.cwd(), envFile) });

  const printOnly = readBoolean(args, 'print-only');
  const dryRun = readBoolean(args, 'dry-run');
  const network = normalizeNetwork(readString(args, 'network') || process.env.PASSKEY_SMART_ACCOUNT_NETWORK || 'testnet');
  const userId = readString(args, 'user-id') || process.env.PASSKEY_SETUP_USER_ID || '';
  const credentialId = readString(args, 'credential-id');
  const source = readString(args, 'source') || process.env.PASSKEY_DEPLOY_SOURCE_ACCOUNT || '';
  const stellarCli = readString(args, 'stellar-cli') || process.env.STELLAR_CLI || 'stellar';
  const rpcUrl = readString(args, 'rpc-url') || process.env.STELLAR_RPC_URL || '';
  const networkPassphrase = readString(args, 'network-passphrase') || process.env.STELLAR_NETWORK_PASSPHRASE || '';
  const buildCommand = readString(args, 'build-command') || process.env.PASSKEY_CONTRACT_BUILD_COMMAND || '';

  if (!printOnly && !userId) {
    throw new Error('--user-id is required unless --print-only is used');
  }

  const verifierWasm = readString(args, 'verifier-wasm');
  const accountWasm = readString(args, 'account-wasm');
  let verifierAddress = readString(args, 'verifier') || process.env.PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS || '';
  let smartAccountAddress = readString(args, 'smart-account') || readString(args, 'account');
  const contextRuleId = parseContextRuleId(readString(args, 'context-rule-id') || process.env.PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID || '');

  if ((verifierWasm || accountWasm) && buildCommand) {
    runBuildCommand(buildCommand);
  }

  if (!verifierAddress && verifierWasm) {
    verifierAddress = deployContract({
      kind: 'verifier',
      wasmPath: verifierWasm,
      source,
      network,
      stellarCli,
      rpcUrl,
      networkPassphrase,
    });
  }

  if (!smartAccountAddress && accountWasm) {
    smartAccountAddress = deployContract({
      kind: 'smart account',
      wasmPath: accountWasm,
      source,
      network,
      stellarCli,
      rpcUrl,
      networkPassphrase,
    });
  }

  assertContractId('Verifier address', verifierAddress);
  assertContractId('Smart account address', smartAccountAddress);

  const enabled = Boolean(verifierAddress && smartAccountAddress && contextRuleId !== null);
  const envBlock = renderEnv({
    enabled,
    network,
    verifierAddress,
    contextRuleId,
  });

  const writeEnv = readString(args, 'write-env');
  if (writeEnv) {
    const target = path.resolve(process.cwd(), writeEnv);
    fs.writeFileSync(
      target,
      [
        '# Generated by backend/scripts/setup-passkey-smart-account.ts',
        '# Keep this server-side. Do not commit secrets or deployment-specific values.',
        envBlock,
        smartAccountAddress ? `PASSKEY_SMART_ACCOUNT_ADDRESS=${smartAccountAddress}` : '',
        '',
      ].filter(Boolean).join('\n'),
    );
    console.log(`Wrote ${target}`);
  }

  if (printOnly) {
    console.log(envBlock);
    if (smartAccountAddress) {
      console.log(`PASSKEY_SMART_ACCOUNT_ADDRESS=${smartAccountAddress}`);
    }
    return;
  }

  const { url, key } = requireSupabaseEnv();
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });
  const passkey = await loadTargetPasskey({ supabase, userId, credentialId });
  if (!passkey) {
    throw new Error('No passkey found for this user. Register a passkey in /passkey-test first.');
  }
  if (!passkey.credential_public_key_p256) {
    throw new Error('The selected passkey has no P-256 public key metadata. Re-register it after applying the passkey migration.');
  }

  const previousMetadata = safeObject(passkey.smart_account_metadata);
  const metadata = {
    ...previousMetadata,
    standard: 'openzeppelin-stellar-contracts/accounts',
    deployment_status: enabled ? 'ready_for_auth_payload' : 'contract_setup_incomplete',
    deployment_script: 'backend/scripts/setup-passkey-smart-account.ts',
    deployed_at: new Date().toISOString(),
    network,
    verifier_address: verifierAddress || null,
    smart_account_address: smartAccountAddress || null,
    context_rule_ids: contextRuleId !== null ? [contextRuleId] : [],
    signer_variant: 'External',
    signer_model: 'Signer::External(Address, Bytes)',
    auth_payload_template: {
      smart_account_address: smartAccountAddress || null,
      signer: {
        variant: 'External',
        verifier_address: verifierAddress || null,
        public_key_p256: passkey.credential_public_key_p256,
      },
      context_rule_ids: contextRuleId !== null ? [contextRuleId] : [],
    },
    contract_setup_note: 'Contract initialization and context rule creation must match the deployed account contract ABI.',
  };

  const update = {
    smart_account_address: smartAccountAddress || null,
    smart_account_verifier_address: verifierAddress || null,
    smart_account_context_rule_id: contextRuleId,
    smart_account_network: network,
    smart_account_enabled: enabled,
    smart_account_signer: 'external_webauthn_p256',
    smart_account_type: 'openzeppelin_stellar_smart_account',
    smart_account_metadata: metadata,
    updated_at: new Date().toISOString(),
  };

  if (dryRun) {
    console.log('Dry run: would update user_passkeys with:');
    console.log(JSON.stringify(update, null, 2));
    console.log('\nEnv block:\n' + envBlock);
    return;
  }

  const { error } = await supabase
    .from('user_passkeys')
    .update(update)
    .eq('user_id', userId)
    .eq('credential_id', passkey.credential_id);

  if (error) {
    throw new Error(`Failed to update user_passkeys: ${error.message}`);
  }

  console.log(`Updated passkey ${passkey.credential_id} for user ${userId}`);
  console.log('\nEnv block:\n' + envBlock);
  if (smartAccountAddress) {
    console.log(`PASSKEY_SMART_ACCOUNT_ADDRESS=${smartAccountAddress}`);
  }
  if (!enabled) {
    console.log('\nSmart account metadata was saved, but execution stays disabled until verifier, account and context rule id are all present.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
