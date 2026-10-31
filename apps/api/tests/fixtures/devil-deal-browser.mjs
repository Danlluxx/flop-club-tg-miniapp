import crypto from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
if (!/^postgresql:\/\/[^@]+@(?:localhost|127\.0\.0\.1):55439\/flop_devil_test(?:\?|$)/.test(process.env.TEST_DATABASE_URL ?? '')) throw new Error('Use isolated TEST_DATABASE_URL on port 55439');
Object.assign(process.env,{DATABASE_URL:process.env.TEST_DATABASE_URL,BOT_TOKEN:'local-test',JWT_SECRET:'devil-local-browser-secret-min-32',FRONTEND_URL:'http://localhost:5189'});
const {prisma}=await import('../../dist/prisma.js');
const {devilDealDefaults}=await import('../../dist/services/tournamentMechanics.js');
const {registerForTournament}=await import('../../dist/services/tournaments.js');
const {checkInTournamentRegistration}=await import('../../dist/services/liveTournament.js');
const {eliminateDevil}=await import('../../dist/services/devilDeal.js');
const complete={displayName:'Администратор',rulesAcceptedAt:new Date(),rulesVersion:'2026-05-22',personalDataConsentAt:new Date(),personalDataConsentVersion:'2026-10-12',photoVideoConsentAt:new Date(),photoVideoConsentVersion:'2026-10-12',introCompletedAt:new Date()};
const admin=await prisma.user.upsert({where:{telegramId:'111111111'},create:{telegramId:'111111111',username:'danlluxx',role:'ADMIN',...complete},update:complete});
const player=await prisma.user.upsert({where:{telegramId:'910000111'},create:{telegramId:'910000111',username:'devil_test_player',role:'USER',...complete,displayName:'Алексей'},update:{...complete,displayName:'Алексей'}});
const killer=await prisma.user.upsert({where:{telegramId:'910000112'},create:{telegramId:'910000112',username:'devil_test_killer',role:'USER',...complete,displayName:'Мария'},update:{...complete,displayName:'Мария'}});
const fixture={player,admin,tournaments:[]};
for(const outcome of ['DEATH','RESURRECT_5','RESURRECT_10']) {
 const mechanics={...devilDealDefaults,registrationClosesAt:new Date(Date.now()+3600000).toISOString(),resurrection:{...devilDealDefaults.resurrection,probabilities:{death:outcome==='DEATH'?1:0,fiveBB:outcome==='RESURRECT_5'?1:0,tenBB:outcome==='RESURRECT_10'?1:0}}};
 const t=await prisma.tournament.create({data:{title:'FLOP DEVIL DEAL',description:'HALLOWEEN SPECIAL',startsAt:new Date(Date.now()-60000),location:'Flop Club, Барнаул',buyIn:500,reEntry:500,prizePool:0,maxParticipants:50,mechanics}});
 const regs=[]; for(const u of [player,killer,admin]) { const r=await registerForTournament(u.id,t.id); regs.push(await checkInTournamentRegistration(r.checkInToken)); }
 await eliminateDevil(t.id,regs[0].id,1,admin.id);
 fixture.tournaments.push({id:t.id,outcome,regs});
}
// Separate fixture for publishing final placements through the existing admin interface.
const finalRules={...devilDealDefaults,registrationClosesAt:new Date(Date.now()+3600000).toISOString()};
const finalTournament=await prisma.tournament.create({data:{title:'FLOP DEVIL DEAL',description:'Final results browser test',startsAt:new Date(Date.now()-3600000),location:'Local test',buyIn:500,reEntry:500,prizePool:0,maxParticipants:50,mechanics:finalRules}});
const finalRegs=[];
for(const u of [player,killer,admin]) { const r=await registerForTournament(u.id,finalTournament.id); finalRegs.push(await checkInTournamentRegistration(r.checkInToken)); }
await eliminateDevil(finalTournament.id,finalRegs[0].id,1,admin.id);
await eliminateDevil(finalTournament.id,finalRegs[2].id,1,admin.id);
await prisma.tournament.update({where:{id:finalTournament.id},data:{mechanics:{...finalRules,registrationClosesAt:new Date(Date.now()-60000).toISOString()}}});
fixture.finalId=finalTournament.id;
const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:910000111,first_name:'Алексей',username:'devil_test_player'})});
const data=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
params.set('hash',crypto.createHmac('sha256',crypto.createHmac('sha256','WebAppData').update('local-test').digest()).update(data).digest('hex'));
fixture.initData=params.toString(); mkdirSync('tmp/devil-deal',{recursive:true}); writeFileSync('tmp/devil-deal/browser-fixture.json',JSON.stringify(fixture));
console.log('Created isolated browser fixtures for three outcomes'); await prisma.$disconnect();
