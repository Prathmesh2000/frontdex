import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CartLine, Product } from '@/lib/types';
import { saveOrder } from '@/lib/api';

interface CartState {
  items: CartLine[];
  coupon: string | null;
  status: 'idle' | 'submitting' | 'failed';
}

const initialState: CartState = { items: [], coupon: null, status: 'idle' };

export const checkout = createAsyncThunk('cart/checkout', async (_: void, { getState }) => {
  const { cart } = getState() as { cart: CartState };
  const res = await saveOrder({ lines: cart.items });
  return res.json();
});

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem(state, action: PayloadAction<Product>) {
      const line = state.items.find((l) => l.product.id === action.payload.id);
      if (line) line.quantity += 1;
      else state.items.push({ product: action.payload, quantity: 1 });
    },
    removeItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter((l) => l.product.id !== action.payload);
    },
    updateQuantity(state, action: PayloadAction<{ id: string; quantity: number }>) {
      const line = state.items.find((l) => l.product.id === action.payload.id);
      if (line) line.quantity = Math.max(1, action.payload.quantity);
    },
    applyCoupon(state, action: PayloadAction<string>) {
      state.coupon = action.payload.trim().toUpperCase();
    },
    clearCart(state) {
      state.items = [];
      state.coupon = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkout.pending, (state) => {
        state.status = 'submitting';
      })
      .addCase(checkout.fulfilled, (state) => {
        state.items = [];
        state.status = 'idle';
      })
      .addCase(checkout.rejected, (state) => {
        state.status = 'failed';
      });
  },
});

export const { addItem, removeItem, updateQuantity, applyCoupon, clearCart } = cartSlice.actions;
export default cartSlice.reducer;
