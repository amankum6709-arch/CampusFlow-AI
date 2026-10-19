import Navbar from "../components/Navbar/Navbar";
import CampusHero from "../components/CampusHero/CampusHero";
import Footer from "../components/Footer/Footer";
import "./Home.css";

const ABOUT_FEATURES = [
  { icon: "🧠", title: "Smart Scheduling", desc: "AI-powered algorithm generates optimal timetables respecting all constraints" },
  { icon: "🔍", title: "Conflict Detection", desc: "Automatically finds and resolves faculty, room, and batch clashes" },
  { icon: "🤖", title: "AI Assistant", desc: "Natural language assistant answers questions about your schedule" },
  { icon: "📊", title: "Excel Import", desc: "Bulk import courses, faculty, and rooms from Excel spreadsheets" },
];

const FEATURES = [
  { icon: "🧠", title: "Smart Scheduling", description: "AI-powered scheduling engine generates optimal timetables in seconds, considering faculty workload, room capacity, and batch preferences." },
  { icon: "🔍", title: "Conflict Detection", description: "Automatically detects and resolves faculty, room, batch, section and group clashes before they cause disruptions." },
  { icon: "🇮🇳", title: "Hindi/Hinglish AI Support", description: "Ask questions in Hindi or Hinglish — 'mujhe Monday ka schedule dikhao' — and get instant answers from the AI assistant." },
  { icon: "📥", title: "Excel Import/Export", description: "Bulk import your course, faculty and room data from Excel files. Export timetables in CSV, JSON or PDF format." },
  { icon: "📈", title: "Real-time Analytics", description: "Monitor faculty workload distribution, room utilization, and scheduling efficiency with live dashboards." },
  { icon: "📤", title: "Multi-format Export", description: "Download timetables as CSV, JSON, or PDF. Share directly with students and faculty in one click." },
];

const PLANS = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    features: [
      "Manual timetable generation",
      "Basic conflict detection",
      "Up to 3 courses",
      "CSV export",
      "Community support",
    ],
    primary: false,
  },
  {
    name: "Advanced",
    price: "₹499",
    period: "/month",
    features: [
      "Everything in Free",
      "AI timetable assistant",
      "Hindi/Hinglish natural language",
      "Excel import/export",
      "AI conflict fixing",
      "Unlimited courses",
      "JSON + PDF export",
      "Priority support",
    ],
    primary: true,
  },
];

function Home() {
  const navigate = (path) => { window.location.href = path; };

  return (
    <>
      <Navbar />
      <CampusHero />
      <main className="home-page">
        {/* ABOUT SECTION */}
        <section className="about-section" id="about">
          <div className="section-heading">
            <span className="eyebrow">About CampusFlow AI</span>
            <h2>AI-powered university timetable scheduler</h2>
            <p>
              CampusFlow AI replaces hours of manual scheduling with an intelligent engine
              that understands your university's unique constraints — faculty availability,
              room capacities, batch sizes, and more — to produce conflict-free timetables
              in minutes.
            </p>
          </div>
          <div className="about-features">
            {ABOUT_FEATURES.map((f) => (
              <div className="about-feature-card" key={f.title}>
                <div className="about-feature-icon">{f.icon}</div>
                <div>
                  <h4>{f.title}</h4>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="steps-section" id="how-it-works">
          <div className="section-heading">
            <span className="eyebrow">How it works</span>
            <h2>From data to timetable in 3 simple steps</h2>
          </div>
          <div className="steps-grid">
            {[
              ["01", "Setup", "Add campuses, rooms, courses, batches, subjects, faculty and availability."],
              ["02", "Generate", "Run the AI scheduler that produces an optimal, conflict-free timetable."],
              ["03", "Optimize", "Review, tweak with drag-and-drop, and export your final schedule."],
            ].map(([number, title, description]) => (
              <div className="step-card" key={number}>
                <div className="step-number">{number}</div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section className="features-section" id="features">
          <div className="section-heading">
            <span className="eyebrow">Why CampusFlow AI</span>
            <h2>Everything you need for conflict-free timetables</h2>
            <p>Purpose-built for universities and colleges that need to schedule thousands of classes across campuses, every term.</p>
          </div>
          <div className="features-grid">
            {FEATURES.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* PRICING SECTION */}
        <section className="pricing-section" id="pricing">
          <div className="section-heading">
            <span className="eyebrow">Pricing</span>
            <h2>Choose the plan that fits your university</h2>
            <p>Start free, upgrade when you need AI-powered automation and unlimited courses.</p>
          </div>
          <div className="pricing-grid">
            {PLANS.map((plan) => (
              <div className={`pricing-card ${plan.primary ? "pricing-card-primary" : ""}`} key={plan.name}>
                {plan.primary && <div className="pricing-badge">Most Popular</div>}
                <h3 className="pricing-plan-name">{plan.name}</h3>
                <div className="pricing-price">
                  <span className="pricing-amount">{plan.price}</span>
                  <span className="pricing-period">{plan.period}</span>
                </div>
                <ul className="pricing-features">
                  {plan.features.map((f) => (
                    <li key={f}>
                      <span className="pricing-check">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className={plan.primary ? "pricing-btn-primary" : "pricing-btn-secondary"}
                  onClick={() => plan.primary ? navigate("/auth?mode=signup") : navigate("/setup")}
                >
                  {plan.primary ? "Upgrade to Advanced" : "Get Started Free"}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* CTA SECTION */}
        <section className="cta-section">
          <h2>Ready to build conflict-free timetables?</h2>
          <p>Join forward-thinking universities using CampusFlow AI to save hours of manual scheduling every week.</p>
          <div className="cta-buttons">
            <button className="cta-primary" onClick={() => navigate("/auth?mode=signup")}>Get Started Free →</button>
            <button className="cta-secondary" onClick={() => navigate("/setup")}>Explore the Setup Flow</button>
          </div>
        </section>
      </main>
      <div className="landing-footer">
        <Footer />
      </div>
    </>
  );
}

export default Home;
