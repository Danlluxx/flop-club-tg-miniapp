import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';

// Never reads DATABASE_URL from .env. Tests only use an explicitly selected isolated database.
const url = process.env.TEST_DATABASE_URL;
if (!url || !/^postgresql:\/\/[^@]+@(?:localhost|127\.0\.0\.1):55439\/flop_devil_test(?:\?|$)/.test(url)) throw new Error('Set TEST_DATABASE_URL to isolated local flop_devil_test on port 55439');
Object.assign(process.env, { DATABASE_URL: url, NODE_ENV: 'test', BOT_TOKEN: 'local-test', JWT_SECRET: 'devil-integration-test-secret-32chars', FRONTEND_URL: 'http://localhost:5173', ADMIN_TELEGRAM_USERNAMES: 'danlluxx' });
const { prisma } = await import('../dist/prisma.js');
const { mechanicsSchema, devilDealDefaults, resurrectionOutcome, assertMechanicsOpen } = await import('../dist/services/tournamentMechanics.js');
const { registerForTournament, cancelRegistration } = await import('../dist/services/tournaments.js');
const { checkInTournamentRegistration } = await import('../dist/services/liveTournament.js');
const { eliminateDevil, resurrect, awardDevilBounty, awardSixes, setBlindLevel, reverseAward, getDevilState, issueDevilAddOn, removeDevilAddOn, issuePaidDevilReEntry } = await import('../dist/services/devilDeal.js');
const { applyTournamentRatingResults } = await import('../dist/services/rating.js');
const { devilDealRouter, devilControlRouter } = await import('../dist/routes/devilDeal.js');
const { ratingRouter } = await import('../dist/routes/rating.js');
const { tournamentsRouter } = await import('../dist/routes/tournaments.js');
const { errorHandler } = await import('../dist/middleware/errorHandler.js');
const app = express(); app.use(express.json());
app.use('/api/tournaments/:id/devil', devilDealRouter);
app.use('/api/admin/tournaments/:id/devil', devilControlRouter);
app.use('/api/tournaments', tournamentsRouter); app.use('/api/rating', ratingRouter); app.use(errorHandler);
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const prefix = 'devil-test-' + randomUUID(); let seq = 0;
const admin = await prisma.user.create({ data: { telegramId: prefix + '-admin', username: 'danlluxx', role: 'ADMIN' } });
after(async () => { server.close(); await prisma.$disconnect(); });
async function request(path, user, body, method = body === undefined ? 'GET' : 'POST') {
  return fetch(base + path, { method, headers: { Authorization: `Bearer ${jwt.sign({ userId: user.id }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function setup(outcome = 'DEATH', options = {}) {
  seq++;
  const probabilities = { death: outcome === 'DEATH' ? 1 : 0, fiveBB: outcome === 'RESURRECT_5' ? 1 : 0, tenBB: outcome === 'RESURRECT_10' ? 1 : 0 };
  const rules = structuredClone(devilDealDefaults); rules.registrationClosesAt = new Date(Date.now() + 3600000).toISOString(); rules.resurrection.probabilities = probabilities;
  const t = await prisma.tournament.create({ data: { title: 'FLOP DEVIL DEAL', description: 'Test', startsAt: new Date(Date.now() - 60000), location: 'Local test', buyIn: 0, reEntry: 0, prizePool: 0, maxParticipants: 50, mechanics: rules, ...options } });
  const users = await Promise.all([0,1,2].map(i => prisma.user.create({ data: { telegramId: `${prefix}-${seq}-${i}`, displayName: `Игрок ${i}` } })));
  const regs = [];
  for (const u of users) { const r = await registerForTournament(u.id, t.id); regs.push(await checkInTournamentRegistration(r.checkInToken)); }
  return { t, users, regs };
}
async function eliminate(f, index=0) { return eliminateDevil(f.t.id, f.regs[index].id, f.regs[index].lifeNumber, admin.id); }
async function bounty(f, index=1) { return awardDevilBounty(f.t.id, f.regs[index].id, randomUUID(), admin.id); }
async function close(f) { const rules = { ...f.t.mechanics, registrationClosesAt: new Date(Date.now() - 1000).toISOString() }; await prisma.tournament.update({ where: { id: f.t.id }, data: { mechanics: rules } }); }

test('configuration validates probabilities, precision, unknown keys and required fields', () => {
  assert.ok(mechanicsSchema.safeParse(devilDealDefaults).success);
  for (const probabilities of [{death:1,fiveBB:1,tenBB:0},{death:-1,fiveBB:1,tenBB:1},{death:.50000001,fiveBB:.29999999,tenBB:.2}]) assert.equal(mechanicsSchema.safeParse({...devilDealDefaults,resurrection:{...devilDealDefaults.resurrection,probabilities}}).success,false);
  assert.equal(mechanicsSchema.safeParse({...devilDealDefaults,userId:'attacker'}).success,false);
});
test('exact 50/30/20 partition and cutoff at 21:00 Barnaul', () => {
  const counts = { DEATH:0, RESURRECT_5:0, RESURRECT_10:0 };
  for(let i=0;i<1000000;i++) counts[resurrectionOutcome(i,devilDealDefaults)]++;
  assert.deepEqual(counts,{DEATH:500000,RESURRECT_5:300000,RESURRECT_10:200000});
  assert.doesNotThrow(()=>assertMechanicsOpen(devilDealDefaults,new Date('2026-10-31T20:59:59.999+07:00')));
  assert.throws(()=>assertMechanicsOpen(devilDealDefaults,new Date('2026-10-31T21:00:00+07:00')));
});
test('registration issues 30000 chips once, concurrent registration is idempotent', async () => {
  const f = await setup(); const r = f.regs[0];
  const entries = await Promise.all(Array.from({length:6},()=>registerForTournament(f.users[0].id,f.t.id)));
  assert.ok(entries.every(x=>x.id===r.id));
  assert.equal(await prisma.registration.count({where:{tournamentId:f.t.id,userId:f.users[0].id}}),1);
  assert.equal((await prisma.registration.findUnique({where:{id:r.id}})).issuedChips,30000);
  assert.equal((await getDevilState(f.t.id,f.users[0].id)).dealAvailable,false);
  await assert.rejects(resurrect(f.t.id,f.users[0].id),e=>e.code==='ELIMINATION_REQUIRED');
});
test('confirmed first elimination opens deal once without requiring or recording an opponent', async () => {
  const f=await setup(); const before=(await prisma.user.findUnique({where:{id:f.users[1].id}})).ratingPoints;
  const events=await Promise.all(Array.from({length:5},()=>eliminate(f)));
  assert.ok(events.every(e=>e.id===events[0].id));
  assert.equal((await prisma.user.findUnique({where:{id:f.users[1].id}})).ratingPoints,before);
  assert.equal(await prisma.knockout.count({where:{tournamentId:f.t.id}}),0);
  assert.equal((await getDevilState(f.t.id,f.users[0].id)).dealAvailable,true);
});
test('bounty counter increments independently and idempotently without identifying a victim',async()=>{
  const f=await setup(); const eventKey=randomUUID(); const before=(await prisma.user.findUnique({where:{id:f.users[1].id}})).ratingPoints;
  const events=await Promise.all(Array.from({length:5},()=>awardDevilBounty(f.t.id,f.regs[1].id,eventKey,admin.id)));
  assert.ok(events.every(event=>event.id===events[0].id));
  assert.equal((await prisma.user.findUnique({where:{id:f.users[1].id}})).ratingPoints,before+50);
  assert.equal((await getDevilState(f.t.id)).stats.bounties,1);
  assert.equal(events[0].eliminationId,null);
});
for (const outcome of ['DEATH','RESURRECT_5','RESURRECT_10']) test(`draw ${outcome}, simultaneous retries, BB snapshot, restored active state`, async()=>{
  const f=await setup(outcome); await setBlindLevel(f.t.id,6,randomUUID(),admin.id); await eliminate(f);
  const results=await Promise.all(Array.from({length:8},()=>resurrect(f.t.id,f.users[0].id)));
  assert.ok(results.every(r=>r.id===results[0].id)); const result=results[0];
  assert.equal(result.outcome,outcome); assert.equal(result.bigBlind,1000); assert.ok(result.eliminationId); assert.equal(result.applied,true);
  const chips=outcome==='DEATH'?0:outcome==='RESURRECT_5'?5000:10000;
  assert.equal(result.chips,chips);
  const reg=await prisma.registration.findUnique({where:{id:f.regs[0].id}});
  assert.equal(reg.liveStatus,chips?'IN_GAME':'ELIMINATED'); assert.equal(reg.issuedChips,30000+chips);
  assert.equal(reg.lifeNumber,chips?2:1);
  await close(f); assert.equal((await resurrect(f.t.id,f.users[0].id)).id,result.id);
});
test('failed draw permits paid re-entry with automatic check-in and seating but never resets attempt',async()=>{
  const f=await setup('DEATH'); await eliminate(f); const attempt=await resurrect(f.t.id,f.users[0].id);
  const reEntries=await Promise.all(Array.from({length:5},()=>issuePaidDevilReEntry(f.t.id,f.users[0].id,admin.id))); const r=reEntries[0];
  assert.ok(reEntries.every(entry=>entry.id===r.id)); assert.equal(r.entryNumber,2); assert.equal(r.issuedChips,30000); assert.ok(r.checkedInAt); assert.ok(r.tableNumber); assert.ok(r.seatNumber);
  await eliminateDevil(f.t.id,r.id,1,admin.id);
  assert.equal((await resurrect(f.t.id,f.users[0].id)).id,attempt.id); assert.equal((await getDevilState(f.t.id,f.users[0].id)).dealAvailable,false);
  assert.equal((await prisma.user.findUnique({where:{id:f.users[1].id}})).ratingPoints,0);
});
test('resurrected player can be eliminated again and stale life replay cannot eliminate new life',async()=>{
  const f=await setup('RESURRECT_5'); const first=await eliminate(f); await resurrect(f.t.id,f.users[0].id);
  assert.equal((await eliminate(f)).id,first.id);
  assert.equal((await prisma.registration.findUnique({where:{id:f.regs[0].id}})).liveStatus,'IN_GAME');
  await eliminateDevil(f.t.id,f.regs[0].id,2,admin.id);
  assert.equal((await prisma.user.findUnique({where:{id:f.users[1].id}})).ratingPoints,0);
  assert.equal(await prisma.knockout.count({where:{eliminatedRegistrationId:f.regs[0].id}}),0);
});
for(const kind of ['POCKET_SIXES','DEVILS_666']) test(`sixes ${kind}: BB scaling, one award per hand, corrections append`,async()=>{
  const f=await setup(); await setBlindLevel(f.t.id,6,randomUUID(),admin.id);
  const input={registrationId:f.regs[0].id,handId:'table1-hand1',kind,levelIndex:6,showdownConfirmed:true,wonHand:true,pocketSixesConfirmed:true};
  const events=await Promise.all(Array.from({length:5},()=>awardSixes(f.t.id,input,admin.id))); const event=events[0];
  assert.ok(events.every(e=>e.id===event.id)); assert.equal(event.chips,kind==='POCKET_SIXES'?6000:13000);
  assert.equal((await awardSixes(f.t.id,{...input,kind:kind==='POCKET_SIXES'?'DEVILS_666':'POCKET_SIXES'},admin.id)).id,event.id);
  const correction=await reverseAward(f.t.id,event.id,'Ошибочно подтверждена комбинация',admin.id);
  assert.equal(correction.chips,-event.chips); assert.equal((await reverseAward(f.t.id,event.id,'Повторный запрос',admin.id)).id,correction.id);
  assert.equal((await prisma.registration.findUnique({where:{id:f.regs[0].id}})).issuedChips,30000);
});
test('cutoff blocks new draws, initial registrations, re-entry and sixes; bounty continues',async()=>{
  const f=await setup(); await close(f); await eliminate(f); await bounty(f);
  await assert.rejects(resurrect(f.t.id,f.users[0].id),e=>e.code==='MECHANICS_CLOSED');
  await assert.rejects(registerForTournament(f.users[0].id,f.t.id),e=>e.code==='MECHANICS_CLOSED');
  await assert.rejects(registerForTournament(admin.id,f.t.id),e=>e.code==='MECHANICS_CLOSED');
  await assert.rejects(awardSixes(f.t.id,{registrationId:f.regs[1].id,handId:'late',kind:'POCKET_SIXES',levelIndex:0,showdownConfirmed:true,wonHand:true,pocketSixesConfirmed:true},admin.id),e=>e.code==='MECHANICS_CLOSED');
  assert.equal((await prisma.user.findUnique({where:{id:f.users[1].id}})).ratingPoints,50);
});
test('add-on opens after late registration, issues 100000 chips once, and can be corrected',async()=>{
  const f=await setup('DEATH',{addOnEnabled:true,addOnPrice:1000,addOnChips:100000});
  await assert.rejects(issueDevilAddOn(f.t.id,f.regs[0].id,admin.id),e=>e.code==='ADD_ON_NOT_OPEN');
  await close(f);
  const issued=await Promise.all(Array.from({length:5},()=>issueDevilAddOn(f.t.id,f.regs[0].id,admin.id)));
  assert.ok(issued.every(r=>r.addOnCount===1));
  let registration=await prisma.registration.findUnique({where:{id:f.regs[0].id}});
  assert.equal(registration.addOnCount,1); assert.equal(registration.issuedChips,130000);
  assert.equal(await prisma.tournamentGameEvent.count({where:{tournamentId:f.t.id,registrationId:f.regs[0].id,type:'ADD_ON'}}),1);
  registration=await removeDevilAddOn(f.t.id,f.regs[0].id,admin.id);
  assert.equal(registration.addOnCount,0); assert.equal(registration.issuedChips,30000);
  registration=await issueDevilAddOn(f.t.id,f.regs[0].id,admin.id);
  assert.equal(registration.addOnCount,1); assert.equal(registration.issuedChips,130000);
});
test('cannot eliminate a foreign registration or award on stale blind level',async()=>{
  const f=await setup(); const other=await setup();
  await assert.rejects(eliminateDevil(f.t.id,other.regs[1].id,1,admin.id),e=>e.statusCode===404);
  await setBlindLevel(f.t.id,2,randomUUID(),admin.id);
  await assert.rejects(awardSixes(f.t.id,{registrationId:f.regs[0].id,handId:'stale',kind:'POCKET_SIXES',levelIndex:0,showdownConfirmed:true,wonHand:true,pocketSixesConfirmed:true},admin.id),e=>e.code==='BLIND_CHANGED');
});
test('HTTP auth, admin guards, outcome/userId tampering and private history',async()=>{
  const f=await setup(); await eliminate(f);
  assert.equal((await fetch(base+`/api/tournaments/${f.t.id}/devil`)).status,401);
  for(const endpoint of ['eliminate','bounty','sixes','blinds','reverse','re-entry']) assert.equal((await request(`/api/admin/tournaments/${f.t.id}/devil/${endpoint}`,f.users[0],{})).status,403);
  for(const payload of [{userId:f.users[1].id},{outcome:'RESURRECT_10'},{probabilities:{death:0}}]) assert.equal((await request(`/api/tournaments/${f.t.id}/devil/resurrect`,f.users[0],payload)).status,400);
  const state=await (await request(`/api/tournaments/${f.t.id}/devil`,f.users[0])).json();
  assert.equal(state.registrations,undefined); assert.ok(state.events.every(e=>e.userId===f.users[0].id));
  const response=await request(`/api/tournaments/${f.t.id}`,f.users[0],{mechanics:devilDealDefaults},'PATCH'); assert.equal(response.status,403);
});
test('bounty survives placement recalculation and contributes to global and seasonal leaderboards',async()=>{
  const f=await setup(); await eliminate(f); await bounty(f);
  await eliminateDevil(f.t.id,f.regs[2].id,1,admin.id); await bounty(f); await close(f);
  await applyTournamentRatingResults(f.t.id,3,[{userId:f.users[1].id,place:1,knockouts:0}]);
  const first=await prisma.user.findUnique({where:{id:f.users[1].id}});
  await applyTournamentRatingResults(f.t.id,3,[{userId:f.users[1].id,place:1,knockouts:0}]);
  assert.equal((await prisma.user.findUnique({where:{id:f.users[1].id}})).ratingPoints,first.ratingPoints);
  for(const scope of ['global','season']) {
    const body=await (await request(`/api/rating/leaderboard?scope=${scope}&month=${f.t.startsAt.toISOString().slice(0,7)}&limit=500`,f.users[1])).json();
    assert.equal(body.leaders.find(u=>u.id===f.users[1].id).ratingPoints,first.ratingPoints);
  }
  await assert.rejects(applyTournamentRatingResults(f.t.id,3,[{userId:f.users[1].id,place:1,knockouts:50}]),e=>e.code==='BOUNTY_ALREADY_ACCOUNTED');
});
test('append-only journal refuses SQL mutation, history keeps every chip source and correction',async()=>{
  const f=await setup(); await eliminate(f); await bounty(f); await resurrect(f.t.id,f.users[0].id);
  const state=await getDevilState(f.t.id); const event=state.events[0];
  await assert.rejects(prisma.tournamentGameEvent.update({where:{id:event.id},data:{chips:999}}),/append-only/);
  assert.equal(state.stats.registered,3); assert.equal(state.stats.eliminations,1); assert.equal(state.stats.attempts,1); assert.equal(state.stats.failed,1); assert.equal(state.stats.ratingPoints,50);
});
test('ordinary tournament still registers, cancels, and has no special ledger',async()=>{
  const t=await prisma.tournament.create({data:{title:'Flop Classic',description:'Legacy',startsAt:new Date(Date.now()+3600000),location:'Test',buyIn:0,prizePool:0,maxParticipants:50}});
  const r=await registerForTournament(admin.id,t.id); assert.equal(r.issuedChips,0);
  assert.equal(await prisma.tournamentGameEvent.count({where:{tournamentId:t.id}}),0);
  assert.equal((await cancelRegistration(admin.id,t.id)).status,'CANCELLED');
});

test('correct 6 BB to 13 BB with one compensating event and the original BB',async()=>{
  const f=await setup(); await setBlindLevel(f.t.id,6,randomUUID(),admin.id);
  const event=await awardSixes(f.t.id,{registrationId:f.regs[0].id,handId:'correctable',kind:'POCKET_SIXES',levelIndex:6,showdownConfirmed:true,wonHand:true,pocketSixesConfirmed:true},admin.id);
  await setBlindLevel(f.t.id,7,randomUUID(),admin.id);
  const correction=await reverseAward(f.t.id,event.id,'На вскрытии подтвержден сет шестёрок',admin.id,'DEVILS_666');
  assert.equal(correction.chips,7000); assert.equal(correction.bigBlind,1000);
  assert.equal((await prisma.registration.findUnique({where:{id:f.regs[0].id}})).issuedChips,43000);
  assert.equal((await reverseAward(f.t.id,event.id,'Повторная отправка',admin.id,'DEVILS_666')).id,correction.id);
});
test('bounty correction adjusts existing user counters and cannot change into chips',async()=>{
  const f=await setup(); await bounty(f); const bountyEvent=(await getDevilState(f.t.id)).events.find(e=>e.type==='BOUNTY_ELIMINATION');
  await assert.rejects(reverseAward(f.t.id,bountyEvent.id,'Неверная комбинация',admin.id,'DEVILS_666'),e=>e.code==='INVALID_CORRECTION');
  await reverseAward(f.t.id,bountyEvent.id,'Bounty добавлен по ошибке',admin.id);
  const user=await prisma.user.findUnique({where:{id:f.users[1].id}}); assert.equal(user.ratingPoints,0); assert.equal(user.knockouts,0);
});
test('capacity checked before every draw, including a death outcome; attempt stays unused',async()=>{
  const f=await setup('DEATH'); await eliminate(f);
  await prisma.tournament.update({where:{id:f.t.id},data:{maxParticipants:2}});
  await assert.rejects(resurrect(f.t.id,f.users[0].id),e=>e.code==='TOURNAMENT_FULL');
  assert.equal((await getDevilState(f.t.id,f.users[0].id)).attempt,null);
});
test('configuration and startsAt are immutable after registration, unchanged values can be saved',async()=>{
  const f=await setup();
  assert.equal((await request(`/api/tournaments/${f.t.id}`,admin,{mechanics:f.t.mechanics},'PATCH')).status,409);
  assert.equal((await request(`/api/tournaments/${f.t.id}`,admin,{startsAt:new Date(Date.now()+100000).toISOString()},'PATCH')).status,409);
  assert.equal((await request(`/api/tournaments/${f.t.id}`,admin,{startsAt:f.t.startsAt.toISOString(),description:'Обновлённое описание'},'PATCH')).status,200);
});
test('completed and future tournaments reject new deals and bonuses',async()=>{
  const f=await setup(); await eliminate(f);
  await prisma.tournament.update({where:{id:f.t.id},data:{status:'FINISHED'}});
  await assert.rejects(resurrect(f.t.id,f.users[0].id),e=>e.code==='TOURNAMENT_NOT_RUNNING');
  await prisma.tournament.update({where:{id:f.t.id},data:{status:'OPEN',startsAt:new Date(Date.now()+60000)}});
  await assert.rejects(resurrect(f.t.id,f.users[0].id),e=>e.code==='TOURNAMENT_NOT_RUNNING');
});
test('admin schema rejects unconfirmed sixes, fabricated chips, and invalid blind levels',async()=>{
  const f=await setup(); const path=`/api/admin/tournaments/${f.t.id}/devil`;
  assert.equal((await request(path+'/sixes',admin,{registrationId:f.regs[0].id,handId:'x',kind:'DEVILS_666',levelIndex:0,showdownConfirmed:false,wonHand:true,pocketSixesConfirmed:true})).status,400);
  assert.equal((await request(path+'/sixes',admin,{registrationId:f.regs[0].id,handId:'x',kind:'DEVILS_666',levelIndex:0,showdownConfirmed:true,wonHand:true,pocketSixesConfirmed:true,chips:999999})).status,400);
  assert.equal((await request(path+'/blinds',admin,{levelIndex:999,eventKey:'bad-level'})).status,400);
});
test('return confirmation is journaled once without issuing chips again',async()=>{
  const f=await setup('RESURRECT_10'); await eliminate(f); await resurrect(f.t.id,f.users[0].id);
  const path=`/api/admin/tournaments/${f.t.id}/devil/confirm-return`;
  const first=await (await request(path,admin,{registrationId:f.regs[0].id,lifeNumber:2})).json();
  const second=await (await request(path,admin,{registrationId:f.regs[0].id,lifeNumber:2})).json();
  assert.equal(first.id,second.id); assert.equal(first.type,'RETURN_CONFIRMED');
  assert.equal((await prisma.registration.findUnique({where:{id:f.regs[0].id}})).issuedChips,31000);
});
test('published results expose final places and bounty totals, not private registrations',async()=>{
  const f=await setup(); await eliminate(f); await bounty(f); await eliminateDevil(f.t.id,f.regs[2].id,1,admin.id); await bounty(f); await close(f); await applyTournamentRatingResults(f.t.id,3,[{userId:f.users[1].id,place:1}]);
  const rows=await (await request(`/api/tournaments/${f.t.id}/results`,f.users[0])).json();
  assert.equal(rows.find(r=>r.userId===f.users[1].id).points,10100);
  assert.equal(rows.find(r=>r.userId===f.users[1].id).place,1);
  assert.ok(rows.every(r=>r.checkInToken===undefined && r.telegramId===undefined));
});

test('cannot finalize before cutoff or while more than one participant remains',async()=>{
  const f=await setup();
  await assert.rejects(applyTournamentRatingResults(f.t.id,3,[{userId:f.users[1].id,place:1}]),e=>e.code==='WINNER_NOT_DETERMINED');
  await close(f);
  await assert.rejects(applyTournamentRatingResults(f.t.id,3,[{userId:f.users[1].id,place:1}]),e=>e.code==='WINNER_NOT_DETERMINED');
});

test('cancelled initial registration compensates reserved chips and permits a fresh booking',async()=>{
  const f=await setup(); const r=await registerForTournament(admin.id,f.t.id);
  const cancelled=await cancelRegistration(admin.id,f.t.id); assert.equal(cancelled.issuedChips,0);
  const events=await prisma.tournamentGameEvent.findMany({where:{tournamentId:f.t.id,userId:admin.id}});
  assert.equal(events.reduce((sum,e)=>sum+e.chips,0),0);
  const next=await registerForTournament(admin.id,f.t.id); assert.notEqual(next.id,r.id); assert.equal(next.issuedChips,30000);
});

test('Halloween schedule uses the existing event identity and the required Barnaul defaults',async()=>{
  const {scheduledTournamentForDate}=await import('../dist/services/tournamentSchedule.js');
  const event=scheduledTournamentForDate('2026-10-31');
  assert.equal(event.title,'FLOP DEVIL DEAL'); assert.equal(event.id,'2026-10-31-flop-devil-deal');
  assert.equal(event.startsAt.toISOString(),'2026-10-31T11:00:00.000Z');
  assert.equal(event.lateRegistrationEndsAt.toISOString(),'2026-10-31T14:00:00.000Z');
  assert.equal(event.prizePool,0); assert.equal(event.buyIn,500); assert.equal(event.reEntry,500);
  assert.equal(event.addOnEnabled,true); assert.equal(event.addOnPrice,1000); assert.equal(event.addOnChips,100000);
  assert.deepEqual(event.mechanics,devilDealDefaults);
});
