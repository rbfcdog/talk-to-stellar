import { AnchorService } from './anchor.service';
import { InternationalTransfer } from './international-transfer.types';

export type PixFundingIntent = {
  provider: 'etherfuse';
  pix_payment_id?: string;
  pix_order_id: string;
  operation_id?: string;
  status: string;
  payment_instructions?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export class PixFundingService {
  async createPixIntent(input: {
    transfer: InternationalTransfer;
    session_id: string;
    session_token: string;
    email?: string;
  }): Promise<PixFundingIntent> {
    if (!input.session_id || !input.session_token) {
      throw new Error('session_id and session_token are required to create a Pix funding intent.');
    }

    const auth = {
      session_id: input.session_id,
      session_token: input.session_token,
    };
    const customerResult = await AnchorService.createCustomerForSession({
      ...auth,
      country: 'BR',
      email: input.email || input.transfer.sender_identity.email,
    });
    const quoteResult = await AnchorService.getQuoteForSession({
      ...auth,
      customer_id: customerResult.customer.id,
      direction: 'onramp',
      from_currency: 'BRL',
      to_currency: 'TESOURO',
      final_asset: 'USDC',
      amount: input.transfer.brl_amount,
    });
    const orderResult = await AnchorService.createOnRampForSession({
      ...auth,
      intent_id: input.transfer.transfer_id,
      customer_id: customerResult.customer.id,
      quote_id: quoteResult.quote.id,
      amount: input.transfer.brl_amount,
      expected_to_amount: quoteResult.quote.toAmount,
      from_currency: 'BRL',
      to_currency: 'TESOURO',
      final_asset: 'USDC',
    });

    return {
      provider: 'etherfuse',
      pix_payment_id: orderResult.transaction.id,
      pix_order_id: orderResult.transaction.id,
      operation_id: orderResult.operation_id,
      status: String(orderResult.transaction.status || 'pending'),
      payment_instructions: orderResult.transaction.paymentInstructions as Record<string, unknown> | undefined,
      raw: {
        customer: customerResult.customer,
        quote: orderResult.quote || quoteResult.quote,
        transaction: orderResult.transaction,
        operation_id: orderResult.operation_id,
        trustline: orderResult.trustline,
        final_trustline: orderResult.final_trustline,
      },
    };
  }
}

export const pixFundingService = new PixFundingService();
