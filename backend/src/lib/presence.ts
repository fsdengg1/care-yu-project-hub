import { store } from '../store/db.js';
import { PresenceUser, User } from '../types.js';

const ACTIVE_MS = 75_000;
const beats = new Map<string, number>();

export function heartbeat(user: User) {
  if (user.status !== 'ACTIVE') return listPresence();
  beats.set(user.id, Date.now());
  return listPresence();
}

export function listPresence() {
  const cutoff = Date.now() - ACTIVE_MS;
  const users = store.getUsers().filter((item) => item.status === 'ACTIVE');
  const online: PresenceUser[] = [];
  for (const user of users) {
    const at = beats.get(user.id);
    if (!at || at < cutoff) continue;
    online.push({
      id: user.id,
      name: user.name,
      role_name: user.role_name,
      team_name: user.team_name,
      last_seen_at: new Date(at).toISOString(),
    });
  }
  online.sort((a, b) => a.name.localeCompare(b.name));
  return {
    active_count: online.length,
    total_users: users.length,
    users: online,
  };
}
