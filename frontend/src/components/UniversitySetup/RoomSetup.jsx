// ============================================================
// Naam: Room Setup
// Kya karta hai: Building ke andar rooms ko bulk generate, edit aur timetable ke liye available mark karta hai.
// Supports two generation modes: Same Type (default) and Mixed Types.
// ============================================================

import { useMemo, useState } from "react";
import SetupStepHeader from "./SetupStepHeader";
import SetupStepIllustrations from "./SetupStepIllustrations";
import { ROOM_TYPES } from "../../utils/constants";
import { createId, getFloorRoomNumber } from "../../utils/helpers";
import { api } from "../../services/api";
import { currentOrgId } from "../../services/backendSync";

function sortRooms(roomList) {
  return [...roomList].sort((a, b) => {
    const campusCmp = (a.campusName || "").localeCompare(b.campusName || "");
    if (campusCmp !== 0) return campusCmp;
    const buildingCmp = (a.buildingName || "").localeCompare(b.buildingName || "");
    if (buildingCmp !== 0) return buildingCmp;
    if (a.floor !== b.floor) return Number(a.floor) - Number(b.floor);
    return String(a.roomNumber || "").localeCompare(String(b.roomNumber || ""), undefined, { numeric: true });
  });
}

const FACILITIES = [
  ["projector", "Projector"],
  ["smartBoard", "Smart Board"],
  ["computers", "Computers"],
  ["ac", "AC"],
];

const initialGenerator = {
  campusId: "",
  buildingId: "",
  floors: 1,
  roomsPerFloor: 10,
  startingRoomNumber: 101,
  roomPrefix: "",
  roomType: "Classroom",
  capacity: 60,
  projector: true,
  smartBoard: true,
  computers: false,
  ac: true,
};

function buildEmptyFloorConfigs(floorCount, roomTypes, defaultCount) {
  return Array.from({ length: floorCount }, () => {
    const cfg = {};
    for (const rt of roomTypes) cfg[rt] = 0;
    return cfg;
  });
}

function RoomSetup({ campuses, rooms, onChange, onPersist }) {
  const [generator, setGenerator] = useState({
    ...initialGenerator,
    floorRoomCounts: [String(initialGenerator.roomsPerFloor)],
  });
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  // Mixed mode state
  const [generationMode, setGenerationMode] = useState("same");
  const [mixedConfig, setMixedConfig] = useState({
    roomTypes: ["Classroom"],
    floorConfigs: [{ Classroom: 0 }],
  });

  // Filter & bulk edit state
  const [roomTypeFilter, setRoomTypeFilter] = useState("All");
  const [selectedRoomIds, setSelectedRoomIds] = useState(new Set());
  const [bulkTypeValue, setBulkTypeValue] = useState(ROOM_TYPES[0]);

  const selectedCampus = useMemo(
    () =>
      campuses.find(
        (campus) => String(campus.id) === String(generator.campusId),
      ),
    [campuses, generator.campusId],
  );

  const buildings = selectedCampus?.buildings || [];

  const floorCount = Number(generator.floors) || 0;
  const floorRoomCounts = (generator.floorRoomCounts || []).map(Number);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setGenerator((previous) => {
      if (name === "floors") {
        const rawFloors = value === "" ? "" : value;
        const nextFloorCount = Math.max(0, Number(rawFloors) || 0);
        const current = Array.isArray(previous.floorRoomCounts)
          ? previous.floorRoomCounts
          : [];
        const nextCounts = Array.from({ length: nextFloorCount }, (_, index) =>
          current[index] ?? String(previous.roomsPerFloor || ""),
        );

        return {
          ...previous,
          floors: rawFloors,
          floorRoomCounts: nextCounts,
        };
      }

      if (name === "roomsPerFloor") {
        const nextDefault = value;
        const current = Array.isArray(previous.floorRoomCounts)
          ? previous.floorRoomCounts
          : [];
        return {
          ...previous,
          roomsPerFloor: nextDefault,
          floorRoomCounts: current.map((count) =>
            count === String(previous.roomsPerFloor) ? nextDefault : count,
          ),
        };
      }

      return {
        ...previous,
        [name]: type === "checkbox" ? checked : value,
        ...(name === "campusId" ? { buildingId: "" } : {}),
      };
    });
  };

  const updateFloorRoomCount = (floorIndex, value) => {
    setGenerator((previous) => {
      const nextCounts = Array.isArray(previous.floorRoomCounts)
        ? [...previous.floorRoomCounts]
        : [];
      nextCounts[floorIndex] = value;
      return { ...previous, floorRoomCounts: nextCounts };
    });
  };

  const selectZeroOnFocus = (event) => {
    if (event.target.value === "0") {
      event.target.select();
    }
  };

  // ── Mixed mode helpers ──────────────────────────────────────────

  const syncMixedFloorConfigs = (newFloorCount, roomTypes, prevConfigs) => {
    const prev = Array.isArray(prevConfigs) ? prevConfigs : [];
    return Array.from({ length: newFloorCount }, (_, i) => {
      if (i < prev.length) {
        const old = prev[i] || {};
        const out = {};
        for (const rt of roomTypes) out[rt] = Number(old[rt]) || 0;
        return out;
      }
      const cfg = {};
      for (const rt of roomTypes) cfg[rt] = 0;
      return cfg;
    });
  };

  const handleMixedFloorsChange = (rawValue) => {
    const nextFloorCount = Math.max(0, Number(rawValue) || 0);
    setMixedConfig((prev) => ({
      ...prev,
      floorConfigs: syncMixedFloorConfigs(nextFloorCount, prev.roomTypes, prev.floorConfigs),
    }));
  };

  const addMixedRoomType = (roomType) => {
    if (!roomType) return;
    setMixedConfig((prev) => {
      if (prev.roomTypes.includes(roomType)) return prev;
      const newTypes = [...prev.roomTypes, roomType];
      const newConfigs = prev.floorConfigs.map((cfg) => ({ ...cfg, [roomType]: 0 }));
      return { roomTypes: newTypes, floorConfigs: newConfigs };
    });
  };

  const removeMixedRoomType = (roomType) => {
    setMixedConfig((prev) => {
      const newTypes = prev.roomTypes.filter((t) => t !== roomType);
      if (newTypes.length === 0) return prev;
      const newConfigs = prev.floorConfigs.map((cfg) => {
        const next = {};
        for (const t of newTypes) next[t] = cfg[t] || 0;
        return next;
      });
      return { roomTypes: newTypes, floorConfigs: newConfigs };
    });
  };

  const updateMixedFloorRoomCount = (floorIndex, roomType, value) => {
    const num = Math.max(0, Number(value) || 0);
    setMixedConfig((prev) => {
      const newConfigs = [...prev.floorConfigs];
      newConfigs[floorIndex] = { ...newConfigs[floorIndex], [roomType]: num };
      return { ...prev, floorConfigs: newConfigs };
    });
  };

  const mixedFloorTotal = (floorIndex) => {
    const cfg = mixedConfig.floorConfigs[floorIndex] || {};
    return Object.values(cfg).reduce((s, v) => s + (Number(v) || 0), 0);
  };

  const mixedFloorRequired = (floorIndex) => {
    return floorRoomCounts[floorIndex] || 0;
  };

  const allFloorsValid = useMemo(() => {
    if (floorCount === 0) return false;
    for (let i = 0; i < floorCount; i++) {
      if (mixedFloorTotal(i) !== mixedFloorRequired(i)) return false;
    }
    return true;
  }, [floorCount, mixedConfig.floorConfigs, floorRoomCounts]);

  // ── Bulk edit helpers ───────────────────────────────────────────

  const toggleRoomSelection = (roomId) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const toggleSelectAll = (visibleRooms) => {
    setSelectedRoomIds((prev) => {
      const allSelected = visibleRooms.every((r) => prev.has(r.id));
      if (allSelected) return new Set();
      return new Set(visibleRooms.map((r) => r.id));
    });
  };

  const applyBulkTypeChange = () => {
    if (selectedRoomIds.size === 0) return;
    const updated = rooms.map((room) =>
      selectedRoomIds.has(room.id) ? { ...room, roomType: bulkTypeValue } : room,
    );
    onChange(updated);
    if (onPersist) onPersist(updated);
    setSelectedRoomIds(new Set());
  };

  // ── Room generation ─────────────────────────────────────────────

  const clearBuildingRooms = async () => {
    const campusId = generator.campusId;
    const buildingId = generator.buildingId;

    if (!campusId || !buildingId) {
      alert("Please select a campus and building first.");
      return;
    }

    const campus = campuses.find(
      (c) => String(c.id) === String(campusId),
    );
    const building = campus?.buildings.find(
      (b) => String(b.id) === String(buildingId),
    );
    const buildingName = building?.name || "this building";

    const roomsInBuilding = rooms.filter(
      (room) =>
        String(room.campusId || "") === String(campusId) &&
        String(room.buildingId || "") === String(buildingId),
    );
    const count = roomsInBuilding.length;

    if (count === 0) {
      alert(`${buildingName} has no rooms to clear.`);
      return;
    }

    const confirmed = window.confirm(
      `Clear all rooms from ${buildingName}?\n\n` +
      `This will permanently remove ${count} room${count === 1 ? "" : "s"}, ` +
      `including manually added rooms.\n\n` +
      `This action cannot be undone.`,
    );

    if (!confirmed) return;

    setClearing(true);
    try {
      const orgId = currentOrgId();
      if (orgId) {
        await api.deleteRoomsByBuilding(orgId, campusId, buildingId);
      }

      const filtered = rooms.filter(
        (room) =>
          String(room.campusId || "") !== String(campusId) ||
          String(room.buildingId || "") !== String(buildingId),
      );
      const sorted = sortRooms(filtered);
      onChange(sorted);
      setEditingRoomId(null);
      setSelectedRoomIds(new Set());
      setRoomTypeFilter("All");

      if (onPersist) {
        onPersist(sorted);
      }

      setLastAction({ type: "clear", buildingName, count });
      setTimeout(() => setLastAction(null), 4000);
    } catch (err) {
      alert(`Failed to clear rooms: ${err.message}`);
    } finally {
      setClearing(false);
    }
  };

  const generateRooms = async () => {
    if (generating) return;

    const campus = campuses.find(
      (item) => String(item.id) === String(generator.campusId),
    );

    const building = campus?.buildings.find(
      (item) => String(item.id) === String(generator.buildingId),
    );

    if (!campus || !building) {
      alert("Please select a campus and building first.");
      return;
    }

    const floors = Number(generator.floors);
    const frc = (generator.floorRoomCounts || []).map(Number);
    const startingRoomNumber = Number(generator.startingRoomNumber);
    const capacity = Number(generator.capacity);

    if (!Number.isInteger(floors) || floors < 1) {
      alert("Number of floors must be at least 1.");
      return;
    }

    if (frc.length !== floors || frc.some((count) => !Number.isInteger(count) || count < 1)) {
      alert("Enter a valid room count for every floor.");
      return;
    }

    if (!Number.isFinite(capacity) || capacity < 1) {
      alert("Default capacity must be at least 1.");
      return;
    }

    if (!Number.isInteger(startingRoomNumber) || startingRoomNumber < 0) {
      alert("Starting room number must be a valid whole number.");
      return;
    }

    // Check if rooms already exist for this building
    const existingCount = rooms.filter(
      (r) =>
        String(r.campusId || "") === String(campus.id) &&
        String(r.buildingId || "") === String(building.id),
    ).length;

    if (existingCount > 0) {
      const confirmed = window.confirm(
        `${building.name} already has ${existingCount} room${existingCount === 1 ? "" : "s"}.\n\n` +
        `Generating new rooms will REPLACE all ${existingCount} existing room${existingCount === 1 ? "" : "s"} in this building.\n\n` +
        `Rooms in other buildings will NOT be affected.\n\n` +
        `Do you want to continue?`,
      );
      if (!confirmed) return;
    }

    setGenerating(true);
    try {
      const prefix = generator.roomPrefix.trim();

      let generated = [];

      if (generationMode === "mixed") {
        // ── Mixed mode generation ──
        for (let fi = 0; fi < floors; fi += 1) {
          const required = frc[fi];
          const cfg = mixedConfig.floorConfigs[fi] || {};
          const configured = Object.values(cfg).reduce((s, v) => s + (Number(v) || 0), 0);
          if (configured !== required) {
            alert(
              `Floor ${fi + 1} requires ${required} rooms but ${configured} are configured. ` +
              `Adjust the room type counts for Floor ${fi + 1}.`,
            );
            setGenerating(false);
            return;
          }
        }

        const batchNames = new Set();
        const normalize = (name) => name.toLowerCase().trim();
        const claimName = (name) => {
          const n = normalize(name);
          if (batchNames.has(n)) return false;
          batchNames.add(n);
          return true;
        };

        for (let fi = 0; fi < floors; fi += 1) {
          const cfg = mixedConfig.floorConfigs[fi] || {};
          for (const roomType of mixedConfig.roomTypes) {
            const qty = Number(cfg[roomType]) || 0;
            for (let idx = 0; idx < qty; idx += 1) {
              const candidateNumber = getFloorRoomNumber(startingRoomNumber, fi + 1, generated.length);
              const roomNumber = prefix ? `${prefix}-${candidateNumber}` : String(candidateNumber);
              if (!claimName(roomNumber)) {
                alert(`Duplicate room number "${roomNumber}" detected. Check your prefix and starting number.`);
                setGenerating(false);
                return;
              }
              generated.push({
                id: createId("room"),
                campusId: campus.id,
                campusName: campus.name,
                buildingId: building.id,
                buildingName: building.name,
                floor: fi + 1,
                roomNumber,
                roomType,
                capacity,
                facilities: {
                  projector: generator.projector,
                  smartBoard: generator.smartBoard,
                  computers: generator.computers,
                  ac: generator.ac,
                },
                timetableAvailable: true,
                isGenerated: true,
              });
            }
          }
        }
      } else {
        // ── Same type mode generation (existing logic, unchanged) ──
        const batchNames = new Set();
        const normalize = (name) => name.toLowerCase().trim();
        const claimName = (name) => {
          const n = normalize(name);
          if (batchNames.has(n)) return false;
          batchNames.add(n);
          return true;
        };

        for (let floor = 1; floor <= floors; floor += 1) {
          const roomsOnThisFloor = frc[floor - 1];
          for (let index = 0; index < roomsOnThisFloor; index += 1) {
            const candidateNumber = getFloorRoomNumber(startingRoomNumber, floor, index);
            const roomNumber = prefix ? `${prefix}-${candidateNumber}` : String(candidateNumber);
            if (!claimName(roomNumber)) {
              alert(`Duplicate room number "${roomNumber}" detected. Check your prefix and starting number.`);
              setGenerating(false);
              return;
            }
            generated.push({
              id: createId("room"),
              campusId: campus.id,
              campusName: campus.name,
              buildingId: building.id,
              buildingName: building.name,
              floor,
              roomNumber,
              roomType: generator.roomType,
              capacity,
              facilities: {
                projector: generator.projector,
                smartBoard: generator.smartBoard,
                computers: generator.computers,
                ac: generator.ac,
              },
              timetableAvailable: true,
              isGenerated: true,
            });
          }
        }
      }

      if (generated.length === 0) {
        alert("No rooms were generated. Check your input values.");
        return;
      }

      // REPLACE rooms for this building (idempotent). Keep rooms from other buildings.
      const otherRooms = rooms.filter(
        (room) =>
          String(room.campusId || "") !== String(campus.id) ||
          String(room.buildingId || "") !== String(building.id),
      );
      const allRooms = sortRooms([...otherRooms, ...generated]);
      onChange(allRooms);
      setEditingRoomId(null);
      setSelectedRoomIds(new Set());
      setRoomTypeFilter("All");

      if (onPersist) {
        onPersist(allRooms);
      }

      setLastAction({
        type: "generate",
        buildingName: building.name,
        campusName: campus.name,
        count: generated.length,
        rooms: generated.slice(0, 8).map((r) => r.roomNumber),
        more: generated.length > 8 ? generated.length - 8 : 0,
      });
      setTimeout(() => setLastAction(null), 5000);
    } catch (err) {
      console.error("Room generation failed:", err);
      alert(`Failed to generate rooms: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const updateRoom = (roomId, patch) => {
    const updated = rooms.map((room) =>
      room.id === roomId ? { ...room, ...patch } : room,
    );
    onChange(updated);
    if (onPersist) {
      onPersist(updated);
    }
  };

  const updateFacility = (roomId, key, value) => {
    const updated = rooms.map((room) =>
      room.id === roomId
        ? {
            ...room,
            facilities: {
              ...room.facilities,
              [key]: value,
            },
          }
        : room,
    );
    onChange(updated);
    if (onPersist) {
      onPersist(updated);
    }
  };

  const deleteRoom = async (roomId) => {
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      const orgId = currentOrgId();
      if (orgId) {
        try {
          await api.deleteRoom(roomId, orgId);
        } catch {
          // Room may not exist in backend yet (generated but not saved).
          // Continue with local removal.
        }
      }
    }
    const updated = rooms.filter((r) => r.id !== roomId);
    onChange(updated);
    if (onPersist) {
      onPersist(updated);
    }
  };

  // ── Filtered rooms for display ──────────────────────────────────

  const visibleRooms = useMemo(() => {
    if (roomTypeFilter === "All") return rooms;
    return rooms.filter((r) => r.roomType === roomTypeFilter);
  }, [rooms, roomTypeFilter]);

  const roomTypeCounts = useMemo(() => {
    const counts = {};
    for (const r of rooms) counts[r.roomType] = (counts[r.roomType] || 0) + 1;
    return counts;
  }, [rooms]);

  const uniqueRoomTypes = useMemo(() => [...new Set(rooms.map((r) => r.roomType))], [rooms]);

  // ── Available room types for mixed mode dropdown ────────────────

  const [newMixedType, setNewMixedType] = useState(ROOM_TYPES[0]);

  const availableTypesForAdd = useMemo(() => {
    return ROOM_TYPES.filter((t) => !mixedConfig.roomTypes.includes(t));
  }, [mixedConfig.roomTypes]);

  return (
    <section className="setup-step step-3">
      <SetupStepIllustrations step={3} />
      <SetupStepHeader
        icon="🚪"
        title="Rooms"
        description="Define classrooms, labs and other spaces for timetable allocation."
      />

      <div className="room-generator-card">
        <div className="room-section-header">
          <div>
            <h3>Generate Rooms in Bulk</h3>
            <p>
              Choose the starting room number and room count for each floor.
            </p>
          </div>
        </div>

        {/* ── Generation Mode Toggle ── */}
        <div className="room-generation-mode">
          <label className="mode-label">Room Generation Mode</label>
          <div className="mode-options">
            <label className="mode-option">
              <input
                type="radio"
                name="generationMode"
                value="same"
                checked={generationMode === "same"}
                onChange={() => setGenerationMode("same")}
              />
              <span>Same type for all rooms</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="generationMode"
                value="mixed"
                checked={generationMode === "mixed"}
                onChange={() => setGenerationMode("mixed")}
              />
              <span>Mixed room types</span>
            </label>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="room-campus">Campus</label>

            <select
              id="room-campus"
              name="campusId"
              value={generator.campusId}
              onChange={handleChange}
            >
              <option value="">Select campus</option>

              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name || "Unnamed Campus"}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="room-building">Building / Block</label>

            <select
              id="room-building"
              name="buildingId"
              value={generator.buildingId}
              onChange={handleChange}
              disabled={!selectedCampus}
            >
              <option value="">Select building</option>

              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name || "Unnamed Building"}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="room-floors">Number of Floors</label>

            <input
              id="room-floors"
              type="number"
              min="1"
              name="floors"
              value={generator.floors}
              onChange={(e) => {
                handleChange(e);
                if (generationMode === "mixed") handleMixedFloorsChange(e.target.value);
              }}
              onFocus={selectZeroOnFocus}
            />
          </div>

          <div className="form-group">
            <label htmlFor="rooms-per-floor">Default Rooms per Floor</label>

            <input
              id="rooms-per-floor"
              type="number"
              min="1"
              name="roomsPerFloor"
              value={generator.roomsPerFloor}
              onChange={handleChange}
              onFocus={selectZeroOnFocus}
            />
          </div>

          <div className="form-group full-width">
            <label>Rooms by Floor</label>
            <div className="floor-room-counts">
              {(generator.floorRoomCounts || []).map((count, index) => (
                <div className="floor-room-count" key={`floor-${index + 1}`}>
                  <span>Floor {index + 1}</span>
                  <input
                    type="number"
                    min="1"
                    value={count}
                    onChange={(event) => updateFloorRoomCount(index, event.target.value)}
                    onFocus={selectZeroOnFocus}
                    aria-label={`Rooms on Floor ${index + 1}`}
                  />
                </div>
              ))}
            </div>
            <small className="field-help">Set a different room count for each floor when needed.</small>
          </div>

          <div className="form-group">
            <label htmlFor="starting-room-number">Starting Room Number</label>

            <input
              id="starting-room-number"
              type="number"
              min="0"
              name="startingRoomNumber"
              value={generator.startingRoomNumber}
              onChange={handleChange}
              onFocus={selectZeroOnFocus}
              placeholder="e.g. 101"
            />

            <small className="field-help">
              Each floor can have a different room count. For example, Floor 1 = 101-110 and Floor 2 = 201-209 if Floor 2 has 9 rooms.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="room-prefix">Room Prefix</label>

            <input
              id="room-prefix"
              type="text"
              name="roomPrefix"
              value={generator.roomPrefix}
              onChange={handleChange}
              placeholder="e.g. M1"
            />

            <small className="field-help">
              The prefix is added before the room number and does not replace the number.
            </small>
          </div>

          {/* ── Same type: Default Room Type ── */}
          {generationMode === "same" && (
            <div className="form-group">
              <label htmlFor="room-type">Default Room Type</label>

              <select
                id="room-type"
                name="roomType"
                value={generator.roomType}
                onChange={handleChange}
              >
                {ROOM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="room-capacity">Default Capacity</label>

            <input
              id="room-capacity"
              type="number"
              min="1"
              name="capacity"
              value={generator.capacity}
              onChange={handleChange}
              onFocus={selectZeroOnFocus}
            />
          </div>
        </div>

        <div className="room-facilities">
          <label>Default Facilities</label>

          <div className="facility-options">
            {FACILITIES.map(([key, label]) => (
              <label className="facility-option" key={key}>
                <input
                  type="checkbox"
                  name={key}
                  checked={generator[key]}
                  onChange={handleChange}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* ── Mixed mode: room type configuration ── */}
        {generationMode === "mixed" && (
          <div className="mixed-room-config">
            <div className="mixed-room-types-section">
              <div className="mixed-section-header">
                <strong>Room Types</strong>
                <small>Define which room types to distribute across floors.</small>
              </div>

              <div className="mixed-type-list">
                {mixedConfig.roomTypes.map((rt) => (
                  <div className="mixed-type-row" key={rt}>
                    <span className="mixed-type-name">{rt}</span>
                    {mixedConfig.roomTypes.length > 1 && (
                      <button
                        type="button"
                        className="remove-building"
                        onClick={() => removeMixedRoomType(rt)}
                        title={`Remove ${rt}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {availableTypesForAdd.length > 0 && (
                <div className="mixed-add-type">
                  <select
                    value={newMixedType}
                    onChange={(e) => setNewMixedType(e.target.value)}
                  >
                    {availableTypesForAdd.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="small-primary-button"
                    onClick={() => { addMixedRoomType(newMixedType); setNewMixedType(availableTypesForAdd[0] || ROOM_TYPES[0]); }}
                  >
                    + Add Room Type
                  </button>
                </div>
              )}
            </div>

            <div className="mixed-floor-configs">
              <div className="mixed-section-header">
                <strong>Floor-wise Room Distribution</strong>
                <small>Set the count for each room type on every floor. The total must match the required room count.</small>
              </div>

              {Array.from({ length: floorCount }, (_, fi) => {
                const required = mixedFloorRequired(fi);
                const total = mixedFloorTotal(fi);
                const isValid = total === required;
                return (
                  <div className="mixed-floor-card" key={`mixed-floor-${fi}`}>
                    <div className="mixed-floor-header">
                      <strong>Floor {fi + 1}</strong>
                      <span className={`mixed-floor-total ${isValid ? "valid" : "invalid"}`}>
                        {total} / {required} rooms {isValid ? "✓" : ""}
                      </span>
                    </div>

                    {!isValid && (
                      <small className="mixed-floor-error">
                        {total < required
                          ? `Add ${required - total} more room${required - total === 1 ? "" : "s"} to generate this floor.`
                          : `${total - required} too many rooms configured for this floor.`}
                      </small>
                    )}

                    <div className="mixed-floor-types">
                      {mixedConfig.roomTypes.map((rt) => (
                        <div className="mixed-floor-type" key={`${fi}-${rt}`}>
                          <span>{rt}</span>
                          <input
                            type="number"
                            min="0"
                            value={mixedConfig.floorConfigs[fi]?.[rt] ?? 0}
                            onChange={(e) => updateMixedFloorRoomCount(fi, rt, e.target.value)}
                            onFocus={selectZeroOnFocus}
                            aria-label={`${rt} count on Floor ${fi + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="room-generator-actions">
          <button
            type="button"
            className="generate-rooms-button"
            onClick={generateRooms}
            disabled={generating || clearing || (generationMode === "mixed" && !allFloorsValid)}
          >
            {generating ? "Generating..." : "Generate Rooms"}
          </button>

          {generator.campusId && generator.buildingId && (
            <button
              type="button"
              className="clear-building-rooms-button"
              onClick={clearBuildingRooms}
              disabled={clearing || generating}
            >
              {clearing ? "Clearing..." : "Clear Building Rooms"}
            </button>
          )}
        </div>
      </div>

      {lastAction && (
        <div className={`room-action-success ${lastAction.type}`}>
          <span className="action-icon">{lastAction.type === "generate" ? "✅" : "🗑️"}</span>
          <div className="action-details">
            <strong>
              {lastAction.type === "generate"
                ? `Generated ${lastAction.count} room${lastAction.count === 1 ? "" : "s"}`
                : `Cleared ${lastAction.count} room${lastAction.count === 1 ? "" : "s"}`}
            </strong>
            <p>
              {lastAction.type === "generate"
                ? `${lastAction.campusName} > ${lastAction.buildingName} > ${lastAction.rooms.join(", ")}${lastAction.more > 0 ? ` +${lastAction.more} more` : ""}`
                : `All rooms removed from ${lastAction.buildingName}`}
            </p>
          </div>
        </div>
      )}

      <div className="setup-info">
        <span>💡</span>

        <div>
          <strong>Room numbering example</strong>

          <p>
            For example, with starting number 101, Floor 1 can have 10 rooms, Floor 2 can have 9 rooms, and each floor can have its own room count. Room numbers continue from the selected starting number pattern.
          </p>
        </div>
      </div>

      {/* ── Generated Rooms Section ── */}
      {rooms.length > 0 ? (
        <div className="generated-rooms-section">
          <div className="generated-rooms-header">
            <div>
              <h3>Generated Rooms</h3>
              <p>Each room can be edited or deleted individually.</p>
            </div>

            <span className="rooms-count">{rooms.length} Rooms Total</span>
          </div>

          {/* ── Room Type Filter ── */}
          <div className="room-type-filter">
            <button
              type="button"
              className={`room-filter-chip ${roomTypeFilter === "All" ? "active" : ""}`}
              onClick={() => setRoomTypeFilter("All")}
            >
              All ({rooms.length})
            </button>
            {uniqueRoomTypes.map((rt) => (
              <button
                type="button"
                key={rt}
                className={`room-filter-chip ${roomTypeFilter === rt ? "active" : ""}`}
                onClick={() => setRoomTypeFilter(rt)}
              >
                {rt} ({roomTypeCounts[rt] || 0})
              </button>
            ))}
          </div>

          {/* ── Bulk Edit Bar ── */}
          {selectedRoomIds.size > 0 && (
            <div className="bulk-edit-bar">
              <span>{selectedRoomIds.size} room{selectedRoomIds.size === 1 ? "" : "s"} selected</span>
              <select value={bulkTypeValue} onChange={(e) => setBulkTypeValue(e.target.value)}>
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button type="button" className="small-primary-button" onClick={applyBulkTypeChange}>
                Apply Type
              </button>
              <button
                type="button"
                className="danger-text-button"
                onClick={() => setSelectedRoomIds(new Set())}
              >
                Clear Selection
              </button>
            </div>
          )}

          <div className="rooms-list">
            {/* Select all row */}
            {visibleRooms.length > 1 && (
              <div className="room-select-all-row">
                <label className="room-checkbox-label">
                  <input
                    type="checkbox"
                    checked={visibleRooms.every((r) => selectedRoomIds.has(r.id))}
                    onChange={() => toggleSelectAll(visibleRooms)}
                  />
                  <span>Select all</span>
                </label>
              </div>
            )}

            {visibleRooms.map((room) => (
              <article className="room-card" key={room.id}>
                <div className="room-card-top">
                  <div className="room-card-left">
                    <label className="room-checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedRoomIds.has(room.id)}
                        onChange={() => toggleRoomSelection(room.id)}
                      />
                    </label>
                    <div>
                      <span className="room-label">ROOM</span>

                      <h4>
                        {room.roomNumber}
                        {room.isGenerated && (
                          <small style={{ marginLeft: 6, fontWeight: 400, fontSize: "0.7em", color: "#BAE6FD" }}>
                            Generated
                          </small>
                        )}
                      </h4>

                      <small>
                        {room.campusName || "Campus"} &bull; {room.buildingName || "Building"} &bull; Floor{" "}
                        {room.floor}
                      </small>
                    </div>
                  </div>

                  <div className="room-actions">
                    <button
                      type="button"
                      className="edit-room-button"
                      onClick={() =>
                        setEditingRoomId(
                          editingRoomId === room.id ? null : room.id,
                        )
                      }
                    >
                      {editingRoomId === room.id ? "Close" : "Edit"}
                    </button>

                    <button
                      type="button"
                      className="delete-room-button"
                      onClick={() => deleteRoom(room.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="room-summary">
                  <div>
                    <strong>Type</strong>
                    <span>{room.roomType}</span>
                  </div>

                  <div>
                    <strong>Capacity</strong>
                    <span>{room.capacity}</span>
                  </div>

                  <div>
                    <strong>Timetable</strong>
                    <span>
                      {room.timetableAvailable ? "Available" : "Blocked"}
                    </span>
                  </div>
                </div>

                {editingRoomId === room.id && (
                  <div className="room-edit-panel">
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Room Name / Number</label>

                        <input
                          type="text"
                          value={room.roomNumber}
                          onChange={(event) =>
                            updateRoom(room.id, {
                              roomNumber: event.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="form-group">
                        <label>Room Type / Purpose</label>

                        <select
                          value={room.roomType}
                          onChange={(event) =>
                            updateRoom(room.id, {
                              roomType: event.target.value,
                            })
                          }
                        >
                          {ROOM_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Floor</label>

                        <input
                          type="number"
                          min="0"
                          value={room.floor}
                          onChange={(event) =>
                            updateRoom(room.id, {
                              floor: event.target.value,
                            })
                          }
                          onFocus={selectZeroOnFocus}
                        />
                      </div>

                      <div className="form-group">
                        <label>Capacity</label>

                        <input
                          type="number"
                          min="1"
                          value={room.capacity}
                          onChange={(event) =>
                            updateRoom(room.id, {
                              capacity: event.target.value,
                            })
                          }
                          onFocus={selectZeroOnFocus}
                        />
                      </div>
                    </div>

                    <div className="room-availability">
                      <label>
                        <input
                          type="checkbox"
                          checked={room.timetableAvailable}
                          onChange={(event) =>
                            updateRoom(room.id, {
                              timetableAvailable: event.target.checked,
                            })
                          }
                        />
                        Available for timetable scheduling
                      </label>
                    </div>

                    <div className="room-edit-facilities">
                      <strong>Facilities</strong>

                      <div className="facility-options">
                        {FACILITIES.map(([key, label]) => (
                          <label className="facility-option" key={key}>
                            <input
                              type="checkbox"
                              checked={room.facilities?.[key] || false}
                              onChange={(event) =>
                                updateFacility(
                                  room.id,
                                  key,
                                  event.target.checked,
                                )
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="room-empty-state">
          <p><strong>No rooms generated yet.</strong></p>
          <p>Configure the floor and room details above, then click &ldquo;Generate Rooms&rdquo;.</p>
        </div>
      )}
    </section>
  );
}

export default RoomSetup;
