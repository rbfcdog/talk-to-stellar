import { PinResetService } from '../src/api/services/core/pin-reset.service';
import { EmailConfirmationService } from '../src/api/services/email-confirmation.service';

describe('PinResetService email delivery', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.FRONTEND_URL = 'https://talktostellar.com';
    jest.clearAllMocks();
    jest.spyOn(EmailConfirmationService, 'sendTransactional').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('sends the PIN reset link to the account email', async () => {
    const result = await PinResetService.generateResetToken('user-1', 'session-1', {
      email: 'USER@example.com',
      language: 'pt-BR',
    });

    expect(result.email_sent).toBe(true);
    expect(result.masked_email).toBe('u**r@example.com');
    expect(result.reset_url).toContain('https://talktostellar.com/change-pin?token=');
    expect(EmailConfirmationService.sendTransactional).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      subject: expect.stringContaining('PIN'),
      text: expect.stringContaining(result.reset_url),
      html: expect.stringContaining(result.reset_url),
    }));
  });
});
