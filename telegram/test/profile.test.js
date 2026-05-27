const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  assertTelegramBotToken,
  configureTelegramBotProfile,
  maskTelegramBotToken,
  normalizeProfileDescription,
  normalizeTelegramBotToken,
  resolveBotProfilePhotoPath,
  verifyTelegramBotToken,
} = require('../src/index');

test('normalizeProfileDescription truncates long bot descriptions', () => {
  assert.equal(normalizeProfileDescription('short', 'fallback', 10), 'short');
  assert.equal(normalizeProfileDescription('', 'fallback', 10), 'fallback');
  assert.equal(normalizeProfileDescription('abcdefghijk', 'fallback', 10), 'abcdefghi');
});

test('resolveBotProfilePhotoPath defaults to bundled avatar asset', () => {
  const resolved = resolveBotProfilePhotoPath();
  assert.equal(path.basename(resolved), 'talktostellar-avatar.jpg');
  assert.ok(fs.existsSync(resolved));
});

test('normalizeTelegramBotToken accepts common copy/paste formats', () => {
  const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';
  assert.equal(normalizeTelegramBotToken(` ${token} `), token);
  assert.equal(normalizeTelegramBotToken(`"${token}"`), token);
  assert.equal(normalizeTelegramBotToken(`bot${token}`), token);
  assert.equal(normalizeTelegramBotToken(`https://api.telegram.org/bot${token}/getMe`), token);
});

test('assertTelegramBotToken rejects malformed deploy values', () => {
  assert.equal(
    assertTelegramBotToken('123456789:abcdefghijklmnopqrstuvwxyzABCDE'),
    '123456789:abcdefghijklmnopqrstuvwxyzABCDE'
  );
  assert.throws(() => assertTelegramBotToken(''), /TELEGRAM_BOT_TOKEN is required/);
  assert.throws(() => assertTelegramBotToken('@talktostellar_bot'), /malformed/);
  assert.throws(() => assertTelegramBotToken('123456789'), /malformed/);
  assert.doesNotMatch(maskTelegramBotToken('123456789:abcdefghijklmnopqrstuvwxyzABCDE'), /abcdefghijklmnopqrstuvwxyzABCDE/);
});

test('verifyTelegramBotToken turns Telegram 401 into an env-specific error', async () => {
  const bot = {
    telegram: {
      getMe: async () => {
        const error = new Error('401: Unauthorized');
        error.response = { error_code: 401, description: 'Unauthorized' };
        throw error;
      },
    },
  };

  await assert.rejects(
    () => verifyTelegramBotToken(bot, {
      botToken: '123456789:abcdefghijklmnopqrstuvwxyzABCDE',
      logger: { log: () => {}, error: () => {} },
    }),
    /TELEGRAM_BOT_TOKEN was rejected by Telegram/
  );
});

test('configureTelegramBotProfile sets photo and descriptions without chat messages', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-profile-'));
  const avatarPath = path.join(tempDir, 'avatar.jpg');
  fs.writeFileSync(avatarPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const originalPhotoPath = process.env.TELEGRAM_PROFILE_PHOTO_PATH;
  const originalSetup = process.env.TELEGRAM_PROFILE_SETUP;
  process.env.TELEGRAM_PROFILE_PHOTO_PATH = avatarPath;
  delete process.env.TELEGRAM_PROFILE_SETUP;

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: true }),
    };
  };

  try {
    const result = await configureTelegramBotProfile({
      botToken: '123:test',
      fetchImpl,
      logger: { log: () => {}, warn: () => {} },
    });

    assert.deepEqual(result, { photo: true, shortDescription: true, description: true });
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /setMyProfilePhoto$/);
    assert.match(calls[1].url, /setMyShortDescription$/);
    assert.match(calls[2].url, /setMyDescription$/);
    assert.doesNotMatch(calls.map((call) => call.url).join('\n'), /sendPhoto|sendMessage/);
  } finally {
    if (originalPhotoPath === undefined) {
      delete process.env.TELEGRAM_PROFILE_PHOTO_PATH;
    } else {
      process.env.TELEGRAM_PROFILE_PHOTO_PATH = originalPhotoPath;
    }
    if (originalSetup === undefined) {
      delete process.env.TELEGRAM_PROFILE_SETUP;
    } else {
      process.env.TELEGRAM_PROFILE_SETUP = originalSetup;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
