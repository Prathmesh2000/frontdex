import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: { drawerOpen: false, theme: 'light' as 'light' | 'dark' },
  reducers: {
    toggleDrawer(state) {
      state.drawerOpen = !state.drawerOpen;
    },
    setTheme(state, action: { payload: 'light' | 'dark' }) {
      state.theme = action.payload;
    },
  },
});

export const { toggleDrawer, setTheme } = uiSlice.actions;
export default uiSlice.reducer;
