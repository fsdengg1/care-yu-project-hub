import { store } from '../store/db.js';
import {
  EntityDocument,
  ForumCategory,
  ForumComment,
  ForumPost,
  ForumReaction,
  ForumReactionKind,
  ForumTag,
  ForumThreadKind,
  User,
} from '../types.js';
import { addEntityDocument, listDocuments } from './documents.js';
import { newId } from './leadWorkflow.js';

const CATEGORIES: ForumCategory[] = [
  'GENERAL',
  'ANNOUNCEMENT',
  'PROJECT_DISCUSSION',
  'TECHNICAL',
  'SUPPORT',
  'FEEDBACK',
  'IDEAS',
  'OTHER',
];

const REACTIONS: ForumReactionKind[] = ['LIKE', 'LOVE', 'CHECK', 'CLAP', 'CELEBRATE'];
const THREAD_KINDS: ForumThreadKind[] = ['DISCUSSION', 'QUESTION', 'IDEA'];
const MODERATOR_ROLES = new Set(['TEAM_LEAD', 'PROJECT_MANAGER', 'SYSTEM_ADMIN', 'CEO', 'CTO']);

export function canModerateForum(user: User) {
  return MODERATOR_ROLES.has(user.role_code);
}

export function parseCategory(value: unknown): ForumCategory | undefined {
  if (typeof value === 'string' && CATEGORIES.includes(value as ForumCategory)) return value as ForumCategory;
  return undefined;
}

export function parseThreadKind(value: unknown): ForumThreadKind {
  if (typeof value === 'string' && THREAD_KINDS.includes(value as ForumThreadKind)) return value as ForumThreadKind;
  return 'DISCUSSION';
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/javascript:/gi, '');
}

function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) return [] as string[];
  const unique = new Set(
    tags
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8)
  );
  return [...unique];
}

function upsertTags(names: string[]) {
  if (!names.length) return;
  const tags = store.getForumTags();
  const known = new Set(tags.map((item) => item.name));
  const now = new Date().toISOString();
  for (const name of names) {
    if (known.has(name)) continue;
    tags.push({ id: newId('ftag'), name, created_at: now });
    known.add(name);
  }
  store.saveForumTags(tags);
}

export function findMentions(text: string) {
  const users = store.getUsers().filter((item) => item.status === 'ACTIVE');
  const mentioned = new Map<string, User>();
  const hay = ` ${text.toLowerCase()} `;
  for (const user of users) {
    const needle = `@${user.name.toLowerCase()}`;
    const idx = hay.indexOf(needle);
    if (idx === -1) continue;
    const after = hay[idx + needle.length];
    if (!after || /[\s.,!?;:)]/.test(after)) mentioned.set(user.id, user);
  }
  return [...mentioned.values()];
}

function notify(params: {
  recipients: User[];
  actor: User;
  type: 'FORUM_POST' | 'FORUM_REPLY' | 'FORUM_MENTION' | 'FORUM_REACTION' | 'FORUM_PINNED';
  title: string;
  message: string;
  postId: string;
  messageId?: string;
}) {
  for (const recipient of params.recipients) {
    if (recipient.id === params.actor.id) continue;
    store.appendNotification({
      recipient_id: recipient.id,
      sender_id: params.actor.id,
      type: params.type,
      title: params.title,
      message: params.message,
      entity_type: 'FORUM',
      entity_id: params.postId,
      message_id: params.messageId,
    });
  }
}

function attachmentsFor(entityType: EntityDocument['entity_type'], entityId: string) {
  return listDocuments(entityType, entityId);
}

function reactionSummary(targetType: 'POST' | 'COMMENT', targetId: string, userId: string) {
  const rows = store.getForumReactions().filter((item) => item.target_type === targetType && item.target_id === targetId);
  const counts: Partial<Record<ForumReactionKind, number>> = {};
  for (const row of rows) counts[row.kind] = (counts[row.kind] || 0) + 1;
  return {
    reaction_counts: counts,
    my_reactions: rows.filter((item) => item.user_id === userId).map((item) => item.kind),
  };
}

function summarizePost(post: ForumPost, user: User) {
  const comments = store
    .getForumComments()
    .filter((item) => item.post_id === post.id && !item.deleted_at)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const last = comments[comments.length - 1];
  const docs = attachmentsFor('FORUM_POST', post.id);
  const types = [...new Set(docs.map((item) => item.file_type || 'Document'))];
  const participants = new Set([post.author_id, ...comments.map((item) => item.author_id)]);
  return {
    ...post,
    thread_kind: post.thread_kind || 'DISCUSSION',
    comment_count: comments.length,
    attachment_count: docs.length,
    attachment_types: types,
    participant_count: participants.size,
    last_reply_at: last?.created_at,
    last_reply_author: last?.author_name,
    last_reply_preview: last?.body_text,
    ...reactionSummary('POST', post.id, user.id),
  };
}

export function listForumPosts(user: User, query?: { q?: string; category?: string; tag?: string }) {
  const q = (query?.q || '').trim().toLowerCase();
  const category = parseCategory(query?.category);
  const tag = (query?.tag || '').trim().toLowerCase();
  const posts = store
    .getForumPosts()
    .filter((item) => !item.deleted_at)
    .filter((item) => !category || item.category === category)
    .filter((item) => !tag || item.tags.includes(tag))
    .filter((item) => {
      if (!q) return true;
      return `${item.title} ${item.body_text} ${item.author_name} ${item.category} ${item.tags.join(' ')}`.toLowerCase().includes(q);
    })
    .map((item) => summarizePost(item, user))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return +new Date(b.updated_at) - +new Date(a.updated_at);
    });
  return { posts, tags: store.getForumTags().map((item) => item.name).sort() };
}

export function getForumPost(user: User, id: string) {
  const post = store.getForumPosts().find((item) => item.id === id && !item.deleted_at);
  if (!post) return { error: 'not_found' as const };
  const comments = store
    .getForumComments()
    .filter((item) => item.post_id === id && !item.deleted_at)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    .map((item) => ({
      ...item,
      attachments: attachmentsFor('FORUM_COMMENT', item.id),
      ...reactionSummary('COMMENT', item.id, user.id),
    }));
  return {
    post: {
      ...summarizePost(post, user),
      attachments: attachmentsFor('FORUM_POST', post.id),
    },
    comments,
  };
}

export function createForumPost(
  user: User,
  body: { title?: string; body?: string; category?: string; tags?: unknown; thread_kind?: string }
) {
  const title = body.title?.trim();
  const html = sanitizeHtml(String(body.body || '').trim());
  const category = parseCategory(body.category) || 'GENERAL';
  const threadKind = parseThreadKind(body.thread_kind);
  if (!title) return { error: 'Post title is required.' };
  if (!stripHtml(html)) return { error: 'Message is required.' };
  const tags = normalizeTags(body.tags);
  upsertTags(tags);
  const now = new Date().toISOString();
  const post: ForumPost = {
    id: newId('fpost'),
    title,
    body: html,
    body_text: stripHtml(html),
    category,
    tags,
    thread_kind: threadKind,
    author_id: user.id,
    author_name: user.name,
    author_role: user.role_name,
    pinned: false,
    locked: false,
    created_at: now,
    updated_at: now,
  };
  const posts = store.getForumPosts();
  posts.unshift(post);
  store.saveForumPosts(posts);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'FORUM',
    entity_id: post.id,
    entity_name: post.title,
    action: 'FORUM_POST_CREATED',
    description: `${user.name} started a forum thread "${post.title}".`,
  });
  const kindLabel = threadKind === 'QUESTION' ? 'asked a question' : threadKind === 'IDEA' ? 'shared an idea' : 'started a discussion';
  const audience = store.getUsers().filter((item) => item.status === 'ACTIVE');
  notify({
    recipients: audience,
    actor: user,
    type: 'FORUM_POST',
    title: 'New Forum Thread',
    message: `${user.name} ${kindLabel}: "${post.title}"`,
    postId: post.id,
  });
  notify({
    recipients: findMentions(`${post.title} ${post.body_text}`),
    actor: user,
    type: 'FORUM_MENTION',
    title: 'You were mentioned',
    message: `${user.name} mentioned you in "${post.title}"`,
    postId: post.id,
  });
  return { post: summarizePost(post, user) };
}

export function updateForumPost(
  user: User,
  id: string,
  body: { title?: string; body?: string; category?: string; tags?: unknown; thread_kind?: string; pinned?: boolean; locked?: boolean }
) {
  const posts = store.getForumPosts();
  const index = posts.findIndex((item) => item.id === id && !item.deleted_at);
  if (index === -1) return { error: 'not_found' as const };
  const current = posts[index];
  const owner = current.author_id === user.id;
  const moderator = canModerateForum(user);
  if (!owner && !moderator) return { error: 'forbidden' as const };
  if ((body.pinned !== undefined || body.locked !== undefined) && !moderator) return { error: 'forbidden' as const };
  if (body.title?.trim()) current.title = body.title.trim();
  if (body.body !== undefined) {
    current.body = sanitizeHtml(String(body.body));
    current.body_text = stripHtml(current.body);
  }
  if (body.category) current.category = parseCategory(body.category) || current.category;
  if (body.thread_kind) current.thread_kind = parseThreadKind(body.thread_kind);
  if (body.tags) {
    current.tags = normalizeTags(body.tags);
    upsertTags(current.tags);
  }
  if (typeof body.pinned === 'boolean' && body.pinned !== current.pinned) {
    current.pinned = body.pinned;
    if (body.pinned) {
      notify({
        recipients: store.getUsers().filter((item) => item.status === 'ACTIVE'),
        actor: user,
        type: 'FORUM_PINNED',
        title: 'Important discussion pinned',
        message: `${user.name} pinned "${current.title}"`,
        postId: current.id,
      });
    }
  }
  if (typeof body.locked === 'boolean') current.locked = body.locked;
  current.updated_at = new Date().toISOString();
  posts[index] = current;
  store.saveForumPosts(posts);
  return { post: summarizePost(current, user) };
}

export function deleteForumPost(user: User, id: string) {
  const posts = store.getForumPosts();
  const index = posts.findIndex((item) => item.id === id && !item.deleted_at);
  if (index === -1) return { error: 'not_found' as const };
  const current = posts[index];
  if (current.author_id !== user.id && !canModerateForum(user)) return { error: 'forbidden' as const };
  current.deleted_at = new Date().toISOString();
  current.updated_at = current.deleted_at;
  posts[index] = current;
  store.saveForumPosts(posts);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'FORUM',
    entity_id: current.id,
    entity_name: current.title,
    action: 'FORUM_POST_DELETED',
    description: `${user.name} deleted forum post "${current.title}".`,
  });
  return { post: current };
}

export function addForumComment(user: User, postId: string, body: { body?: string; parent_id?: string }) {
  const post = store.getForumPosts().find((item) => item.id === postId && !item.deleted_at);
  if (!post) return { error: 'not_found' as const };
  if (post.locked && !canModerateForum(user)) return { error: 'This discussion is locked.', status: 403 as const };
  const html = sanitizeHtml(String(body.body || '').trim());
  if (!stripHtml(html)) return { error: 'Comment is required.' };
  let parentId = body.parent_id || undefined;
  if (parentId) {
    const parent = store.getForumComments().find((item) => item.id === parentId && item.post_id === postId && !item.deleted_at);
    if (!parent) return { error: 'Parent comment not found.' };
    if (parent.parent_id) parentId = parent.parent_id;
  }
  const now = new Date().toISOString();
  const comment: ForumComment = {
    id: newId('fcom'),
    post_id: postId,
    parent_id: parentId,
    author_id: user.id,
    author_name: user.name,
    author_role: user.role_name,
    body: html,
    body_text: stripHtml(html),
    created_at: now,
    updated_at: now,
  };
  const comments = store.getForumComments();
  comments.push(comment);
  store.saveForumComments(comments);
  post.updated_at = now;
  store.saveForumPosts(store.getForumPosts().map((item) => (item.id === post.id ? post : item)));
  const parent = parentId ? store.getForumComments().find((item) => item.id === parentId) : undefined;
  const replyTarget = parent ? store.findUserById(parent.author_id) : store.findUserById(post.author_id);
  if (replyTarget) {
    notify({
      recipients: [replyTarget],
      actor: user,
      type: 'FORUM_REPLY',
      title: parent ? 'New reply to your comment' : 'New reply on your post',
      message: `${user.name} replied in "${post.title}"`,
      postId: post.id,
      messageId: comment.id,
    });
  }
  notify({
    recipients: findMentions(comment.body_text),
    actor: user,
    type: 'FORUM_MENTION',
    title: 'You were mentioned',
    message: `${user.name} mentioned you in "${post.title}"`,
    postId: post.id,
    messageId: comment.id,
  });
  return { comment };
}

export function updateForumComment(user: User, id: string, body: { body?: string }) {
  const comments = store.getForumComments();
  const index = comments.findIndex((item) => item.id === id && !item.deleted_at);
  if (index === -1) return { error: 'not_found' as const };
  const current = comments[index];
  if (current.author_id !== user.id && !canModerateForum(user)) return { error: 'forbidden' as const };
  const post = store.getForumPosts().find((item) => item.id === current.post_id);
  if (post?.locked && !canModerateForum(user)) return { error: 'This discussion is locked.', status: 403 as const };
  const html = sanitizeHtml(String(body.body || '').trim());
  if (!stripHtml(html)) return { error: 'Comment is required.' };
  current.body = html;
  current.body_text = stripHtml(html);
  current.updated_at = new Date().toISOString();
  comments[index] = current;
  store.saveForumComments(comments);
  return { comment: current };
}

export function deleteForumComment(user: User, id: string) {
  const comments = store.getForumComments();
  const index = comments.findIndex((item) => item.id === id && !item.deleted_at);
  if (index === -1) return { error: 'not_found' as const };
  const current = comments[index];
  if (current.author_id !== user.id && !canModerateForum(user)) return { error: 'forbidden' as const };
  current.deleted_at = new Date().toISOString();
  current.updated_at = current.deleted_at;
  comments[index] = current;
  store.saveForumComments(comments);
  return { comment: current };
}

export function toggleForumReaction(user: User, targetType: 'POST' | 'COMMENT', targetId: string, kindRaw: unknown) {
  const kind = REACTIONS.includes(kindRaw as ForumReactionKind) ? (kindRaw as ForumReactionKind) : undefined;
  if (!kind) return { error: 'Invalid reaction.' };
  let postId = targetId;
  if (targetType === 'POST') {
    const post = store.getForumPosts().find((item) => item.id === targetId && !item.deleted_at);
    if (!post) return { error: 'not_found' as const };
  } else {
    const comment = store.getForumComments().find((item) => item.id === targetId && !item.deleted_at);
    if (!comment) return { error: 'not_found' as const };
    postId = comment.post_id;
  }
  const rows = store.getForumReactions();
  const existing = rows.findIndex(
    (item) => item.target_type === targetType && item.target_id === targetId && item.user_id === user.id && item.kind === kind
  );
  if (existing >= 0) {
    rows.splice(existing, 1);
    store.saveForumReactions(rows);
    return { removed: true, ...reactionSummary(targetType, targetId, user.id) };
  }
  const reaction: ForumReaction = {
    id: newId('freact'),
    target_type: targetType,
    target_id: targetId,
    user_id: user.id,
    kind,
    created_at: new Date().toISOString(),
  };
  rows.push(reaction);
  store.saveForumReactions(rows);
  const targetAuthorId =
    targetType === 'POST'
      ? store.getForumPosts().find((item) => item.id === targetId)?.author_id
      : store.getForumComments().find((item) => item.id === targetId)?.author_id;
  const author = targetAuthorId ? store.findUserById(targetAuthorId) : undefined;
  const post = store.getForumPosts().find((item) => item.id === postId);
  if (author && post) {
    notify({
      recipients: [author],
      actor: user,
      type: 'FORUM_REACTION',
      title: 'New reaction',
      message: `${user.name} reacted to "${post.title}"`,
      postId,
    });
  }
  return { removed: false, ...reactionSummary(targetType, targetId, user.id) };
}

export function addForumAttachment(
  user: User,
  entityType: 'FORUM_POST' | 'FORUM_COMMENT',
  entityId: string,
  body: {
    file_name?: string;
    original_file_name?: string;
    file_type?: string;
    file_size?: string;
    file_url?: string;
    mime_type?: string;
    size_bytes?: number;
  }
) {
  if (entityType === 'FORUM_POST') {
    const post = store.getForumPosts().find((item) => item.id === entityId && !item.deleted_at);
    if (!post) return { error: 'not_found' as const };
    if (post.author_id !== user.id && !canModerateForum(user)) return { error: 'forbidden' as const };
  } else {
    const comment = store.getForumComments().find((item) => item.id === entityId && !item.deleted_at);
    if (!comment) return { error: 'not_found' as const };
    if (comment.author_id !== user.id && !canModerateForum(user)) return { error: 'forbidden' as const };
    const post = store.getForumPosts().find((item) => item.id === comment.post_id);
    if (post?.locked && !canModerateForum(user)) return { error: 'This discussion is locked.', status: 403 as const };
  }
  return addEntityDocument(user, {
    file_name: String(body.file_name || ''),
    original_file_name: body.original_file_name,
    file_type: body.file_type,
    file_size: body.file_size,
    file_url: body.file_url,
    mime_type: body.mime_type,
    entity_type: entityType,
    entity_id: entityId,
    size_bytes: body.size_bytes,
  });
}

export const FORUM_CATEGORIES = CATEGORIES;
export const FORUM_REACTIONS = REACTIONS;
export type { ForumTag };
