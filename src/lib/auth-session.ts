import { cookies } from 'next/headers';
import { adminAuth } from './firebase-admin';
import { prisma } from './prisma';

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || cookieStore.get('__session')?.value;
    if (!sessionCookie) return null;

    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
    if (!decodedClaims || !decodedClaims.uid) return null;

    const user = await prisma.user.findUnique({
      where: { firebaseUid: decodedClaims.uid },
    });

    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}
