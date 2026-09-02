import 'dotenv/config';
import { initStore, shutdownStore, store } from '../src/store/db.js';
import { closePool, getPool } from '../src/store/postgres.js';

async function main() {
  await initStore();

  const projects = store.getProjects();
  const projectIds = new Set(projects.map((project) => project.id));
  const count = projects.length;
  console.log(`Found ${count} project(s) to remove.`);

  if (count === 0) {
    console.log('No projects in the database.');
    await shutdownStore();
    return;
  }

  const removedPhases = store.getProjectPhases().filter((item) => projectIds.has(item.project_id)).length;
  const removedTasks = store.getTasks().filter((item) => item.project_id && projectIds.has(item.project_id)).length;
  const removedUpdates = store.getDailyUpdates().filter((item) => item.project_id && projectIds.has(item.project_id)).length;
  const removedEscalations = store.getEscalations().filter((item) => item.project_id && projectIds.has(item.project_id)).length;
  const removedDocuments = store
    .getEntityDocuments()
    .filter((item) => item.entity_type === 'PROJECT' && projectIds.has(item.entity_id)).length;
  const removedTransitions = store
    .getStageTransitions()
    .filter((item) => item.project_id && projectIds.has(item.project_id)).length;
  const removedConversations = store
    .getConversations()
    .filter((item) => item.project_id && projectIds.has(item.project_id));
  const removedConversationIds = new Set(removedConversations.map((item) => item.id));
  const removedParticipants = store
    .getConversationParticipants()
    .filter((item) => removedConversationIds.has(item.conversation_id)).length;
  const removedMessages = store
    .getChatMessages()
    .filter((item) => removedConversationIds.has(item.conversation_id)).length;
  const removedHistory = store
    .getAssignmentHistory()
    .filter((item) => item.entity_type === 'PROJECT' && projectIds.has(item.entity_id)).length;

  store.saveProjects([]);
  store.saveProjectPhases(store.getProjectPhases().filter((item) => !projectIds.has(item.project_id)));
  store.saveTasks(store.getTasks().filter((item) => !item.project_id || !projectIds.has(item.project_id)));
  store.saveDailyUpdates(
    store.getDailyUpdates().filter((item) => !item.project_id || !projectIds.has(item.project_id))
  );
  store.saveEscalations(
    store.getEscalations().filter((item) => !item.project_id || !projectIds.has(item.project_id))
  );
  store.saveEntityDocuments(
    store
      .getEntityDocuments()
      .filter((item) => !(item.entity_type === 'PROJECT' && projectIds.has(item.entity_id)))
  );
  store.saveStageTransitions(
    store.getStageTransitions().filter((item) => !item.project_id || !projectIds.has(item.project_id))
  );
  store.saveConversations(
    store.getConversations().filter((item) => !item.project_id || !projectIds.has(item.project_id))
  );
  store.saveConversationParticipants(
    store.getConversationParticipants().filter((item) => !removedConversationIds.has(item.conversation_id))
  );
  store.saveChatMessages(
    store.getChatMessages().filter((item) => !removedConversationIds.has(item.conversation_id))
  );
  store.saveAssignmentHistory(
    store
      .getAssignmentHistory()
      .filter((item) => item.entity_type !== 'PROJECT' || !projectIds.has(item.entity_id))
  );

  const pool = getPool();
  const procurementResult = await pool.query('DELETE FROM procurement_requests WHERE project_id IS NOT NULL');
  const removedProcurement = procurementResult.rowCount ?? 0;

  await shutdownStore();

  console.log('Removed all projects and related records:');
  console.log(`  projects: ${count}`);
  console.log(`  project phases: ${removedPhases}`);
  console.log(`  tasks: ${removedTasks}`);
  console.log(`  daily updates: ${removedUpdates}`);
  console.log(`  escalations: ${removedEscalations}`);
  console.log(`  project documents: ${removedDocuments}`);
  console.log(`  stage transitions: ${removedTransitions}`);
  console.log(`  conversations: ${removedConversations.length}`);
  console.log(`  conversation participants: ${removedParticipants}`);
  console.log(`  chat messages: ${removedMessages}`);
  console.log(`  assignment history: ${removedHistory}`);
  console.log(`  procurement requests: ${removedProcurement}`);
}

main().catch(async (error) => {
  console.error(error);
  try {
    await shutdownStore();
  } catch {
    // ignore
  }
  try {
    await closePool();
  } catch {
    // ignore
  }
  process.exit(1);
});
