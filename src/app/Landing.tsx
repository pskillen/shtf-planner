import { Link } from 'react-router-dom';
import releases from '../generated/releases.json';
import { paragraphs } from '../util/text';
import { Footer } from './Footer';

interface Release {
  tag: string;
  name: string;
  publishedAt: string;
  body: string;
}

export function Landing({ list = releases as Release[] }: { list?: Release[] }) {
  return (
    <>
      <main className="landing">
        <h1>SHTF Planner</h1>
        <p>
          Beta: for family and friends. Your data stays in your browser and your own Google Drive.
        </p>
        <Link to="/app" className="button">
          Start
        </Link>
        <p className="muted">
          On Android, open this page in Chrome and choose menu, then Install app (or Add to Home
          screen). It works offline after the first visit.
        </p>

        <h2>Changelog</h2>
        {list.length === 0 ? (
          <p className="muted">No releases yet.</p>
        ) : (
          list.map((r) => (
            <article className="release" key={r.tag}>
              <h3>{r.name}</h3>
              <time dateTime={r.publishedAt}>{r.publishedAt.slice(0, 10)}</time>
              {paragraphs(r.body).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </article>
          ))
        )}
      </main>
      <Footer />
    </>
  );
}
