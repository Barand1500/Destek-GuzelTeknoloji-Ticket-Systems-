import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectedReplyChannels,validateReplyChannels} from '../src/services/reply-channels.js';
import {updateConversationSchema,createStaffConversationSchema} from '../src/validators/index.js';
import {elapsedDuration} from '../../frontend/src/utils/elapsed-duration.ts';
test('channel selections are unique and legacy conversations retain their original channel',()=>{
 assert.deepEqual(selectedReplyChannels(null,'EMAIL'),['EMAIL']);
 assert.deepEqual(selectedReplyChannels(['EMAIL','WHATSAPP'],'TICKET'),['EMAIL','WHATSAPP']);
 assert.equal(updateConversationSchema.safeParse({replyChannels:[]}).success,false);
 assert.equal(updateConversationSchema.safeParse({replyChannels:['EMAIL','EMAIL']}).success,false);
 assert.equal(updateConversationSchema.safeParse({replyChannels:['EMAIL','WHATSAPP']}).success,true);
 const creation = { customerId: '3b3f3171-b44d-4c0b-80c7-c0cf528cc4cc', departmentId: 'b605ce0d-cb66-4dbd-81cf-561d7b6a81ad', subject: 'Test subject', message: 'First message' };
 assert.equal(createStaffConversationSchema.safeParse({...creation,replyChannels:['EMAIL','WHATSAPP']}).success,true);
 assert.equal(createStaffConversationSchema.safeParse({...creation,replyChannels:[]}).success,false);
 assert.equal(createStaffConversationSchema.safeParse({...creation,replyChannels:['EMAIL','EMAIL']}).success,false);
});
test('inactive channels and missing contacts are rejected; phone only needs no integration',()=>{
 validateReplyChannels(['TICKET'],{},null);
 assert.throws(()=>validateReplyChannels(['WHATSAPP'],{phone:'905321112233'},{whatsappEnabled:false}),/etkin değil/);
 assert.throws(()=>validateReplyChannels(['EMAIL'],{}, {smtpEnabled:true,smtpHost:'test',smtpFromAddress:'test@example.test'}),/adresi eksik/);
 validateReplyChannels(['EMAIL','WHATSAPP'],{email:'test@example.test',phone:'905321112233'},{smtpEnabled:true,smtpHost:'test',smtpFromAddress:'test@example.test',whatsappEnabled:true});
});
test('elapsed time includes calendar months, weeks, days, hours and minutes',()=>{
 assert.equal(elapsedDuration('2026-10-01T00:00:00Z',Date.parse('2026-10-03T03:15:00Z')),'2 gün 3 saat 15 dakika geçti');
 assert.equal(elapsedDuration('2026-10-01T00:00:00Z',Date.parse('2026-10-16T04:10:00Z')),'2 hafta 1 gün 4 saat 10 dakika geçti');
 assert.equal(elapsedDuration('2026-09-01T00:00:00Z',Date.parse('2026-10-10T05:20:00Z')),'1 ay 1 hafta 2 gün 5 saat 20 dakika geçti');
 assert.equal(elapsedDuration('2026-01-31T00:00:00Z',Date.parse('2026-02-28T00:00:00Z')),'1 ay geçti');
 assert.equal(elapsedDuration('2026-10-01T00:00:00Z',Date.parse('2026-10-01T01:03:00Z')),'1 saat 3 dakika geçti');
 assert.equal(elapsedDuration('2026-10-01T00:00:00Z',Date.parse('2026-10-01T00:00:30Z')),'Az önce');
});
