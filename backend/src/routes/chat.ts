import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { store } from '../store/db.js';
import {
  canCreateAnnouncement,
  createAnnouncement,
  createGroup,
  getConversation,
  deleteConversation,
  deleteMessage,
  getOrCreateDirect,
  listConversations,
  parseConversationType,
  postAttachment,
  postMessage,
  unreadCount,
  updateGroupMembers,
} from '../lib/chat.js';

const router = Router();

function paramId(req: AuthedRequest, key = 'id') {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

function fail(res: import('express').Response, result: { error?: string; status?: number }) {
  if (result.error === 'not_found') return res.status(404).json({ message: 'Conversation not found.' });
  if (result.error === 'forbidden') {
    return res.status(403).json({ message: 'You do not have permission to access this conversation.' });
  }
  return res.status(result.status || 400).json({ message: result.error || 'Request failed.' });
}

router.get('/conversations', requireAuth, (req: AuthedRequest, res) => {
  const type = parseConversationType(req.query.type);
  return res.json({ conversations: listConversations(req.user!, type), unread_count: unreadCount(req.user!) });
});

router.get('/unread', requireAuth, (req: AuthedRequest, res) => {
  return res.json({ unread_count: unreadCount(req.user!) });
});

router.get('/employees', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const q = String(req.query.q || '').trim().toLowerCase();
  const employees = store
    .getUsers()
    .filter((item) => item.status === 'ACTIVE' && item.id !== user.id)
    .filter((item) => {
      if (!q) return true;
      return `${item.name} ${item.email} ${item.role_name} ${item.team_name || ''}`.toLowerCase().includes(q);
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      role_name: item.role_name,
      role_code: item.role_code,
      team_name: item.team_name,
    }));
  return res.json({ employees });
});

router.get('/conversations/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = getConversation(req.user!, paramId(req), parseConversationType(req.query.type));
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.get('/conversations/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const result = getConversation(req.user!, paramId(req), parseConversationType(req.query.type));
  if ('error' in result) return fail(res, result);
  return res.json({ conversation: result.conversation, messages: result.messages });
});

router.get('/conversations/:id/members', requireAuth, (req: AuthedRequest, res) => {
  const result = getConversation(req.user!, paramId(req), parseConversationType(req.query.type) || 'GROUP');
  if ('error' in result) return fail(res, result);
  return res.json({ conversation: result.conversation, participants: result.participants });
});

router.post('/direct', requireAuth, (req: AuthedRequest, res) => {
  const result = getOrCreateDirect(req.user!, String(req.body?.user_id || ''));
  if ('error' in result) return fail(res, result);
  return res.status(201).json(result);
});

router.post('/groups', requireAuth, (req: AuthedRequest, res) => {
  const result = createGroup(req.user!, {
    name: req.body?.name,
    description: req.body?.description,
    member_ids: Array.isArray(req.body?.member_ids) ? req.body.member_ids.map(String) : [],
    project_id: req.body?.project_id,
  });
  if ('error' in result) return fail(res, result);
  return res.status(201).json(result);
});

router.post('/announcements', requireAuth, (req: AuthedRequest, res) => {
  if (!canCreateAnnouncement(req.user!)) {
    return res.status(403).json({ message: 'You do not have permission to create an announcement.' });
  }
  const audience = req.body?.audience === 'PROJECT' || req.body?.audience === 'TEAMS' ? req.body.audience : 'ALL';
  const result = createAnnouncement(req.user!, {
    name: req.body?.name,
    message: req.body?.message,
    audience,
    project_id: req.body?.project_id,
    team_ids: Array.isArray(req.body?.team_ids) ? req.body.team_ids.map(String) : undefined,
    message_type: req.body?.message_type,
    link_url: req.body?.link_url,
    attachment_id: req.body?.attachment_id,
  });
  if ('error' in result) return fail(res, result);
  return res.status(201).json(result);
});

router.patch('/conversations/:id/members', requireAuth, (req: AuthedRequest, res) => {
  const result = updateGroupMembers(req.user!, paramId(req), {
    add: Array.isArray(req.body?.add) ? req.body.add.map(String) : undefined,
    remove: Array.isArray(req.body?.remove) ? req.body.remove.map(String) : undefined,
    name: req.body?.name,
    description: req.body?.description,
    transfer_to_user_id: req.body?.transfer_to_user_id,
  });
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.post('/conversations/:id/members', requireAuth, (req: AuthedRequest, res) => {
  const add = Array.isArray(req.body?.member_ids)
    ? req.body.member_ids.map(String)
    : req.body?.user_id
      ? [String(req.body.user_id)]
      : [];
  const result = updateGroupMembers(req.user!, paramId(req), { add });
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.delete('/conversations/:id/members/:userId', requireAuth, (req: AuthedRequest, res) => {
  const result = updateGroupMembers(req.user!, paramId(req), { remove: [paramId(req, 'userId')] });
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.delete('/conversations/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = deleteConversation(req.user!, paramId(req));
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

router.post('/conversations/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const result = postMessage(req.user!, paramId(req), {
    message: req.body?.message,
    message_type: req.body?.message_type,
    attachment_id: req.body?.attachment_id,
    link_url: req.body?.link_url,
    file_name: req.body?.file_name,
    file_size: req.body?.file_size,
    mime_type: req.body?.mime_type,
  });
  if ('error' in result) return fail(res, result);
  return res.status(201).json(result);
});

router.post('/conversations/:id/attachments', requireAuth, (req: AuthedRequest, res) => {
  const result = postAttachment(req.user!, paramId(req), {
    file_name: req.body?.file_name,
    original_file_name: req.body?.original_file_name,
    file_type: req.body?.file_type,
    file_size: req.body?.file_size,
    file_url: req.body?.file_url,
    mime_type: req.body?.mime_type,
    size_bytes: req.body?.size_bytes != null ? Number(req.body.size_bytes) : undefined,
    message: req.body?.message,
    message_type: req.body?.message_type,
  });
  if ('error' in result) return fail(res, result);
  return res.status(201).json(result);
});

router.delete('/conversations/:id/messages/:messageId', requireAuth, (req: AuthedRequest, res) => {
  const messageId = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const result = deleteMessage(req.user!, paramId(req), String(messageId || ''));
  if ('error' in result) return fail(res, result);
  return res.json(result);
});

export default router;
