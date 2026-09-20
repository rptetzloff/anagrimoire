// The one write a browser may make to its own profile row.
//
// Source-level on purpose, and the limit is worth stating: this proves what
// schema.sql says, not what a database does with it. There is no SQL harness
// in this repo to ask the second question -- so the rule is asserted where it
// can be, against the artifact that carries it.
//
// The hole it closes: "update own profile" exists so a browser can save its
// settings, and with the table-wide grant Supabase gives `authenticated` it
// also let a browser PATCH its own display_name -- past set_display_name, and
// so past the length rules, uniqueness and the blocked-names list.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8');

/** Statements with the comments stripped, so a rule written in prose above a
 *  line is never mistaken for the line itself. */
const statements = schema
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('what a browser may write to its own profile', () => {
  it('has the table-wide grant taken away', () => {
    expect(statements).toMatch(
      /revoke\s+insert,\s*update\s+on\s+public\.profiles\s+from\s+anon,\s*authenticated;/
    );
  });

  it('and gets back settings, and only settings', () => {
    expect(statements).toMatch(/grant\s+update\s+\(settings\)\s+on\s+public\.profiles\s+to\s+authenticated;/);
    expect(statements).toMatch(/grant\s+insert\s+\(id,\s*settings\)\s+on\s+public\.profiles\s+to\s+authenticated;/);
    // The one that would undo it all.
    expect(statements).not.toMatch(/grant\s+(update|insert)\s+\(([^)]*\b)?display_name\b/);
  });

  // The blocklist is only worth having if it cannot be walked around, and it
  // is reachable from exactly one place.
  it('leaves set_display_name the only way a name is set', () => {
    expect(statements).toMatch(/grant execute on function public\.set_display_name\(text\) to authenticated;/);
    expect(statements).toMatch(/public\.name_is_blocked\(cleaned\)/);
  });
});
