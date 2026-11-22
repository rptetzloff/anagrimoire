// Notices, the privacy policy and the terms: a page since the layout spec
// (November 2026; built in Amherst Games first), where it was a panel over the
// game.
import PageWithRail, { PageTabs } from '@/PageWithRail';
import { PrivacyPolicy, Terms } from '@/LegalDocs';
import type { LegalDoc } from '@/routes';

export default function LegalPage({ doc, docLink }: {
  doc: LegalDoc;
  docLink: (d: LegalDoc) => { to: string; onGo: () => void };
}) {
  return (
    <PageWithRail section="About" title="Legal">

      <PageTabs
        label="Legal"
        tabs={[
          { id: 'notices', label: 'Notices' },
          { id: 'privacy', label: 'Privacy' },
          { id: 'terms', label: 'Terms' },
        ]}
        current={doc}
        link={docLink}
      />

      {doc === 'privacy' && <PrivacyPolicy />}
      {doc === 'terms' && <Terms />}

      <div className={`space-y-5 text-sm text-slate-300 ${doc === 'notices' ? '' : 'hidden'}`}>
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Disclaimer
          </h3>
          <p className="text-slate-400">
            Anagrimoire is an independent project. It is not affiliated with,
            endorsed by, or sponsored by The New York Times Company (Wordle, Spelling
            Bee, Letter Boxed, Strands), Hasbro or Mattel (Scrabble, Boggle), Tribune Content Agency (Jumble), or any
            other puzzle publisher. All game names and trademarks are the property of
            their respective owners and are used here only to describe the kinds of
            puzzles this tool can help with.
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Word lists
          </h3>
          <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
            <li>
              All three word lists — Easy, Hard and Extreme — are built from{' '}
              <a
                href="https://github.com/jacksonrayhamilton/wordlist-english"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
              >
                wordlist-english
              </a>{' '}
              (MIT) and, for the largest tier, from{' '}
              <a
                href="http://wordlist.aspell.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
              >
                SCOWL
              </a>{' '}
              itself © Kevin Atkinson — each difficulty cuts deeper into
              SCOWL&apos;s frequency sizes (55, 70, 80), and every word a game
              asks or accepts comes from these.
            </li>
            <li>
              Words we won&apos;t use as puzzle answers are drawn from the{' '}
              <a
                href="https://github.com/en-wl/wordlist"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
              >
                English Speller Database
              </a>{' '}
              © 2000–2026 Kevin Atkinson, which marks offensive and vulgar
              words, and from the{' '}
              <a
                href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
              >
                LDNOOBW list
              </a>{' '}
              (CC BY 4.0). They filter what we publish, never what
              you&apos;re allowed to type — though the word lists
              themselves contain no slurs, at any tier.
            </li>
            <li>
              Word categories in our shared data files come from{' '}
              <a
                href="https://wordnet.princeton.edu/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
              >
                WordNet
              </a>
              &reg; © Princeton University, used under the{' '}
              <a
                href="https://wordnet.princeton.edu/license-and-commercial-use"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
              >
                WordNet License
              </a>
              . They label words (animal, food, plant&hellip;) and never
              decide what a puzzle asks or accepts.
            </li>
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            No word list is guaranteed to match any game&apos;s official dictionary.
          </p>
        </div>

        {/* Both fonts are bundled with the site rather than fetched, so the
            site is what redistributes them, and the OFL asks that they
            travel with their notice. Inter went uncredited until
            Fraunces arrived and the gap was looked for. */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Typefaces
          </h3>
          <p className="text-slate-400">
            Text is set in Inter (© 2016 The Inter Project Authors) and the name
            in Fraunces (© 2020 The Fraunces Project Authors), both served from this
            site under the{' '}
            <a
              href="https://openfontlicense.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
            >
              SIL Open Font License 1.1
            </a>
            .
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            License
          </h3>
          <p className="text-slate-400">
            The site&apos;s code is released under the{' '}
            <a
              href="https://github.com/rptetzloff/anagrimoire/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 hover:text-amber-200 underline underline-offset-2"
            >
              MIT License
            </a>
            .
          </p>
        </div>
      </div>

    </PageWithRail>
  );
}
