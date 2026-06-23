import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value || cookieStore.get('__session')?.value;
  
  if (sessionCookie) {
    try {
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
      await adminAuth.revokeRefreshTokens(decodedClaims.uid);
    } catch (e) {
      console.error('Error revoking token on logout:', e);
    }
  }

  cookieStore.delete('session');
  cookieStore.delete('__session');
  return NextResponse.json({ success: true });
}
