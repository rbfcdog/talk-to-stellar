import { IdentityProfile, SameNameMatchStatus, UsdBankDestination } from './international-transfer.types';

function normalizeName(value?: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltda|llc|inc|corp|corporation|sa|s\.a\.|me|eireli)\b/gi, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function identityName(identity: IdentityProfile): string {
  return normalizeName(identity.legal_name || identity.entity_name);
}

export class IdentityAlignmentService {
  static evaluateSameName(input: {
    senderIdentity: IdentityProfile;
    recipientIdentity: IdentityProfile;
    payoutDestination: UsdBankDestination;
    sameNameRequired?: boolean;
  }): {
    same_name_payout_required: boolean;
    same_name_match_status: SameNameMatchStatus;
    identity_risk_notes: string[];
  } {
    const sameNameRequired = input.sameNameRequired !== false;
    const senderName = identityName(input.senderIdentity);
    const institutionName = normalizeName(input.senderIdentity.entity_name);
    const recipientName = identityName(input.recipientIdentity);
    const destinationOwner = normalizeName(input.payoutDestination.accountHolderName);
    const notes: string[] = [];

    if (!sameNameRequired) {
      notes.push('Same-name payout not required for this transfer policy.');
    }

    if (!destinationOwner) {
      notes.push('Destination account holder name is missing.');
      return {
        same_name_payout_required: sameNameRequired,
        same_name_match_status: 'UNKNOWN',
        identity_risk_notes: notes,
      };
    }

    const candidates = [
      senderName ? { label: 'sender legal name', value: senderName } : null,
      institutionName ? { label: 'institution/entity name', value: institutionName } : null,
      recipientName ? { label: 'recipient legal name', value: recipientName } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;

    if (!candidates.length) {
      notes.push('No sender, institution or recipient legal name was provided for payout owner comparison.');
      return {
        same_name_payout_required: sameNameRequired,
        same_name_match_status: 'UNKNOWN',
        identity_risk_notes: notes,
      };
    }

    const matched = candidates.find((candidate) => candidate.value === destinationOwner);
    if (matched) {
      notes.push(`Destination owner matches ${matched.label}.`);
      return {
        same_name_payout_required: sameNameRequired,
        same_name_match_status: 'MATCHED',
        identity_risk_notes: notes,
      };
    }

    notes.push('Destination account holder name does not match sender, institution or recipient identity exactly.');
    notes.push('Do not block automatically; route to compliance/manual review when policy requires it.');
    return {
      same_name_payout_required: sameNameRequired,
      same_name_match_status: 'MISMATCHED',
      identity_risk_notes: notes,
    };
  }
}
