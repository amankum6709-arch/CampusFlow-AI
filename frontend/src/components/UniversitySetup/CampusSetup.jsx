// ============================================================
// Naam: Campus Setup
// Kya karta hai: Institution ke campuses aur unke buildings/blocks ka physical structure save karta hai.
// ============================================================

import SetupStepHeader from "./SetupStepHeader";
import SetupStepIllustrations from "./SetupStepIllustrations";
import { createId } from "../../utils/helpers";
import { createBuilding, createCampus } from "../../utils/setupDefaults";

const BLOCK_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function getNextBuildingName(existingBuildings) {
  const existingNames = new Set(
    (existingBuildings || []).map((b) => (b.name || "").trim().toLowerCase()),
  );

  for (let i = 0; i < BLOCK_LETTERS.length; i++) {
    const candidate = `Block ${BLOCK_LETTERS[i]}`;
    if (!existingNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  for (let n = 1; n <= 999; n++) {
    const candidate = `Block ${n}`;
    if (!existingNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `Block ${existingBuildings.length + 1}`;
}

function CampusSetup({ mode, campuses, onModeChange, onChange }) {
  const updateCampus = (campusId, patch) => {
    onChange(
      campuses.map((campus) =>
        campus.id === campusId ? { ...campus, ...patch } : campus,
      ),
    );
  };

  const addCampus = () => {
    onChange([...campuses, createCampus(`Campus ${campuses.length + 1}`)]);
  };

  const removeCampus = (campusId) => {
    if (campuses.length === 1) return;
    onChange(campuses.filter((campus) => campus.id !== campusId));
  };

  const addBuilding = (campusId) => {
    onChange(
      campuses.map((campus) =>
        campus.id === campusId
          ? {
              ...campus,
              buildings: [
                ...campus.buildings,
                createBuilding(getNextBuildingName(campus.buildings)),
              ],
            }
          : campus,
      ),
    );
  };

  const updateBuilding = (campusId, buildingId, value) => {
    onChange(
      campuses.map((campus) =>
        campus.id === campusId
          ? {
              ...campus,
              buildings: campus.buildings.map((building) =>
                building.id === buildingId
                  ? { ...building, name: value }
                  : building,
              ),
            }
          : campus,
      ),
    );
  };

  const removeBuilding = (campusId, buildingId) => {
    onChange(
      campuses.map((campus) => {
        if (campus.id !== campusId || campus.buildings.length === 1) {
          return campus;
        }

        return {
          ...campus,
          buildings: campus.buildings.filter(
            (building) => building.id !== buildingId,
          ),
        };
      }),
    );
  };

  return (
    <section className="setup-step step-2">
      <SetupStepIllustrations step={2} />
      <SetupStepHeader
        icon="🏫"
        title="Campus & Buildings"
        description="Define the physical campus structure. Each building remains linked to its campus."
      />

      <div className="campus-setup-section">
        <label className="campus-question">
          Does your institution have multiple campuses?
        </label>

        <div className="campus-mode-options">
          <button
            type="button"
            className={`campus-mode-card ${mode === "single" ? "active" : ""}`}
            onClick={() => onModeChange("single")}
          >
            <span className="campus-mode-icon">🏢</span>

            <span>
              <strong>Single Campus</strong>
              <small>A campus can contain multiple buildings or blocks.</small>
            </span>
          </button>

          <button
            type="button"
            className={`campus-mode-card ${
              mode === "multiple" ? "active" : ""
            }`}
            onClick={() => onModeChange("multiple")}
          >
            <span className="campus-mode-icon">🏫</span>

            <span>
              <strong>Multiple Campuses</strong>
              <small>Different campuses or branches can be maintained separately.</small>
            </span>
          </button>
        </div>
      </div>

      <div className="campus-list">
        {campuses.map((campus, campusIndex) => (
          <article className="campus-card" key={campus.id}>
            <div className="campus-card-header">
              <div>
                <span className="campus-number">
                  Campus {campusIndex + 1}
                </span>

                <h3>{campus.name || `Campus ${campusIndex + 1}`}</h3>
              </div>

              {campuses.length > 1 && (
                <button
                  type="button"
                  className="remove-campus"
                  onClick={() => removeCampus(campus.id)}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="form-group">
              <label htmlFor={`campus-${campus.id}`}>Campus Name</label>

              <input
                id={`campus-${campus.id}`}
                type="text"
                value={campus.name}
                onChange={(event) =>
                  updateCampus(campus.id, { name: event.target.value })
                }
                placeholder="e.g. Main Campus"
              />
            </div>

            <div className="building-section">
              <div className="building-section-header">
                <div>
                  <label>Buildings / Blocks</label>
                  <p>Define which building belongs to each campus.</p>
                </div>

                <button
                  type="button"
                  className="add-building-btn"
                  onClick={() => addBuilding(campus.id)}
                >
                  + Add Building
                </button>
              </div>

              <div className="building-list">
                {campus.buildings.map((building, buildingIndex) => (
                  <div className="building-row" key={building.id}>
                    <span className="building-icon">🏢</span>

                    <input
                      type="text"
                      value={building.name}
                      onChange={(event) =>
                        updateBuilding(
                          campus.id,
                          building.id,
                          event.target.value,
                        )
                      }
                      placeholder={`Building ${buildingIndex + 1}`}
                    />

                    {campus.buildings.length > 1 && (
                      <button
                        type="button"
                        className="remove-building"
                        onClick={() =>
                          removeBuilding(campus.id, building.id)
                        }
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      {(mode === "multiple" || campuses.length === 0) && (
        <button type="button" className="add-campus-btn" onClick={addCampus}>
          + {campuses.length === 0 ? "Add Campus" : "Add Another Campus"}
        </button>
      )}

      <div className="setup-info">
        <span>💡</span>

        <div>
          <strong>Why this structure matters</strong>

          <p>
            The scheduling engine will know the campus and building for every room. This enables room allocation and floor movement rules.
          </p>
        </div>
      </div>
    </section>
  );
}

export default CampusSetup;
