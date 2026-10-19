// ======================================================
// CampusHero — illustrated landing hero matching reference
// Visual-only. CTA destinations reuse existing app routes:
// Get Started -> /auth?mode=signup, Watch Video -> /setup.
// Stats/testimonial below are illustrative design placeholders.
// ======================================================
import {
  FiZap,
  FiClock,
  FiUsers,
  FiBarChart2,
  FiAward,
  FiHome,
  FiShield,
} from "react-icons/fi";
import "./CampusHero.css";

const INDICATORS = [
  { icon: <FiZap />, label: "AI Powered" },
  { icon: <FiClock />, label: "Save Time" },
  { icon: <FiUsers />, label: "Reduce Conflicts" },
  { icon: <FiBarChart2 />, label: "Better Utilization" },
];

const STATS = [
  { icon: <FiAward />, value: "100+", label: "Universities Trust Us", tone: "blue" },
  { icon: <FiUsers />, value: "2M+", label: "Students Impacted", tone: "cyan" },
  { icon: <FiHome />, value: "500K+", label: "Classes Scheduled", tone: "lavender" },
  { icon: <FiShield />, value: "99.9%", label: "Uptime & Reliability", tone: "green" },
];

function CampusHero() {
  const go = (path) => {
    window.location.href = path;
  };

  return (
    <section className="campus-hero" aria-label="CampusFlow AI campus overview">
      {/* ── Illustrated scenery (decorative) ── */}
      <div className="campus-scene" aria-hidden="true">
        <svg className="campus-scene-svg" viewBox="0 0 1440 780" preserveAspectRatio="xMidYMid slice">
          {/* sky */}
          <rect x="0" y="0" width="1440" height="780" fill="#48B5F5" />
          <rect x="0" y="0" width="1440" height="560" fill="#5FBEF7" opacity="0.55" />
          {/* soft horizon */}
          <ellipse cx="720" cy="640" rx="760" ry="180" fill="#DFF3FF" opacity="0.85" />
          {/* clouds */}
          <g fill="#FFFFFF" opacity="0.95">
            <ellipse cx="180" cy="200" rx="70" ry="26" />
            <ellipse cx="230" cy="188" rx="52" ry="24" />
            <ellipse cx="700" cy="120" rx="90" ry="28" opacity="0.7" />
            <ellipse cx="1150" cy="170" rx="80" ry="26" />
            <ellipse cx="1200" cy="156" rx="55" ry="22" />
          </g>
          {/* distant city skyline */}
          <g fill="#9CC8EE" opacity="0.85">
            <rect x="430" y="430" width="46" height="120" rx="4" />
            <rect x="484" y="455" width="34" height="95" rx="4" />
            <rect x="880" y="440" width="40" height="110" rx="4" />
            <rect x="1260" y="430" width="52" height="120" rx="4" />
            <rect x="1320" y="460" width="36" height="90" rx="4" />
          </g>
          {/* distant trees */}
          <g fill="#65B95B">
            <circle cx="880" cy="560" r="26" />
            <circle cx="915" cy="565" r="20" />
            <circle cx="640" cy="570" r="22" />
            <circle cx="1360" cy="560" r="30" />
          </g>
          {/* pathway */}
          <path d="M820 780 C 860 700 900 660 980 640 C 1040 625 1100 620 1160 615 L 1160 780 Z" fill="#E8DCC3" opacity="0.9" />
          {/* main lawn */}
          <rect x="0" y="600" width="1440" height="180" fill="#4CAF5D" />
          <rect x="0" y="600" width="1440" height="26" fill="#65B95B" />
          {/* university building with clock tower */}
          <g>
            <rect x="1010" y="470" width="150" height="140" rx="6" fill="#E9C88F" />
            <rect x="1010" y="470" width="150" height="140" rx="6" fill="none" stroke="#B98A4B" strokeWidth="3" />
            <rect x="1055" y="380" width="60" height="110" fill="#F2D9A4" stroke="#B98A4B" strokeWidth="3" />
            <polygon points="1050,380 1120,380 1085,345" fill="#C96F4A" stroke="#A34A2A" strokeWidth="3" strokeLinejoin="round" />
            <rect x="995" y="440" width="180" height="18" rx="4" fill="#C96F4A" />
            <circle cx="1085" cy="412" r="14" fill="#FFFFFF" stroke="#7A5A2E" strokeWidth="3" />
            <line x1="1085" y1="412" x2="1085" y2="403" stroke="#333" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="1085" y1="412" x2="1092" y2="415" stroke="#333" strokeWidth="2.4" strokeLinecap="round" />
            <g fill="#7A5A2E" opacity="0.85">
              <rect x="1024" y="492" width="18" height="26" rx="2" />
              <rect x="1050" y="492" width="18" height="26" rx="2" />
              <rect x="1076" y="492" width="18" height="26" rx="2" />
              <rect x="1102" y="492" width="18" height="26" rx="2" />
              <rect x="1128" y="492" width="18" height="26" rx="2" />
              <rect x="1024" y="530" width="18" height="26" rx="2" />
              <rect x="1050" y="530" width="18" height="26" rx="2" />
              <rect x="1102" y="530" width="18" height="26" rx="2" />
              <rect x="1128" y="530" width="18" height="26" rx="2" />
            </g>
            <rect x="1072" y="566" width="26" height="44" rx="4" fill="#6B4A26" />
            <line x1="1168" y1="352" x2="1168" y2="382" stroke="#6B4A26" strokeWidth="3" />
            <polygon points="1168,348 1192,356 1168,364" fill="#E8823A" />
          </g>
          {/* top-left tree canopy */}
          <g>
            <rect x="30" y="60" width="42" height="300" rx="14" fill="#6B4A26" />
            <g fill="#258C45">
              <circle cx="40" cy="60" r="55" />
              <circle cx="120" cy="45" r="62" />
              <circle cx="210" cy="55" r="52" />
              <circle cx="300" cy="48" r="58" />
              <circle cx="390" cy="55" r="48" />
            </g>
            <g fill="#2FA44F">
              <circle cx="80" cy="80" r="30" />
              <circle cx="250" cy="82" r="28" />
              <circle cx="350" cy="78" r="26" />
            </g>
          </g>
          {/* right trees */}
          <g fill="#258C45">
            <circle cx="1330" cy="470" r="46" />
            <circle cx="1390" cy="490" r="40" />
            <circle cx="1280" cy="500" r="34" />
          </g>
          <rect x="1324" y="510" width="14" height="70" fill="#6B4A26" />
          {/* bushes */}
          <g fill="#2FA44F">
            <ellipse cx="120" cy="660" rx="90" ry="42" />
            <ellipse cx="300" cy="680" rx="70" ry="34" />
            <ellipse cx="1240" cy="670" rx="90" ry="40" />
          </g>
          {/* flowers */}
          <g>
            <g transform="translate(560,660)">
              <line x1="0" y1="0" x2="0" y2="52" stroke="#258C45" strokeWidth="5" strokeLinecap="round" />
              <g fill="#fff" stroke="#E3E9F2" strokeWidth="1.5">
                <circle cx="0" cy="-18" r="10" /><circle cx="12" cy="-6" r="10" /><circle cx="7" cy="10" r="10" /><circle cx="-7" cy="10" r="10" /><circle cx="-12" cy="-6" r="10" />
              </g>
              <circle cx="0" cy="0" r="8" fill="#FFD24A" />
            </g>
            <g transform="translate(640,700)">
              <line x1="0" y1="0" x2="0" y2="46" stroke="#258C45" strokeWidth="5" strokeLinecap="round" />
              <g fill="#fff" stroke="#E3E9F2" strokeWidth="1.5">
                <circle cx="0" cy="-16" r="9" /><circle cx="11" cy="-5" r="9" /><circle cx="6" cy="9" r="9" /><circle cx="-6" cy="9" r="9" /><circle cx="-11" cy="-5" r="9" />
              </g>
              <circle cx="0" cy="0" r="7" fill="#FFD24A" />
            </g>
            <g transform="translate(470,710)">
              <line x1="0" y1="0" x2="0" y2="44" stroke="#258C45" strokeWidth="5" strokeLinecap="round" />
              <g fill="#fff" stroke="#E3E9F2" strokeWidth="1.5">
                <circle cx="0" cy="-15" r="9" /><circle cx="10" cy="-5" r="9" /><circle cx="6" cy="9" r="9" /><circle cx="-6" cy="9" r="9" /><circle cx="-10" cy="-5" r="9" />
              </g>
              <circle cx="0" cy="0" r="7" fill="#FFD24A" />
            </g>
          </g>
        </svg>

        {/* clouds with text */}
        <div className="campus-cloud campus-cloud--right">
          <span>A<br />Smarter<br />Campus<br />Today</span>
        </div>
        <div className="campus-cloud campus-cloud--thought">
          <span>Same<br />Campus<br />More<br />Possibilities</span>
        </div>

        {/* wooden sign */}
        <div className="campus-wood-sign">
          <span>Plan<br />Allocate<br />Schedule<br />Grow<br />Together</span>
        </div>

        {/* direction signboards */}
        <div className="campus-signpost">
          <span className="campus-sign campus-sign--pink">Classrooms</span>
          <span className="campus-sign campus-sign--yellow">Faculty</span>
          <span className="campus-sign campus-sign--blue">Students</span>
          <span className="campus-sign campus-sign--purple">Timetable</span>
        </div>

        {/* books + mug vignette */}
        <div className="campus-desk">
          <div className="campus-books" aria-hidden="true">
            <span className="book book--red">Plan</span>
            <span className="book book--blue">Schedule</span>
            <span className="book book--green">Manage</span>
            <span className="book book--purple">Succeed</span>
          </div>
          <div className="campus-mug">One<br />Schedule<br />at a Time</div>
          <div className="campus-open-book">Ideas<br />into<br />Impact</div>
        </div>

        {/* backpack tag + student */}
        <div className="campus-backpack">Good<br />Students<br />Brighter<br />Futures</div>
        <svg className="campus-butterfly" viewBox="0 0 40 32" aria-hidden="true">
          <ellipse cx="12" cy="12" rx="9" ry="11" fill="#FFD24A" stroke="#B97E0B" strokeWidth="2" />
          <ellipse cx="28" cy="12" rx="9" ry="11" fill="#FFB020" stroke="#B97E0B" strokeWidth="2" />
          <rect x="18" y="6" width="4" height="20" rx="2" fill="#6B4A26" />
        </svg>
        <svg className="campus-bird" viewBox="0 0 48 30" aria-hidden="true">
          <ellipse cx="24" cy="17" rx="14" ry="9" fill="#FFD24A" stroke="#B97E0B" strokeWidth="2" />
          <circle cx="34" cy="11" r="7" fill="#FFD24A" stroke="#B97E0B" strokeWidth="2" />
          <circle cx="36" cy="10" r="1.8" fill="#101B45" />
          <polygon points="41,10 47,12 41,14" fill="#E8823A" />
        </svg>
        <svg className="campus-student" viewBox="0 0 220 180" aria-hidden="true">
          <ellipse cx="110" cy="160" rx="95" ry="20" fill="#1E7A38" opacity="0.55" />
          <rect x="40" y="110" width="140" height="42" rx="21" fill="#F26BA5" />
          <circle cx="80" cy="78" r="30" fill="#F6C79B" />
          <path d="M50 70 Q80 30 112 66 L108 78 Q80 52 54 82 Z" fill="#1769F5" />
          <rect x="48" y="62" width="64" height="12" rx="6" fill="#FFFFFF" opacity="0.85" />
          <rect x="96" y="104" width="60" height="48" rx="14" fill="#FFFFFF" />
          <rect x="30" y="118" width="34" height="52" rx="12" fill="#FFD24A" stroke="#B97E0B" strokeWidth="2.5" />
        </svg>
      </div>

      {/* ── Center content ── */}
      <div className="campus-content">
        <h1 className="campus-title">
          Better Schedules
          <br />
          Brighter Tomorrows
        </h1>
        <p className="campus-subtitle">
          CampusFlow AI simplifies timetable generation, faculty scheduling,
          classroom allocation and academic resource management for modern universities.
        </p>
        <div className="campus-cta">
          <button type="button" className="campus-btn campus-btn--primary" onClick={() => go("/auth?mode=signup")}>
            Get Started <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="campus-btn campus-btn--secondary" onClick={() => go("/setup")}>
            <span className="campus-play" aria-hidden="true">▶</span> Watch Video
          </button>
        </div>
        <ul className="campus-indicators">
          {INDICATORS.map((item) => (
            <li key={item.label}>
              <span className="campus-indicator-icon">{item.icon}</span>
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Stats bar ── */}
      <div className="campus-stats" role="note" aria-label="CampusFlow illustrative highlights">
        <div className="campus-stats-grid">
          {STATS.map((s) => (
            <div className="campus-stat" key={s.label}>
              <span className={`campus-stat-icon campus-stat-icon--${s.tone}`}>{s.icon}</span>
              <span className="campus-stat-text">
                <strong>{s.value}</strong>
                <small>{s.label}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="campus-quote">
          <p>“CampusFlow has transformed the way we plan our academic calendar.”</p>
          <small>— Vice Chancellor, Leading University</small>
        </div>
      </div>
    </section>
  );
}

export default CampusHero;
