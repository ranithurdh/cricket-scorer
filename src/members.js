// The roster. Saved players live in MongoDB and are edited on the Settings page; these are the
// pure helpers both the browser and the server use to match names against them.

// Seeded into the database the first time the server starts. After that the database is the source of truth.
export const DEFAULT_MEMBERS = [
  'Ranithu', 'Sadaham', 'Nithil', 'Sandanu',
  'Bhashika', 'Senuja', 'Oneth', 'Nadin',
];

export const NAME_MAX = 30;
export const cleanName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');
export const nameKey = (name) => cleanName(name).toLowerCase();

// list: [{ name, aliases?: [previous names], photo?: url, id?: string }]
// An alias is a name the player used before a rename, so old matches still count towards them.
export function makeRoster(list) {
  const entries = list.map((p) => ({ ...p, key: nameKey(p.name) }));
  const byKey = new Map();
  for (const e of entries) byKey.set(e.key, e); // current names win over aliases
  for (const e of entries) {
    for (const a of e.aliases ?? []) if (!byKey.has(nameKey(a))) byKey.set(nameKey(a), e);
  }
  const find = (name) => byKey.get(nameKey(name)) ?? null;
  return {
    list: entries,
    members: entries.map((e) => e.name),
    byKey,
    find,
    isMember: (name) => !!find(name),
    // Current spelling for a typed or saved name ("ranithu " -> "Ranithu"), or the trimmed input for guests.
    canonical: (name) => find(name)?.name ?? String(name).trim(),
    // The key a person is grouped under across matches (their current name's key).
    keyOf: (name) => find(name)?.key ?? nameKey(name),
  };
}

export const DEFAULT_ROSTER = makeRoster(DEFAULT_MEMBERS.map((name) => ({ name })));
