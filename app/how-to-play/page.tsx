/* oxlint-disable next/no-html-link-for-pages -- Full navigation is required by the Netlify static export. */
import { gameModes, gameplayFaq } from '@/lib/game-guide';
import {
  pageMetadata,
  REPOSITORY_URL,
  serializeJsonLd,
  SITE_NAME,
  siteUrl,
} from '@/lib/seo';
import styles from './page.module.css';

export const metadata = pageMetadata('/how-to-play');

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': siteUrl('/how-to-play#faq'),
  url: siteUrl('/how-to-play'),
  name: `How to play ${SITE_NAME}`,
  inLanguage: 'en',
  about: { '@id': siteUrl('/#game') },
  mainEntity: gameplayFaq.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
};

export default function HowToPlay() {
  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <div className={styles.content}>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a href="/">← Play Frostbound</a>
          <a href="/race">Race a friend</a>
        </nav>
        <header className={styles.header}>
          <p className={styles.eyebrow}>ICY TOWER — FROSTBOUND</p>
          <h1>How to play Frostbound.</h1>
          <p>
            Frostbound is a free, Icy Tower-inspired browser game. Run to build
            momentum, jump through a frozen cathedral, and stay above the rising
            frost. Play solo, try a daily tower, or race a friend online.
          </p>
          <a className={styles.play} href="/">
            Play in your browser
          </a>
        </header>
        <nav className={styles.contents} aria-label="Gameplay guide sections">
          <a href="#controls">Controls</a>
          <a href="#climbing">Climbing tips</a>
          <a href="#modes">Game modes</a>
          <a href="#multiplayer">Multiplayer</a>
          <a href="#faq">FAQ</a>
        </nav>
        <section id="controls">
          <h2>Controls</h2>
          <table>
            <caption>Keyboard controls for a solo climb</caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Key</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Move</th>
                <td>A / D or ← / →</td>
              </tr>
              <tr>
                <th scope="row">Jump</th>
                <td>Space, W, or ↑</td>
              </tr>
              <tr>
                <th scope="row">Pause</th>
                <td>Escape or P</td>
              </tr>
              <tr>
                <th scope="row">Begin / retry</th>
                <td>Enter</td>
              </tr>
            </tbody>
          </table>
          <p>
            On a phone or tablet, hold left or right with one thumb and tap JUMP
            with the other. Release jump before the next jump. Portrait and
            landscape layouts are supported.
          </p>
        </section>
        <section id="climbing">
          <h2>Climb higher, one landing at a time</h2>
          <ul>
            <li>
              <strong>Build momentum.</strong> A running jump reaches higher
              ledges than a standing jump.
            </li>
            <li>
              <strong>Use the walls.</strong> Release and tap jump while
              airborne beside a wall to launch up and away.
            </li>
            <li>
              <strong>Keep the chain.</strong> Land on new higher floors within
              3.8 seconds to extend your combo.
            </li>
            <li>
              <strong>Stay ahead of the frost.</strong> Automatic scrolling
              starts at floor 5 in Classic and Party and accelerates as you
              climb.
            </li>
            <li>
              <strong>Watch the tower.</strong> Crumbling ledges, falling
              icicles, and frost bats make later floors more demanding.
            </li>
          </ul>
          <p>
            Start with Menu → Guided practice to learn with movement tips and no
            automatic frost chase.
          </p>
        </section>
        <section id="modes">
          <h2>Choose your climb</h2>
          <p>
            Open Menu on the title screen to choose a mode or the daily tower.
          </p>
          <dl className={styles.modes}>
            {gameModes.map(({ name, description }) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section id="multiplayer">
          <h2>Race a friend</h2>
          <p>
            Choose a name, hat, and sweater, then create a private 2–4 player
            lobby and share its invite. Everyone sees your name and chosen kit. Pick a
            finish floor from 5–100, a one-, two-, three-, or five-minute limit,
            and optional shoves. You can edit your name and kit in the lobby before
            getting ready. Everyone in the room readies up to start. Falls return you to the last five-floor checkpoint, and equal verified floors
            draw.
          </p>
          <p>
            Dodge frost bats and falling ice as you climb. After a hit or checkpoint
            recovery, a brief shield protects you from obstacles and shoves.
          </p>
          <p>
            With shoves enabled, press E or the shove button while facing a
            nearby friend. Race results stay separate from solo rankings.
          </p>
          <a href="/race">Open the race lobby →</a>
        </section>
        <section id="faq">
          <h2>Frequently asked questions</h2>
          {gameplayFaq.map(({ question, answer }) => (
            <div className={styles.answer} key={question}>
              <h3>{question}</h3>
              <p>{answer}</p>
            </div>
          ))}
        </section>
        <footer className={styles.footer}>
          <p>
            Independent Icy Tower-inspired browser prototype. No original game
            assets or affiliation. JavaScript and WebGL are required.
          </p>
          <a href={REPOSITORY_URL}>Source code & asset credits</a>
          <a href="/">Back to the tower →</a>
        </footer>
      </div>
    </main>
  );
}
