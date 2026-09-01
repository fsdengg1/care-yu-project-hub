import { store } from '../store/db.js';
import { Task, User } from '../types.js';
import { personGivenKey } from './people.js';

type ActionItem = {
  person: string;
  project: string;
  description: string;
  dueDate?: string;
};

const ACTION_ITEMS: ActionItem[] = [
  {
    person: 'Aakash',
    project: '4-Way Shuttle',
    description:
      'Shuttle integration with WCS – integration activities, communication/interface validation, testing and pending issues closure',
    dueDate: '2026-09-24',
  },
  {
    person: 'Aakash',
    project: 'Hero Mainline System – Project Installation',
    description:
      'Prepare project installation & implementation timeline, finalize milestones, review internally and send timeline to customer',
    dueDate: '2026-09-03',
  },
  {
    person: 'Vanippriya',
    project: 'Roca-2 – Fittings Defect Analysis',
    description:
      'Complete defect analysis system preparation, validate required functionality and prepare the system for customer/internal demo',
    dueDate: '2026-09-04',
  },
  {
    person: 'Vanippriya',
    project: 'Hero Mainline – Vision Action Items',
    description:
      'A. Finalize system accuracy timeline B. Finalize camera/barcode verification method C. Finalize integration timeline and action plan',
  },
  {
    person: 'Vanippriya',
    project: 'Auto Annotation Software',
    description:
      'Complete deployment, identify required fine-tuning, implement improvements and validate software performance',
  },
  {
    person: 'Arun',
    project: 'WMS – ASRS',
    description:
      'Review WMS–ASRS requirements, identify pending development/integration activities, complete implementation and testing actions',
  },
  {
    person: 'Kabitha',
    project: 'Taskforge',
    description: 'Complete pending development, validate workflow, test the implementation and fix identified issues',
    dueDate: '2026-09-02',
  },
  {
    person: 'Kabitha',
    project: 'Rack Configurator',
    description:
      'Prepare for usage demo, demonstrate rack creation/configuration workflow, explain key features and usage steps, validate demo flow and fix issues before demo',
    dueDate: '2026-09-03',
  },
  {
    person: 'Kabitha',
    project: 'PMS Integration',
    description:
      'Implement PMS integration and add required features similar to the Daily Work Updates page, validate data synchronization, perform end-to-end testing and close integration issues',
  },
];

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

const GIVEN_ALIASES: Record<string, string[]> = {
  vani: ['vani', 'vanippriya'],
  vanippriya: ['vani', 'vanippriya'],
};

function givenKeys(given: string): string[] {
  const key = personGivenKey(given);
  return GIVEN_ALIASES[key] || [key];
}

function findByGivenName(given: string): User | undefined {
  const keys = new Set(givenKeys(given));
  return store.getUsers().find((user) => user.status === 'ACTIVE' && keys.has(personGivenKey(user.name)));
}

function sameProject(task: Task, project: string) {
  return (task.project_name || '').trim().toLowerCase() === project.trim().toLowerCase();
}

export function ensureActionItemTasks() {
  const pm = store.getUsers().find((user) => user.role_code === 'PROJECT_MANAGER' && user.status === 'ACTIVE');
  const now = new Date().toISOString();
  const tasks = store.getTasks();
  let created = 0;
  const missing: string[] = [];

  for (const item of ACTION_ITEMS) {
    const assignee = findByGivenName(item.person);
    if (!assignee) {
      missing.push(item.person);
      continue;
    }
    const id = `task-action-${personGivenKey(item.person)}-${slug(item.project)}`;
    const exists = tasks.some(
      (task) =>
        task.id === id ||
        (task.assigned_to_id === assignee.id && sameProject(task, item.project))
    );
    if (exists) continue;
    const title = item.description.slice(0, 120);
    tasks.unshift({
      id,
      lead_id: '',
      title,
      description: item.description,
      status: 'TODO',
      priority: 'High',
      due_date: item.dueDate,
      assigned_to: assignee.name,
      assigned_to_id: assignee.id,
      assigned_by: pm?.name || assignee.name,
      assigned_by_id: pm?.id || assignee.id,
      created_by: pm?.name || assignee.name,
      created_by_id: pm?.id || assignee.id,
      responsible_user_id: assignee.id,
      responsible_user_name: assignee.name,
      progress_percent: 0,
      team_id: assignee.team_id,
      team_name: assignee.team_name,
      start_date: now.slice(0, 10),
      task_type: 'PROJECT_TASK',
      project_name: item.project,
      review_status: 'NONE',
      comments: [],
      created_at: now,
      updated_at: now,
    });
    created += 1;
  }

  if (created) store.saveTasks(tasks);
  if (missing.length) {
    console.warn(`[action-items] Users not found: ${[...new Set(missing)].join(', ')}`);
  } else if (created) {
    console.log(`[action-items] Added ${created} Daily Work Updates action items.`);
  }
}
