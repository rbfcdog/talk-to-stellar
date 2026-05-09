import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import ExternalService from '../../services/external.service';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletRepository } from '../../repositories/wallet.repository';
import PasskeyService from '../../services/passkey.service';

const externalService = new ExternalService(supabase);
const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);

async function hasOnboardingCredentials(sessionId: string, userId: string): Promise<boolean> {
  const session = await agentRepo.getSession(sessionId);
  if (!session) {
    return false;
  }

  if (String((session as any).password_hash || '').trim()) {
    return true;
  }

  try {
    const passkeys = await PasskeyService.getUserPasskeys(userId);
    return passkeys.length > 0;
  } catch {
    return false;
  }
}

export class ExternalController {
  // POST /api/external/check-account
  static async checkAccount(req: Request, res: Response) {
    try {
      const { provider } = req.body;
      const normalizeExternalId = (prov: string, value: string) => {
        if (String(prov || '').toLowerCase() === 'whatsapp' || String(prov || '').toLowerCase() === 'phone') {
          return String(value || '').replace(/\D+/g, '');
        }
        return String(value || '').trim();
      };
      const provider_user_id = normalizeExternalId(String(provider || ''), String(req.body?.provider_user_id || ''));

      if (!provider || !provider_user_id) {
        return res.status(400).json({ success: false, message: 'provider and provider_user_id required' });
      }

      let existing = null;
      try {
        existing = await externalService.checkExternalAccount(provider, provider_user_id);
        if (!existing && String(provider).toLowerCase() === 'whatsapp') {
          existing = await externalService.checkExternalAccount('phone', provider_user_id);
        }
      } catch (error: any) {
        const message = String(error?.message || '').toLowerCase();
        const isMissingExternalTable =
          message.includes("could not find the table 'public.external_accounts' in the schema cache") ||
          message.includes('relation "external_accounts" does not exist') ||
          message.includes('relation public.external_accounts does not exist');

        if (!isMissingExternalTable) {
          throw error;
        }
      }

      if (existing) {
        const hasLinkedSession = Boolean(existing.session_id);
        const hasLinkedUser = Boolean(existing.user_id);
        let linkedWallet = null;
        let hasCredentials = false;

        if (hasLinkedSession) {
          try {
            linkedWallet = await walletRepo.getWalletBySession(String(existing.session_id));
            if (linkedWallet && hasLinkedUser) {
              hasCredentials = await hasOnboardingCredentials(String(existing.session_id), String(existing.user_id));
            }
          } catch (error: any) {
            const message = String(error?.message || '').toLowerCase();
            if (!message.includes("could not find the table 'public.wallets' in the schema cache") &&
                !message.includes('relation "wallets" does not exist') &&
                !message.includes('relation public.wallets does not exist')) {
              throw error;
            }
          }
        }

        if (hasLinkedSession && hasLinkedUser && linkedWallet && hasCredentials) {
          return res.status(200).json({
            success: true,
            exists: true,
            sessionId: existing.session_id,
            userId: existing.user_id,
            data: existing.data || {},
          });
        }
      }

      const { token, url } = externalService.createOnboardUrl(provider, provider_user_id);

      return res.status(200).json({
        success: true,
        exists: false,
        onboardingRequired: true,
        reason: 'missing_credentials',
        creationUrl: url,
        token,
      });
    } catch (error: any) {
      const message = error?.message || String(error);
      return res.status(500).json({ success: false, message });
    }
  }
}

export default ExternalController;
