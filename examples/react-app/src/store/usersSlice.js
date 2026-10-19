import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { fetchUsers } from '../lib/api';

export const loadUsers = createAsyncThunk('users/load', (query) => fetchUsers({ q: query }));

const usersSlice = createSlice({
  name: 'users',
  initialState: { list: [], selectedIds: [], status: 'idle', query: '' },
  reducers: {
    toggleSelected(state, action) {
      const i = state.selectedIds.indexOf(action.payload);
      if (i >= 0) state.selectedIds.splice(i, 1);
      else state.selectedIds.push(action.payload);
    },
    clearSelection(state) {
      state.selectedIds = [];
    },
    setQuery(state, action) {
      state.query = action.payload;
    },
  },
  extraReducers: (b) => {
    b.addCase(loadUsers.pending, (s) => {
      s.status = 'loading';
    }).addCase(loadUsers.fulfilled, (s, a) => {
      s.status = 'idle';
      s.list = a.payload;
    });
  },
});

export const { toggleSelected, clearSelection, setQuery } = usersSlice.actions;
export default usersSlice.reducer;
