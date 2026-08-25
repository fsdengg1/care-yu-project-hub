import { store } from '../store/db.js';
import { ForumLiveMessage, User } from '../types.js';
import { newId } from './leadWorkflow.js';
import { findMentions } from './forum.js';

const MAX_LIVE_MESSAGES = 300;

export function listLiveMessages() {
  return store
    .getForumLiveMessages()
    .filter((item) => item.body)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
}

export function postLiveMessage(user: User, bodyRaw: unknown) {
  const body = String(bodyRaw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
  if (!body) return { error: 'Message is required.' };
  const message: ForumLiveMessage = {
    id: newId('flive'),
    author_id: user.id,
    author_name: user.name,
    author_role: user.role_name,
    body,
    created_at: new Date().toISOString(),
  };
  const rows = listLiveMessages();
  rows.push(message);
  store.saveForumLiveMessages(rows.slice(-MAX_LIVE_MESSAGES));
  for (const mentioned of findMentions(body)) {
    if (mentioned.id === user.id) continue;
    store.appendNotification({
      recipient_id: mentioned.id,
      sender_id: user.id,
      type: 'FORUM_MENTION',
      title: 'You were mentioned in live chat',
      message: `${user.name} mentioned you in Forum live chat`,
      entity_type: 'FORUM',
      entity_id: 'live',
    });
  }
  return { message };
}
