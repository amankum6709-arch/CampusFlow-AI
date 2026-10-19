import { generateTimetable } from "../services/schedulingEngine";

self.onmessage = (event) => {
  try {
    const { setup, options } = event.data || {};
    const generated = generateTimetable(setup || {}, options || { attempts: 8 });
    self.postMessage({ type: "complete", generated });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
