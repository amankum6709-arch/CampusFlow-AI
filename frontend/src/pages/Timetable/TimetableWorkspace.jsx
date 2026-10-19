import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";
import { hasFeature, FEATURES } from "../../utils/subscription";
import UpgradePrompt from "../../components/UpgradePrompt/UpgradePrompt";
import AIAssistantPanel from "../../components/AIAssistant/AIAssistantPanel";
import "./TimetableWorkspace.css";

const DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const SUBJECT_COLORS = [
  { bg: "#e8f0fe", border: "#4285f4", text: "#1a3d7c" },
  { bg: "#fce8e6", border: "#ea4335", text: "#7c1d18" },
  { bg: "#e6f4ea", border: "#34a853", text: "#1e5c2b" },
  { bg: "#fef7e0", border: "#fbbc04", text: "#7c6b00" },
  { bg: "#f3e8fd", border: "#a142f4", text: "#4a1578" },
  { bg: "#e0f7fa", border: "#00bcd4", text: "#006064" },
  { bg: "#fbe9e7", border: "#ff5722", text: "#7c2b0e" },
  { bg: "#e8eaf6", border: "#3f51b5", text: "#1a237e" },
  { bg: "#f1f8e9", border: "#689f38", text: "#33691e" },
  { bg: "#fff3e0", border: "#ff9800", text: "#e65100" },
];

function getSubjectColor(name) {
  if (!name) return SUBJECT_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
}

function currentOrgId() {
  try {
    const user = JSON.parse(localStorage.getItem("campusflow.user") || "null");
    if (user?.organization_id) return user.organization_id;
  } catch { /* ignore */ }
  return localStorage.getItem("campusflow.organizationId");
}

function getPeriodTimes(configuration) {
  if (configuration?.period_times) return configuration.period_times;
  const count = Number(configuration?.period_count) || 8;
  const dur = Number(configuration?.period_duration_minutes) || 60;
  const startStr = configuration?.day_start || "09:00";
  const [sh, sm] = startStr.split(":").map(Number);
  let cursor = sh * 60 + sm;
  const times = {};
  for (let i = 1; i <= count; i++) {
    const hh1 = String(Math.floor(cursor / 60)).padStart(2, "0");
    const mm1 = String(cursor % 60).padStart(2, "0");
    const end = cursor + dur;
    const hh2 = String(Math.floor(end / 60)).padStart(2, "0");
    const mm2 = String(end % 60).padStart(2, "0");
    times[String(i)] = `${hh1}:${mm1}-${hh2}:${mm2}`;
    cursor = end;
  }
  return times;
}

function TimetableWorkspace() {
  const [searchParams] = useSearchParams();
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState("");
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragged, setDragged] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState("section");
  const [viewFilter, setViewFilter] = useState("all");
  const [asking, setAsking] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState(null);
  const exportRef = useRef(null);
  const organizationId = currentOrgId();
  const requestedRunId = searchParams.get("run");
  const config = selectedRun?.configuration || {};
  const days = config.days?.length ? config.days : DEFAULT_DAYS;
  const periodTimes = useMemo(() => getPeriodTimes(config), [config]);
  const periodCount = Number(config.period_count) || Object.keys(periodTimes).length || 8;
  const periods = Array.from({ length: periodCount }, (_, i) => i + 1);
  const lunchConfig = config.lunch || {};
  const lunchStart = lunchConfig.start || "12:20";
  const lunchDuration = lunchConfig.duration_minutes || 40;
  const [lunchH, lunchM] = lunchStart.split(":").map(Number);
  const lunchEndMinutes = lunchH * 60 + lunchM + lunchDuration;
  const lunchEnd = `${String(Math.floor(lunchEndMinutes / 60)).padStart(2, "0")}:${String(lunchEndMinutes % 60).padStart(2, "0")}`;

  const loadRuns = useCallback(async () => {
    if (!organizationId) return;
    try {
      const nextRuns = await api.getRuns(organizationId);
      setRuns(nextRuns);
      if (!runId) {
        if (requestedRunId && nextRuns.some((r) => r.id === requestedRunId)) { setRunId(requestedRunId); return; }
        const completed = nextRuns.find((r) => r.status === "COMPLETED");
        if (completed) setRunId(completed.id);
      }
    } catch (err) { setError(err.message); }
  }, [organizationId, runId, requestedRunId]);

  const loadSelectedRun = useCallback(async (id) => {
    if (!id) { setSelectedRun(null); return; }
    try { setSelectedRun(await api.getRun(id)); } catch (err) { setError(err.message); }
  }, []);

  const loadEntries = useCallback(async () => {
    if (!runId) { setEntries([]); return; }
    try {
      const data = await api.getRunEntries(runId);
      setEntries(data);
    } catch (err) { setError(err.message); }
  }, [runId]);

  const loadAnalytics = useCallback(async () => {
    if (!runId) { setAnalytics(null); return; }
    try { setAnalytics(await api.getRunAnalytics(runId)); } catch { setAnalytics(null); }
  }, [runId]);

  useEffect(() => { loadRuns(); }, [loadRuns]);
  useEffect(() => { loadSelectedRun(runId); }, [runId, loadSelectedRun]);
  useEffect(() => { loadEntries(); loadAnalytics(); }, [runId, loadEntries, loadAnalytics]);

  const exportRun = async (format) => {
    setShowExportMenu(false);
    try {
      const data = await api.exportRun(runId, format);
      const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type: format === "csv" ? "text/csv" : "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `timetable.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
  };

  const exportPDF = () => {
    setShowExportMenu(false);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Campus Flow Timetable</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;padding:20px;font-size:12px}
      .header{text-align:center;margin-bottom:16px}
      .header h1{font-size:18px;color:#1e293b}
      .header p{color:#666;font-size:12px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #999;padding:6px 8px;text-align:center;vertical-align:middle;font-size:11px}
      th{background:#1e293b;color:#fff;font-weight:700}
      .day-cell{background:#f0f4ff;font-weight:700;font-size:12px;min-width:70px}
      .time-header{font-size:9px;color:#ccc;font-weight:400}
      .class-cell{text-align:left;min-width:100px;padding:4px}
      .class-cell .subject{font-weight:700;font-size:11px}
      .class-cell .detail{font-size:9px;color:#555}
      .lunch-col{background:#fff3cd !important;font-weight:700;color:#856404}
      .empty-cell{color:#ddd}
      @media print{body{margin:5px}th,td{border:1px solid #666}}
    </style></head><body>
      <div class="header"><h1>Campus Flow Scheduler</h1><p>Timetable</p></div>
      <div id="content"></div></body></html>`);
    win.document.close();

    let html = '<table><thead><tr><th>Day</th>';
    periods.forEach((p) => {
      const timeStr = periodTimes[String(p)] || `P${p}`;
      const isLunchPeriod = p === 4;
      html += `<th>${isLunchPeriod ? "Lunch" : `Period ${p}`}<br/><span style="font-weight:400;font-size:9px;color:#aaa">${isLunchPeriod ? `${lunchStart}-${lunchEnd}` : timeStr}</span></th>`;
    });
    html += "</tr></thead><tbody>";

    days.forEach((day) => {
      html += `<tr><td class="day-cell">${day.slice(0, 3)}</td>`;
      periods.forEach((p) => {
        if (p === 4) {
          html += '<td class="lunch-col">Lunch</td>';
          return;
        }
        const cellEntries = entries.filter((e) => e.day === day && Number(e.period) === p);
        html += '<td class="class-cell">';
        if (cellEntries.length === 0) {
          html += '<span class="empty-cell">-</span>';
        } else {
          cellEntries.forEach((entry) => {
            const display = entry.subject_name || entry.course_name || "—";
            const code = entry.subject_code || entry.course_code || "";
            html += `<div style="margin-bottom:3px"><div class="subject">${display}</div>`;
            if (code) html += `<div class="detail">${code}</div>`;
            html += `<div class="detail">${entry.faculty_name || ""}</div>`;
            html += `<div class="detail">${entry.room_name || ""}</div>`;
            if (entry.section_name) html += `<div class="detail">${entry.section_name}</div>`;
            if (entry.mode === "lab") html += '<div class="detail" style="color:#e65100;font-weight:700">LAB</div>';
            html += "</div>";
          });
        }
        html += "</td>";
      });
      html += "</tr>";
    });

    html += "</tbody></table>";
    win.document.getElementById("content").innerHTML = html;
    win.print();
  };

  const openAssistant = () => {
    if (!hasFeature(FEATURES.AI_ASSISTANT)) {
      setUpgradeFeature(FEATURES.AI_ASSISTANT);
      return;
    }
    setAssistantOpen(true);
  };

  const handleAssistantApplied = async (result) => {
    await loadEntries();
    await loadAnalytics();
    setMessage(`Assistant applied ${result?.applied_changes ?? 0} change(s) and revalidated the timetable.`);
  };

  const askAI = async () => {
    if (!aiQuestion.trim()) return;
    if (!hasFeature(FEATURES.AI_ASSISTANT)) {
      setUpgradeFeature(FEATURES.AI_ASSISTANT);
      return;
    }
    setAsking(true);
    try {
      const result = await api.askAI(runId, aiQuestion);
      setAiAnswer(result.answer);
    } catch (err) { setError(err.message); }
    finally { setAsking(false); }
  };

  const conflicts = useMemo(() => {
    const bySlot = new Map();
    entries.forEach((entry) => {
      const key = `${entry.day}:${entry.period}`;
      if (!bySlot.has(key)) bySlot.set(key, []);
      bySlot.get(key).push(entry);
    });
    const bad = new Set();
    bySlot.forEach((items) => {
      ["faculty_id", "room_id"].forEach((field) => {
        const seen = new Map();
        items.forEach((item) => {
          if (!item[field]) return;
          const key = String(item[field]);
          const previous = seen.get(key);
          if (previous) {
            bad.add(item.id);
            bad.add(previous.id);
          } else {
            seen.set(key, item);
          }
        });
      });
    });
    return bad;
  }, [entries]);

  const sections = useMemo(() => [...new Set(entries.map((e) => e.section_name).filter(Boolean))], [entries]);
  const faculties = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => { if (e.faculty_id && e.faculty_name) map.set(e.faculty_id, e.faculty_name); });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [entries]);
  const rooms = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => { if (e.room_id && e.room_name) map.set(e.room_id, e.room_name); });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [entries]);

  const visibleEntries = useMemo(() => {
    let filtered = entries;
    if (filter === "conflicts") filtered = filtered.filter((e) => conflicts.has(e.id));
    if (filter === "locked") filtered = filtered.filter((e) => e.locked);
    if (viewMode === "section" && viewFilter !== "all") {
      filtered = filtered.filter((e) => e.section_name === viewFilter);
    } else if (viewMode === "faculty" && viewFilter !== "all") {
      filtered = filtered.filter((e) => e.faculty_id === viewFilter);
    } else if (viewMode === "room" && viewFilter !== "all") {
      filtered = filtered.filter((e) => e.room_id === viewFilter);
    }
    return filtered;
  }, [entries, filter, conflicts, viewMode, viewFilter]);

  const updateEntry = async (entry, patch) => {
    try {
      const updated = await api.updateEntry(runId, entry.id, patch);
      setEntries((current) => current.map((item) => item.id === updated.id ? updated : item));
      setError("");
      return updated;
    } catch (err) { setError(err.message); return null; }
  };

  const dropEntry = async (day, period) => {
    if (!dragged) return;
    const updated = await updateEntry(dragged, { day, period });
    if (updated && dragged.session_id) await loadEntries();
    setDragged(null);
  };

  const viewFilters = viewMode === "section" ? sections : viewMode === "faculty" ? faculties.map((f) => f.name) : rooms.map((r) => r.name);

  return (
    <main className="timetable-page">
      <header className="tw-header">
        <div className="tw-header-left">
          <div className="tw-logo"><span className="tw-logo-icon">CF</span><span>Campus Flow Scheduler</span></div>
          <h1 className="tw-title">Timetable</h1>
          {selectedRun && <p className="tw-subtitle">Generated timetable &mdash; {selectedRun.status}{selectedRun.score ? ` (score: ${Number(selectedRun.score).toFixed(1)})` : ""}</p>}
        </div>
        <div className="tw-header-right">
          {runId && (
            <button className="tw-btn tw-btn-primary" onClick={openAssistant}>
              &#10022; Assistant
            </button>
          )}
          <select className="tw-select" value={runId} onChange={(e) => setRunId(e.target.value)}>
            <option value="">Select generation</option>
            {runs.map((run) => <option key={run.id} value={run.id}>{run.status} &middot; {run.id.slice(0, 8)}</option>)}
          </select>
          {runId && (
            <div className="tw-export-group" ref={exportRef}>
              <button className="tw-btn tw-btn-outline" onClick={() => setShowExportMenu(!showExportMenu)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                Export
              </button>
              {showExportMenu && (
                <div className="tw-export-menu">
                  <button onClick={() => exportRun("csv")}>Export CSV</button>
                  <button onClick={() => exportRun("json")}>Export JSON</button>
                  <button onClick={exportPDF}>Export / Print PDF</button>
                </div>
              )}
            </div>
          )}
          <Link to="/setup" className="tw-btn tw-btn-ghost">Setup</Link>
        </div>
      </header>

      {error && <div className="tw-alert tw-alert-error"><span>!</span> {error} <button onClick={() => setError("")}>x</button></div>}
      {message && <div className="tw-alert tw-alert-success"><span>&#10003;</span> {message} <button onClick={() => setMessage("")}>x</button></div>}
      {!organizationId && <div className="tw-empty">No organization connected. Sign in to continue.</div>}

      {analytics && runId && (
        <section className="tw-stats">
          <div className="tw-stat"><div className="tw-stat-value">{analytics.total_entries}</div><div className="tw-stat-label">Scheduled</div></div>
          <div className="tw-stat"><div className="tw-stat-value">{analytics.faculty_workload?.length || 0}</div><div className="tw-stat-label">Faculty</div></div>
          <div className="tw-stat"><div className="tw-stat-value">{analytics.room_utilization?.length || 0}</div><div className="tw-stat-label">Rooms</div></div>
          <div className="tw-stat"><div className="tw-stat-value">{sections.length}</div><div className="tw-stat-label">Sections</div></div>
          <div className="tw-stat tw-stat-wide"><div className="tw-stat-value">{analytics.room_utilization?.[0]?.name || "\u2014"}</div><div className="tw-stat-label">Busiest Room</div></div>
          <div className="tw-stat tw-stat-wide"><div className="tw-stat-value">{analytics.faculty_workload?.[0]?.name || "\u2014"}</div><div className="tw-stat-label">Top Faculty</div></div>
        </section>
      )}

      {runId && (
        <section className="tw-toolbar">
          <div className="tw-toolbar-left">
            <div className="tw-filter-group">
              {[
                ["all", "All"],
                ["conflicts", `Conflicts${conflicts.size ? ` (${conflicts.size})` : ""}`],
                ["locked", "Locked"],
              ].map(([v, label]) => (
                <button key={v} className={`tw-chip ${filter === v ? "tw-chip-active" : ""}`} onClick={() => setFilter(v)}>{label}</button>
              ))}
            </div>
            <div className="tw-divider" />
            <div className="tw-filter-group">
              {[
                ["section", "By Section"],
                ["faculty", "By Faculty"],
                ["room", "By Room"],
              ].map(([v, label]) => (
                <button key={v} className={`tw-chip ${viewMode === v ? "tw-chip-active" : ""}`} onClick={() => { setViewMode(v); setViewFilter("all"); }}>{label}</button>
              ))}
            </div>
            {viewFilters.length > 0 && (
              <>
                <div className="tw-divider" />
                <select className="tw-select tw-select-sm" value={viewFilter} onChange={(e) => setViewFilter(e.target.value)}>
                  <option value="all">All {viewMode === "section" ? "Sections" : viewMode === "faculty" ? "Faculty" : "Rooms"}</option>
                  {viewFilters.map((f) => <option key={typeof f === "object" ? f.id : f} value={typeof f === "object" ? f.name : f}>{typeof f === "object" ? f.name : f}</option>)}
                </select>
              </>
            )}
          </div>
          <div className="tw-legend">
            <span className="tw-legend-item"><span className="tw-dot tw-dot-green" />Valid</span>
            <span className="tw-legend-item"><span className="tw-dot tw-dot-red" />Conflict</span>
            <span className="tw-legend-item"><span className="tw-dot tw-dot-gold" />Locked</span>
          </div>
        </section>
      )}

      {runId && (
        <section className="tw-ai">
          <div className="tw-ai-header">
            <span className="tw-ai-badge">AI</span>
            <strong>Timetable Assistant</strong>
          </div>
          <div className="tw-ai-row">
            <input className="tw-ai-input" value={aiQuestion} onChange={(e) => setAiQuestion(e.target.value)} placeholder="Ask: Which faculty has the highest workload?" onKeyDown={(e) => e.key === "Enter" && askAI()} />
            <button className="tw-btn tw-btn-primary" onClick={askAI} disabled={asking}>{asking ? "Thinking..." : "Ask"}</button>
          </div>
          {aiAnswer && <div className="tw-ai-answer">{aiAnswer}</div>}
        </section>
      )}

      {!runId ? (
        <div className="tw-empty-state">
          <div className="tw-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <h3>No timetable selected</h3>
          <p>Generate a timetable or select a previous run from the dropdown above.</p>
          <Link to="/setup" className="tw-btn tw-btn-primary">Go to Setup</Link>
        </div>
      ) : (
        <div className="timetable-grid-wrapper">
          <table className="tw-table">
            <thead>
              <tr>
                <th className="tw-th-day">Day</th>
                {periods.map((p) => {
                  const timeStr = periodTimes[String(p)] || `P${p}`;
                  const isLunch = p === 4;
                  return (
                    <th key={p} className={`tw-th-period ${isLunch ? "tw-th-lunch" : ""}`}>
                      <div className="tw-period-number">{isLunch ? "Lunch" : `Period ${p}`}</div>
                      <div className="tw-period-time">{isLunch ? `${lunchStart}-${lunchEnd}` : timeStr}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day} className="tw-tr-day">
                  <td className="tw-td-day">{day}</td>
                  {periods.map((p) => {
                    if (p === 4) {
                      return (
                        <td key={`${day}-${p}`} className="tw-td-lunch">
                          <div className="tw-lunch-label">Lunch</div>
                        </td>
                      );
                    }
                    const cellEntries = visibleEntries.filter((e) => e.day === day && Number(e.period) === p);
                    return (
                      <td
                        key={`${day}-${p}`}
                        className={`tw-td-cell ${cellEntries.length > 0 ? "tw-td-filled" : ""}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => dropEntry(day, p)}
                      >
                        {cellEntries.map((entry) => {
                          const color = getSubjectColor(entry.subject_name || entry.course_name);
                          const displayName = entry.subject_name || entry.course_name || "\u2014";
                          const code = entry.subject_code || entry.course_code || "";
                          return (
                            <article
                              key={entry.id}
                              draggable={!entry.locked}
                              onDragStart={() => setDragged(entry)}
                              className={`tw-card ${conflicts.has(entry.id) ? "tw-card-conflict" : ""} ${entry.locked ? "tw-card-locked" : ""}`}
                              style={{ borderLeftColor: color.border, background: color.bg }}
                            >
                              <div className="tw-card-subject" style={{ color: color.text }}>{displayName}</div>
                              {code && <div className="tw-card-code" style={{ color: color.text }}>{code}</div>}
                              <div className="tw-card-faculty">{entry.faculty_name || ""}</div>
                              <div className="tw-card-room">{entry.room_name || ""}</div>
                              <div className="tw-card-meta">
                                {entry.section_name && <span className="tw-card-section">{entry.section_name}</span>}
                                {entry.mode === "lab" && <span className="tw-card-badge tw-card-badge-lab">LAB</span>}
                                {entry.mode === "theory" && <span className="tw-card-badge tw-card-badge-lecture">LEC</span>}
                              </div>
                              <button className="tw-card-lock" onClick={(e) => { e.stopPropagation(); updateEntry(entry, { locked: !entry.locked }); }} title={entry.locked ? "Unlock" : "Lock"}>
                                {entry.locked ? "\uD83D\uDD12" : "\uD83D\uDD13"}
                              </button>
                            </article>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {upgradeFeature && (
        <UpgradePrompt feature={upgradeFeature} onDismiss={() => setUpgradeFeature(null)} />
      )}

      {runId && (
        <AIAssistantPanel
          runId={runId}
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          onApplied={handleAssistantApplied}
        />
      )}
    </main>
  );
}

export default TimetableWorkspace;
