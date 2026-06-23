import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, importX509, decodeProtectedHeader } from 'jose';

// In-memory cache for Google public keys
let publicKeysCache: { keys: Record<string, string>; expires: number } | null = null;

/**
 * Fetches and caches the public keys used to verify Firebase session cookies.
 */
async function getPublicKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (publicKeysCache && publicKeysCache.expires > now) {
    return publicKeysCache.keys;
  }

  const res = await fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys');
  if (!res.ok) {
    throw new Error('Failed to fetch public keys from Google');
  }

  const cacheControl = res.headers.get('cache-control');
  let maxAge = 3600; // Default cache of 1 hour
  if (cacheControl) {
    const match = cacheControl.match(/max-age=(\d+)/);
    if (match) {
      maxAge = parseInt(match[1], 10);
    }
  }

  const keys = await res.json();
  publicKeysCache = {
    keys,
    expires: now + maxAge * 1000,
  };

  return keys;
}

interface FirebaseSessionPayload {
  role?: 'ADMIN' | 'EMPLOYEE';
  email?: string;
  sub: string;
  [key: string]: unknown;
}

/**
 * Decodes and verifies a Firebase Session Cookie.
 */
async function verifyFirebaseSessionCookie(
  cookieValue: string,
  projectId: string
): Promise<FirebaseSessionPayload> {
  const header = decodeProtectedHeader(cookieValue);
  const kid = header.kid;
  if (!kid) {
    throw new Error('No kid claim in JWT header');
  }

  const publicKeys = await getPublicKeys();
  const x509Cert = publicKeys[kid];
  if (!x509Cert) {
    throw new Error(`Public key not found for kid: ${kid}`);
  }

  // Import x509 certificate to Web Crypto key format
  const publicKey = await importX509(x509Cert, 'RS256');

  // Verify the JWT signature, issuer, and audience
  const { payload } = await jwtVerify(cookieValue, publicKey, {
    issuer: `https://session.firebase.google.com/${projectId}`,
    audience: projectId,
  });

  return payload as FirebaseSessionPayload;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    console.error('Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variable');
    return NextResponse.next();
  }

  // Check both 'session' and '__session' cookies for maximum compatibility
  const sessionCookie =
    request.cookies.get('session')?.value ||
    request.cookies.get('__session')?.value;

  let payload: FirebaseSessionPayload | null = null;

  if (sessionCookie) {
    try {
      payload = await verifyFirebaseSessionCookie(sessionCookie, projectId);
    } catch (err) {
      console.warn('Firebase session cookie verification failed:', err);
      if (pathname !== '/login') {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('session');
        response.cookies.delete('__session');
        return response;
      }
    }
  }

  // 1. Auth check: Accessing protected routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/employee')) {
    if (!payload) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Role-based authorization
    const role = payload.role || 'EMPLOYEE';

    if (pathname.startsWith('/admin') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/employee/dashboard', request.url));
    }
  }

  // 2. Guest check: Accessing login page while already authenticated
  if (pathname === '/login' && payload) {
    const role = payload.role || 'EMPLOYEE';
    if (role === 'ADMIN') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/employee/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/employee/:path*', '/login'],
};
