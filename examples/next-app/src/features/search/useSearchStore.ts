import { create } from 'zustand';

interface SearchStore {
  recent: string[];
  addRecent: (term: string) => void;
  clearRecent: () => void;
}

/** Recent search terms, kept client-side with zustand. */
export const useSearchStore = create<SearchStore>((set) => ({
  recent: [],
  addRecent: (term) => set((s) => ({ recent: [term, ...s.recent.filter((t) => t !== term)].slice(0, 8) })),
  clearRecent: () => set({ recent: [] }),
}));
