import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import {
  addForumAttachment,
  addForumComment,
  createForumPost,
  deleteForumComment,
  deleteForumPost,
  FORUM_CATEGORIES,
  FORUM_REACTIONS,
  getForumPost,
  listForumPosts,
  toggleForumReaction,
  updateForumComment,
  updateForumPost,
} from '../lib/forum.js';
import { listLiveMessages, postLiveMessage } from '../lib/forumLive.js';
import { heartbeat, listPresence } from '../lib/presence.js';

const router = Router();

function paramId(req: AuthedRequest, key = 'id') {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

function fail(res: import('express').Response, result: { error?: string; status?: number }) {
  if (result.error === 'not_found') return res.status(404).json({ message: 'Forum item not found.' });
  if (result.error === 'forbidden') {
    return res.status(403).json({ message: 'You do not have permission to perform this forum action.' });
  }
  return res.status(result.status || 400).json({ message: result.error || 'Request failed.' });
}

router.get('/meta', requireAuth, (_req, res) => {
  return res.json({ categories: FORUM_CATEGORIES, reactions: FORUM_REACTIONS });
});

router.get('/posts', requireAuth, (req: AuthedRequest, res) => {
  return res.json(
    listForumPosts(req.user!, {
      q: String(req.query.q || ''),
      category: String(req.query.category || ''),
      tag: String(req.query.tag || ''),
    })
  );
});

router.post('/posts', requireAuth, (req: AuthedRequest, res) => {
  const result = createForumPost(req.user!, {
    title: req.body?.title,
    body: req.body?.body,
    category: req.body?.category,
    tags: req.body?.tags,
    thread_kind: req.body?.thread_kind,
  });
  if ('error' in result) return fail(res, result);
  return res.status(201).json(result);
});

router.get('/posts/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = getForumPost(req.user!, paramId(req));
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.patch('/posts/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = updateForumPost(req.user!, paramId(req), {
    title: req.body?.title,
    body: req.body?.body,
    category: req.body?.category,
    tags: req.body?.tags,
    thread_kind: req.body?.thread_kind,
    pinned: typeof req.body?.pinned === 'boolean' ? req.body.pinned : undefined,
    locked: typeof req.body?.locked === 'boolean' ? req.body.locked : undefined,
  });
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.delete('/posts/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = deleteForumPost(req.user!, paramId(req));
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.post('/posts/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const result = addForumComment(req.user!, paramId(req), {
    body: req.body?.body,
    parent_id: req.body?.parent_id,
  });
  if ('error' in result) return fail(res, result);
  return res.status(201).json(result);
});

router.patch('/comments/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = updateForumComment(req.user!, paramId(req), { body: req.body?.body });
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.delete('/comments/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = deleteForumComment(req.user!, paramId(req));
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.post('/posts/:id/reactions', requireAuth, (req: AuthedRequest, res) => {
  const result = toggleForumReaction(req.user!, 'POST', paramId(req), req.body?.kind);
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.post('/comments/:id/reactions', requireAuth, (req: AuthedRequest, res) => {
  const result = toggleForumReaction(req.user!, 'COMMENT', paramId(req), req.body?.kind);
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.post('/posts/:id/attachments', requireAuth, (req: AuthedRequest, res) => {
  const result = addForumAttachment(req.user!, 'FORUM_POST', paramId(req), req.body || {});
  if ('error' in result) return fail(res, result);
  return res.status(201).json({ document: result.document });
});

router.post('/comments/:id/attachments', requireAuth, (req: AuthedRequest, res) => {
  const result = addForumAttachment(req.user!, 'FORUM_COMMENT', paramId(req), req.body || {});
  if ('error' in result) return fail(res, result);
  return res.status(201).json({ document: result.document });
});

router.post('/presence', requireAuth, (req: AuthedRequest, res) => {
  return res.json(heartbeat(req.user!));
});

router.get('/presence', requireAuth, (req: AuthedRequest, res) => {
  heartbeat(req.user!);
  return res.json(listPresence());
});

router.get('/live', requireAuth, (req: AuthedRequest, res) => {
  heartbeat(req.user!);
  return res.json({ messages: listLiveMessages(), presence: listPresence() });
});

router.post('/live', requireAuth, (req: AuthedRequest, res) => {
  heartbeat(req.user!);
  const result = postLiveMessage(req.user!, req.body?.message ?? req.body?.body);
  if ('error' in result) return fail(res, result);
  return res.status(201).json({ message: result.message, presence: listPresence() });
});

export default router;
