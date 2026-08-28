import * as assert from 'node:assert/strict';
import { normalizeMatchChatCommandPrefix } from '@skribbl-duels/product-core';
import {
  isMatchChatCommandPreviewRelevant,
  parseMatchChatCommand
} from '../apps/telemetry-inspector/src/matchChatCommand';

assert.equal(normalizeMatchChatCommandPrefix('duel-chat'), '/duel-chat');
assert.equal(normalizeMatchChatCommandPrefix('///My Chat!'), '/mychat');
assert.equal(normalizeMatchChatCommandPrefix('/'), '/sdchat');
assert.deepEqual(parseMatchChatCommand('/sdchat Hello world!', '/sdchat'), {
  matched: true,
  message: 'Hello world!'
});
assert.equal(parseMatchChatCommand('/msg Hello', '/sdchat').matched, false);
assert.equal(parseMatchChatCommand('/chat Hello', '/sdchat').matched, false);
assert.ok(isMatchChatCommandPreviewRelevant('/sd', '/sdchat'));
assert.ok(!isMatchChatCommandPreviewRelevant('/kick', '/sdchat'));

console.log('Configurable Match Chat command test passed.');
