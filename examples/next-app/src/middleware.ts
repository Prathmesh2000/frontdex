import { NextResponse, type NextRequest } from 'next/server';

// Sends signed-out visitors away from /account and /admin.
export function middleware(request: NextRequest) {
  if (!request.cookies.has('session')) return NextResponse.redirect(new URL('/login', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/account/:path*', '/admin/:path*'] };
