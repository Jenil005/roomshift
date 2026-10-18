import { createContext, useContext } from "react";

/** Opens the facility view (the App swaps it in for the mission screens). null outside a mission. */
export const FacilityLauncher = createContext<(() => void) | null>(null);

export function useFacilityLauncher() {
  return useContext(FacilityLauncher);
}
