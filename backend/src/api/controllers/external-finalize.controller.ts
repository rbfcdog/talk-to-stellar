import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../../config/supabase';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletRepository } from '../../repositories/wallet.repository';
import { ExternalRepository } from '../../repositories/external.repository';
import { ContactRepository } from '../../api/repository/contact.repository';
import { VaultService } from '../../services/vault.service';
import { StellarService } from '../services/stellar.service';
import { logger } from '../../utils/logger';
import { Keypair } from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import PasskeyService from '../../services/passkey.service';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);
const externalRepo = new ExternalRepository(supabase);
const vaultService = new VaultService(supabase);

function isValidStellarPublicKey(value?: string) {
  if (!value) return false;
  try {
    Keypair.fromPublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
}

export default class ExternalFinalizeController {
  // POST /api/external/finalize
  // body: { token, name?, email? }
  static async finalize(req: Request, res: Response) {
    try {
      const { token, name, email } = req.body;
      // Accept public_key coming from POST body or URL query (confirm link may include it)
      const publicKeyFromBody = String(req.body?.public_key || req.query?.public_key || '').trim() || undefined;
      if (!token) return res.status(400).json({ success: false, message: 'token is required' });

      let payload: any;
      try {
        payload = jwt.verify(token, getJwtSecret());
      } catch (err: any) {
        return res.status(400).json({ success: false, message: 'Invalid or expired token' });
      }

      const tokenSub = String((payload as any)?.sub || '');
      if (tokenSub === 'external_payment_confirm') {
        const { amount, destination, destination_name, destination_contact, session_id, owner_id } = payload as any;

        if (!amount || !destination || !session_id) {
          return res.status(400).json({ success: false, message: 'token missing payment data' });
        }

        const wallet = await walletRepo.getWalletBySession(String(session_id));
        if (!wallet?.public_key || !wallet?.vault_secret_id) {
          return res.status(400).json({ success: false, message: 'wallet not found for payment confirmation' });
        }

        const session = await agentRepo.getSession(String(session_id));
        if (!session?.user_id) {
          return res.status(400).json({ success: false, message: 'session not found for payment confirmation' });
        }

        const normalize = (value: string) =>
          value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const candidateOwnerIds = Array.from(
          new Set(
            [String(owner_id || ''), String(session.user_id || '')]
              .map((value) => value.trim())
              .filter(Boolean)
          )
        );

        const resolveContactFromOwners = async (query: string): Promise<string | null> => {
          const normalizedQuery = normalize(query);

          for (const candidateOwnerId of candidateOwnerIds) {
            const directMatch = await ContactRepository.findByNameForOwner(candidateOwnerId, query);
            if (directMatch?.stellar_public_key) {
              return String(directMatch.stellar_public_key).trim();
            }

            const contacts = await ContactRepository.findByOwnerId(candidateOwnerId);
            const exactMatch = contacts.find((contact) => {
              const contactName = normalize(String(contact.contact_name || ''));
              return contactName === normalizedQuery;
            });

            if (exactMatch?.stellar_public_key) {
              return String(exactMatch.stellar_public_key).trim();
            }
          }

          return null;
        };

        type ContactCandidate = {
          contact_name: string;
          stellar_public_key: string;
          score: number;
        };

        const buildCandidateList = (contacts: Array<{ contact_name?: string; stellar_public_key?: string }>, query: string) => {
          const normalizedQuery = normalize(query);
          const queryTokens = normalizedQuery.split(' ').filter(Boolean);

          return contacts
            .map((contact) => {
              const contactName = String(contact.contact_name || '').trim();
              const normalizedName = normalize(contactName);
              const nameTokens = normalizedName.split(' ').filter(Boolean);
              const overlap = queryTokens.filter((token) => nameTokens.includes(token)).length;
              const startsWith = normalizedName.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedName);
              const contains = normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName);
              const score = overlap * 3 + (startsWith ? 2 : 0) + (contains ? 1 : 0);

              return {
                contact_name: contactName,
                stellar_public_key: String(contact.stellar_public_key || ''),
                score,
              } as ContactCandidate;
            })
            .filter((candidate) => candidate.score > 0)
            .sort((a, b) => b.score - a.score || a.contact_name.localeCompare(b.contact_name))
            .slice(0, 5);
        };

        const contactFromToken = destination_contact && typeof destination_contact === 'object'
          ? destination_contact
          : undefined;

        let resolvedDestination = String(
          contactFromToken?.stellar_public_key ||
          contactFromToken?.public_key ||
          destination || ''
        ).trim();

        // If frontend provided an explicit public key in the URL or POST body, prefer it
        if (publicKeyFromBody && typeof publicKeyFromBody === 'string' && isValidStellarPublicKey(publicKeyFromBody)) {
          resolvedDestination = publicKeyFromBody.trim();
        }
        const isValidPublicKey = isValidStellarPublicKey(resolvedDestination);

        if (!isValidPublicKey) {
          return res.status(400).json({
            success: false,
            message: 'destination must be a valid Stellar public key (provide `public_key` in the confirm link or token).',
            debug: {
              sessionUserId: String(session.user_id),
              providedDestination: destination_name || destination || null,
              hasDestinationContact: Boolean(contactFromToken),
            },
          });
        }

        if (!isValidStellarPublicKey(resolvedDestination) && contactFromToken) {
          const contactKey = String(contactFromToken.stellar_public_key || contactFromToken.public_key || '').trim();
          if (isValidStellarPublicKey(contactKey)) {
            resolvedDestination = contactKey;
          }
        }

        if (!isValidStellarPublicKey(resolvedDestination)) {
          return res.status(400).json({
            success: false,
            message: `destination is invalid: ${destination_contact?.contact_name || destination_name || destination || 'unknown recipient'}`,
            debug: {
              lookupOwnerIds: candidateOwnerIds,
              sessionUserId: String(session.user_id),
              hasDestinationContact: Boolean(contactFromToken),
            },
          });
        }

        const unsignedXdr = await StellarService.buildPaymentXdr({
          sourcePublicKey: wallet.public_key,
          destination: resolvedDestination,
          amount: String(amount),
          assetCode: 'XLM',
          memoText: `Pagamento para ${destination_contact?.contact_name || destination_name || destination}`,
        });

        const passkeyAuth = req.body?.passkey;
        if (!passkeyAuth?.challenge_id || !passkeyAuth?.credential) {
          return res.status(428).json({
            success: false,
            passkeyRequired: true,
            message: 'Passkey authorization is required before this payment can be signed.',
          });
        }

        try {
          await PasskeyService.verifyTransactionAuthorization({
            token,
            publicKey: publicKeyFromBody,
            challengeId: String(passkeyAuth.challenge_id),
            response: passkeyAuth.credential,
          });
        } catch (error: any) {
          return res.status(401).json({
            success: false,
            passkeyRequired: true,
            message: error?.message || 'Passkey authorization failed',
          });
        }

        const secretKey = await vaultService.getSecret(String(wallet.vault_secret_id));

        // try to lookup destination wallet (if recipient is an existing user in our DB)
        let destinationWallet = null;
        try {
          destinationWallet = await walletRepo.getWalletByPublicKey(resolvedDestination);
        } catch (err) {
          // ignore lookup errors; destination may be external
        }

        const result = await StellarService.signAndSubmitXdr(
          String(session.user_id),
          secretKey,
          unsignedXdr,
          {
            user_id: String(session.user_id),
            type: 'PAYMENT',
            destination_key: resolvedDestination,
            asset_code: 'XLM',
            amount: parseFloat(String(amount)),
            context: `Pagamento para ${destination_contact?.contact_name || destination_name || destination}`,
            source_public_key: wallet.public_key,
            source_session_id: wallet.session_id,
            destination_session_id: destinationWallet?.session_id || undefined,
          }
        );

        if (!result.success) {
          return res.status(400).json({
            success: false,
            message: result.error || 'Could not submit payment',
          });
        }

        return res.status(200).json({
          success: true,
          paymentConfirmed: true,
          sessionId: String(session_id),
          userId: String(session.user_id),
          destination: resolvedDestination,
          destinationName: destination_contact?.contact_name || destination_name || destination,
          amount: String(amount),
          hash: result.hash,
        });
      }

      const { provider, provider_user_id } = payload as any;
      if (!provider || !provider_user_id) {
        return res.status(400).json({ success: false, message: 'token missing provider data' });
      }

      // create deterministic user id for external users, or use email if provided
      const userId = email ? String(email) : `external:${provider}:${provider_user_id}`;

      const existingAccount = await externalRepo.findByProviderAndId(provider, provider_user_id);
      if (existingAccount?.session_id && existingAccount?.user_id) {
        const existingSession = await agentRepo.getSession(String(existingAccount.session_id));
        const existingWallet = await walletRepo.getWalletBySession(String(existingAccount.session_id));

        if (existingSession && existingWallet) {
          return res.status(200).json({
            success: true,
            sessionId: existingAccount.session_id,
            sessionToken: existingSession.session_token,
            userId: existingAccount.user_id,
            publicKey: existingWallet.public_key,
            walletName: existingWallet.name || `Wallet for ${existingAccount.user_id}`,
          });
        }
      }

      let publicKey = '';
      let secretKey = '';

      try {
        const generated = await StellarService.createTestAccount();
        secretKey = generated.secret;
      } catch (error: any) {
        const fallback = StellarService.generateStellarKeypair();
        secretKey = fallback.secret;
        console.warn('[external-finalize] friendbot unavailable, using unfunded generated keypair:', error?.message || error);
      }

      publicKey = Keypair.fromSecret(secretKey).publicKey();

      const vaultSecretId = await vaultService.storeSecret(
        secretKey,
        `wallet:${userId}:private-key`,
        `Stellar private key for wallet ${publicKey}`
      );

      const storedSecretKey = await vaultService.getSecret(vaultSecretId);
      const storedKeypair = Keypair.fromSecret(storedSecretKey);
      publicKey = storedKeypair.publicKey();
      secretKey = storedSecretKey;

      const existingWallet = await walletRepo.getWalletByPublicKey(publicKey);
      if (existingWallet) {
        const existingSession = await agentRepo.getSession(existingWallet.session_id);

        if (existingSession) {
          await externalRepo.createMapping({
            provider,
            provider_user_id,
            session_id: existingWallet.session_id,
            user_id: userId,
          });

          return res.status(200).json({
            success: true,
            sessionId: existingWallet.session_id,
            sessionToken: existingSession.session_token,
            userId,
            publicKey,
            walletName: existingWallet.name || `Wallet for ${userId}`,
          });
        }
      }

      // create session and session token
      const sessionId = uuidv4();
      const sessionToken = uuidv4();

      const now = new Date().toISOString();
      await agentRepo.saveSession(sessionId, {
        user_id: userId,
        email: email || '',
        session_token: sessionToken,
        public_key: publicKey,
        phone_number: undefined,
        created_at: now,
        last_activity: now,
      });

      await walletRepo.saveWallet({
        session_id: sessionId,
        public_key: publicKey,
        vault_secret_id: vaultSecretId,
        name: name || `Wallet for ${userId}`,
      } as any);

      // link external_accounts mapping
      await externalRepo.createMapping({
        provider,
        provider_user_id,
        session_id: sessionId,
        user_id: userId,
      });

      return res.status(201).json({ success: true, sessionId, sessionToken, userId, publicKey, walletName: name || `Wallet for ${userId}` });
    } catch (error: any) {
      const message = error?.message || String(error);
      return res.status(500).json({ success: false, message });
    }
  }
}
