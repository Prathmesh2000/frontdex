import { configureStore } from '@reduxjs/toolkit';
import cart from './cartSlice';
import user from './userSlice';
import ui from './uiSlice';

export const makeStore = () => configureStore({ reducer: { cart, user, ui } });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
