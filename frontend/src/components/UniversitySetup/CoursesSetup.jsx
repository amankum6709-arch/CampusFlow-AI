// ============================================================
// Naam: Courses / Batches / Sections / Groups Setup
// Kya karta hai: Course ke multiple batches ko manage karta hai aur har batch ko numbered sections aur optional groups mein divide karta hai.
// ============================================================

import { createId } from "../../utils/helpers";
import { COURSE_DURATIONS } from "../../utils/constants";
import { createSections } from "../../utils/setupDefaults";
import SetupStepIllustrations from "./SetupStepIllustrations";

const normalizeSections = (batch) => {
  if (Array.isArray(batch.sections) && batch.sections.length) {
    return batch.sections.map((section, index) => {
      if (typeof section === "string") {
        return {
          id: createId("section"),
          number: index + 1,
          studentCount: Math.floor(Number(batch.studentCount || 0) / batch.sections.length),
          groupsEnabled: false,
          groups: [],
        };
      }
      return {
        ...section,
        number: Number(section.number || index + 1),
        groups: Array.isArray(section.groups) ? section.groups : [],
        groupsEnabled: Boolean(section.groupsEnabled),
      };
    });
  }

  return createSections(batch.studentCount || 0, batch.sectionCount || 1, Boolean(batch.groupsEnabled), batch.groupsPerSection || 2);
};


const rebuildSections = (batch, sectionCount, groupsEnabled = batch.groupsEnabled, groupsPerSection = batch.groupsPerSection) =>
  createSections(batch.studentCount, sectionCount, groupsEnabled, groupsPerSection);

function CoursesSetup({ courses, campuses, rooms, onChange, onPersist }) {
  const updateAndPersist = (nextCourses) => {
    onChange(nextCourses);
    if (onPersist) {
      onPersist(nextCourses);
    }
  };
  const getRoomCapacityForCourse = (course) => {
    const matchingRooms = (rooms || []).filter((room) => {
      if (!room.timetableAvailable) return false;
      if (["HOD Room", "Staff Room"].includes(room.roomType)) return false;
      if (course.campusId && room.campusId && String(course.campusId) !== String(room.campusId)) return false;
      if (course.buildingId && room.buildingId && String(course.buildingId) !== String(room.buildingId)) return false;
      return Number(room.capacity || 0) > 0;
    });

    const capacities = matchingRooms.map((room) => Number(room.capacity || 0)).filter((capacity) => capacity > 0);
    return capacities.length ? Math.max(...capacities) : 0;
  };

  const getAutomaticSectionCount = (course, studentCount) => {
    const totalStudents = Number(studentCount) || 0;
    const roomCapacity = getRoomCapacityForCourse(course);
    if (totalStudents <= 0) return 1;
    if (roomCapacity <= 0) return 1;
    return Math.max(1, Math.ceil(totalStudents / roomCapacity));
  };
  const updateCourse = (courseId, patch) => {
    updateAndPersist(
      courses.map((course) => {
        if (course.id !== courseId) return course;

        const nextCourse = { ...course, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, "campusId") || Object.prototype.hasOwnProperty.call(patch, "buildingId")) {
          nextCourse.batches = (course.batches || []).map((batch) => {
            const automaticSectionCount = getAutomaticSectionCount(nextCourse, batch.studentCount);
            return {
              ...batch,
              sectionCount: automaticSectionCount,
              sections: rebuildSections(batch, automaticSectionCount, batch.groupsEnabled, batch.groupsPerSection),
            };
          });
        }

        return nextCourse;
      }),
    );
  };

  const addCourse = () => {
    updateAndPersist([
      ...courses,
      {
        id: createId("course"),
        name: "",
        duration: 3,
        totalSemesters: 6,
        campusId: "",
        buildingId: "",
        batches: [],
      },
    ]);
  };

  const removeCourse = (courseId) => {
    updateAndPersist(courses.filter((course) => course.id !== courseId));
  };

  const calculateCurrentSemester = (admissionYear, admissionMonth, totalSemesters) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const admissionMonthNum = admissionMonth === "January" ? 1 : 7;
    const monthsSinceAdmission = (currentYear - admissionYear) * 12 + (currentMonth - admissionMonthNum);
    if (monthsSinceAdmission < 0) return 1;
    const semestersCompleted = Math.floor(monthsSinceAdmission / 6);
    return Math.min(semestersCompleted + 1, totalSemesters);
  };

  const addBatch = (course) => {
    const studentCount = 60;
    const sectionCount = getAutomaticSectionCount(course, studentCount);
    const admissionYear = new Date().getFullYear();
    const admissionMonth = "July";
    const totalSemesters = course.duration * 2;
    const batch = {
      id: createId("batch"),
      name: "",
      admissionYear,
      admissionMonth,
      courseId: course.id,
      duration: course.duration,
      currentSemester: calculateCurrentSemester(admissionYear, admissionMonth, totalSemesters),
      requiredTimetable: true,
      studentCount,
      sectionCount,
      groupsEnabled: false,
      groupsPerSection: 2,
      sections: createSections(studentCount, sectionCount, false, 2),
    };

    updateCourse(course.id, { batches: [...course.batches, batch] });
  };

  const updateBatch = (courseId, batchId, patch) => {
    updateAndPersist(
      courses.map((course) =>
        course.id === courseId
          ? {
              ...course,
              batches: course.batches.map((batch) =>
                batch.id === batchId ? { ...batch, ...patch } : batch,
              ),
            }
          : course,
      ),
    );
  };

  const removeBatch = (courseId, batchId) => {
    updateCourse(courseId, {
      batches: courses
        .find((course) => course.id === courseId)
        ?.batches.filter((batch) => batch.id !== batchId) || [],
    });
  };

  const getBuildings = (campusId) =>
    campuses.find((campus) => campus.id === campusId)?.buildings || [];

  const toggleGroups = (courseId, batchId, enabled) => {
    const course = courses.find((item) => item.id === courseId);
    const batch = course?.batches.find((item) => item.id === batchId);
    if (!batch) return;

    updateBatch(courseId, batchId, {
      groupsEnabled: enabled,
      sections: rebuildSections(batch, batch.sectionCount, enabled, batch.groupsPerSection),
    });
  };

  const updateSectionStructure = (courseId, batchId, key, value) => {
    const course = courses.find((item) => item.id === courseId);
    const batch = course?.batches.find((item) => item.id === batchId);
    if (!batch) return;

    const next = {
      ...batch,
      [key]: value,
    };

    if (key === "studentCount" || key === "groupsPerSection") {
      const automaticSectionCount = getAutomaticSectionCount(course, key === "studentCount" ? value : next.studentCount);
      next.sectionCount = automaticSectionCount;
      next.sections = rebuildSections(
        next,
        automaticSectionCount,
        next.groupsEnabled,
        key === "groupsPerSection" ? value : next.groupsPerSection,
      );
    }

    updateBatch(courseId, batchId, next);
  };



  return (
    <section className="setup-step step-4">
      <SetupStepIllustrations step={4} />
      <div className="step-title">
        <div className="step-icon">🎓</div>
        <div>
          <h2>Courses, Batches, Sections & Groups</h2>
          <p>Define the academic hierarchy used by the timetable: course → batch → numbered sections → optional groups.</p>
        </div>
      </div>

      {courses.map((course, courseIndex) => (
        <article className="entity-card" key={course.id}>
          <div className="entity-card-header">
            <div>
              <span className="entity-label">COURSE {courseIndex + 1}</span>
              <h3>{course.name || "New Course"}</h3>
            </div>
            <button type="button" className="danger-text-button" onClick={() => removeCourse(course.id)}>
              Remove Course
            </button>
          </div>

          <div className="form-grid">
            <div className="form-group full-width">
              <label>Course Name</label>
              <input type="text" value={course.name} onChange={(event) => updateCourse(course.id, { name: event.target.value })} placeholder="e.g. BCA" />
            </div>

            <div className="form-group">
              <label>Course Duration</label>
              <select value={course.duration} onChange={(event) => {
                const duration = Number(event.target.value);
                updateCourse(course.id, {
                  duration,
                  totalSemesters: duration * 2,
                  batches: course.batches.map((batch) => ({ ...batch, duration })),
                });
              }}>
                {COURSE_DURATIONS.map((duration) => <option key={duration} value={duration}>{duration} Years</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Total Semesters (Auto)</label>
              <input type="number" min="1" value={course.totalSemesters} readOnly title="Automatically calculated from course duration (Duration × 2)." />
            </div>

            <div className="form-group">
              <label>Campus</label>
              <select value={course.campusId} onChange={(event) => updateCourse(course.id, { campusId: event.target.value, buildingId: "" })}>
                <option value="">Select campus</option>
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Building / Block</label>
              <select value={course.buildingId} disabled={!course.campusId} onChange={(event) => updateCourse(course.id, { buildingId: event.target.value })}>
                <option value="">Select building</option>
                {getBuildings(course.campusId).map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
              </select>
            </div>
          </div>

          <div className="nested-section">
            <div className="nested-header">
              <div>
                <h4>Course Batches</h4>
                <p>A course can have multiple batches such as 24BCA, 25BCA and 26BCA.</p>
              </div>
              <button type="button" className="small-primary-button" onClick={() => addBatch(course)}>+ Add Batch</button>
            </div>

            {course.batches.map((batch, batchIndex) => {
              const sections = normalizeSections(batch);
              const totalStudents = Number(batch.studentCount || 0);
              const groupsPerSection = Math.max(1, Number(batch.groupsPerSection || 2));

              return (
                <div className="batch-card" key={batch.id}>
                  <div className="batch-header">
                    <strong>Batch {batchIndex + 1}</strong>
                    <button type="button" className="danger-text-button" onClick={() => removeBatch(course.id, batch.id)}>Remove Batch</button>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Batch Name</label>
                      <input type="text" value={batch.name} onChange={(event) => updateBatch(course.id, batch.id, { name: event.target.value })} placeholder="e.g. 24BCA" />
                    </div>
                    <div className="form-group">
                      <label>Admission Year</label>
                      <input type="number" min="1900" value={batch.admissionYear} onChange={(event) => {
                        const admissionYear = Number(event.target.value);
                        const admissionMonth = batch.admissionMonth || "July";
                        updateBatch(course.id, batch.id, {
                          admissionYear,
                          currentSemester: calculateCurrentSemester(admissionYear, admissionMonth, course.totalSemesters),
                        });
                      }} />
                    </div>
                    <div className="form-group">
                      <label>Admission Month</label>
                      <select value={batch.admissionMonth || "July"} onChange={(event) => {
                        const admissionMonth = event.target.value;
                        updateBatch(course.id, batch.id, {
                          admissionMonth,
                          currentSemester: calculateCurrentSemester(batch.admissionYear, admissionMonth, course.totalSemesters),
                        });
                      }}>
                        <option value="January">January</option>
                        <option value="July">July</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Current Semester (Auto)</label>
                      <input type="number" min="1" value={batch.currentSemester} readOnly title="Automatically calculated from admission year and month." />
                    </div>
                    <div className="form-group">
                      <label>Total Students</label>
                      <input type="number" min="1" value={totalStudents} onChange={(event) => updateSectionStructure(course.id, batch.id, "studentCount", Number(event.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>Number of Sections (Automatic)</label>
                      <input
                        type="number"
                        min="1"
                        value={batch.sectionCount || sections.length}
                        readOnly
                        title="Calculated automatically from total students and available room capacity."
                      />
                      <small className="field-help">Calculated from total students and available room capacity.</small>
                    </div>
                    <div className="form-group">
                      <label>Groups per Section</label>
                      <input type="number" min="1" max="10" value={groupsPerSection} disabled={!batch.groupsEnabled} onChange={(event) => updateSectionStructure(course.id, batch.id, "groupsPerSection", Number(event.target.value))} />
                    </div>
                  </div>

                  <div className="batch-structure-summary">
                    <strong>Batch Structure</strong>
                    <span>{totalStudents} students → {sections.length} sections → {batch.groupsEnabled ? `${groupsPerSection} groups per section` : "No groups"}</span>
                    <small>Available room capacities: {(rooms || []).filter((room) => {
                      if (!room.timetableAvailable) return false;
                      if (["HOD Room", "Staff Room"].includes(room.roomType)) return false;
                      if (course.campusId && room.campusId && String(course.campusId) !== String(room.campusId)) return false;
                      if (course.buildingId && room.buildingId && String(course.buildingId) !== String(room.buildingId)) return false;
                      return Number(room.capacity || 0) > 0;
                    }).map((room) => room.capacity).join(", ") || "Not available yet"}</small>
                  </div>

                  <label className="large-toggle section-group-toggle">
                    <input type="checkbox" checked={Boolean(batch.groupsEnabled)} onChange={(event) => toggleGroups(course.id, batch.id, event.target.checked)} />
                    <span>
                      <strong>Enable groups inside each section</strong>
                      <small>Example: Section 1 (50) → Group A (25) + Group B (25).</small>
                    </span>
                  </label>

                  <div className="section-structure-list">
                    {sections.map((section) => {
                      const groups = section.groups || [];
                      return (
                        <div className="section-structure-card" key={section.id}>
                          <div className="section-structure-header">
                            <div>
                              <strong>Section {section.number}</strong>
                              <span>{section.studentCount} students</span>
                            </div>
                          </div>

                          {batch.groupsEnabled && (
                            <div className="group-list">
                              {groups.map((group) => (
                                <div className="group-chip" key={group.id}>
                                  <strong>Group {group.name}</strong>
                                  <span>{group.studentCount} students</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!course.batches.length && <div className="empty-nested">No batches have been added to this course yet.</div>}
          </div>
        </article>
      ))}

      <button type="button" className="add-campus-btn" onClick={addCourse}>+ Add Another Course</button>

      {!courses.length && (
        <div className="empty-state">
          <span>🎓</span>
          <h3>No courses have been added yet</h3>
          <p>Add a course, then define its batches, numbered sections and optional groups.</p>
        </div>
      )}
    </section>
  );
}

export default CoursesSetup;
