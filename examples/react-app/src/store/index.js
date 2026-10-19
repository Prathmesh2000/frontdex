import { configureStore } from '@reduxjs/toolkit';
import users from './usersSlice';

export const store = configureStore({ reducer: { users } });
