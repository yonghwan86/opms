import { storage } from "./storage";

let availableDatesCache: { data: string[]; at: number } | null = null;
let availableDatesInFlight: Promise<string[]> | null = null;

export async function getCachedAvailableDates(): Promise<string[]> {
  if (availableDatesCache && Date.now() - availableDatesCache.at < 5 * 60_000) {
    return availableDatesCache.data;
  }
  if (availableDatesInFlight) {
    return availableDatesInFlight;
  }
  availableDatesInFlight = storage.getOilAvailableDates().then(data => {
    availableDatesCache = { data, at: Date.now() };
    availableDatesInFlight = null;
    return data;
  }).catch(err => {
    availableDatesInFlight = null;
    throw err;
  });
  return availableDatesInFlight;
}

export function invalidateAvailableDatesCache() {
  availableDatesCache = null;
}
