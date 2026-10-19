// ============================================================
// Naam: Faculty Setup
// Kya karta hai: Faculty master data, Excel import, multi-subject mapping, drag and drop aur availability ko manage karta hai.
// Enhanced with summary bar, search/filters, subject-centric view, and assignment status.
// ============================================================

import { useRef, useState, useMemo } from "react";
import SetupStepHeader from "./SetupStepHeader";
import SetupStepIllustrations from "./SetupStepIllustrations";
import { DAYS } from "../../utils/constants";
import { createEmptyFaculty } from "../../utils/setupDefaults";
import { importFacultyFile, downloadFacultyTemplate } from "../../utils/facultyImport";

const getSubjectContext = (subject, courses) => {
  const course = courses.find((item) => item.id === subject.courseId);
  const batches = (course?.batches || []).filter((batch) => subject.batchIds?.includes(batch.id));
  return {
    courseName: course?.name || "Course not selected",
    batches,
  };
};

function FacultySetup({ faculty, subjects, courses = [], timetable = [], constraints = {}, onChange, onSubjectsChange }) {
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedFaculty, setExpandedFaculty] = useState(new Set());
  const [filterText, setFilterText] = useState("");
  const [courseFilter, setCourseFilter] = useState("All");
  const [semesterFilter, setSemesterFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [expandedSubjectId, setExpandedSubjectId] = useState(null);
  const [assigningSubjectId, setAssigningSubjectId] = useState(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [activeTab, setActiveTab] = useState("subjects");
  const [editingFacultyId, setEditingFacultyId] = useState(null);

  const toggleExpand = (facultyId) => {
    setExpandedFaculty((prev) => {
      const next = new Set(prev);
      if (next.has(facultyId)) next.delete(facultyId);
      else next.add(facultyId);
      return next;
    });
  };

  const expandAll = () => setExpandedFaculty(new Set(faculty.map((f) => f.id)));
  const collapseAll = () => setExpandedFaculty(new Set());

  const filteredFaculty = useMemo(() => {
    if (!filterText.trim()) return faculty;
    const query = filterText.toLowerCase();
    return faculty.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(query) ||
        (p.department || "").toLowerCase().includes(query) ||
        (p.employeeId || "").toLowerCase().includes(query)
    );
  }, [faculty, filterText]);

  const globalDailyLimit = Number(constraints.maxClassesPerDay) || 0;

  const getDailyLoad = (facultyId) => {
    const counts = Object.fromEntries(DAYS.map((day) => [day, 0]));
    (timetable || []).forEach((item) => {
      if (item.facultyId === facultyId && counts[item.day] !== undefined) {
        counts[item.day] += 1;
      }
    });
    return counts;
  };

  const getDailyLoadMax = (facultyId) => {
    const counts = getDailyLoad(facultyId);
    return Math.max(0, ...Object.values(counts));
  };

  const updateFaculty = (facultyId, patch) => {
    onChange(faculty.map((person) => person.id === facultyId ? { ...person, ...patch } : person));
  };

  const addFaculty = () => onChange([...faculty, createEmptyFaculty()]);

  const removeFaculty = (facultyId) => {
    onChange(faculty.filter((person) => person.id !== facultyId));
    onSubjectsChange(subjects.map((subject) => ({
      ...subject,
      facultyIds: (subject.facultyIds || []).filter((id) => id !== facultyId),
    })));
  };

  const toggleSubject = (facultyId, subjectId) => {
    const person = faculty.find((item) => item.id === facultyId);
    if (!person) return;

    const subjectIds = (person.subjectIds || []).includes(subjectId)
      ? person.subjectIds.filter((id) => id !== subjectId)
      : [...(person.subjectIds || []), subjectId];

    updateFaculty(facultyId, { subjectIds });
    onSubjectsChange(subjects.map((subject) => subject.id !== subjectId ? subject : {
      ...subject,
      facultyIds: subjectIds.includes(subjectId)
        ? [...new Set([...(subject.facultyIds || []), facultyId])]
        : (subject.facultyIds || []).filter((id) => id !== facultyId),
    }));
  };

  const toggleDay = (facultyId, day) => {
    const person = faculty.find((item) => item.id === facultyId);
    if (!person) return;
    const days = person.availableDays || [];
    const availableDays = days.includes(day) ? days.filter((item) => item !== day) : [...days, day];
    updateFaculty(facultyId, { availableDays });
  };

  const assignFacultyToSubject = (facultyId, subjectId) => {
    const person = faculty.find((item) => item.id === facultyId);
    if (!person) return;
    if (!(person.subjectIds || []).includes(subjectId)) {
      updateFaculty(facultyId, { subjectIds: [...(person.subjectIds || []), subjectId] });
    }
    onSubjectsChange(subjects.map((subject) => subject.id === subjectId
      ? { ...subject, facultyIds: [...new Set([...(subject.facultyIds || []), facultyId])] }
      : subject));
  };

  const removeFacultyFromSubject = (facultyId, subjectId) => {
    const person = faculty.find((item) => item.id === facultyId);
    if (!person) return;
    updateFaculty(facultyId, { subjectIds: (person.subjectIds || []).filter((id) => id !== subjectId) });
    onSubjectsChange(subjects.map((subject) => subject.id === subjectId
      ? { ...subject, facultyIds: (subject.facultyIds || []).filter((id) => id !== facultyId) }
      : subject));
  };

  const handleFile = async (file) => {
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const result = await importFacultyFile(file, subjects, faculty);
      onChange(result.faculty);
      onSubjectsChange(result.subjects);
      setMessage(`✓ ${result.message}`);
    } catch (error) {
      setMessage(`⚠ ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files?.[0]);
  };

  // ── Summary calculations ──────────────────────────────────────
  const summary = useMemo(() => {
    const totalFaculty = faculty.length;
    const totalSubjects = subjects.length;
    let fullyAssigned = 0;
    let partiallyAssigned = 0;
    let unassigned = 0;

    for (const subject of subjects) {
      const count = (subject.facultyIds || []).length;
      if (count >= 2) fullyAssigned++;
      else if (count === 1) partiallyAssigned++;
      else unassigned++;
    }

    return { totalFaculty, totalSubjects, fullyAssigned, partiallyAssigned, unassigned };
  }, [faculty, subjects]);

  // ── Filtered subjects ─────────────────────────────────────────
  const filteredSubjects = useMemo(() => {
    let list = subjects;

    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter((s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.code || "").toLowerCase().includes(q)
      );
    }

    if (courseFilter !== "All") {
      list = list.filter((s) => s.courseId === courseFilter);
    }

    if (semesterFilter !== "All") {
      list = list.filter((s) => String(s.semester) === semesterFilter);
    }

    if (statusFilter !== "All") {
      list = list.filter((s) => {
        const count = (s.facultyIds || []).length;
        if (statusFilter === "assigned") return count >= 2;
        if (statusFilter === "partial") return count === 1;
        if (statusFilter === "unassigned") return count === 0;
        return true;
      });
    }

    return list;
  }, [subjects, filterText, courseFilter, semesterFilter, statusFilter]);

  const getSubjectStatus = (subject) => {
    const count = (subject.facultyIds || []).length;
    if (count >= 2) return "assigned";
    if (count === 1) return "partial";
    return "unassigned";
  };

  const getSubjectStatusLabel = (status) => {
    if (status === "assigned") return "Fully Assigned";
    if (status === "partial") return "Needs Attention";
    return "Not Assigned";
  };

  const uniqueSemesters = useMemo(() => {
    const set = new Set(subjects.map((s) => String(s.semester || "1")));
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [subjects]);

  const availableFacultyForAssign = useMemo(() => {
    if (!assigningSubjectId) return [];
    const q = assignSearch.toLowerCase();
    return faculty.filter((f) => {
      if (q && !(f.name || "").toLowerCase().includes(q) && !(f.department || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [faculty, assignSearch, assigningSubjectId]);

  return (
    <section className="setup-step step-6">
      <SetupStepIllustrations step={6} />
      <SetupStepHeader
        icon="👨‍🏫"
        title="Faculty"
        description="Import the faculty master once, then assign one faculty member to multiple subjects or multiple faculty members to the same subject."
      />

      {/* ── Top Summary ── */}
      <div className="faculty-summary-bar">
        <div className="summary-item">
          <span className="summary-value">{summary.totalFaculty}</span>
          <span className="summary-label">Faculty</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <span className="summary-value">{summary.totalSubjects}</span>
          <span className="summary-label">Subjects</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-item summary-assigned">
          <span className="summary-value">{summary.fullyAssigned}</span>
          <span className="summary-label">Fully Assigned</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-item summary-partial">
          <span className="summary-value">{summary.partiallyAssigned}</span>
          <span className="summary-label">Needs Attention</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-item summary-unassigned">
          <span className="summary-value">{summary.unassigned}</span>
          <span className="summary-label">Unassigned</span>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="faculty-tabs">
        <button
          type="button"
          className={`faculty-tab ${activeTab === "subjects" ? "active" : ""}`}
          onClick={() => setActiveTab("subjects")}
        >
          Subject Assignments
        </button>
        <button
          type="button"
          className={`faculty-tab ${activeTab === "faculty" ? "active" : ""}`}
          onClick={() => setActiveTab("faculty")}
        >
          Faculty Management
        </button>
        <button
          type="button"
          className={`faculty-tab ${activeTab === "import" ? "active" : ""}`}
          onClick={() => setActiveTab("import")}
        >
          Import / Export
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════
           TAB 1: SUBJECT ASSIGNMENTS
           ════════════════════════════════════════════════════════════ */}
      {activeTab === "subjects" && (
        <div className="faculty-tab-content">
          {/* ── Search & Filters ── */}
          <div className="faculty-filter-bar">
            <input
              type="text"
              className="faculty-search-input"
              placeholder="Search faculty or subject..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {filterText && (
              <button type="button" className="compact-clear-btn" onClick={() => setFilterText("")}>Clear</button>
            )}
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="All">All Courses</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)}>
              <option value="All">All Semesters</option>
              {uniqueSemesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Status</option>
              <option value="assigned">Fully Assigned</option>
              <option value="partial">Needs Attention</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>

          {/* ── Subject Cards ── */}
          <div className="subject-assignment-list">
            {filteredSubjects.length === 0 && (
              <div className="empty-state compact">
                <p>{subjects.length === 0 ? "No subjects available. Add subjects in the Subjects step first." : "No subjects match the current filters."}</p>
              </div>
            )}

            {filteredSubjects.map((subject) => {
              const assigned = (subject.facultyIds || []).map((id) => faculty.find((p) => p.id === id)).filter(Boolean);
              const context = getSubjectContext(subject, courses);
              const status = getSubjectStatus(subject);
              const isExpanded = expandedSubjectId === subject.id;
              const isAssigning = assigningSubjectId === subject.id;

              return (
                <article className={`subject-assignment-card status-${status}`} key={subject.id}>
                  <div className="subject-card-main">
                    <div className="subject-card-info">
                      <div className="subject-card-header">
                        <strong>{subject.name || "Unnamed Subject"}</strong>
                        <span className={`assignment-status-badge ${status}`}>
                          {status === "assigned" ? "✓" : status === "partial" ? "⚠" : "○"} {getSubjectStatusLabel(status)}
                        </span>
                      </div>
                      <small className="subject-meta">
                        {subject.code || "No code"} · {context.courseName}
                        {context.batches.length
                          ? ` · ${context.batches.map((b) => `${b.name || "Batch"} · Sem ${Number(b.currentSemester || 1)}`).join(" · ")}`
                          : " · No batch"}
                      </small>
                      <small className="subject-scope">
                        Scope: {(subject.teachingScope || "section") === "group" ? "Section Group" : "Section"}
                        {context.batches.length ? ` · ${context.batches.map((b) => `${b.studentCount || 0} students`).join(", ")}` : ""}
                      </small>
                    </div>

                    <div className="subject-card-actions">
                      <button
                        type="button"
                        className="edit-room-button"
                        onClick={() => setExpandedSubjectId(isExpanded ? null : subject.id)}
                      >
                        {isExpanded ? "Close" : "Details"}
                      </button>
                      <button
                        type="button"
                        className="small-primary-button"
                        onClick={() => { setAssigningSubjectId(isAssigning ? null : subject.id); setAssignSearch(""); }}
                      >
                        + Assign Faculty
                      </button>
                    </div>
                  </div>

                  {/* ── Assigned Faculty List ── */}
                  <div className="assigned-faculty-chips">
                    {assigned.length > 0 ? assigned.map((person) => (
                      <span className="faculty-chip assigned" key={person.id}>
                        <span className="chip-dot assigned" /> {person.name || "Unnamed"}
                        <button type="button" className="chip-remove" onClick={() => removeFacultyFromSubject(person.id, subject.id)} title="Remove">×</button>
                      </span>
                    )) : (
                      <span className="faculty-chip unassigned">No faculty assigned</span>
                    )}
                  </div>

                  {/* ── Assign Faculty Panel ── */}
                  {isAssigning && (
                    <div className="assign-faculty-panel">
                      <input
                        type="text"
                        placeholder="Search faculty..."
                        value={assignSearch}
                        onChange={(e) => setAssignSearch(e.target.value)}
                        className="assign-search-input"
                        autoFocus
                      />
                      <div className="assign-faculty-list">
                        {availableFacultyForAssign.length === 0 && (
                          <div className="assign-empty">
                            {faculty.length === 0 ? "No faculty available. Add faculty first." : "No faculty match the search."}
                          </div>
                        )}
                        {availableFacultyForAssign.map((person) => {
                          const isAssigned = (subject.facultyIds || []).includes(person.id);
                          return (
                            <label className={`assign-faculty-option ${isAssigned ? "already-assigned" : ""}`} key={person.id}>
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={() => {
                                  if (isAssigned) removeFacultyFromSubject(person.id, subject.id);
                                  else assignFacultyToSubject(person.id, subject.id);
                                }}
                              />
                              <span className="assign-faculty-info">
                                <strong>{person.name || "Unnamed Faculty"}</strong>
                                <small>{person.employeeId || "No ID"} · {person.department || "No Dept"}</small>
                              </span>
                              {isAssigned && <span className="assign-check">✓</span>}
                            </label>
                          );
                        })}
                      </div>
                      <button type="button" className="compact-clear-btn" onClick={() => setAssigningSubjectId(null)}>Done</button>
                    </div>
                  )}

                  {/* ── Expanded Details ── */}
                  {isExpanded && (
                    <div className="subject-detail-panel">
                      <div className="subject-detail-row">
                        <strong>Teaching Scope:</strong> {(subject.teachingScope || "section") === "group" ? "Section Group" : "Section"}
                      </div>
                      {context.batches.length > 0 && (
                        <div className="subject-detail-row">
                          <strong>Batches:</strong> {context.batches.map((b) => `${b.name || "Unnamed"} (${b.studentCount || 0} students, Sem ${Number(b.currentSemester || 1)})`).join(", ")}
                        </div>
                      )}
                      <div className="subject-detail-row">
                        <strong>Weekly Periods:</strong> {subject.weeklyPeriods || 0} · <strong>Duration:</strong> {subject.durationMinutes || 60} min
                      </div>
                      <div className="subject-detail-row">
                        <strong>Type:</strong> {subject.type || "Lecture"}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* ── Drag-and-Drop Assignment Board ── */}
          {faculty.length > 0 && subjects.length > 0 && (
            <div className="faculty-assignment-board">
              <div className="nested-header">
                <div>
                  <h4>Drag-and-Drop Assignment</h4>
                  <p>Drag a faculty card onto a subject to assign.</p>
                </div>
              </div>

              <div className="faculty-drag-grid">
                <div className="faculty-source-list">
                  {faculty.map((person) => (
                    <div className="faculty-drag-card" key={person.id} draggable onDragStart={(event) => event.dataTransfer.setData("facultyId", person.id)}>
                      <span className="drag-handle">⋮⋮</span>
                      <div>
                        <strong>{person.name || "Unnamed Faculty"}</strong>
                        <small>{person.employeeId || "No ID"} · {(person.subjectIds || []).length} subject{(person.subjectIds || []).length !== 1 ? "s" : ""}</small>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="subject-drop-list">
                  {subjects.map((subject) => {
                    const assigned = (subject.facultyIds || []).map((id) => faculty.find((p) => p.id === id)).filter(Boolean);
                    return (
                      <div className="subject-drop-card" key={subject.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                        event.preventDefault();
                        assignFacultyToSubject(event.dataTransfer.getData("facultyId"), subject.id);
                      }}>
                        <div>
                          <strong>{subject.name || "Unnamed Subject"}</strong>
                          <small>{subject.code || "No code"} · {getSubjectContext(subject, courses).courseName}</small>
                        </div>
                        <div className="assigned-faculty-list">
                          {assigned.length ? assigned.map((p) => <span key={p.id}>{p.name}</span>) : <span className="drop-hint">Drop faculty here</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
           TAB 2: FACULTY MANAGEMENT
           ════════════════════════════════════════════════════════════ */}
      {activeTab === "faculty" && (
        <div className="faculty-tab-content">
          {faculty.length > 0 && (
            <div className="compact-toolbar">
              <div className="compact-toolbar-left">
                <input
                  type="text"
                  className="compact-filter-input"
                  placeholder="Filter by name or department..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
                {filterText && (
                  <button type="button" className="compact-clear-btn" onClick={() => setFilterText("")}>Clear</button>
                )}
              </div>
              <div className="compact-toolbar-right">
                <button type="button" className="compact-expand-btn" onClick={expandAll}>Expand All</button>
                <button type="button" className="compact-collapse-btn" onClick={collapseAll}>Collapse All</button>
              </div>
            </div>
          )}

          {filteredFaculty.length === 0 && faculty.length === 0 && (
            <div className="empty-state compact">
              <span>👨‍🏫</span>
              <p><strong>No faculty added yet.</strong></p>
              <p>Add faculty manually or import from Excel.</p>
            </div>
          )}

          {filteredFaculty.length === 0 && faculty.length > 0 && (
            <div className="empty-state compact">
              <p>No faculty match the filter.</p>
            </div>
          )}

          {filteredFaculty.map((person, index) => {
            const isExpanded = expandedFaculty.has(person.id);
            const assignedCount = (person.subjectIds || []).length;
            const assignedSubjects = subjects.filter((s) => (person.subjectIds || []).includes(s.id));
            return (
              <article className={`entity-card collapsible-card ${isExpanded ? "is-expanded" : "is-collapsed"}`} key={person.id}>
                <div className="entity-card-header">
                  <div className="collapsible-card-summary" onClick={() => toggleExpand(person.id)}>
                    <button type="button" className={`collapsible-chevron ${isExpanded ? "rotated" : ""}`} onClick={(e) => { e.stopPropagation(); toggleExpand(person.id); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                    <div>
                      <span className="entity-label">FACULTY {faculty.indexOf(person) + 1}</span>
                      <h3>{person.name || "New Faculty"}</h3>
                      {!isExpanded && (
                        <div className="collapsible-preview">
                          <span>{person.employeeId || "No ID"}</span>
                          <span className="collapsible-dot">·</span>
                          <span>{person.department || "No Dept"}</span>
                          <span className="collapsible-dot">·</span>
                          <span>{assignedCount} subject{assignedCount !== 1 ? "s" : ""}</span>
                          {assignedSubjects.length > 0 && (
                            <>
                              <span className="collapsible-dot">·</span>
                              <span className="collapsible-subjects">{assignedSubjects.slice(0, 3).map((s) => s.name).join(", ")}{assignedSubjects.length > 3 ? ` +${assignedSubjects.length - 3}` : ""}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button type="button" className="danger-text-button" onClick={() => removeFaculty(person.id)}>Remove Faculty</button>
                </div>

                {isExpanded && (
                  <>
                    <div className="form-grid">
                      <div className="form-group"><label>Faculty Name</label><input value={person.name} onChange={(event) => updateFaculty(person.id, { name: event.target.value })} placeholder="e.g. Dr. Rahul Sharma" /></div>
                      <div className="form-group"><label>Employee ID</label><input value={person.employeeId} onChange={(event) => updateFaculty(person.id, { employeeId: event.target.value })} placeholder="e.g. FAC-101" /></div>
                      <div className="form-group"><label>Department</label><input value={person.department || ""} onChange={(event) => updateFaculty(person.id, { department: event.target.value })} placeholder="e.g. Computer Applications" /></div>
                      <div className="form-group faculty-daily-limit-field">
                        <label>Maximum Classes / Day</label>
                        <input
                          type="number"
                          min="1"
                          max={globalDailyLimit || 12}
                          value={person.maxClassesPerDay || 1}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (globalDailyLimit && value > globalDailyLimit) {
                              alert(`Cannot exceed the global limit of ${globalDailyLimit} classes per day.`);
                              return;
                            }
                            updateFaculty(person.id, { maxClassesPerDay: value });
                          }}
                        />
                        <small>Per-faculty limit. Must not exceed the global constraint ({globalDailyLimit || "not set"}).</small>
                      </div>
                    </div>

                    <div className="nested-section faculty-workload-section">
                      <div className="nested-header">
                        <div>
                          <h4>Daily Teaching Load</h4>
                          <p>Actual classes already present in the generated timetable. Lab group assignments count for the faculty member teaching them.</p>
                        </div>
                        <span className="assignment-count">Global limit: {globalDailyLimit || 0}/day</span>
                      </div>
                      {timetable?.length ? (
                        <>
                          <div className="faculty-daily-load-grid">
                            {DAYS.map((day) => {
                              const load = getDailyLoad(person.id)[day];
                              const limit = globalDailyLimit || 0;
                              const overloaded = limit > 0 && load > limit;
                              return (
                                <div className={`faculty-daily-load-card ${overloaded ? "overloaded" : ""}`} key={day}>
                                  <span>{day.slice(0, 3)}</span>
                                  <strong>{load}</strong>
                                  <small>{limit ? `${Math.max(0, limit - load)} left` : "limit not set"}</small>
                                </div>
                              );
                            })}
                          </div>
                          <div className="faculty-load-summary">
                            <strong>Current maximum: {getDailyLoadMax(person.id)}/{globalDailyLimit || 0} classes/day</strong>
                            {getDailyLoadMax(person.id) > (globalDailyLimit || 0) && <span>⚠ Overloaded. Increase the global limit or rearrange the timetable.</span>}
                          </div>
                        </>
                      ) : (
                        <div className="setup-info compact-info"><span>📊</span><div><strong>Generate a timetable to see the actual daily load.</strong><p>The daily limit above is the allowed maximum. After generation, each day's scheduled classes will appear here automatically.</p></div></div>
                      )}
                    </div>

                    <div className="nested-section">
                      <div className="nested-header">
                        <div><h4>Subjects Assigned</h4><p>Select any subjects this faculty member is qualified to teach.</p></div>
                      </div>
                      <div className="batch-check-list">
                        {subjects.map((subject) => {
                          const context = getSubjectContext(subject, courses);
                          return (
                            <label className={`batch-check-card ${(person.subjectIds || []).includes(subject.id) ? "selected" : ""}`} key={subject.id}>
                              <input type="checkbox" checked={(person.subjectIds || []).includes(subject.id)} onChange={() => toggleSubject(person.id, subject.id)} />
                              <span>
                                <strong>{subject.name || "Unnamed Subject"}</strong>
                                <small>{subject.code || "No code"} · {context.courseName} · {context.batches.length ? context.batches.map((batch) => `${batch.name || "Batch"} · Semester ${Number(batch.currentSemester || 1)}`).join(" · ") : "Semester not set"}</small>
                                <small>{context.batches.length ? `For: ${context.batches.map((batch) => batch.name || "Unnamed Batch").join(", ")}` : "For: No batch assigned"}</small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="nested-section">
                      <div className="nested-header"><div><h4>Available Working Days</h4><p>Uncheck days when this faculty member is unavailable.</p></div></div>
                      <div className="section-options">
                        {DAYS.map((day) => (
                          <label className="section-option" key={day}><input type="checkbox" checked={(person.availableDays || []).includes(day)} onChange={() => toggleDay(person.id, day)} />{day}</label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })}

          <button type="button" className="add-campus-btn" onClick={addFaculty}>+ Add Faculty</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
           TAB 3: IMPORT / EXPORT
           ════════════════════════════════════════════════════════════ */}
      {activeTab === "import" && (
        <div className="faculty-tab-content">
          <div className="faculty-import-panel">
            <div className={`faculty-dropzone ${importing ? "is-importing" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
              <div className="faculty-dropzone-icon">↑</div>
              <strong>{importing ? "Importing Faculty Data..." : "Drag & Drop Faculty Excel / CSV here"}</strong>
              <span>Supported: .xlsx, .xls, .csv</span>
              <div className="faculty-import-actions">
                <button type="button" className="secondary-action" onClick={() => fileInputRef.current?.click()} disabled={importing}>Choose File</button>
                <button type="button" className="secondary-action" onClick={downloadFacultyTemplate} disabled={importing}>Download Template</button>
              </div>
              <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleFile(event.target.files?.[0])} />
            </div>
            {message && <div className="faculty-import-message">{message}</div>}
          </div>
        </div>
      )}
    </section>
  );
}

export default FacultySetup;
