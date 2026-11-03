import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:1/test';
process.env.BOT_TOKEN = 'test';
process.env.JWT_SECRET = 'test-secret-for-registration-qr-tests';
process.env.FRONTEND_URL = 'https://app.example.com';
process.env.TELEGRAM_BOT_USERNAME = '@FlopClubBot';
process.env.TELEGRAM_APP_NAME = '';
const { prisma } = await import('../dist/prisma.js');
const { buildCheckInUrl, buildRegistrationCaption, sendRegistrationQr } = await import('../dist/services/telegramRegistrationQr.js');

const tournament = { title: 'Flop Phoenix', startsAt: new Date('2026-11-05T12:00:00Z') };
let registration;
let requests;
let response;
let deactivated;
prisma.registration.findUnique = async () => registration;
prisma.telegramSubscriber.updateMany = async ({ where }) => { deactivated.push(where.chatId); return { count: 1 }; };
globalThis.fetch = async (url, options) => { requests.push({ url, body: options.body }); return response; };

beforeEach(() => {
  registration = { status: 'ACTIVE', checkInToken: 'token-1', entryNumber: 1, user: { telegramId: '555' }, tournament };
  requests = [];
  deactivated = [];
  response = { ok: true, status: 200, text: async () => '' };
});

test('check-in URL matches the format handled by the Mini App', () => {
  assert.equal(buildCheckInUrl('abc-123'), 'https://t.me/FlopClubBot?startapp=checkin_abc-123');
});

test('every tournament gets the agreed caption format', () => {
  for (const title of ['Flop Phoenix', 'FLOP DEVIL DEAL', 'Flop Bounty']) {
    assert.equal(buildRegistrationCaption({ entryNumber: 1, tournament: { title, startsAt: tournament.startsAt } }), [
      'Запись на турнир подтверждена ✅',
      `<b>${title.toUpperCase()}</b>`,
      '',
      '<blockquote>📅 четверг, 5 ноября, 19:00',
      '📍 Flop Club, Барнаул, Геблера 33б</blockquote>',
      '',
      'Покажи этот QR-код на входе — открывать приложение не нужно.',
      '',
      'Удачи в игре! 🍀'
    ].join('\n'));
  }
});

test('sends the player a PNG QR with the formatted caption', async () => {
  await sendRegistrationQr('registration-1');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/bottest\/sendPhoto$/);
  const { body } = requests[0];
  assert.equal(body.get('chat_id'), '555');
  const caption = body.get('caption');
  assert.equal(body.get('parse_mode'), 'HTML');
  assert.match(caption, /<b>FLOP PHOENIX<\/b>/);
  const photo = Buffer.from(await body.get('photo').arrayBuffer());
  assert.equal(photo.subarray(1, 4).toString(), 'PNG');
  assert.equal(JSON.parse(body.get('reply_markup')).inline_keyboard[0][0].web_app.url, 'https://app.example.com');
});

test('re-entry message names the entry number', async () => {
  registration.entryNumber = 2;
  await sendRegistrationQr('registration-1');
  assert.match(requests[0].body.get('caption'), /^Re-entry подтверждён ✅ Вход №2/);
});

test('tournament text cannot break the HTML caption', async () => {
  registration.tournament = { ...tournament, title: 'Flop <A&B>' };
  await sendRegistrationQr('registration-1');
  assert.match(requests[0].body.get('caption'), /<b>FLOP &lt;A&amp;B&gt;<\/b>/);
});

test('a registration cancelled before delivery gets no message', async () => {
  registration.status = 'CANCELLED';
  await sendRegistrationQr('registration-1');
  assert.equal(requests.length, 0);
});

test('a player unreachable by the bot is deactivated and the error surfaces', async () => {
  response = { ok: false, status: 403, text: async () => 'Forbidden: bot was blocked by the user' };
  await assert.rejects(sendRegistrationQr('registration-1'), /sendPhoto failed: 403/);
  assert.deepEqual(deactivated, ['555']);
});
