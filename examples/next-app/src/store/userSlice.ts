import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@/lib/types';

const userSlice = createSlice({
  name: 'user',
  initialState: { profile: null as User | null, wishlist: [] as string[] },
  reducers: {
    setProfile(state, action: PayloadAction<User | null>) {
      state.profile = action.payload;
    },
    toggleWishlist(state, action: PayloadAction<string>) {
      const i = state.wishlist.indexOf(action.payload);
      if (i >= 0) state.wishlist.splice(i, 1);
      else state.wishlist.push(action.payload);
    },
  },
});

export const { setProfile, toggleWishlist } = userSlice.actions;
export default userSlice.reducer;
