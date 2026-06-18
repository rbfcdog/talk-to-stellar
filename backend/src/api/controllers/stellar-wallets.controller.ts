import { Request, Response } from 'express';
import { Keypair, Operation, Asset, TransactionBuilder, Networks } from '@stellar/stellar-sdk';
import { server, stellarConfig } from '../../config/stellar';
import { supabase } from '../../config/supabase';
import { PUBLIC_USDC_ISSUER, TESTNET_USDC_ISSUER } from '../../config/assets';

const SPONSOR_SECRET = process.env.STELLAR_WALLET_SPONSOR_SECRET;
const BASE_FEE = '100';

// XLM given to each newly created wallet:
//  1.0 base reserve (account)
//  0.5 base reserve (USDC trustline entry)
//  0.5 buffer for fees
const STARTING_BALANCE = '2.0';

async function sponsorNewAccount(newPublicKey: string, newSecret: string): Promise<{ funded: boolean; trustline: boolean; error?: string }> {
  if (!SPONSOR_SECRET) {
    return { funded: false, trustline: false, error: 'STELLAR_WALLET_SPONSOR_SECRET not configured' };
  }

  const usdcIssuer = stellarConfig.network === Networks.PUBLIC ? PUBLIC_USDC_ISSUER : TESTNET_USDC_ISSUER;
  const sponsorKeypair = Keypair.fromSecret(SPONSOR_SECRET);

  try {
    // Step 1 — sponsor creates the new account
    const sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
    const createTx = new TransactionBuilder(sponsorAccount, {
      fee: BASE_FEE,
      networkPassphrase: stellarConfig.network,
    })
      .addOperation(Operation.createAccount({ destination: newPublicKey, startingBalance: STARTING_BALANCE }))
      .setTimeout(60)
      .build();

    createTx.sign(sponsorKeypair);
    await server.submitTransaction(createTx);

    // Step 2 — wait for account to appear on-ledger
    for (let i = 0; i < 10; i++) {
      try { await server.loadAccount(newPublicKey); break; } catch { await new Promise(r => setTimeout(r, 500)); }
    }

    // Step 3 — new account signs its own trustline (no third-party can sign this)
    const newAccount = await server.loadAccount(newPublicKey);
    const newKeypair = Keypair.fromSecret(newSecret);
    const trustTx = new TransactionBuilder(newAccount, {
      fee: BASE_FEE,
      networkPassphrase: stellarConfig.network,
    })
      .addOperation(Operation.changeTrust({ asset: new Asset('USDC', usdcIssuer) }))
      .setTimeout(60)
      .build();

    trustTx.sign(newKeypair);
    await server.submitTransaction(trustTx);

    return { funded: true, trustline: true };
  } catch (e: any) {
    const msg = e?.response?.data?.extras?.result_codes
      ? JSON.stringify(e.response.data.extras.result_codes)
      : String(e?.message || e);
    return { funded: false, trustline: false, error: msg };
  }
}

export const StellarWalletsController = {
  async createWallet(req: Request, res: Response) {
    const { user_id, label } = req.body as { user_id?: string; label?: string };
    if (!user_id) return res.status(400).json({ success: false, message: 'user_id required' });

    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const secret = keypair.secret();

    const { funded, trustline, error: sponsorError } = await sponsorNewAccount(publicKey, secret);

    const { error: dbError } = await supabase.from('user_stellar_wallets').insert({
      user_id,
      label: label || null,
      public_key: publicKey,
      is_funded: funded,
      has_usdc_trustline: trustline,
    });

    if (dbError) {
      return res.status(500).json({ success: false, message: dbError.message });
    }

    return res.json({
      success: true,
      wallet: { public_key: publicKey, is_funded: funded, has_usdc_trustline: trustline, label },
      // Secret shown exactly once — not stored anywhere
      secret,
      sponsor_note: funded
        ? 'Wallet funded and USDC trustline added — ready for Bridge.'
        : `Wallet created (unfunded). ${sponsorError ? sponsorError + '. ' : ''}Fund with ≥2 XLM and add USDC trustline before using with Bridge.`,
    });
  },

  async listWallets(req: Request, res: Response) {
    const user_id = req.query.user_id as string;
    if (!user_id) return res.status(400).json({ success: false, message: 'user_id required' });

    const { data, error } = await supabase
      .from('user_stellar_wallets')
      .select('id, user_id, label, public_key, is_funded, has_usdc_trustline, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, wallets: data || [] });
  },

  async deleteWallet(req: Request, res: Response) {
    const { id } = req.params;
    const user_id = req.query.user_id as string;
    if (!user_id) return res.status(400).json({ success: false, message: 'user_id required' });

    const { error } = await supabase
      .from('user_stellar_wallets')
      .delete()
      .eq('id', id)
      .eq('user_id', user_id);

    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true });
  },
};
