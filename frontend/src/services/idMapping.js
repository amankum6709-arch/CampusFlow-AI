function mappedId(map, id, label) {
  if (id === null || id === undefined || id === "") return id;
  const mapped = map?.[id];
  if (!mapped) {
    throw new Error(`Setup sync did not return a database ID for ${label} "${id}".`);
  }
  return mapped;
}

export function remapSchedulerConfiguration(configuration, idMap = {}) {
  const courseIds = idMap.courses || {};
  const facultyIds = idMap.faculty || {};
  const roomIds = idMap.rooms || {};

  return {
    ...configuration,
    rooms: (configuration.rooms || []).map((room) => ({
      ...room,
      id: mappedId(roomIds, room.id, "room"),
    })),
    faculty: (configuration.faculty || []).map((person) => ({
      ...person,
      id: mappedId(facultyIds, person.id, "faculty"),
    })),
    sessions: (configuration.sessions || []).map((session) => ({
      ...session,
      courseId: mappedId(courseIds, session.courseId, "course"),
      facultyId: mappedId(facultyIds, session.facultyId, "faculty"),
      facultyIds: (session.facultyIds || []).map((id) => mappedId(facultyIds, id, "faculty")),
    })),
  };
}
