import { create } from "zustand";

export type Tab = "search" | "schedule" | "foryou" | "easy" | "requirements";

interface UI {
  tab: Tab;
  prof: string | null;
  atlasOpen: boolean;
  authOpen: boolean;
  filtersOpen: boolean;
  setTab: (t: Tab) => void;
  openProf: (name: string | null) => void;
  setAtlas: (v: boolean) => void;
  setAuth: (v: boolean) => void;
  setFiltersOpen: (v: boolean) => void;
}

export const useUI = create<UI>((set) => ({
  tab: "search",
  prof: null,
  atlasOpen: false,
  authOpen: false,
  filtersOpen: false,
  setTab: (tab) => set({ tab }),
  openProf: (prof) => set({ prof }),
  setAtlas: (atlasOpen) => set({ atlasOpen }),
  setAuth: (authOpen) => set({ authOpen }),
  setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
}));
