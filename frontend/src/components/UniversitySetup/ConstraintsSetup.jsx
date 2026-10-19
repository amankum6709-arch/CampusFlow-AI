// ============================================================
// Naam: Constraints Setup
// Kya karta hai: Timetable generation ke hard aur soft rules ko admin ke control mein deta hai.
// Organized into 5 clear sections: Conflict Rules, Subject Distribution,
// Break & Lunch, Room Movement, and Working Days.
// ============================================================

import SetupStepHeader from "./SetupStepHeader";
import SetupStepIllustrations from "./SetupStepIllustrations";

function ConstraintsSetup({ constraints, onChange }) {
  const update = (key, value) => {
    onChange({
      ...constraints,
      [key]: value,
    });
  };

  return (
    <section className="setup-step step-8">
      <SetupStepIllustrations step={8} />
      <SetupStepHeader
        icon="🧩"
        title="Constraints"
        description="Define the rules CampusFlow must follow while generating the timetable."
      />

      {/* ── Two-column layout ────────────────────────────── */}
      <div className="constraints-columns">

        {/* ── LEFT COLUMN ─────────────────────────────────── */}
        <div className="constraints-col-left">

          {/* SECTION 1: Conflict Rules */}
          <div className="constraints-section">
            <div className="constraints-section-header">
              <h4>Conflict Rules</h4>
              <p>Hard rules that prevent scheduling conflicts. These cannot be disabled.</p>
            </div>

            <div className="constraint-grid">
              <label className="constraint-card">
                <div>
                  <strong>Faculty Clash Avoid</strong>
                  <span>A faculty member cannot teach two classes at the same time.</span>
                </div>
                <input type="checkbox" checked readOnly />
              </label>

              <label className="constraint-card">
                <div>
                  <strong>Room Clash Avoid</strong>
                  <span>A room cannot host two classes at the same time.</span>
                </div>
                <input type="checkbox" checked readOnly />
              </label>

              <label className="constraint-card">
                <div>
                  <strong>Batch Clash Avoid</strong>
                  <span>A batch cannot have two subjects at the same time.</span>
                </div>
                <input type="checkbox" checked readOnly />
              </label>

              <label className="constraint-card">
                <div>
                  <strong>Room Capacity Check</strong>
                  <span>Classes are assigned only to rooms that can accommodate the batch.</span>
                </div>
                <input type="checkbox" checked readOnly />
              </label>
            </div>
          </div>

          {/* SECTION 2: Subject Distribution */}
          <div className="constraints-section">
            <div className="constraints-section-header">
              <h4>Subject Distribution</h4>
              <p>Control how subjects are spread across the timetable.</p>
            </div>

            <div className="constraints-form-grid">
              <div className="form-group">
                <label htmlFor="max-classes">Maximum Classes / Faculty / Day</label>
                <input
                  id="max-classes"
                  type="number"
                  min="1"
                  max="12"
                  value={constraints.maxClassesPerDay}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      update("maxClassesPerDay", 1);
                      return;
                    }
                    const num = Number(raw);
                    if (!Number.isNaN(num)) {
                      update("maxClassesPerDay", Math.max(1, num));
                    }
                  }}
                />
                <small>Maximum number of classes one faculty member can teach in a day.</small>
              </div>

              <div className="form-group">
                <label htmlFor="min-gap">Minimum Gap Between Same Subject (Periods)</label>
                <input
                  id="min-gap"
                  type="number"
                  min="0"
                  max="10"
                  value={constraints.minGapBetweenSameSubject ?? 1}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      update("minGapBetweenSameSubject", 0);
                      return;
                    }
                    const num = Number(raw);
                    if (!Number.isNaN(num)) {
                      update("minGapBetweenSameSubject", Math.max(0, num));
                    }
                  }}
                />
                <small>
                  How many periods should separate two classes of the same subject. 0 = no extra gap, 1 = keep at least one period between.
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="max-subject">Max Same Subject / Section / Day</label>
                <input
                  id="max-subject"
                  type="number"
                  min="0"
                  max="10"
                  value={constraints.maxSameSubjectPerDay ?? 1}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      update("maxSameSubjectPerDay", 0);
                      return;
                    }
                    const num = Number(raw);
                    if (!Number.isNaN(num)) {
                      update("maxSameSubjectPerDay", Math.max(0, num));
                    }
                  }}
                />
                <small>
                  Maximum times the same subject can appear for one section in a day. 0 = no limit.
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────── */}
        <div className="constraints-col-right">

          {/* SECTION 3: Break & Lunch */}
          <div className="constraints-section">
            <div className="constraints-section-header">
              <h4>Break & Lunch</h4>
              <p>Configure teaching breaks and lunch periods.</p>
            </div>

            <div className="constraints-form-grid">
              <div className="form-group">
                <label htmlFor="break-after">Break After Periods</label>
                <input
                  id="break-after"
                  type="number"
                  min="0"
                  max="8"
                  value={constraints.breakAfterPeriods ?? 2}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      update("breakAfterPeriods", 0);
                      return;
                    }
                    const num = Number(raw);
                    if (!Number.isNaN(num)) {
                      update("breakAfterPeriods", Math.max(0, num));
                    }
                  }}
                />
                <small>Insert a short break after this many teaching periods. 0 = no extra break.</small>
              </div>

              <div className="form-group">
                <label htmlFor="break-duration">Break Duration (Minutes)</label>
                <input
                  id="break-duration"
                  type="number"
                  min="0"
                  max="120"
                  value={constraints.breakDuration ?? 15}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      update("breakDuration", 0);
                      return;
                    }
                    const num = Number(raw);
                    if (!Number.isNaN(num)) {
                      update("breakDuration", Math.max(0, num));
                    }
                  }}
                />
                <small>Length of the regular break between teaching periods.</small>
              </div>

              <div className="form-group">
                <label htmlFor="lunch-start">Lunch Start</label>
                <input
                  id="lunch-start"
                  type="time"
                  value={constraints.lunchStart}
                  onChange={(event) =>
                    update("lunchStart", event.target.value)
                  }
                />
                <small>Time when the lunch break begins.</small>
              </div>

              <div className="form-group">
                <label htmlFor="lunch-duration">Lunch Duration (Minutes)</label>
                <input
                  id="lunch-duration"
                  type="number"
                  min="0"
                  max="180"
                  value={constraints.lunchDuration ?? 90}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      update("lunchDuration", 0);
                      return;
                    }
                    const num = Number(raw);
                    if (!Number.isNaN(num)) {
                      update("lunchDuration", Math.max(0, num));
                    }
                  }}
                />
                <small>Length of the lunch break.</small>
              </div>
            </div>
          </div>

          {/* SECTION 4: Room Movement */}
          <div className="constraints-section">
            <div className="constraints-section-header">
              <h4>Room Movement</h4>
              <p>Reduce unnecessary movement between floors and rooms.</p>
            </div>

            <div className="constraints-form-grid">
              <div className="form-group">
                <label htmlFor="max-floor">Maximum Allowed Floor Jump</label>
                <input
                  id="max-floor"
                  type="number"
                  min="0"
                  max="10"
                  value={constraints.maxFloorJump}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      update("maxFloorJump", 0);
                      return;
                    }
                    const num = Number(raw);
                    if (!Number.isNaN(num)) {
                      update("maxFloorJump", Math.max(0, num));
                    }
                  }}
                />
                <small>Prefer rooms that are not too far apart between consecutive classes.</small>
              </div>
            </div>

            <div className="constraints-toggle-row">
              <label className="large-toggle">
                <input
                  type="checkbox"
                  checked={constraints.avoidFloorJump}
                  onChange={(event) =>
                    update("avoidFloorJump", event.target.checked)
                  }
                />

                <span>
                  <strong>Avoid direct jumps from the ground floor to the fourth floor</strong>
                  <small>
                    Reduce unnecessary movement between distant floors for the same faculty member.
                  </small>
                </span>
              </label>
            </div>
          </div>

          {/* SECTION 5: Working Days */}
          <div className="constraints-section">
            <div className="constraints-section-header">
              <h4>Working Days</h4>
              <p>Allow the timetable generator to schedule classes on Saturday.</p>
            </div>

            <div className="constraints-toggle-row">
              <label className="large-toggle">
                <input
                  type="checkbox"
                  checked={constraints.allowSaturday}
                  onChange={(event) =>
                    update("allowSaturday", event.target.checked)
                  }
                />

                <span>
                  <strong>Allow Saturday</strong>
                  <small>
                    When enabled, Saturday is included in timetable generation.
                  </small>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── Hard vs Soft Rules ────────────────────────────── */}
      <div className="constraints-rules-info">
        <div className="constraints-rules-card">
          <div className="constraints-rules-header">
            <span className="constraints-rules-badge constraints-rules-badge--must">Must Follow</span>
            <div>
              <strong>Hard Rules</strong>
              <p>These rules are never violated by the scheduler.</p>
            </div>
          </div>
          <ul className="constraints-rules-list">
            <li>Faculty, batch, and room clashes</li>
            <li>Room capacity limits</li>
            <li>Faculty working days and leave</li>
            <li>Lunch and break schedules</li>
          </ul>
        </div>

        <div className="constraints-rules-card">
          <div className="constraints-rules-header">
            <span className="constraints-rules-badge constraints-rules-badge--pref">Preferences</span>
            <div>
              <strong>Soft Rules</strong>
              <p>These rules help improve timetable quality when possible.</p>
            </div>
          </div>
          <ul className="constraints-rules-list">
            <li>Subject distribution and spacing</li>
            <li>Floor movement preferences</li>
            <li>Faculty daily load preferences</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export default ConstraintsSetup;
