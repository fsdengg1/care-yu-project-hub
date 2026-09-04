import { initStore, runWithoutPersisting, shutdownStore, store } from '../src/store/db.js';
import { createAnnouncement, createGroup, deleteConversation, getConversation, getOrCreateDirect, listConversations, postAttachment, postMessage, updateGroupMembers } from '../src/lib/chat.js';
import { addEntityDocument, getEntityDocumentFile } from '../src/lib/documents.js';
import {
  addForumComment,
  createForumPost,
  deleteForumComment,
  getForumPost,
  listForumPosts,
  toggleForumReaction,
  updateForumComment,
  updateForumPost,
} from '../src/lib/forum.js';
import { listLiveMessages, postLiveMessage } from '../src/lib/forumLive.js';
import { heartbeat, listPresence } from '../src/lib/presence.js';
import { notifyStageCompleted } from '../src/lib/stages.js';
import { canMutateWorkTask, canViewTask, createWorkTask, acceptWorkTask, updateWorkTask } from '../src/lib/workTasks.js';
import { buildDailyStatusRows } from '../src/lib/dailyStatus.js';
import { listAssignmentsForUser } from '../src/lib/dailyUpdates.js';
import { User } from '../src/types.js';

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function assert(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function role(code: string): User {
  const user = store.getUsers().find((item) => item.role_code === code && item.status === 'ACTIVE');
  if (!user) throw new Error(`No active user with role ${code}`);
  return user;
}

function employeeNamed(skipId?: string): User {
  const user = store
    .getUsers()
    .find((item) => item.role_code === 'EMPLOYEE' && item.status === 'ACTIVE' && item.id !== skipId);
  if (!user) throw new Error('No employee found');
  return user;
}

await initStore();

console.info('[verify-permissions] Running in-memory only. Live Postgres will not be modified.');

const snapshot = {
  audits: store.getAudits().slice(),
  conversations: store.getConversations().slice(),
  participants: store.getConversationParticipants().slice(),
  messages: store.getChatMessages().slice(),
  documents: store.getEntityDocuments().slice(),
  tasks: store.getTasks().slice(),
  notifications: store.getNotifications().slice(),
  transitions: store.getStageTransitions().slice(),
  emails: store.getOutboundEmails().slice(),
  forumPosts: store.getForumPosts().slice(),
  forumComments: store.getForumComments().slice(),
  forumReactions: store.getForumReactions().slice(),
  forumTags: store.getForumTags().slice(),
  forumLiveMessages: store.getForumLiveMessages().slice(),
};

await runWithoutPersisting(async () => {
try {
  const ceo = role('CEO');
  const employee = employeeNamed();
  const other = employeeNamed(employee.id);
  const outsider = store.getUsers().find((item) => item.role_code === 'TEAM_LEAD' && item.status === 'ACTIVE') || other;

  const direct = getOrCreateDirect(ceo, employee.id);
  assert('CEO can contact employee', !('error' in direct) && Boolean(direct.conversation));
  if (!('error' in direct)) {
    const again = getOrCreateDirect(ceo, employee.id);
    assert(
      'Direct conversations are not duplicated',
      !('error' in again) && again.conversation.id === direct.conversation.id
    );
    const dmText = 'Tomorrow schedule meeting for meril';
    const sent = postMessage(ceo, direct.conversation.id, { message: dmText });
    assert('CEO can send a message', !('error' in sent) && sent.message?.conversation_type === 'DIRECT');
    const listed = listConversations(employee, 'DIRECT');
    assert('Employee can see CEO conversation', listed.some((item) => item.id === direct.conversation.id));
    const unread = store
      .getNotifications()
      .filter((item) => item.recipient_id === employee.id && item.entity_id === direct.conversation.id && item.type === 'DIRECT_MESSAGE' && !item.read_status);
    assert('Recipient receives an unread DIRECT_MESSAGE notification', unread.length >= 1);
    const senderNotified = store
      .getNotifications()
      .some((item) => item.recipient_id === ceo.id && item.entity_id === direct.conversation.id && item.type === 'DIRECT_MESSAGE');
    assert('Sender does not receive a notification for their own message', !senderNotified);
    const groupLeak = listConversations(employee, 'GROUP').some((item) => item.last_message === dmText);
    const forumLeak = listConversations(employee, 'ANNOUNCEMENT').some((item) => item.last_message === dmText);
    assert('Direct message is not visible in Groups', !groupLeak);
    assert('Direct message is not visible in Forum', !forumLeak);
    const outsiderView = getConversation(outsider, direct.conversation.id, 'DIRECT');
    assert('Non-participant cannot see private CEO chat', 'error' in outsiderView && outsiderView.error === 'forbidden');
    const otherView = getConversation(other, direct.conversation.id, 'DIRECT');
    assert('Other employee cannot see private CEO chat', 'error' in otherView && otherView.error === 'forbidden');
    const wrongType = getConversation(employee, direct.conversation.id, 'GROUP');
    assert('Direct conversation cannot be fetched as a Group', 'error' in wrongType && wrongType.error === 'forbidden');
    getConversation(employee, direct.conversation.id, 'DIRECT');
    const stillUnread = store
      .getNotifications()
      .some((item) => item.recipient_id === employee.id && item.entity_id === direct.conversation.id && item.type === 'DIRECT_MESSAGE' && !item.read_status);
    assert('Opening the conversation marks the notification as read', !stillUnread);
    const note = postMessage(ceo, direct.conversation.id, { message: 'Check the BOM before tomorrow\'s review.', message_type: 'NOTE' });
    assert('Direct note stores NOTE message type', !('error' in note) && note.message?.message_type === 'NOTE');
    const reply = postMessage(employee, direct.conversation.id, { message: 'Update will be submitted today.' });
    assert('Employee can reply', !('error' in reply));
  }

  const peer = getOrCreateDirect(employee, other.id);
  assert('Direct chat can be created between employees', !('error' in peer));
  if (!('error' in peer)) {
    const ceoPeek = getConversation(ceo, peer.conversation.id);
    assert('CEO cannot read unrelated private chats', 'error' in ceoPeek && ceoPeek.error === 'forbidden');
  }

  const group = createGroup(employee, { name: 'Permission Test Group', member_ids: [other.id] });
  assert('Member can create a group', !('error' in group));
  if (!('error' in group)) {
    const memberAccess = getConversation(other, group.conversation.id);
    const nonMember = getConversation(ceo.role_code === outsider.role_code ? role('CTO') : ceo, group.conversation.id);
    assert('Group member can access', !('error' in memberAccess));
    const send = postMessage(other, group.conversation.id, { message: 'Hello group' });
    assert('Group member can send', !('error' in send));
    assert('Non-member cannot access group', 'error' in nonMember && nonMember.error === 'forbidden');
    const outsiderSend = postMessage(nonMember && 'error' in nonMember ? (ceo.role_code === outsider.role_code ? role('CTO') : ceo) : ceo, group.conversation.id, { message: 'Should fail' });
    assert('Non-member cannot send group messages', 'error' in outsiderSend && outsiderSend.error === 'forbidden');
    const memberDelete = deleteConversation(other, group.conversation.id);
    assert('Normal member cannot delete group', 'error' in memberDelete && memberDelete.error === 'forbidden');
    const ownerRemove = updateGroupMembers(employee, group.conversation.id, { remove: [employee.id] });
    assert('Group owner cannot be removed', 'error' in ownerRemove);
    const excel = postAttachment(other, group.conversation.id, {
      file_name: 'Project_Status.xlsx',
      file_type: 'Excel',
      file_size: '2.4 MB',
      file_url: 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,AAA',
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size_bytes: 2048,
    });
    assert('Group member can send Excel', !('error' in excel) && excel.message?.message_type === 'EXCEL');
    if (!('error' in excel)) {
      const notified = store.getNotifications().filter((item) => item.entity_id === group.conversation.id && item.message_type === 'EXCEL' && !item.read_status);
      assert('Excel notification goes to group members only', notified.every((item) => [employee.id, other.id].includes(item.recipient_id)) && notified.some((item) => item.recipient_id === employee.id));
      assert('Sender is not notified for group Excel', !notified.some((item) => item.recipient_id === other.id));
    }
    const removed = updateGroupMembers(employee, group.conversation.id, { remove: [other.id] });
    assert('Group admin can remove a member', !('error' in removed));
    const afterRemove = getConversation(other, group.conversation.id, 'GROUP');
    assert('Removed member loses group access', 'error' in afterRemove && afterRemove.error === 'forbidden');
    const history = store.getChatMessages().filter((item) => item.conversation_id === group.conversation.id && item.sender_id === other.id && !item.deleted_at);
    assert('Removed member history remains', history.length >= 1);
    const ownerDelete = deleteConversation(employee, group.conversation.id);
    assert('Group owner can delete group', !('error' in ownerDelete));
    assert('Deleted group leaves the list', !listConversations(employee, 'GROUP').some((item) => item.id === group.conversation.id));
  }

  const forbiddenAnnouncement = createAnnouncement(employee, { name: 'Invalid', message: 'Should fail' });
  assert(
    'Unauthorized user cannot create announcement',
    'error' in forbiddenAnnouncement && forbiddenAnnouncement.status === 403
  );
  const announcement = createAnnouncement(ceo, { name: 'Company holiday', message: 'Tomorrow is a company holiday.' });
  assert('Authorized user can create announcement', !('error' in announcement));
  if (!('error' in announcement)) {
    const viewer = getConversation(employee, announcement.conversation.id);
    assert('Employees can view global announcement', !('error' in viewer));
  }
  const teamId = employee.team_id;
  if (teamId) {
    const teamPost = createAnnouncement(ceo, {
      name: 'Team-only update',
      message: 'Software team huddle at 4pm.',
      audience: 'TEAMS',
      team_ids: [teamId],
    });
    assert('Authorized user can create team-scoped forum post', !('error' in teamPost));
    if (!('error' in teamPost)) {
      const teamViewer = getConversation(employee, teamPost.conversation.id, 'ANNOUNCEMENT');
      assert('Team member can view team forum post', !('error' in teamViewer));
      const outsiderTeam = store.getUsers().find((item) => item.status === 'ACTIVE' && item.id !== employee.id && item.team_id !== teamId && !['CEO', 'CTO', 'BUSINESS_HEAD', 'SYSTEM_ADMIN'].includes(item.role_code));
      if (outsiderTeam) {
        const denied = getConversation(outsiderTeam, teamPost.conversation.id, 'ANNOUNCEMENT');
        assert('Non-audience user cannot view team forum post', 'error' in denied && denied.error === 'forbidden');
      }
    }
  }

  const project = store.getProjects().find((item) => item.status === 'ACTIVE');
  const pm = role('PROJECT_MANAGER');
  const projectTask = createWorkTask(pm, {
    title: 'Complete UI Design',
    task_type: 'PROJECT_TASK',
    project_id: project?.id,
    assigned_to_id: employee.id,
    due_date: '2026-08-28',
  });
  const nonProjectTask = createWorkTask(pm, {
    title: 'Prepare Monthly Management Report',
    task_type: 'NON_PROJECT_TASK',
    assigned_to_id: other.id,
    due_date: '2026-08-26',
  });
  assert('Project task can be created and assigned', !('error' in projectTask) && projectTask.task?.task_type === 'PROJECT_TASK');
  assert('Non-project task can be created and assigned', !('error' in nonProjectTask) && nonProjectTask.task?.task_type === 'NON_PROJECT_TASK');
  if (!('error' in projectTask) && !('error' in nonProjectTask)) {
    assert('Assigned user sees project task', canViewTask(employee, projectTask.task));
    assert('Assigned user sees non-project task', canViewTask(other, nonProjectTask.task));
    assert('Unassigned user does not see private assigned task', !canViewTask(employee, nonProjectTask.task));
  }

  const lead = store.getLeads().find((item) => item.status !== 'CANCELLED' && item.status !== 'LOST');
  const leadTask = createWorkTask(pm, {
    title: 'Prepare shuttle feasibility calculation based on LD-001 requirement.',
    description: 'Prepare shuttle feasibility calculation based on customer requirement.',
    task_type: 'LEAD_TASK',
    lead_id: lead?.id,
    assigned_to_id: employee.id,
    due_date: '2026-09-05',
    status: 'Yet to Start',
  });
  assert('Lead task can be created against a lead', !('error' in leadTask) && leadTask.task?.task_type === 'LEAD_TASK');
  if (!('error' in leadTask)) {
    assert('Lead task stays linked to the lead', Boolean(leadTask.task.lead_id) && leadTask.task.lead_id === lead?.id);
    assert('Lead task starts pending acceptance', leadTask.task.acceptance_status === 'REQUESTED');
    assert('Lead task does not attach a project', !leadTask.task.project_id);
    assert('Pending assignee cannot edit details', !canMutateWorkTask(employee, leadTask.task));
    assert('Creator can edit before acceptance', canMutateWorkTask(pm, leadTask.task));
    const blockedEdit = updateWorkTask(employee, leadTask.task.id, { description: 'Should not save' });
    assert('Assignee update is rejected before accept', 'error' in blockedEdit);
    const creatorEdit = updateWorkTask(pm, leadTask.task.id, { description: 'Prepare shuttle feasibility calculation based on customer requirement.' });
    assert('Creator can update pending lead task', !('error' in creatorEdit));
    const assigneeRows = buildDailyStatusRows(employee);
    assert(
      'Pending lead task appears in assignee Daily Work Updates',
      assigneeRows.some((row) => row.id === leadTask.task.id && row.canAccept && !row.canEdit)
    );
    const creatorRows = buildDailyStatusRows(pm);
    assert(
      'Pending lead task appears in creator Daily Work Updates as editable',
      creatorRows.some((row) => row.id === leadTask.task.id && row.canEdit)
    );
    assert(
      'Assignee sees the same task in My Assigned Work',
      listAssignmentsForUser(employee).some((item) => item.task_id === leadTask.task.id || item.id === leadTask.task.id)
    );
    assert(
      'Creator sees the same task in My Assigned Work',
      listAssignmentsForUser(pm).some((item) => item.task_id === leadTask.task.id || item.id === leadTask.task.id)
    );
    const accepted = acceptWorkTask(employee, leadTask.task.id);
    assert('Assignee can accept a lead task', !('error' in accepted) && accepted.task.acceptance_status === 'ACCEPTED');
    if (!('error' in accepted)) {
      assert('Accepted assignee can edit', canMutateWorkTask(employee, accepted.task));
      assert('Creator still can edit after accept', canMutateWorkTask(pm, accepted.task));
    }
    const previousLeadStatus = lead?.status;
    assert('Accepting a lead task does not change lead stage', store.getLeads().find((item) => item.id === lead?.id)?.status === previousLeadStatus);
  }

  const uploadTarget = !('error' in nonProjectTask) ? nonProjectTask.task.id : 'missing';
  const upload = addEntityDocument(pm, {
    file_name: 'requirement.pdf',
    file_type: 'PDF',
    file_size: '1 MB',
    file_url: 'data:application/pdf;base64,AAA',
    entity_type: 'TASK',
    entity_id: uploadTarget,
    size_bytes: 1024,
  });
  assert('Authorized user can upload a document', !('error' in upload));
  const rejectedType = addEntityDocument(pm, {
    file_name: 'malware.exe',
    entity_type: 'TASK',
    entity_id: uploadTarget,
  });
  assert('Invalid file type is rejected', 'error' in rejectedType);
  if (!('error' in upload)) {
    const allowed = getEntityDocumentFile(pm, upload.document.id);
    assert('Authorized user can preview/download', !('error' in allowed));
    const denied = getEntityDocumentFile(employee, upload.document.id);
    assert('Unauthorized user cannot download', 'error' in denied && denied.error === 'forbidden');
  }

  const first = notifyStageCompleted({
    actor: role('TEAM_LEAD'),
    stageName: 'Feasibility',
    stageId: 'stage-test-feasibility-once',
    projectName: project?.name || 'Website Development',
    nextUser: pm,
    nextStage: 'Planning',
  });
  const second = notifyStageCompleted({
    actor: role('TEAM_LEAD'),
    stageName: 'Feasibility',
    stageId: 'stage-test-feasibility-once',
    projectName: project?.name || 'Website Development',
    nextUser: pm,
    nextStage: 'Planning',
  });
  assert('Stage completion notifies the next responsible person', Boolean(first));
  assert('Stage completion notification is sent exactly once', first != null && second == null);

  const forumPost = createForumPost(employee, {
    title: 'RackVision UI review',
    body: `Please review the latest UI. @${other.name} can you check this?`,
    category: 'PROJECT_DISCUSSION',
    tags: ['ui', 'review'],
  });
  assert('Team member can create a forum post', !('error' in forumPost));
  if (!('error' in forumPost)) {
    const listed = listForumPosts(other);
    assert('Other employees can view company forum posts', listed.posts.some((item) => item.id === forumPost.post.id));
    const pinDenied = updateForumPost(employee, forumPost.post.id, { pinned: true });
    assert('Team member cannot pin a forum post', 'error' in pinDenied && pinDenied.error === 'forbidden');
    const pinned = updateForumPost(outsider, forumPost.post.id, { pinned: true });
    assert('Team Lead can pin a forum post', !('error' in pinned) && pinned.post.pinned);
    const comment = addForumComment(other, forumPost.post.id, { body: 'Looks good with one small change.' });
    assert('Team member can comment on a forum post', !('error' in comment));
    if (!('error' in comment)) {
      const reply = addForumComment(employee, forumPost.post.id, { body: 'Agreed, we can update this.', parent_id: comment.comment.id });
      assert('Team member can reply to a forum comment', !('error' in reply));
      const edited = updateForumComment(other, comment.comment.id, { body: 'Updated comment body.' });
      assert('Author can edit their forum comment', !('error' in edited));
      const deletedOwn = deleteForumComment(other, comment.comment.id);
      assert('Author can delete their forum comment', !('error' in deletedOwn));
    }
    const reacted = toggleForumReaction(other, 'POST', forumPost.post.id, 'LIKE');
    assert('Team member can react to a forum post', !('error' in reacted) && !reacted.removed);
    const locked = updateForumPost(outsider, forumPost.post.id, { locked: true });
    assert('Team Lead can lock a forum post', !('error' in locked) && locked.post.locked);
    const lockedComment = addForumComment(employee, forumPost.post.id, { body: 'Should be blocked.' });
    assert('Locked forum posts reject member comments', 'error' in lockedComment);
    const moderatorComment = addForumComment(outsider, forumPost.post.id, { body: 'Moderator note on locked thread.' });
    assert('Team Lead can still comment on a locked post', !('error' in moderatorComment));
    const unlocked = updateForumPost(outsider, forumPost.post.id, { locked: false });
    assert('Team Lead can unlock a forum post', !('error' in unlocked) && !unlocked.post.locked);
    const detail = getForumPost(employee, forumPost.post.id);
    assert('Forum post detail is readable after unlock', !('error' in detail));
    const mention = store
      .getNotifications()
      .some((item) => item.recipient_id === other.id && item.type === 'FORUM_MENTION' && item.entity_id === forumPost.post.id);
    assert('Mentioned user is notified', mention);
    const replyNotice = store
      .getNotifications()
      .some((item) => item.recipient_id === employee.id && item.type === 'FORUM_REPLY' && item.entity_id === forumPost.post.id);
    assert('Post author is notified of replies', replyNotice);
    const pinNotice = store
      .getNotifications()
      .some((item) => item.recipient_id === employee.id && item.type === 'FORUM_PINNED' && item.entity_id === forumPost.post.id);
    assert('Pinned discussion notifies the author', pinNotice);
  }

  heartbeat(employee);
  heartbeat(other);
  const presence = listPresence();
  assert('Presence counts users currently in the tool', presence.active_count >= 2);
  const live = postLiveMessage(employee, 'Hello from live chat');
  assert('Team member can send a forum live chat message', !('error' in live));
  if (!('error' in live)) {
    assert('Live chat messages are visible to other users', listLiveMessages().some((item) => item.id === live.message.id));
  }
} finally {
  store.saveAudits(snapshot.audits);
  store.saveConversations(snapshot.conversations);
  store.saveConversationParticipants(snapshot.participants);
  store.saveChatMessages(snapshot.messages);
  store.saveEntityDocuments(snapshot.documents);
  store.saveTasks(snapshot.tasks);
  store.saveNotifications(snapshot.notifications);
  store.saveStageTransitions(snapshot.transitions);
  store.saveOutboundEmails(snapshot.emails);
  store.saveForumPosts(snapshot.forumPosts);
  store.saveForumComments(snapshot.forumComments);
  store.saveForumReactions(snapshot.forumReactions);
  store.saveForumTags(snapshot.forumTags);
  store.saveForumLiveMessages(snapshot.forumLiveMessages);
}
});

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} permission checks passed.`);
if (failed.length) {
  process.exitCode = 1;
}
await shutdownStore();

