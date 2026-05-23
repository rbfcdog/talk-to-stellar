const sendTextMock = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../src/api/services/evolution.service', () => ({
  EvolutionService: {
    sendText: (...args: any[]) => sendTextMock(...args),
  },
}));

import { TransferNotificationService } from '../src/api/services/transfer-notification.service';

describe('TransferNotificationService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    sendTextMock.mockReset();
    sendTextMock.mockResolvedValue({ success: true });
    process.env = {
      ...originalEnv,
      EVOLUTION_API_URL: 'http://evolution.local',
      EVOLUTION_API_KEY: 'evolution-key',
      EVOLUTION_INSTANCE: 'main',
      TWILIO_ACCOUNT_SID: '',
      TWILIO_AUTH_TOKEN: '',
      TWILIO_PHONE_NUMBER: '',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sends completion callbacks to WhatsApp through Evolution direct mappings', async () => {
    await TransferNotificationService.notifyExternalChannelMessage({
      provider: 'whatsapp',
      providerUserId: '55 19 98180-8102',
      text: 'PIX confirmado. Seu pagamento foi concluido.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      'PIX confirmado. Seu pagamento foi concluido.',
      { reliable: true }
    );
  });
});
