const NAMES_KEY = "hobita.circle.names";

function readNames(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(NAMES_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveCircleName(address: string, name: string) {
  if (typeof window === "undefined") return;
  const names = readNames();
  names[address] = name;
  window.localStorage.setItem(NAMES_KEY, JSON.stringify(names));
}

export function getCircleName(address: string) {
  return readNames()[address] || "";
}

export function allCircleNames() {
  return readNames();
}
