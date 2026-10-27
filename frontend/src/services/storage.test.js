import test from "node:test";
import assert from "node:assert/strict";

import { clearSetup, saveSetup } from "./storage.js";
import { SETUP_STORAGE_KEY } from "../utils/constants.js";

function createLocalStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("clearSetup removes only the selected organization's setup key", () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = createLocalStorage();

  try {
    saveSetup({ institution: { name: "Org A" } }, "org-a");
    saveSetup({ institution: { name: "Org B" } }, "org-b");
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ institution: { name: "Unknown legacy" } }));

    clearSetup("org-a");

    assert.equal(globalThis.localStorage.getItem(`${SETUP_STORAGE_KEY}__org-a`), null);
    assert.notEqual(globalThis.localStorage.getItem(`${SETUP_STORAGE_KEY}__org-b`), null);
    assert.notEqual(globalThis.localStorage.getItem(SETUP_STORAGE_KEY), null);
  } finally {
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previousLocalStorage;
    }
  }
});

test("clearSetup without an organization clears the legacy setup key", () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = createLocalStorage();

  try {
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ institution: { name: "Legacy" } }));

    clearSetup("");

    assert.equal(globalThis.localStorage.getItem(SETUP_STORAGE_KEY), null);
  } finally {
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previousLocalStorage;
    }
  }
});