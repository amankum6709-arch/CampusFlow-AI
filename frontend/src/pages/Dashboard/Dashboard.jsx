import { useEffect, useState, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  FiHome, FiCalendar, FiSettings, FiDownload, FiUpload,
  FiBookOpen, FiUsers, FiBook, FiLayers, FiGrid,
  FiClock, FiCheckCircle, FiAlertTriangle, FiXCircle,
  FiActivity, FiZap, FiArrowRight, FiDatabase,
  FiServer, FiCpu, FiFileText, FiTrendingUp,
} from "react-icons/fi";
import { api, getCurrentUser } from "../../services/api";
import { loadBackendSetup } from "../../services/backendSync";
import { getPlan, PLANS } from "../../utils/subscription";
import { downloadSetupTemplate } from "../../utils/setupExcelExport";
import { importSetupFile } from "../../utils/setupExcelImport";
import Navbar from "../../components/Navbar/Navbar";
import "./Dashboard.css";

function currentOrgId() {
  try {
    const user = JSON.parse(localStorage.getItem("campusflow.user") || "null");
    if (user?.organization_id) return user.organization_id;
  } catch { /* ignore */ }
  return localStorage.getItem("campusflow.organizationId");
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function ReadinessRing({ percent, status }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  return (
    <div className="readiness-ring">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle className="readiness-ring-bg" cx="48" cy="48" r={r} />
        <circle
          className={`readiness-ring-fill ${status}`}
          cx="48" cy="48" r={r}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="readiness-percent">{percent}<span className="readiness-percent-sign">%</span></div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="skeleton-grid">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

function Dashboard() {
  const [health, setHealth] = useState("checking");
  const [runs, setRuns] = useState([]);
  const [entriesByRun, setEntriesByRun] = useState({});
  const [user] = useState(getCurrentUser());
  const [plan] = useState(getPlan());
  const organizationId = currentOrgId();
  const [loading, setLoading] = useState(true);
  const [setupCounts, setSetupCounts] = useState({ rooms: 0, faculty: 0, courses: 0, subjects: 0, batches: 0 });
  const [setupData, setSetupData] = useState(null);
  const [lastSetupSave, setLastSetupSave] = useState(null);
  const [lastGeneration, setLastGeneration] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState(null);
  const importInputRef = useRef(null);

  useEffect(() => {
    fetch((import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1").replace(/\/api\/v1$/, "") + "/health")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("API unavailable")))
      .then(() => setHealth("online"))
      .catch(() => setHealth("offline"));
  }, []);

  const loadRuns = async () => {
    if (!organizationId) return;
    try {
      const nextRuns = await api.getRuns(organizationId);
      setRuns(nextRuns);
      const counts = {};
      for (const run of nextRuns.filter((item) => item.status === "COMPLETED")) {
        try {
          const entries = await api.getRunEntries(run.id);
          counts[run.id] = entries.length;
        } catch {
          counts[run.id] = 0;
        }
      }
      setEntriesByRun(counts);

      if (nextRuns.length > 0) {
        const sorted = [...nextRuns].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setLastGeneration(sorted[0].created_at);
      }
    } catch {
      /* no-op */
    }
  };

  const loadSetup = async () => {
    try {
      const data = await loadBackendSetup();
      if (data) {
        setSetupData(data);
        const totalBatches = (data.courses || []).reduce((acc, c) => acc + (c.batches || []).length, 0);
        setSetupCounts({
          rooms: (data.rooms || []).length,
          faculty: (data.faculty || []).length,
          courses: (data.courses || []).length,
          subjects: (data.subjects || []).length,
          batches: totalBatches,
        });
        const savedTs = localStorage.getItem("campusflow.lastSetupSave");
        if (savedTs) setLastSetupSave(savedTs);
      }
    } catch {
      /* no-op */
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadRuns();
      await loadSetup();
      setLoading(false);
    };
    init();
  }, [organizationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportFeedback(null);
    try {
      const imported = await importSetupFile(file);
      if (imported.errors.length > 0) {
        setImportFeedback({ type: "error", message: imported.errors.join("; ") });
      } else {
        const total = imported.rooms.length + imported.courses.length + imported.subjects.length + imported.faculty.length;
        setImportFeedback({ type: "success", message: `Imported ${total} items. Go to Setup to review and save.` });
      }
    } catch (err) {
      setImportFeedback({ type: "error", message: err.message || "Import failed." });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const completed = runs.filter((run) => run.status === "COMPLETED");
  const totalEntries = Object.values(entriesByRun).reduce((a, b) => a + b, 0);
  const aiModifications = runs.reduce((acc, run) => acc + (run.ai_modifications || 0), 0);

  const readiness = useMemo(() => {
    const required = [
      setupCounts.rooms > 0,
      setupCounts.faculty > 0,
      setupCounts.courses > 0,
      setupCounts.subjects > 0,
    ];
    const completedCount = required.filter(Boolean).length;
    const percent = Math.round((completedCount / required.length) * 100);

    let status = "red";
    let message = "Timetable generation cannot start until required data is set up.";
    let itemsNeeded = required.filter((r) => !r).length;

    if (percent === 100) {
      status = "green";
      message = "Your university data is ready for timetable generation.";
      itemsNeeded = 0;
    } else if (percent >= 50) {
      status = "yellow";
      message = "Complete a few more setup items before generating.";
    }

    return { percent, status, message, itemsNeeded };
  }, [setupCounts]);

  const todayClasses = useMemo(() => {
    if (!setupData || totalEntries === 0) return [];
    return [];
  }, [setupData, totalEntries]);

  const timetableHealth = useMemo(() => {
    const lastCompleted = completed[completed.length - 1];
    const entries = lastCompleted ? (entriesByRun[lastCompleted.id] || 0) : 0;
    return { valid: entries, conflicts: 0, missing: 0 };
  }, [completed, entriesByRun]);

  const needsAttention = useMemo(() => {
    const items = [];
    if (setupCounts.rooms === 0) items.push({ text: "No rooms configured", action: "/setup", fix: "Add Rooms" });
    if (setupCounts.faculty === 0) items.push({ text: "No faculty members added", action: "/setup", fix: "Add Faculty" });
    if (setupCounts.subjects === 0) items.push({ text: "No subjects configured", action: "/setup", fix: "Add Subjects" });
    if (setupCounts.courses === 0) items.push({ text: "No courses configured", action: "/setup", fix: "Add Courses" });
    if (setupCounts.batches === 0 && setupCounts.courses > 0) items.push({ text: "Courses exist but no batches defined", action: "/setup", fix: "Add Batches" });
    if (runs.some((r) => r.status === "FAILED")) items.push({ text: "A generation run failed", action: "/timetable", fix: "View Timetable" });
    return items;
  }, [setupCounts, runs]);

  const recentRuns = useMemo(() => {
    return [...runs]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
  }, [runs]);

  const stats = [
    { label: "Rooms", value: setupCounts.rooms, icon: <FiGrid size={18} />, color: "#3b82f6", bg: "#eff6ff", to: "/setup", empty: "No rooms yet" },
    { label: "Faculty", value: setupCounts.faculty, icon: <FiUsers size={18} />, color: "#10b981", bg: "#ecfdf5", to: "/setup", empty: "No faculty yet" },
    { label: "Subjects", value: setupCounts.subjects, icon: <FiBookOpen size={18} />, color: "#8b5cf6", bg: "#f5f3ff", to: "/setup", empty: "No subjects yet" },
    { label: "Batches", value: setupCounts.batches, icon: <FiLayers size={18} />, color: "#f59e0b", bg: "#fffbeb", to: "/setup", empty: "No batches yet" },
    { label: "Courses", value: setupCounts.courses, icon: <FiBook size={18} />, color: "#06b6d4", bg: "#ecfeff", to: "/setup", empty: "No courses yet" },
    { label: "Scheduled", value: totalEntries, icon: <FiCalendar size={18} />, color: "#6366f1", bg: "#eef2ff", to: "/timetable", empty: "Nothing scheduled" },
    { label: "Runs", value: runs.length, icon: <FiZap size={18} />, color: "#8b5cf6", bg: "#f5f3ff", to: null, empty: "No runs yet" },
  ];

  return (
    <div className="dashboard-page">
      <Navbar />
      <main className="dashboard-main">
        {/* ── Welcome Hero ── */}
        <section className="hero">
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">{getGreeting()}, {user?.name || "Administrator"} 👋</h1>
              <p className="hero-subtitle">Manage your university timetable from one intelligent workspace.</p>
            </div>
            <div className="hero-badge">
              <span>{plan === PLANS.ADVANCED ? "⚡ Advanced Plan" : "🎓 Free Plan"}</span>
              {plan !== PLANS.ADVANCED && (
                <Link to="/pricing" className="hero-upgrade">Upgrade</Link>
              )}
            </div>
          </div>
          <div className="hero-decoration" aria-hidden="true">
            <div className="hero-dot hero-dot--1" />
            <div className="hero-dot hero-dot--2" />
            <div className="hero-dot hero-dot--3" />
          </div>
        </section>

        {loading ? (
          <>
            <div className="skeleton skeleton-wide" style={{ marginBottom: 28 }} />
            <SkeletonGrid />
            <SkeletonGrid />
          </>
        ) : (
          <>
            {/* ── Readiness ── */}
            <section className="readiness-card">
              <ReadinessRing percent={readiness.percent} status={readiness.status} />
              <div className="readiness-info">
                <h3>CampusFlow Readiness</h3>
                <div className="readiness-bar-track">
                  <div className={`readiness-bar-fill ${readiness.status}`} style={{ width: `${readiness.percent}%` }} />
                </div>
                <p className="readiness-message">
                  {readiness.message}
                  {readiness.itemsNeeded > 0 && (
                    <span className="readiness-attention"> {readiness.itemsNeeded} item{readiness.itemsNeeded !== 1 ? "s" : ""} need{readiness.itemsNeeded === 1 ? "s" : ""} attention.</span>
                  )}
                </p>
              </div>
              <Link to="/setup" className="btn btn-primary readiness-btn">
                Review Setup
                <FiArrowRight size={15} />
              </Link>
            </section>

            {/* ── Data Overview ── */}
            <div className="section-header">
              <h2 className="section-title">Data Overview</h2>
              <span className="section-subtitle">Your university configuration at a glance</span>
            </div>
            <div className="stats-grid">
              {stats.map(({ label, value, icon, color, bg, to, empty }) => {
                const card = (
                  <article className={`stat-card${!to ? " no-hover" : ""}`} key={label}>
                    <div className="stat-icon" style={{ background: bg, color }}>{icon}</div>
                    <div className="stat-label">{label}</div>
                    <div className="stat-value" style={{ color }}>{value}</div>
                    {value === 0 && <div className="stat-empty">{empty}</div>}
                  </article>
                );
                return to ? <Link key={label} to={to} style={{ textDecoration: "none", color: "inherit" }}>{card}</Link> : card;
              })}
            </div>

            {/* ── Quick Actions ── */}
            <div className="section-header">
              <h2 className="section-title">Quick Actions</h2>
            </div>
            <div className="quick-actions-grid">
              <Link to="/setup" className="quick-action-btn primary" style={{ textDecoration: "none", color: "white" }}>
                <div className="quick-action-icon-wrap primary-icon"><FiZap size={20} /></div>
                <div className="quick-action-text">
                  <span className="quick-action-label">Generate Timetable</span>
                  <span className="quick-action-desc">Configure and generate your schedule</span>
                </div>
                <FiArrowRight size={16} className="quick-action-arrow" />
              </Link>
              <Link to="/timetable" className="quick-action-btn" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="quick-action-icon-wrap"><FiCalendar size={18} /></div>
                <div className="quick-action-text">
                  <span className="quick-action-label">View Timetable</span>
                  <span className="quick-action-desc">See and manage generated schedules</span>
                </div>
                <FiArrowRight size={16} className="quick-action-arrow" />
              </Link>
              <button className="quick-action-btn" onClick={handleImportClick} disabled={importing}>
                <div className="quick-action-icon-wrap"><FiUpload size={18} /></div>
                <div className="quick-action-text">
                  <span className="quick-action-label">{importing ? "Importing..." : "Import Excel"}</span>
                  <span className="quick-action-desc">Bulk import rooms, courses, subjects & faculty</span>
                </div>
                <FiArrowRight size={16} className="quick-action-arrow" />
              </button>
              <button className="quick-action-btn" onClick={downloadSetupTemplate}>
                <div className="quick-action-icon-wrap"><FiDownload size={18} /></div>
                <div className="quick-action-text">
                  <span className="quick-action-label">Download Template</span>
                  <span className="quick-action-desc">Get a blank Excel template for data entry</span>
                </div>
                <FiArrowRight size={16} className="quick-action-arrow" />
              </button>
              <Link to="/setup" className="quick-action-btn" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="quick-action-icon-wrap"><FiSettings size={18} /></div>
                <div className="quick-action-text">
                  <span className="quick-action-label">Continue Setup</span>
                  <span className="quick-action-desc">Complete institution and campus configuration</span>
                </div>
                <FiArrowRight size={16} className="quick-action-arrow" />
              </Link>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFile}
              style={{ display: "none" }}
            />
            {importFeedback && (
              <div className={`import-feedback ${importFeedback.type}`}>
                {importFeedback.type === "success" ? <FiCheckCircle size={16} /> : <FiXCircle size={16} />}
                {importFeedback.message}
              </div>
            )}

            {/* ── Two Column: Today + Health ── */}
            <div className="two-col">
              <div className="dash-card">
                <div className="dash-card-header">
                  <h3><FiClock size={16} className="dash-card-icon" /> Today's Timetable</h3>
                  <Link to="/timetable" className="dash-card-link">View Full <FiArrowRight size={13} /></Link>
                </div>
                {todayClasses.length > 0 ? (
                  <div className="today-list">
                    {todayClasses.map((cls, i) => (
                      <div className="today-item" key={i}>
                        <div className="today-time">{cls.startTime}</div>
                        <div className="today-details">
                          <p className="today-subject">{cls.subject}</p>
                          <div className="today-meta">{cls.room}{cls.faculty ? ` · ${cls.faculty}` : ""}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-state-icon"><FiCalendar size={36} strokeWidth={1.5} /></div>
                    <p className="empty-state-text">
                      {totalEntries > 0
                        ? "Timetable is generated. Visit the Timetable page to view today's schedule."
                        : "No classes scheduled yet. Generate a timetable to see today's schedule."
                      }
                    </p>
                    <Link to="/timetable" className="btn btn-secondary btn-sm">View Timetable</Link>
                  </div>
                )}
              </div>

              <div className="dash-card">
                <div className="dash-card-header">
                  <h3><FiActivity size={16} className="dash-card-icon" /> Timetable Health</h3>
                </div>
                {totalEntries > 0 ? (
                  <>
                    <div className="health-grid">
                      <div className="health-item">
                        <div className="health-dot green" />
                        <span className="health-label">Valid Classes</span>
                        <span className="health-value">{timetableHealth.valid}</span>
                      </div>
                      <div className="health-item">
                        <div className="health-dot amber" />
                        <span className="health-label">Conflicts</span>
                        <span className="health-value">{timetableHealth.conflicts}</span>
                      </div>
                      <div className="health-item">
                        <div className="health-dot green" />
                        <span className="health-label">Completed Runs</span>
                        <span className="health-value">{completed.length}</span>
                      </div>
                      <div className="health-item">
                        <div className="health-dot green" />
                        <span className="health-label">AI Modifications</span>
                        <span className="health-value">{aiModifications}</span>
                      </div>
                    </div>
                    {timetableHealth.conflicts === 0 && (
                      <div className="health-ok">
                        <FiCheckCircle size={15} />
                        No timetable conflicts detected.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-state-icon"><FiTrendingUp size={36} strokeWidth={1.5} /></div>
                    <p className="empty-state-text">Generate a timetable to see health metrics.</p>
                    <Link to="/setup" className="btn btn-secondary btn-sm">Go to Setup</Link>
                  </div>
                )}
              </div>
            </div>

            {/* ── Two Column: Attention + System ── */}
            <div className="two-col">
              <div className="dash-card">
                <div className="dash-card-header">
                  <h3><FiAlertTriangle size={16} className="dash-card-icon" /> Needs Attention</h3>
                </div>
                {needsAttention.length > 0 ? (
                  <div className="attention-list">
                    {needsAttention.map((item, i) => (
                      <div className="attention-item" key={i}>
                        <FiAlertTriangle size={16} className="attention-icon" />
                        <span className="attention-text">{item.text}</span>
                        {item.action && (
                          <Link to={item.action} className="attention-fix">{item.fix}</Link>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state empty-state--success">
                    <div className="empty-state-icon"><FiCheckCircle size={36} strokeWidth={1.5} /></div>
                    <p className="empty-state-text">Everything looks good. No issues require attention.</p>
                  </div>
                )}
              </div>

              <div className="dash-card">
                <div className="dash-card-header">
                  <h3><FiServer size={16} className="dash-card-icon" /> System Health</h3>
                </div>
                <div className="health-status-grid">
                  <div className="health-status-item">
                    <div className={`health-status-dot ${health === "online" ? "online" : "offline"}`} />
                    <FiActivity size={14} className="health-status-icon" />
                    <span className="health-status-label">API</span>
                    <span className={`health-status-value ${health === "online" ? "online" : "offline"}`}>
                      {health === "online" ? "Online" : health === "checking" ? "Checking..." : "Offline"}
                    </span>
                  </div>
                  <div className="health-status-item">
                    <div className={`health-status-dot ${health === "online" ? "online" : "offline"}`} />
                    <FiDatabase size={14} className="health-status-icon" />
                    <span className="health-status-label">Database</span>
                    <span className={`health-status-value ${health === "online" ? "online" : "offline"}`}>
                      {health === "online" ? "Connected" : "Unavailable"}
                    </span>
                  </div>
                  <div className="health-status-item">
                    <div className="health-status-dot online" />
                    <FiCpu size={14} className="health-status-icon" />
                    <span className="health-status-label">Timetable Engine</span>
                    <span className="health-status-value online">Ready</span>
                  </div>
                  <div className="health-status-item">
                    <div className="health-status-dot online" />
                    <FiFileText size={14} className="health-status-icon" />
                    <span className="health-status-label">Excel Import</span>
                    <span className="health-status-value online">Ready</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Recent Activity ── */}
            <div className="dash-card dash-card--full">
              <div className="dash-card-header">
                <h3><FiZap size={16} className="dash-card-icon" /> Recent Generation Activity</h3>
                {runs.length > 0 && <Link to="/timetable" className="dash-card-link">View All <FiArrowRight size={13} /></Link>}
              </div>
              {recentRuns.length > 0 ? (
                <div className="runs-list">
                  {recentRuns.map((run) => (
                    <div className="run-item" key={run.id}>
                      <div className="run-status-icon">
                        {run.status === "COMPLETED" ? (
                          <div className="run-status-dot run-status-dot--success"><FiCheckCircle size={16} /></div>
                        ) : run.status === "FAILED" ? (
                          <div className="run-status-dot run-status-dot--failed"><FiXCircle size={16} /></div>
                        ) : (
                          <div className="run-status-dot run-status-dot--running"><FiActivity size={16} /></div>
                        )}
                      </div>
                      <div className="run-info">
                        <div className="run-title">
                          {run.status === "COMPLETED"
                            ? `Completed — ${entriesByRun[run.id] || 0} classes generated`
                            : run.status === "FAILED"
                              ? "Generation failed"
                              : `Run ${run.status.toLowerCase()}`
                          }
                        </div>
                        <div className="run-meta">
                          {new Date(run.created_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                          {" · "}
                          {new Date(run.created_at).toLocaleTimeString("en-US", {
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <div className="run-actions">
                        <span className={`run-badge ${run.status === "COMPLETED" ? "completed" : run.status === "FAILED" ? "failed" : "running"}`}>
                          {run.status}
                        </span>
                        {run.status === "COMPLETED" && (
                          <Link to={`/timetable?run=${run.id}`} className="run-link">Open <FiArrowRight size={13} /></Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon"><FiZap size={36} strokeWidth={1.5} /></div>
                  <p className="empty-state-text">No timetable generations yet.</p>
                  <Link to="/setup" className="btn btn-primary btn-sm">Generate Timetable</Link>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
