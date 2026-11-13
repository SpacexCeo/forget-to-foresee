// Chat over the head (src/play/chat-bubbles.js, owner 13.11): new chat lines become one bubble per speaker for a few
// seconds; the player's own line goes over her own heroine; old history never pops up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBubbleQueue, chatFeed, BUBBLE, SELF } from '../../src/play/chat-bubbles.js';

test('the feed skips the history present at start, then yields each new line once, the own line as SELF', () => {
  const chat = [{ id: 'a', text: 'old', mine: false }];
  const feed = chatFeed();
  assert.deepEqual(feed(chat), [], 'history is not shown');
  chat.push({ id: 'me', text: 'hey', mine: true }, { id: 'b', text: 'hi there', mine: false });
  assert.deepEqual(feed(chat), [{ key: SELF, text: 'hey' }, { key: 'b', text: 'hi there' }]);
  assert.deepEqual(feed(chat), []);
  chat.shift(); chat.push({ id: 'a', text: 'again', mine: false }); // the presence drops the oldest line at 60
  assert.deepEqual(feed(chat), [{ key: 'a', text: 'again' }]);
  const fresh = chatFeed(), empty = [];
  assert.deepEqual(fresh(empty), []); empty.push({ id: 'c', text: 'first', mine: false });
  assert.deepEqual(fresh(empty), [{ key: 'c', text: 'first' }], 'an empty room at start: the first line shows');
});

test('one bubble per speaker (the newest wins), gone after BUBBLE.seconds, long lines cut', () => {
  const q = createBubbleQueue();
  q.push('a', 'one', 0); q.push('a', 'two', 1); q.push('b', '  spaced   out  ', 1); q.push('c', '   ', 1);
  assert.deepEqual(q.live(2).map((b) => [b.key, b.text]), [['a', 'two'], ['b', 'spaced out']]);
  assert.deepEqual(q.live(1 + BUBBLE.seconds).length, 0);
  q.push('d', 'x'.repeat(200), 0);
  assert.equal(q.live(0)[0].text.length, BUBBLE.maxChars);
});
