"use client";
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  GraduationCap, ArrowRight, Megaphone, CalendarDays, Users, School, BookOpen,
  ShieldCheck, Sparkles, Phone, Mail, MapPin,
} from 'lucide-react';
import { PLATFORM_NAME } from '@/lib/branding';
import './public-home.css';

interface PublicHomeData {
  school: { name: string; slug: string };
  stats: { students: number; teachers: number; classes: number; sections: number };
  announcements: { id: string; title: string; body: string; urgent: boolean; publishedAt: string }[];
  events: { id: string; title: string; kind: string; startDate: string; endDate: string; description: string }[];
}

const ORG_SLUG = 'my-school-days';
const fmtDate = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const kindLabel = (kind: string) => kind === 'ptm' ? 'Parent–teacher meeting' : kind.charAt(0).toUpperCase() + kind.slice(1);

export function PublicHomePage() {
  const [data, setData] = useState<PublicHomeData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/public/home?org=${ORG_SLUG}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  return <div className="pub-home">
    <header className="pub-nav">
      <div className="pub-nav-inner">
        <div className="pub-brand"><span className="pub-crest"><GraduationCap size={20} strokeWidth={1.7}/></span><span className="pub-brand-name">{data?.school.name ?? 'School'}</span></div>
        <nav className="pub-nav-links">
          <a href="#about">About</a>
          <a href="#news">News</a>
          <a href="#events">Events</a>
          <a href="#admissions">Admissions</a>
        </nav>
        <Link href="/login" className="pub-nav-cta">Portal sign in <ArrowRight size={14}/></Link>
      </div>
    </header>

    <section className="pub-hero">
      <div className="pub-hero-inner">
        <p className="pub-eyebrow"><Sparkles size={13} aria-hidden="true"/> Welcome to {data?.school.name ?? 'our school'}</p>
        <h1 className="pub-display">A school day<br/>built around <em>every child.</em></h1>
        <p className="pub-lede">Learning, belonging, becoming — one trusted place for classes, attendance, assignments, fees and live classrooms. Families stay close to every school day.</p>
        <div className="pub-hero-actions">
          <Link href="/apply" className="pub-btn pub-btn-primary">Apply for admission <ArrowRight size={15}/></Link>
          <Link href="/login" className="pub-btn pub-btn-ghost">Staff & student sign in</Link>
        </div>
      </div>
    </section>

    <section className="pub-stats" aria-label="School at a glance">
      <div className="pub-stats-inner">
        <div><strong>{data?.stats.students ?? '—'}</strong><span>Students</span></div>
        <div><strong>{data?.stats.teachers ?? '—'}</strong><span>Teachers</span></div>
        <div><strong>{data?.stats.classes ?? '—'}</strong><span>Classes</span></div>
        <div><strong>{data?.stats.sections ?? '—'}</strong><span>Sections</span></div>
      </div>
    </section>

    <section className="pub-section" id="about">
      <div className="pub-section-inner pub-about-grid">
        <div>
          <p className="pub-kicker">About the school</p>
          <h2 className="pub-h2">Every day begins together.</h2>
          <p className="pub-copy">From the first bell to the last goodbye, {data?.school.name ?? 'our school'} blends strong academics with care, routine and community. Teachers see every child; families see every school day.</p>
          <ul className="pub-points">
            <li><School size={15}/> One calendar for classes, exams, holidays and parent meetings</li>
            <li><BookOpen size={15}/> Daily attendance, assignments and report cards in one place</li>
            <li><Users size={15}/> Live classrooms with safe, teacher-controlled participation</li>
            <li><ShieldCheck size={15}/> Family privacy choices built into every feature</li>
          </ul>
        </div>
        <div className="pub-about-card">
          <div className="pub-about-crest"><GraduationCap size={30} strokeWidth={1.4}/></div>
          <p className="pub-about-school">{data?.school.name ?? PLATFORM_NAME}</p>
          <p className="pub-about-sub">Powered by {PLATFORM_NAME}</p>
          <div className="pub-about-contact">
            <span><MapPin size={13}/> Visit the school office for admissions enquiries</span>
            <span><Phone size={13}/> Contact the office during school hours</span>
            <span><Mail size={13}/> Admission forms are accepted online, year-round</span>
          </div>
        </div>
      </div>
    </section>

    <section className="pub-section pub-alt" id="news">
      <div className="pub-section-inner">
        <p className="pub-kicker"><Megaphone size={13} aria-hidden="true"/> School updates</p>
        <h2 className="pub-h2">News & announcements</h2>
        {failed && <p className="pub-empty">Updates are temporarily unavailable. Please check back shortly.</p>}
        {!failed && !data && <p className="pub-empty">Loading updates…</p>}
        {data && data.announcements.length === 0 && <p className="pub-empty">No announcements right now — check back soon.</p>}
        <div className="pub-news-grid">
          {data?.announcements.map(item => (
            <article key={item.id} className={`pub-news-card${item.urgent ? ' pub-urgent' : ''}`}>
              {item.urgent && <span className="pub-tag-urgent">Important</span>}
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <time>{new Date(item.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="pub-section" id="events">
      <div className="pub-section-inner">
        <p className="pub-kicker"><CalendarDays size={13} aria-hidden="true"/> School calendar</p>
        <h2 className="pub-h2">Upcoming events</h2>
        {data && data.events.length === 0 && <p className="pub-empty">The new event calendar is being prepared — check back soon.</p>}
        <div className="pub-events">
          {data?.events.map(ev => (
            <div key={ev.id} className="pub-event">
              <div className="pub-event-date"><strong>{fmtDate(ev.startDate)}</strong>{ev.endDate !== ev.startDate && <span> → {fmtDate(ev.endDate)}</span>}</div>
              <div className="pub-event-body"><span className={`pub-tag-kind pub-kind-${ev.kind}`}>{kindLabel(ev.kind)}</span><h3>{ev.title}</h3>{ev.description && <p>{ev.description}</p>}</div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="pub-admissions" id="admissions">
      <div className="pub-admissions-inner">
        <p className="pub-kicker pub-kicker-light">Admissions open</p>
        <h2>Join our school community.</h2>
        <p>Submit an admission enquiry online in a few minutes. Our admissions team reviews every application and reaches out with the next steps.</p>
        <Link href="/apply" className="pub-btn pub-btn-light">Start an admission enquiry <ArrowRight size={15}/></Link>
      </div>
    </section>

    <footer className="pub-footer">
      <div className="pub-footer-inner">
        <span>{(data?.school.name ?? 'School').toUpperCase()}</span>
        <span>{PLATFORM_NAME.toUpperCase()}</span>
        <Link href="/login">Portal sign in</Link>
      </div>
    </footer>
  </div>;
}

/** Landing shown at "/" for visitors; signed-in users go to the dashboard. */
export function VisitorHomeGate() {
  const [, setLocation] = useLocation();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    import('@/auth-token').then(({ restoreRememberedSession }) => {
      void restoreRememberedSession().then(token => {
        if (token) setLocation('/dashboard');
        else setChecked(true);
      }).catch(() => setChecked(true));
    });
  }, [setLocation]);
  if (!checked) return <div className="pub-loading">Loading…</div>;
  return <PublicHomePage />;
}
