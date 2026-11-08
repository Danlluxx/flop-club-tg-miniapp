import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:1/test';
process.env.BOT_TOKEN = 'test';
process.env.JWT_SECRET = 'test-secret-for-publication-tests';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.TELEGRAM_RATING_CHAT_ID = '@flopclub';
const { prisma } = await import('../dist/prisma.js');
const { Prisma } = await import('@prisma/client');
const { getTournamentRatingText, publishTournamentRatingResults, splitRatingMessage, premiumEmojiEntities } = await import('../dist/services/telegramRatingResults.js');
const user = { displayName: 'Игрок <&>', username: 'player', firstName: null, lastName: null, telegramId: '1' };
let tournament = { title: 'Flop Classic', startsAt: new Date('2026-10-23T18:00:00Z'), registrations: [
  { userId: '1', user, finishPlace: 1, createdAt: new Date() },
  { userId: '2', user: { ...user, displayName: 'Второй' }, finishPlace: 8, createdAt: new Date() }
], ratingResults: [{ userId: '1', user, place: 1, points: 3300, knockouts: 900, chipLeaderBonus: 0 }], chipLeaderAward: { userId: '2', points: 2000 } };
const states = new Map();
let sent = [];
let fail = false;
prisma.tournament.findUnique = async () => tournament;
prisma.telegramSubscriber.findFirst = async () => ({ chatId: '12345' });
prisma.telegramBotState.create = async ({data}) => {
  if (states.has(data.key)) throw new Prisma.PrismaClientKnownRequestError('duplicate', {code:'P2002',clientVersion:'5'});
  states.set(data.key, data); return data;
};
prisma.telegramBotState.updateMany = async () => ({ count: 0 });
prisma.telegramBotState.findUnique = async ({where}) => states.get(where.key) ?? null;
prisma.telegramBotState.findFirst = async ({where}) => [...states.values()].find(s => s.key.startsWith(where.key.startsWith) && s.key !== where.key.not && s.value === where.value) ?? null;
prisma.telegramBotState.upsert = async ({where,create}) => { if (!states.has(where.key)) states.set(where.key,create); return states.get(where.key); };
prisma.telegramBotState.update = async ({where,data}) => { states.set(where.key,{key:where.key,...data}); return data; };
prisma.telegramBotState.deleteMany = async ({where}) => { if(states.get(where.key)?.value===where.value) states.delete(where.key); return {count:1}; };
globalThis.fetch = async (_url,options) => { if(fail) throw Error('offline'); sent.push(JSON.parse(options.body)); return {ok:true,json:async()=>({ok:true})}; };

test('date, literal names, bounty and independent chip leader award', async () => {
  const text = await getTournamentRatingText('test');
  assert.match(text, /24\.10\.2026/);
  assert.match(text, /Игрок <&> \(4.200⚡️\)/);
  assert.match(text, /8 - Второй \(2.000⚡️\)/);
});
test('bounty template lists placement and bounty points apart', async () => {
  const original = tournament;
  tournament = { ...original, title: 'Flop Bounty', ratingResults: [{ userId: '1', user, place: 1, points: 3300, knockouts: 0, chipLeaderBonus: 0 }],
    registrations: original.registrations, chipLeaderAward: null,
    gameEvents: [{ userId: '1', ratingPoints: 900 }, { userId: '2', ratingPoints: 100 }] };
  const text = await getTournamentRatingText('test');
  assert.match(text, /^\u{1F31F}{5}\n\n\u{1F965} FLOP BOUNTY \u{1F965}\n\n/u);
  assert.match(text, /\u{1F451} - Игрок <&> \(3.300\u26A1\uFE0F\) \(\+900\u{1F94A}\)/u);
  assert.match(text, /8 - Второй \(\+100\u{1F94A}\)/u);
  assert.doesNotMatch(text, /Второй \(.*\u26A1/u);
  assert.match(text, /━━━━━━━━━━━━━\n\n\u26A1\uFE0F — рейтинговые очки за место\n\u{1F94A} — бонусные очки за выбивания$/u);
  const entities = premiumEmojiEntities(text);
  const ids = entities.map((entity) => entity.custom_emoji_id);
  assert.equal(entities.filter((entity) => text.slice(entity.offset, entity.offset + entity.length) === '\u{1F31F}').length, 5);
  assert.deepEqual(ids.filter((id) => id === '5395608259656709199').length, 2);
  assert.ok(ids.includes('5260367375957516164') && ids.includes('5231406626228948265') && ids.includes('5429249222362810005'));
  assert.deepEqual(entities.map((entity) => entity.offset), [...entities.map((entity) => entity.offset)].sort((x, y) => x - y));
  for (const entity of entities) assert.equal(entity.length, 2);
  tournament = original;
});
test('delivery deduplication, updates and retry after failure', async () => {
  assert.equal(await publishTournamentRatingResults('test'),true);
  assert.equal(await publishTournamentRatingResults('test'),false);
  assert.equal(sent.length,1);
  tournament.ratingResults[0].points=3400;
  fail=true;
  await assert.rejects(publishTournamentRatingResults('test'),/offline/);
  fail=false;
  assert.equal(await publishTournamentRatingResults('test'),true);
  assert.match(sent[1].text,/^Обновлённые результаты/);
  assert.equal(sent[1].chat_id,'12345');
});
test('long messages retain unicode and fit Telegram limits', () => {
  const text = Array.from({length:200},(_,i)=>`${i} - Игрок 👑 ${'x'.repeat(50)}`).join('\n');
  const parts=splitRatingMessage(text);
  assert.ok(parts.length>1);
  assert.ok(parts.every(p=>p.length<=3900));
  assert.equal(parts.join('\n'),text);
});
