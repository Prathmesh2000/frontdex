import { NextResponse } from 'next/server';

// Route handler: GET lists orders, POST creates one. Listed under `endpoints` in the catalogue.
export async function GET() {
  return NextResponse.json({ orders: [] });
}

export async function POST(request: Request) {
  const order = await request.json();
  return NextResponse.json({ id: 'ord_1', ...order }, { status: 201 });
}
