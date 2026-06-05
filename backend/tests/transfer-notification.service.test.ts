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
import { supabase } from '../src/config/supabase';

describe('TransferNotificationService', () => {
  const originalEnv = process.env;
  const originalAgentRepo = (TransferNotificationService as any).agentRepo;

  beforeEach(() => {
    sendTextMock.mockReset();
    sendTextMock.mockResolvedValue({ success: true });
    (supabase.from as jest.Mock).mockReset();
    (supabase.from as jest.Mock).mockImplementation(() => emptySupabaseSelect());
    (TransferNotificationService as any).agentRepo = originalAgentRepo;
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
    (TransferNotificationService as any).agentRepo = originalAgentRepo;
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

  it('treats AUTHENTICATION_API_KEY as a valid Evolution API key for completion callbacks', async () => {
    process.env.EVOLUTION_API_KEY = '';
    process.env.EVOLUTION_GLOBAL_API_KEY = '';
    process.env.AUTHENTICATION_API_KEY = 'evolution-global-key';

    await TransferNotificationService.notifyExternalChannelMessage({
      provider: 'whatsapp',
      providerUserId: '55 19 98180-8102',
      text: 'Pagamento concluido.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      'Pagamento concluido.',
      { reliable: true }
    );
  });

  it('accepts evolution as a WhatsApp delivery provider alias', async () => {
    await TransferNotificationService.notifyExternalChannelMessage({
      provider: 'evolution',
      providerUserId: '+55 19 98180-8102',
      text: 'Recibo enviado.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      'Recibo enviado.',
      { reliable: true }
    );
  });

  it('converts a receipt button placeholder into a visible receipt URL for WhatsApp', async () => {
    await TransferNotificationService.notifyExternalChannelMessage({
      provider: 'whatsapp',
      providerUserId: '+55 19 98180-8102',
      text: 'PIX confirmado com sucesso.\nComprovante:\nAbrir link',
      buttonText: 'Abrir link',
      buttonUrl: 'https://talktostellar.com/receipt/abc123',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const sentText = String(sendTextMock.mock.calls[0][2] || '');
    expect(sentText).toContain('PIX confirmado com sucesso.');
    expect(sentText).toContain('Comprovante: https://talktostellar.com/receipt/abc123');
    expect(sentText).not.toMatch(/Comprovante:\s*\n\s*Abrir link/i);
    expect(sendTextMock).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      sentText,
      { reliable: true }
    );
  });

  it('infers WhatsApp delivery when a chat callback carries a phone provider id', async () => {
    await TransferNotificationService.notifyExternalChannelMessage({
      provider: 'chat',
      providerUserId: '5519981808102',
      text: 'PIX confirmado e transferencia enviada.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      'PIX confirmado e transferencia enviada.',
      { reliable: true }
    );
  });

  it('uses EVOLUTION_NOTIFY_INSTANCE as a fallback instance name for callbacks', async () => {
    process.env.EVOLUTION_INSTANCE = '';
    process.env.EVOLUTION_INSTANCE_NAME = '';
    process.env.EVOLUTION_NOTIFY_INSTANCE = 'notify-main';

    await TransferNotificationService.notifyExternalChannelMessage({
      provider: 'whatsapp',
      providerUserId: '5519981808102',
      text: 'Pagamento concluido.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'notify-main',
      '5519981808102',
      'Pagamento concluido.',
      { reliable: true }
    );
  });

  it('falls back to user WhatsApp mapping when the browser confirmation session only has a web mapping', async () => {
    (TransferNotificationService as any).agentRepo = {
      getSession: jest.fn(async () => ({ user_id: 'user-1', email: 'user@example.com' })),
    };
    (supabase.from as jest.Mock).mockImplementation(() => externalAccountsBySessionAndUser({
      sessionMappings: [
        { provider: 'web', provider_user_id: 'browser-session-1', data: {} },
      ],
      userMappings: [
        { provider: 'whatsapp', provider_user_id: '55 19 98180-8102', data: {} },
      ],
    }));

    await TransferNotificationService.notifyExternalChannelMessage({
      sessionId: 'browser-session-1',
      userId: 'user-1',
      text: 'Pagamento concluido. Recibo disponivel.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      'Pagamento concluido. Recibo disponivel.',
      { reliable: true }
    );
  });

  it('uses the saved Evolution instance from the WhatsApp mapping before env fallback', async () => {
    process.env.EVOLUTION_INSTANCE = '';
    process.env.EVOLUTION_INSTANCE_NAME = '';
    process.env.EVOLUTION_NOTIFY_INSTANCE = '';
    (TransferNotificationService as any).agentRepo = {
      getSession: jest.fn(async () => ({ user_id: 'user-1', email: 'user@example.com' })),
    };
    (supabase.from as jest.Mock).mockImplementation(() => externalAccountsBySessionAndUser({
      sessionMappings: [],
      userMappings: [
        {
          provider: 'whatsapp',
          provider_user_id: '5519981808102',
          data: {
            instance: 'talktostellar-business',
            remote_jid: '5519981808102@s.whatsapp.net',
          },
        },
      ],
    }));

    const report = await TransferNotificationService.notifyExternalChannelMessage({
      sessionId: 'browser-session-1',
      userId: 'user-1',
      text: 'Pagamento finalizado. Comprovante disponivel.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'talktostellar-business',
      '5519981808102',
      'Pagamento finalizado. Comprovante disponivel.',
      { reliable: true }
    );
    expect(report.whatsapp).toMatchObject({
      attempted: true,
      delivered: 1,
      recipients: 1,
      instances: ['talktostellar-business'],
    });
  });

  it('preserves saved Evolution metadata when a confirmation token also provides a direct WhatsApp mapping', async () => {
    process.env.EVOLUTION_INSTANCE = '';
    process.env.EVOLUTION_INSTANCE_NAME = '';
    process.env.EVOLUTION_NOTIFY_INSTANCE = '';
    (TransferNotificationService as any).agentRepo = {
      getSession: jest.fn(async () => ({ user_id: 'user-1', email: 'user@example.com' })),
    };
    (supabase.from as jest.Mock).mockImplementation(() => externalAccountsBySessionAndUser({
      sessionMappings: [],
      userMappings: [
        {
          provider: 'whatsapp',
          provider_user_id: '5519981808102',
          data: {
            instance: 'talktostellar-business',
            remote_jid: '5519981808102@s.whatsapp.net',
          },
        },
      ],
    }));

    const report = await TransferNotificationService.notifyExternalChannelMessage({
      sessionId: 'browser-session-1',
      userId: 'user-1',
      provider: 'whatsapp',
      providerUserId: '5519981808102',
      text: 'Pagamento confirmado. Comprovante disponivel.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'talktostellar-business',
      '5519981808102',
      'Pagamento confirmado. Comprovante disponivel.',
      { reliable: true }
    );
    expect(report.whatsapp.instances).toEqual(['talktostellar-business']);
  });

  it('does not prefer the Evolution UUID over the configured sendable instance name', async () => {
    process.env.EVOLUTION_INSTANCE = 'TalkToStellar';
    process.env.EVOLUTION_INSTANCE_NAME = '';
    process.env.EVOLUTION_NOTIFY_INSTANCE = '';
    (TransferNotificationService as any).agentRepo = {
      getSession: jest.fn(async () => ({ user_id: 'user-1', email: 'user@example.com' })),
    };
    (supabase.from as jest.Mock).mockImplementation(() => externalAccountsBySessionAndUser({
      sessionMappings: [],
      userMappings: [
        {
          provider: 'whatsapp',
          provider_user_id: '5519997624114',
          data: {
            instance: '635afaa8-b4d2-4e04-8b35-3093d16ba1af',
            instance_id: '635afaa8-b4d2-4e04-8b35-3093d16ba1af',
            remote_jid: '5519997624114@s.whatsapp.net',
          },
        },
      ],
    }));

    const report = await TransferNotificationService.notifyExternalChannelMessage({
      sessionId: 'browser-session-1',
      userId: 'user-1',
      text: 'Pagamento confirmado. Comprovante disponivel.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'TalkToStellar',
      '5519997624114',
      'Pagamento confirmado. Comprovante disponivel.',
      { reliable: true }
    );
    expect(report.whatsapp.instances).toEqual([
      'TalkToStellar',
      '635afaa8-b4d2-4e04-8b35-3093d16ba1af',
    ]);
  });

  it('can notify WhatsApp from a user_id-only callback diagnostic request', async () => {
    process.env.EVOLUTION_INSTANCE = '';
    process.env.EVOLUTION_INSTANCE_NAME = '';
    process.env.EVOLUTION_NOTIFY_INSTANCE = '';
    (supabase.from as jest.Mock).mockImplementation(() => externalAccountsBySessionAndUser({
      sessionMappings: [],
      userMappings: [
        {
          provider: 'whatsapp',
          provider_user_id: '5519981808102',
          data: {
            instance: 'talktostellar-business',
            remote_jid: '5519981808102@s.whatsapp.net',
          },
        },
      ],
    }));

    const report = await TransferNotificationService.notifyExternalChannelMessage({
      userId: 'user-1',
      text: 'Teste por usuario.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'talktostellar-business',
      '5519981808102',
      'Teste por usuario.',
      { reliable: true }
    );
    expect(report.whatsapp).toMatchObject({
      attempted: true,
      delivered: 1,
      recipients: 1,
      instances: ['talktostellar-business'],
    });
  });

  it('can recover the WhatsApp recipient from mapping data remote_jid', async () => {
    process.env.EVOLUTION_INSTANCE = '';
    process.env.EVOLUTION_NOTIFY_INSTANCE = 'notify-main';
    (TransferNotificationService as any).agentRepo = {
      getSession: jest.fn(async () => ({ user_id: 'user-1', email: 'user@example.com' })),
    };
    (supabase.from as jest.Mock).mockImplementation(() => externalAccountsBySessionAndUser({
      sessionMappings: [],
      userMappings: [
        {
          provider: 'whatsapp',
          provider_user_id: 'wa-row-id-without-phone',
          data: {
            remote_jid: '5519981808102@s.whatsapp.net',
          },
        },
      ],
    }));

    await TransferNotificationService.notifyExternalChannelMessage({
      sessionId: 'browser-session-1',
      userId: 'user-1',
      text: 'PIX confirmado e envio concluido.',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'notify-main',
      '5519981808102',
      'PIX confirmado e envio concluido.',
      { reliable: true }
    );
  });

  it('still sends welcome to WhatsApp when the session intro was already saved', async () => {
    (TransferNotificationService as any).agentRepo = {
      getSession: jest.fn(async () => ({ user_id: 'user-1', email: 'user@example.com' })),
      saveMessageOnce: jest.fn(async () => false),
    };

    await TransferNotificationService.notifySessionWelcome({
      sessionId: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      provider: 'whatsapp',
      providerUserId: '5519981808102',
      name: 'User Example',
      language: 'pt-BR',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      expect.stringContaining('Conta conectada'),
      { reliable: true }
    );
  });

  it('sends one welcome when it wins the session intro dedupe key', async () => {
    (TransferNotificationService as any).agentRepo = {
      getSession: jest.fn(async () => ({ user_id: 'user-1', email: 'user@example.com' })),
      saveMessageOnce: jest.fn(async () => true),
    };

    await TransferNotificationService.notifySessionWelcome({
      sessionId: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      provider: 'whatsapp',
      providerUserId: '5519981808102',
      name: 'User Example',
      language: 'pt-BR',
    });

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      expect.stringContaining('Conta conectada'),
      { reliable: true }
    );
  });
});

function emptySupabaseSelect() {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return chain;
}

function externalAccountsBySessionAndUser(input: {
  sessionMappings: any[];
  userMappings: any[];
}) {
  const chain: any = {};
  let selectedColumn = '';
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn((column: string) => {
    selectedColumn = column;
    return chain;
  });
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({
      data: selectedColumn === 'user_id' ? input.userMappings : input.sessionMappings,
      error: null,
    }).then(resolve, reject);
  return chain;
}
