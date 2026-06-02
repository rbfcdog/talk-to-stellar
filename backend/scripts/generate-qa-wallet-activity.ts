import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { ContactSeedService } from '../src/api/services/contact-seed.service';
import VaultService from '../src/api/services/core/vault.service';
import { supabase } from '../src/config/supabase';
import { stellarConfig } from '../src/config/stellar';
import { assertTestnetOnlyScript } from './stellar-script-safety';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

type Channel = 'WhatsApp' | 'Web' | 'Telegram';

type QaWallet = {
  index: number;
  userId: string;
  sessionId: string;
  sessionToken: string;
  email: string;
  name: string;
  channel: Channel;
  phoneNumber: string;
  pixKey: string;
  publicKey: string;
  keypair: Keypair;
};

type QaSession = {
  userLabel: string;
  date: string;
  channel: Channel;
  whatHappened: string;
  feedback: string;
  exactPrompt: string;
  productBehavior: string;
  confusion: string;
  sessionId: string;
  userId: string;
  email: string;
  publicKey: string;
  txHash?: string;
  explorerUrl?: string;
};

const repoRoot = path.resolve(__dirname, '../..');
const horizonUrl = stellarConfig.horizonUrl || 'https://horizon-testnet.stellar.org';
const friendbotUrl = stellarConfig.friendbotUrl || process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org';
const server = new Horizon.Server(horizonUrl);
const networkPassphrase = stellarConfig.network || Networks.TESTNET;

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseCount(): number {
  const raw = readArg('--count') || process.argv.find((arg) => /^\d+$/.test(arg));
  const parsed = Number(raw || 15);
  if (!Number.isFinite(parsed) || parsed <= 0) return 15;
  return Math.max(1, Math.min(Math.floor(parsed), 50));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortKey(publicKey: string): string {
  return `${publicKey.slice(0, 8)}...${publicKey.slice(-6)}`;
}

function isoDateOnly(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const url = `${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Friendbot failed for ${shortKey(publicKey)}: ${response.status} ${body}`);
  }
}

async function loadBalances(publicKey: string): Promise<any[]> {
  const account = await server.accounts().accountId(publicKey).call();
  return Array.isArray((account as any).balances) ? (account as any).balances : [];
}

async function loadAccountData(publicKey: string): Promise<any> {
  return server.accounts().accountId(publicKey).call();
}

async function waitForTransaction(hash: string, maxAttempts = 10): Promise<any> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await server.transactions().transaction(hash).call();
    } catch {
      if (attempt === maxAttempts) break;
      await sleep(1200);
    }
  }
  throw new Error(`Could not confirm transaction ${hash}`);
}

async function submitXlmPayment(source: Keypair, destination: string, amount: string, memoText: string): Promise<string> {
  const sourceAccount = await server.loadAccount(source.publicKey());
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(Operation.payment({
      destination,
      asset: Asset.native(),
      amount,
    }))
    .addMemo(Memo.text(memoText.slice(0, 28)))
    .setTimeout(60)
    .build();

  tx.sign(source);
  const result = await server.submitTransaction(tx);
  const hash = String((result as any).hash || '');
  if (!hash) throw new Error('Submitted transaction without hash');
  await waitForTransaction(hash);
  return hash;
}

async function tryStoreSecret(userId: string, publicKey: string, secret: string): Promise<string | undefined> {
  try {
    const vault = new VaultService(supabase);
    return await vault.storeSecret(
      secret,
      `qa-wallet:${userId}:private-key`,
      `QA testnet private key for scripted wallet ${publicKey}`,
    );
  } catch (error) {
    console.warn(`[vault] secret not stored for ${shortKey(publicKey)}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function isMissingTable(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('could not find the table') || (message.includes('relation') && message.includes('does not exist'));
}

async function insertUserRecord(input: { email: string; phoneNumber: string; publicKey: string }): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      email: input.email,
      phone_number: input.phoneNumber,
      stellar_public_key: input.publicKey,
    })
    .select('id')
    .maybeSingle();

  if (!error) return String((data as any)?.id || uuidv4());
  if (isMissingTable(error)) return uuidv4();
  if (String(error.code || '') === '23505') {
    throw new Error(`User identity already exists for ${input.email}. Use a different --prefix.`);
  }
  throw new Error(`Failed to insert user: ${error.message}`);
}

async function insertAgentSession(wallet: QaWallet): Promise<void> {
  const { error } = await supabase.from('agent_sessions').insert({
    session_id: wallet.sessionId,
    user_id: wallet.userId,
    email: wallet.email,
    session_token: wallet.sessionToken,
    public_key: wallet.publicKey,
    phone_number: wallet.phoneNumber.replace(/\D/g, ''),
    pix_key: wallet.pixKey,
    created_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Failed to insert agent_session for ${wallet.email}: ${error.message}`);
}

async function insertWallet(wallet: QaWallet, vaultSecretId?: string): Promise<void> {
  const account = await loadAccountData(wallet.publicKey);
  const balances = Array.isArray((account as any).balances) ? (account as any).balances : [];
  const { error } = await supabase.from('wallets').upsert({
    session_id: wallet.sessionId,
    public_key: wallet.publicKey,
    vault_secret_id: vaultSecretId || null,
    name: wallet.name,
    pix_key: wallet.pixKey,
    balance: balances,
    sequence: String((account as any).sequence || ''),
    account_data: account,
    last_synced: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'session_id' });
  if (error) throw new Error(`Failed to insert wallet for ${wallet.email}: ${error.message}`);
}

async function insertContact(owner: QaWallet, target: QaWallet): Promise<void> {
  const { error } = await supabase.from('contacts').upsert({
    owner_id: owner.userId,
    contact_name: target.name,
    stellar_public_key: target.publicKey,
    pix_key: target.pixKey,
    phone_number: target.phoneNumber,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id,contact_name' });
  if (error && String(error.message || '').includes('on conflict')) {
    const fallback = await supabase.from('contacts').insert({
      owner_id: owner.userId,
      contact_name: target.name,
      stellar_public_key: target.publicKey,
      pix_key: target.pixKey,
      phone_number: target.phoneNumber,
    });
    if (fallback.error && String(fallback.error.code || '') !== '23505') {
      throw new Error(`Failed to insert contact for ${owner.email}: ${fallback.error.message}`);
    }
    return;
  }
  if (error && String(error.code || '') !== '23505') {
    throw new Error(`Failed to upsert contact for ${owner.email}: ${error.message}`);
  }
}

async function saveMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  const { error } = await supabase.from('agent_messages').insert({
    session_id: sessionId,
    role,
    content,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Failed to save ${role} message: ${error.message}`);
}

async function insertPaymentLog(input: {
  wallet: QaWallet;
  destination: QaWallet;
  amount: string;
  txHash: string;
  prompt: string;
  channel: Channel;
}): Promise<void> {
  const fingerprint = crypto
    .createHash('sha256')
    .update(`qa:${input.wallet.sessionId}:${input.txHash}`)
    .digest('hex');

  const row = {
    session_id: input.wallet.sessionId,
    user_id: input.wallet.userId,
    source_public_key: input.wallet.publicKey,
    destination_public_key: input.destination.publicKey,
    source_amount: input.amount,
    source_asset_code: 'XLM',
    destination_amount: input.amount,
    destination_asset_code: 'XLM',
    fee_xlm: '0.00001',
    payment_hash: input.txHash,
    operation_type: 'qa_testnet_payment',
    status: 'completed',
    metadata: {
      qa_script: true,
      channel: input.channel,
      exact_prompt: input.prompt,
      destination_name: input.destination.name,
      note: 'Scripted QA/testnet activity. Do not present as real human user feedback.',
    },
    completed_at: new Date().toISOString(),
    operation_fingerprint: fingerprint,
  };

  const { error } = await supabase
    .from('payment_logs')
    .upsert(row, { onConflict: 'operation_fingerprint' });

  if (!error) return;

  if (String(error.message || '').includes('operation_fingerprint')) {
    const { operation_fingerprint, ...fallbackRow } = row;
    const fallback = await supabase.from('payment_logs').insert(fallbackRow);
    if (!fallback.error || String(fallback.error.code || '') === '23505') return;
    throw new Error(`Failed to insert payment log fallback: ${fallback.error.message}`);
  }

  throw new Error(`Failed to insert payment log: ${error.message}`);
}

function scenarioFor(index: number, wallet: QaWallet, destination: QaWallet, amount: string): {
  prompt: string;
  productBehavior: string;
  whatHappened: string;
  confusion: string;
} {
  const variants = [
    {
      prompt: `quero mandar ${amount} xlm pra ${destination.name}`,
      productBehavior: `Criou contato de ${destination.name}, executou pagamento testnet de ${amount} XLM e registrou comprovante.`,
      whatHappened: `Enviou ${amount} XLM para contato`,
      confusion: 'Nenhum feedback humano coletado; atividade gerada por script QA.',
    },
    {
      prompt: `ver saldo e depois enviar ${amount} xlm para ${destination.name}`,
      productBehavior: `Carteira criada, saldo testnet consultável e pagamento de ${amount} XLM confirmado na Stellar testnet.`,
      whatHappened: `Consultou saldo e enviou ${amount} XLM`,
      confusion: 'Nenhum feedback humano coletado; atividade gerada por script QA.',
    },
    {
      prompt: `adicionar ${destination.name} nos contatos e pagar ${amount} xlm`,
      productBehavior: `Contato salvo na lista do usuário e transferência testnet registrada no histórico.`,
      whatHappened: `Salvou contato e pagou ${amount} XLM`,
      confusion: 'Nenhum feedback humano coletado; atividade gerada por script QA.',
    },
    {
      prompt: `mandar dinheiro para ${destination.name} usando minha conta global`,
      productBehavior: `Resolveu destinatário salvo, gerou atividade financeira e confirmou hash testnet.`,
      whatHappened: `Enviou pagamento pela conta global`,
      confusion: 'Nenhum feedback humano coletado; atividade gerada por script QA.',
    },
    {
      prompt: `quero testar histórico depois de pagar ${destination.name}`,
      productBehavior: `Executou pagamento testnet e deixou payment_log disponível para histórico/comprovante.`,
      whatHappened: `Gerou histórico com pagamento testnet`,
      confusion: 'Nenhum feedback humano coletado; atividade gerada por script QA.',
    },
  ];
  return variants[index % variants.length];
}

function buildMarkdown(sessions: QaSession[], runId: string): string {
  const lines: string[] = [];
  lines.push(`# TalkToStellar QA/Testnet Session Log`);
  lines.push('');
  lines.push(`Run ID: \`${runId}\``);
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('Important: this file documents scripted QA/testnet activity. It is useful as product evidence and demo coverage, but it is not a substitute for real user-session feedback. Do not label these rows as real human feedback unless a real person actually ran the session and gave that quote.');
  lines.push('');
  lines.push('## Notion Table');
  lines.push('');
  lines.push('| Usuário | Data | Canal | O que fez | Feedback |');
  lines.push('|---|---|---|---|---|');
  for (const session of sessions) {
    lines.push(`| ${session.userLabel} | ${session.date} | ${session.channel} | ${session.whatHappened} | ${session.feedback} |`);
  }
  lines.push('');
  lines.push('## Session Details');
  lines.push('');
  for (const session of sessions) {
    lines.push(`### ${session.userLabel}`);
    lines.push('');
    lines.push(`- Canal: ${session.channel}`);
    lines.push(`- E-mail QA: ${session.email}`);
    lines.push(`- Session ID: \`${session.sessionId}\``);
    lines.push(`- Wallet: \`${session.publicKey}\``);
    if (session.txHash) {
      lines.push(`- Stellar testnet tx: \`${session.txHash}\``);
      lines.push(`- Explorer: ${session.explorerUrl}`);
    }
    lines.push(`- Frase exata digitada: "${session.exactPrompt}"`);
    lines.push(`- O que o produto fez: ${session.productBehavior}`);
    lines.push(`- Onde travou ou confundiu: ${session.confusion}`);
    lines.push(`- Feedback literal: ${session.feedback}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function buildCsv(sessions: QaSession[]): string {
  const headers = [
    'Usuario',
    'Data',
    'Canal',
    'O que fez',
    'Feedback',
    'Frase exata',
    'O que o produto fez',
    'Onde travou/confundiu',
    'Session ID',
    'User ID',
    'Email',
    'Public Key',
    'Tx Hash',
    'Explorer',
  ];
  const rows = sessions.map((session) => [
    session.userLabel,
    session.date,
    session.channel,
    session.whatHappened,
    session.feedback,
    session.exactPrompt,
    session.productBehavior,
    session.confusion,
    session.sessionId,
    session.userId,
    session.email,
    session.publicKey,
    session.txHash || '',
    session.explorerUrl || '',
  ]);
  return `${[headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

async function createQaWallet(index: number, runId: string, channel: Channel): Promise<QaWallet> {
  const keypair = Keypair.random();
  const padded = String(index + 1).padStart(2, '0');
  const email = `${runId}-user-${padded}@qa.talktostellar.local`;
  const name = `QA User ${padded}`;
  const phoneNumber = `+55119999${String(1000 + index).padStart(4, '0')}`;
  const userId = await insertUserRecord({ email, phoneNumber, publicKey: keypair.publicKey() });
  const sessionId = uuidv4();
  const sessionToken = uuidv4();
  const pixKey = ContactSeedService.derivePixKey(userId, { email, phoneNumber, name });

  await insertAgentSession({
    index,
    userId,
    sessionId,
    sessionToken,
    email,
    name,
    channel,
    phoneNumber,
    pixKey,
    publicKey: keypair.publicKey(),
    keypair,
  });

  return {
    index,
    userId,
    sessionId,
    sessionToken,
    email,
    name,
    channel,
    phoneNumber,
    pixKey,
    publicKey: keypair.publicKey(),
    keypair,
  };
}

async function refreshWalletBalance(wallet: QaWallet): Promise<void> {
  const account = await loadAccountData(wallet.publicKey);
  const { error } = await supabase
    .from('wallets')
    .update({
      balance: Array.isArray((account as any).balances) ? (account as any).balances : [],
      sequence: String((account as any).sequence || ''),
      account_data: account,
      last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', wallet.sessionId);
  if (error) throw new Error(`Failed to refresh wallet ${wallet.email}: ${error.message}`);
}

async function main(): Promise<void> {
  assertTestnetOnlyScript('generate-qa-wallet-activity', horizonUrl);

  const count = parseCount();
  const dryRun = hasFlag('--dry-run');
  const runId = (readArg('--prefix') || `qa-${timestampSlug()}`)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const outDir = path.resolve(repoRoot, readArg('--out') || `docs/qa-session-logs/${runId}`);
  const channels: Channel[] = ['WhatsApp', 'Web', 'Telegram'];

  console.log(`QA wallet activity generator`);
  console.log(`- count: ${count}`);
  console.log(`- run id: ${runId}`);
  console.log(`- horizon: ${horizonUrl}`);
  console.log(`- friendbot: ${friendbotUrl}`);
  console.log(`- out: ${outDir}`);
  console.log(`- dry run: ${dryRun ? 'yes' : 'no'}`);
  console.log('');
  console.log('This creates scripted QA/testnet activity. Do not present it as human user feedback.');
  console.log('');

  if (dryRun) return;

  const wallets: QaWallet[] = [];
  for (let index = 0; index < count; index += 1) {
    const channel = channels[index % channels.length];
    const wallet = await createQaWallet(index, runId, channel);
    wallets.push(wallet);
    console.log(`[${index + 1}/${count}] Created DB session ${wallet.email} ${shortKey(wallet.publicKey)}`);
  }

  for (const [index, wallet] of wallets.entries()) {
    console.log(`[${index + 1}/${count}] Funding ${wallet.email} with Friendbot...`);
    await fundWithFriendbot(wallet.publicKey);
    const vaultSecretId = await tryStoreSecret(wallet.userId, wallet.publicKey, wallet.keypair.secret());
    await insertWallet(wallet, vaultSecretId);
    await sleep(350);
  }

  const sessions: QaSession[] = [];
  for (const [index, wallet] of wallets.entries()) {
    const destination = wallets[(index + 1) % wallets.length];
    const amount = (1 + (index % 5) * 0.25).toFixed(2);
    const scenario = scenarioFor(index, wallet, destination, amount);

    await insertContact(wallet, destination);
    await saveMessage(wallet.sessionId, 'user', scenario.prompt);

    console.log(`[${index + 1}/${count}] Sending ${amount} XLM from ${wallet.email} to ${destination.email}...`);
    const txHash = await submitXlmPayment(wallet.keypair, destination.publicKey, amount, `qa-${index + 1}`);
    const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    const assistantMessage = [
      `Pagamento testnet concluído para ${destination.name}.`,
      `Valor: ${amount} XLM.`,
      `Hash: ${txHash}.`,
      `Histórico atualizado para QA.`,
    ].join('\n');

    await saveMessage(wallet.sessionId, 'assistant', assistantMessage);
    await insertPaymentLog({
      wallet,
      destination,
      amount,
      txHash,
      prompt: scenario.prompt,
      channel: wallet.channel,
    });
    await refreshWalletBalance(wallet);
    await refreshWalletBalance(destination);

    sessions.push({
      userLabel: `User ${String(index + 1).padStart(2, '0')}`,
      date: isoDateOnly(),
      channel: wallet.channel,
      whatHappened: scenario.whatHappened,
      feedback: 'Scripted QA; no human feedback collected.',
      exactPrompt: scenario.prompt,
      productBehavior: `${scenario.productBehavior} Hash testnet: ${txHash}.`,
      confusion: scenario.confusion,
      sessionId: wallet.sessionId,
      userId: wallet.userId,
      email: wallet.email,
      publicKey: wallet.publicKey,
      txHash,
      explorerUrl,
    });
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'session-log.md'), buildMarkdown(sessions, runId));
  fs.writeFileSync(path.join(outDir, 'session-log.csv'), buildCsv(sessions));
  fs.writeFileSync(path.join(outDir, 'wallets-public.json'), JSON.stringify(sessions.map((session) => ({
    user: session.userLabel,
    email: session.email,
    session_id: session.sessionId,
    user_id: session.userId,
    public_key: session.publicKey,
    channel: session.channel,
    tx_hash: session.txHash,
    explorer_url: session.explorerUrl,
  })), null, 2));

  console.log('');
  console.log(`Done. Wrote:`);
  console.log(`- ${path.join(outDir, 'session-log.md')}`);
  console.log(`- ${path.join(outDir, 'session-log.csv')}`);
  console.log(`- ${path.join(outDir, 'wallets-public.json')}`);
  console.log('');
  console.log('Use session-log.md as QA/testnet evidence. For the Instawards user log, keep real human sessions in a separate section.');
}

main().catch((error) => {
  console.error(`\nScript failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
