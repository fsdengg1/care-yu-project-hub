const SMOKE_TEST_NAMES = new Set(['case tester', 'flow tester', 'auth tester']);

export function isSmokeTestAccount(person: { name?: string; email?: string }): boolean {
  const name = (person.name || '').trim().toLowerCase();
  if (SMOKE_TEST_NAMES.has(name)) return true;
  return /^(case|flow|auth)\.test\.\d+@/i.test((person.email || '').trim());
}
