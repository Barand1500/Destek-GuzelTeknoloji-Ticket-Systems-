import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conversationListOrder} from '../src/services/conversation-sorting.js';
import {listSchema} from '../src/validators/index.js';
test('inbox sorting supports one column and preserves stable default ordering',()=>{
 const fallback=[{updatedAt:'desc'},{id:'desc'}];
 assert.deepEqual(conversationListOrder(),fallback);
 for(const direction of ['asc','desc'] as const){
  assert.deepEqual(conversationListOrder('subject',direction),[{subject:direction},...fallback]);
  assert.deepEqual(conversationListOrder('department',direction),[{department:{name:direction}},...fallback]);
  assert.deepEqual(conversationListOrder('assignedAgent',direction),[{assignedAgent:{name:direction}},...fallback]);
 }
 assert.equal(listSchema.safeParse({sortBy:'subject',sortDirection:'asc'}).success,true);
 assert.equal(listSchema.safeParse({sortBy:'invalid'}).success,false);
 assert.equal(listSchema.safeParse({sortDirection:'invalid'}).success,false);
});
