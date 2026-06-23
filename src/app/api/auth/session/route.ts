import { adminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: 'Missing ID token' }, { status: 400 });
    }

    // Set session cookie expiration time (5 days)
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    
    // Create the session cookie
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    // Verify token to get UID and check/create User in Prisma DB
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const { uid, email, name } = decodedToken;

    if (!email) {
      return NextResponse.json({ error: 'Email missing from auth provider' }, { status: 400 });
    }

    // Check if user exists in database, otherwise create as EMPLOYEE (first user as ADMIN)
    const existingUser = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });

    let expectedRole = 'EMPLOYEE';
    if (existingUser) {
      expectedRole = existingUser.role;
    } else {
      const userCount = await prisma.user.count();
      expectedRole = userCount === 0 ? 'ADMIN' : 'EMPLOYEE';
    }

    // Check if the current ID token already includes the correct role claim
    const hasCorrectClaim = decodedToken.role === expectedRole;

    if (!existingUser) {
      await prisma.user.create({
        data: {
          firebaseUid: uid,
          email: email,
          name: name || email.split('@')[0],
          role: expectedRole as Role,
          isActive: true,
        },
      });
      // Synchronize role back to Firebase Auth custom claims
      await adminAuth.setCustomUserClaims(uid, { role: expectedRole });
    } else {
      // Keep Firebase Auth custom claims in sync with DB roles
      await adminAuth.setCustomUserClaims(uid, { role: existingUser.role });
    }

    // If the token did not have the claim yet, instruct the client to force-refresh and re-verify
    if (!hasCorrectClaim) {
      return NextResponse.json({ success: true, forceRefresh: true });
    }

    const cookieStore = await cookies();
    const cookieOptions = {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax' as const,
    };

    cookieStore.set('session', sessionCookie, cookieOptions);
    cookieStore.set('__session', sessionCookie, cookieOptions);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Session creation error:', error);
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
