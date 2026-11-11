import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, Briefcase, CalendarDays, CheckCircle2, Clock3, DoorOpen, FileBarChart,
  Globe2, ShieldCheck, UserPlus, UserRound, Wallet,
} from "lucide-react";
import "./Landing.css";

const HERO_VIDEO = "/videos/home-hero.mp4";
const HERO_POSTER = "/images/home-hero-1920.jpg";

const PORTALS = [
  {
    Icon: Briefcase,
    title: "HR Portal",
    text: "Run the whole employee lifecycle from one place.",
    points: ["Employees, grades and departments", "Leave, attendance and payroll", "Recruitment, hiring and resignations"],
  },
  {
    Icon: UserRound,
    title: "Employee Portal",
    text: "Everything an employee needs, any time.",
    points: ["Apply for leave and track approvals", "Attendance, payslips and documents", "Requests, certificates and resignation"],
  },
];

const MODULES = [
  { Icon: UserPlus, title: "Recruitment", text: "Manpower requests, job openings and hiring" },
  { Icon: Clock3, title: "Attendance", text: "Shifts, punches and working hours" },
  { Icon: CalendarDays, title: "Leave", text: "Policies, balances and approvals" },
  { Icon: Wallet, title: "Payroll", text: "Salaries, allowances and payslips" },
  { Icon: DoorOpen, title: "Resignation", text: "Notice, clearance and final settlement" },
  { Icon: FileBarChart, title: "Reports", text: "Workforce insights and exports" },
];

const HIGHLIGHTS = [
  { Icon: ShieldCheck, text: "Secure sign-in" },
  { Icon: Globe2, text: "English & Arabic" },
  { Icon: BadgeCheck, text: "D365 connected" },
];

// Background video that never slows the page down:
// - the light poster shows first; the video only loads after the page has finished loading
// - it pauses while the hero is off screen or the tab is hidden
// - skipped for people who prefer reduced motion
function HeroVideo() {
  const videoRef = useRef(null);
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    let idleId;
    let timerId;
    const start = () => {
      if ("requestIdleCallback" in window) idleId = window.requestIdleCallback(() => setSrc(HERO_VIDEO), { timeout: 1500 });
      else timerId = window.setTimeout(() => setSrc(HERO_VIDEO), 300);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      window.removeEventListener("load", start);
      if (idleId && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
      if (timerId) window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    let onScreen = true;
    const sync = () => {
      if (onScreen && !document.hidden) video.play().catch(() => {});
      else video.pause();
    };

    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); }, { threshold: 0.05 })
      : null;
    observer?.observe(video);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      className={`hm-hero-video${src ? " ready" : ""}`}
      src={src || undefined}
      poster={HERO_POSTER}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

function Home() {
  const [scrolled, setScrolled] = useState(false);

  // Solid navbar once the page scrolls (passive listener, state only changes at the threshold)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="hm">

      <header className={`hm-nav${scrolled ? " scrolled" : ""}`}>
        <div className="hm-container hm-nav-inner">
          <Link to="/" className="hm-brand" aria-label="Shelter Group home">
            <img src="/shelter logo.png" alt="Shelter Group" />
          </Link>
          <nav className="hm-nav-links" aria-label="Sections">
            <a href="#portals">Portals</a>
            <a href="#modules">Modules</a>
          </nav>
          <div className="hm-nav-actions">
            <Link to="/careers" className="hm-btn ghost small">Careers</Link>
            <Link to="/login" className="hm-btn primary small">Login</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hm-hero">
        <HeroVideo />
        <div className="hm-hero-shade" aria-hidden="true" />

        <div className="hm-container hm-hero-inner">
          <span className="hm-kicker">Welcome to Shelter Group</span>
          <h1>
            Human Resource
            <br />
            <em>Management System</em>
          </h1>
          <p>
            One centralized platform to manage employees, attendance, leave,
            payroll, recruitment and every other HR activity, efficiently.
          </p>
          <div className="hm-hero-actions">
            <Link to="/login" className="hm-btn primary">
              Sign in to HRMS <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link to="/careers" className="hm-btn ghost">Explore careers</Link>
          </div>
          <ul className="hm-highlights">
            {HIGHLIGHTS.map(({ Icon, text }) => (
              <li key={text}><Icon size={15} aria-hidden="true" />{text}</li>
            ))}
          </ul>
        </div>

        <a href="#portals" className="hm-scroll" aria-label="Scroll to portals"><span /></a>
      </section>

      {/* Portals */}
      <section className="hm-section hm-portals" id="portals">
        <div className="hm-container">
          <div className="hm-heading">
            <span className="hm-kicker dark">Our portals</span>
            <h2>One system, two experiences</h2>
            <p>HR teams and employees each get a portal built for what they do every day.</p>
          </div>

          <div className="hm-portal-grid">
            {PORTALS.map(({ Icon, title, text, points }) => (
              <article className="hm-portal" key={title}>
                <span className="hm-portal-icon"><Icon size={26} strokeWidth={1.7} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{text}</p>
                <ul>
                  {points.map((point) => (
                    <li key={point}><CheckCircle2 size={16} aria-hidden="true" />{point}</li>
                  ))}
                </ul>
                <Link to="/login" className="hm-portal-link">
                  Sign in <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className="hm-section hm-modules" id="modules">
        <div className="hm-container">
          <div className="hm-heading light">
            <span className="hm-kicker">What you can manage</span>
            <h2>Every HR module in one place</h2>
          </div>

          <div className="hm-module-grid">
            {MODULES.map(({ Icon, title, text }) => (
              <div className="hm-module" key={title}>
                <span className="hm-module-icon"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Careers call to action */}
      <section className="hm-cta">
        <div className="hm-container hm-cta-inner">
          <div>
            <h2>Build your career with Shelter Group</h2>
            <p>See our open positions and apply online in a few minutes.</p>
          </div>
          <Link to="/careers" className="hm-btn primary">
            View open jobs <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="hm-footer">
        <div className="hm-container hm-footer-inner">
          <img src="/shelter logo.png" alt="Shelter Group" />
          <nav aria-label="Footer">
            <Link to="/login">Login</Link>
            <Link to="/careers">Careers</Link>
            <a href="#portals">Portals</a>
          </nav>
          <p>© 2026 Shelter Group. All rights reserved. · HRMS – Human Resource Management System</p>
        </div>
      </footer>

    </div>
  );
}

export default Home;
