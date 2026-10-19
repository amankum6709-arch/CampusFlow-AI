// ============================================================
// Naam: Subjects Setup
// Kya karta hai: Har subject ko course, semester, batches aur section/group teaching scope ke saath map karta hai.
// ============================================================

import { useMemo, useState } from "react";
import SetupStepHeader from "./SetupStepHeader";
import SetupStepIllustrations from "./SetupStepIllustrations";
import { SUBJECT_TYPES } from "../../utils/constants";
import { createEmptySubject } from "../../utils/setupDefaults";

const normalizeSections = (batch) => {
  if (Array.isArray(batch.sections) && batch.sections.length) {
    return batch.sections;
  }

  return [];
};

function SubjectsSetup({ subjects, courses, onChange }) {
  const courseMap = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  const [expandedSubjects, setExpandedSubjects] = useState(new Set());
  const [filterText, setFilterText] = useState("");

  const toggleExpand = (subjectId) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  const expandAll = () => setExpandedSubjects(new Set(subjects.map((s) => s.id)));
  const collapseAll = () => setExpandedSubjects(new Set());

  const filteredSubjects = useMemo(() => {
    if (!filterText.trim()) return subjects;
    const query = filterText.toLowerCase();
    return subjects.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(query) ||
        (s.code || "").toLowerCase().includes(query) ||
        (() => {
          const course = courseMap.get(s.courseId);
          return (course?.name || "").toLowerCase().includes(query);
        })()
    );
  }, [subjects, filterText, courseMap]);

  const updateSubject = (subjectId, patch) => {
    onChange(
      subjects.map((subject) =>
        subject.id === subjectId ? { ...subject, ...patch } : subject,
      ),
    );
  };

  const addSubject = () => onChange([...subjects, createEmptySubject()]);

  const removeSubject = (subjectId) => onChange(subjects.filter((subject) => subject.id !== subjectId));

  const getBatches = (courseId) => courseMap.get(courseId)?.batches || [];

  const toggleBatch = (subjectId, batchId) => {
    const subject = subjects.find((item) => item.id === subjectId);
    if (!subject) return;

    const batchIds = subject.batchIds.includes(batchId)
      ? subject.batchIds.filter((id) => id !== batchId)
      : [...subject.batchIds, batchId];

    // Naam: Automatic Semester Mapping
    // Kya karta hai: Subject ka semester selected batch ke saved Current Semester se automatically sync rakhta hai.
    const subjectBatches = getBatches(subject.courseId);
    const nextSemester = batchIds.length
      ? Number(subjectBatches.find((batch) => batch.id === batchIds[0])?.currentSemester || 1)
      : 1;

    updateSubject(subjectId, { batchIds, semester: nextSemester });
  };

  return (
    <section className="setup-step step-5">
      <SetupStepIllustrations step={5} />
      <SetupStepHeader
        icon="📚"
        title="Subjects"
        description="Define each subject and assign it to the batches that study it. Semester is taken automatically from each batch's Current Semester."
      />

      {subjects.length >= 5 && (
        <div className="compact-list-section">
          <div className="compact-list-header">
            <h4>Quick Overview ({filteredSubjects.length} of {subjects.length})</h4>
          </div>
          <div className="compact-list-table-wrap">
            <table className="compact-list-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Course</th>
                  <th>Type</th>
                  <th>Weekly Periods</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubjects.map((subject) => {
                  const course = courseMap.get(subject.courseId);
                  return (
                    <tr key={subject.id} onClick={() => toggleExpand(subject.id)} className="compact-list-row">
                      <td>{subject.name || "—"}</td>
                      <td>{subject.code || "—"}</td>
                      <td>{course?.name || "—"}</td>
                      <td>{subject.type || "—"}</td>
                      <td>{subject.weeklyPeriods || "—"}</td>
                    </tr>
                  );
                })}
                {!filteredSubjects.length && (
                  <tr><td colSpan={5} className="compact-list-empty">No subjects match the filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subjects.length > 0 && (
        <div className="compact-toolbar">
          <div className="compact-toolbar-left">
            <input
              type="text"
              className="compact-filter-input"
              placeholder="Filter by name, code, or course..."
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

      {filteredSubjects.map((subject, index) => {
        const course = courseMap.get(subject.courseId);
        const batches = getBatches(subject.courseId);
        const isExpanded = expandedSubjects.has(subject.id);

        return (
          <article className={`entity-card collapsible-card ${isExpanded ? "is-expanded" : "is-collapsed"}`} key={subject.id}>
            <div className="entity-card-header">
              <div className="collapsible-card-summary" onClick={() => toggleExpand(subject.id)}>
                <button type="button" className={`collapsible-chevron ${isExpanded ? "rotated" : ""}`} onClick={(e) => { e.stopPropagation(); toggleExpand(subject.id); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
                <div>
                  <span className="entity-label">SUBJECT {subjects.indexOf(subject) + 1}</span>
                  <h3>{subject.name || "New Subject"}</h3>
                  {!isExpanded && (
                    <div className="collapsible-preview">
                      <span>{subject.code || "No code"}</span>
                      <span className="collapsible-dot">·</span>
                      <span>{course?.name || "No course"}</span>
                      <span className="collapsible-dot">·</span>
                      <span>{subject.type || "—"}</span>
                    </div>
                  )}
                </div>
              </div>
              <button type="button" className="danger-text-button" onClick={() => removeSubject(subject.id)}>Remove Subject</button>
            </div>

            {isExpanded && (
              <>
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label>Subject Name</label>
                    <input type="text" value={subject.name} onChange={(event) => updateSubject(subject.id, { name: event.target.value })} placeholder="e.g. Database Management System" />
                  </div>

                  <div className="form-group">
                    <label>Subject Code</label>
                    <input type="text" value={subject.code} onChange={(event) => updateSubject(subject.id, { code: event.target.value })} placeholder="e.g. BCA-301" />
                  </div>

                  <div className="form-group">
                    <label>Course</label>
                    <select value={subject.courseId} onChange={(event) => updateSubject(subject.id, { courseId: event.target.value, batchIds: [], semester: 1 })}>
                      <option value="">Select course</option>
                      {courses.map((courseItem) => <option key={courseItem.id} value={courseItem.id}>{courseItem.name}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Semester</label>
                    <div className="auto-field-value">
                      {subject.batchIds.length
                        ? (() => {
                            const selectedBatches = batches.filter((batch) => subject.batchIds.includes(batch.id));
                            const semesterEntries = selectedBatches.map((batch) => {
                              const current = Number(batch.currentSemester || 1);
                              const course = courses.find((c) => c.id === batch.courseId);
                              const total = course?.totalSemesters || 6;
                              if (current === total) return `Semester ${current}`;
                              return `Semester ${current}-${total}`;
                            });
                            return [...new Set(semesterEntries)].join(" • ");
                          })()
                        : "Select a batch to set automatically"}
                    </div>
                    <small className="field-help">Semesters available from the batch's Current Semester to Total Semesters.</small>
                  </div>

                  <div className="form-group">
                    <label>Subject Type</label>
                    <select value={subject.type} onChange={(event) => updateSubject(subject.id, { type: event.target.value })}>
                      {SUBJECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Weekly Periods</label>
                    <input type="number" min="1" max="20" value={subject.weeklyPeriods} onChange={(event) => updateSubject(subject.id, { weeklyPeriods: Number(event.target.value) })} />
                  </div>

                  <div className="form-group">
                    <label>Class Duration</label>
                    <select value={subject.durationMinutes} onChange={(event) => updateSubject(subject.id, { durationMinutes: Number(event.target.value) })}>
                      <option value="30">30 Minutes</option>
                      <option value="45">45 Minutes</option>
                      <option value="60">60 Minutes</option>
                      <option value="90">90 Minutes</option>
                      <option value="120">120 Minutes</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Scheduling Mode</label>
                    <div className="auto-field-value">
                      {subject.type === "Lab" || subject.type === "Practical"
                        ? "Lab: Groups A/B run separately at the same time"
                        : "Theory: Groups A + B attend together"}
                    </div>
                    <small className="field-help">The mode is determined automatically from Subject Type. You do not need to choose a separate group setting here.</small>
                  </div>
                </div>

                <div className="nested-section">
                  <div className="nested-header">
                    <div>
                      <h4>Batch Assignment</h4>
                      <p>Select exactly which course batches study this subject.</p>
                    </div>
                  </div>

                  {!batches.length && <div className="empty-nested">Add a batch to this course before assigning the subject.</div>}

                  <div className="batch-check-list">
                    {batches.map((batch) => {
                      const sections = normalizeSections(batch);
                      return (
                        <label className={`batch-check-card ${subject.batchIds.includes(batch.id) ? "selected" : ""}`} key={batch.id}>
                          <input type="checkbox" checked={subject.batchIds.includes(batch.id)} onChange={() => toggleBatch(subject.id, batch.id)} />
                          <span>
                            <strong>{batch.name || "Unnamed Batch"}</strong>
                            <small>
                              {course?.name || "Course"} • Admission {batch.admissionMonth || "July"} {batch.admissionYear} • Semester {batch.currentSemester} • {batch.studentCount} students
                            </small>
                            <small>
                              Semester {Number(batch.currentSemester || 1)} • {sections.length} section(s) • {batch.groupsEnabled ? `${batch.groupsPerSection || 2} group(s) per section` : "No groups"}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </article>
        );
      })}

      <button type="button" className="add-campus-btn" onClick={addSubject}>+ Add Another Subject</button>

      {!subjects.length && (
        <div className="empty-state">
          <span>📚</span>
          <h3>No subjects have been added yet</h3>
          <p>Select a course, semester and batch before generating a timetable.</p>
        </div>
      )}
    </section>
  );
}

export default SubjectsSetup;
