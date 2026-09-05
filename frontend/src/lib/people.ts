export type NamedPerson = {
  id?: string;
  employee_id?: string;
  name?: string;
  email?: string;
};

const FEMALE_GIVEN_NAMES = new Set([
  'kabitha',
  'sumithra',
  'vanippriya',
  'vani',
  'shradha',
  'sharadha',
]);

const MALE_GIVEN_NAMES = new Set([
  'aakash',
  'arivan',
  'arun',
  'sabarigiri',
  'sabari',
  'sanjay',
  'aravind',
  'bernard',
  'raja',
]);

const HONORIFIC_RE = /^(mr\.?\s+and\s+mrs\.?|mr|mrs|ms|miss|dr)\.?\s+/i;

function givenName(name: string): string {
  const stripped = name.replace(HONORIFIC_RE, '').trim();
  const first = stripped.split(/\s+/)[0] || stripped;
  return first;
}

function titleForGivenName(given: string): 'Mr.' | 'Mrs.' {
  const key = given.toLowerCase().replace(/[^a-z]/g, '');
  if (FEMALE_GIVEN_NAMES.has(key)) return 'Mrs.';
  if (MALE_GIVEN_NAMES.has(key)) return 'Mr.';
  return 'Mr.';
}

function properGiven(given: string): string {
  if (!given) return '';
  return given.charAt(0).toUpperCase() + given.slice(1);
}

export function formatEmployeeDisplayName(
  user?: NamedPerson | string | null
): string {
  if (!user) return '—';
  const raw = typeof user === 'string' ? user : user.name || '';
  const name = raw.trim();
  if (!name) return '—';
  if (/^mr\.?\s+and\s+mrs\.?/i.test(name)) return name;
  const given = givenName(name);
  if (!given) return name;
  return `${titleForGivenName(given)} ${properGiven(given)}`;
}

export function personStableId(user: NamedPerson): string {
  return String(user.id || user.employee_id || '').trim();
}

export function dedupeByStableId<T>(items: T[], getId: (item: T) => string | undefined | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = String(getId(item) || '').trim();
    if (!id) {
      out.push(item);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}
