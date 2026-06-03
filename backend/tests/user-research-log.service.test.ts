import {
  buildResearchLogFromEvents,
  normalizeResearchNetwork,
  researchLogToCsv,
  researchLogToMarkdown,
  researchLogToNotionBlocks,
  UserResearchRawEvent,
} from '../src/api/services/user-research-log.service';

describe('UserResearchLogService', () => {
  it('normalizes mainnet aliases to PUBLIC', () => {
    expect(normalizeResearchNetwork('mainnet')).toBe('PUBLIC');
    expect(normalizeResearchNetwork('PUBLIC')).toBe('PUBLIC');
    expect(normalizeResearchNetwork('production')).toBe('PUBLIC');
    expect(normalizeResearchNetwork('testnet')).toBe('TESTNET');
  });

  it('builds an honest mainnet export without synthetic users or testnet rows', () => {
    const events: UserResearchRawEvent[] = [
      {
        source: 'research_event',
        sessionId: 'session-real-1',
        userId: 'rodrigo@example.org',
        email: 'rodrigo@example.org',
        channel: 'whatsapp',
        eventName: 'login_completed',
        taskLabel: 'Entrou na conta',
        status: 'success',
        feedbackText: 'foi simples',
        evidenceUrl: 'https://talktostellar.com/receipt/abc',
        stellarNetwork: 'MAINNET',
        createdAt: '2026-06-02T12:00:00.000Z',
      },
      {
        source: 'agent_message',
        sessionId: 'session-real-1',
        userId: 'rodrigo@example.org',
        email: 'rodrigo@example.org',
        channel: 'whatsapp',
        role: 'user',
        content: 'quero receber um pix',
        stellarNetwork: 'PUBLIC',
        createdAt: '2026-06-02T12:01:00.000Z',
      },
      {
        source: 'payment_log',
        sessionId: 'session-real-1',
        userId: 'rodrigo@example.org',
        eventName: 'pix_onramp',
        taskLabel: 'PIX entrada',
        status: 'success',
        transactionHash: 'hash-mainnet-1',
        stellarNetwork: 'PUBLIC',
        createdAt: '2026-06-02T12:02:00.000Z',
        metadata: {
          source_amount: '100.50',
          source_asset_code: 'BRL',
          destination_amount: '100.00',
          destination_asset_code: 'BRL',
          operation_type: 'pix_onramp',
        },
      },
      {
        source: 'research_event',
        sessionId: 'session-testnet',
        userId: 'friend@example.org',
        email: 'friend@example.org',
        channel: 'web',
        eventName: 'balance_viewed',
        status: 'success',
        stellarNetwork: 'TESTNET',
        createdAt: '2026-06-02T13:00:00.000Z',
      },
      {
        source: 'research_event',
        sessionId: 'session-qa',
        userId: 'qa-seed-user',
        email: 'qa-seed@example.com',
        channel: 'web',
        eventName: 'fake_event',
        status: 'success',
        stellarNetwork: 'PUBLIC',
        createdAt: '2026-06-02T14:00:00.000Z',
      },
    ];

    const exportData = buildResearchLogFromEvents(events, { mainnetOnly: true, limitUsers: 15 });

    expect(exportData.realUserCount).toBe(1);
    expect(exportData.excludedSyntheticCount).toBe(1);
    expect(exportData.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('fora da rede PUBLIC'),
      expect.stringContaining('teste/QA'),
      expect.stringContaining('Apenas 1 usuario'),
    ]));
    expect(exportData.entries[0]).toMatchObject({
      userLabel: 'User 01',
      result: 'Sucesso',
      feedbackLiteral: 'foi simples',
      evidence: 'https://talktostellar.com/receipt/abc',
    });
    expect(exportData.entries[0].channel).toContain('WhatsApp');
    expect(exportData.entries[0].prompts).toContain('quero receber um pix');
  });

  it('builds a TESTNET export when requested', () => {
    const exportData = buildResearchLogFromEvents([
      {
        source: 'research_event',
        sessionId: 'session-mainnet',
        userId: 'mainnet-user',
        channel: 'web',
        eventName: 'mainnet_event',
        status: 'success',
        stellarNetwork: 'PUBLIC',
        createdAt: '2026-06-02T12:00:00.000Z',
      },
      {
        source: 'research_event',
        sessionId: 'session-testnet',
        userId: 'friend-real-user',
        channel: 'telegram',
        eventName: 'pix_onramp_completed',
        taskLabel: 'Colocou saldo via PIX',
        status: 'success',
        evidenceUrl: 'https://talktostellar.com/receipt/testnet',
        stellarNetwork: 'TESTNET',
        createdAt: '2026-06-02T13:00:00.000Z',
      },
    ], { network: 'TESTNET' });

    expect(exportData.networkFilter).toBe('TESTNET');
    expect(exportData.mainnetOnly).toBe(false);
    expect(exportData.realUserCount).toBe(1);
    expect(exportData.entries[0]).toMatchObject({
      channel: 'Telegram',
      whatDid: 'Colocou saldo via PIX',
      evidence: 'https://talktostellar.com/receipt/testnet',
    });
  });

  it('does not fabricate feedback when none was recorded', () => {
    const exportData = buildResearchLogFromEvents([
      {
        source: 'research_event',
        sessionId: 'session-real-2',
        userId: 'real-user-2',
        channel: 'web',
        eventName: 'profile_opened',
        taskLabel: 'Abriu perfil',
        status: 'observed',
        stellarNetwork: 'PUBLIC',
        createdAt: '2026-06-02T15:00:00.000Z',
      },
    ]);

    expect(exportData.entries).toHaveLength(1);
    expect(exportData.entries[0].feedbackLiteral).toBe('Sem feedback literal registrado');
  });

  it('formats CSV, Markdown and Notion blocks for the same export', () => {
    const exportData = buildResearchLogFromEvents([
      {
        source: 'research_event',
        sessionId: 'session-real-3',
        userId: 'real-user-3',
        channel: 'telegram',
        eventName: 'history_opened',
        taskLabel: 'Abriu histórico',
        status: 'success',
        evidenceUrl: 'https://talktostellar.com/r/history',
        stellarNetwork: 'PUBLIC',
        createdAt: '2026-06-02T16:00:00.000Z',
      },
    ]);

    const csv = researchLogToCsv(exportData);
    const markdown = researchLogToMarkdown(exportData);
    const notionBlocks = researchLogToNotionBlocks(exportData);

    expect(csv).toContain('"Usuario","Data","Canal"');
    expect(csv).toContain('"Telegram"');
    expect(markdown).toContain('| User 01 |');
    expect(markdown).toContain('Abriu histórico');
    expect(notionBlocks[0]).toMatchObject({ type: 'heading_1' });
    expect(notionBlocks.some((block) => block.type === 'code')).toBe(true);
  });
});
