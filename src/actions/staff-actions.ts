'use server';

import { prisma } from '@/lib/prisma';
import { adminAuth } from '@/lib/firebase-admin';
import { Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

export async function createStaffMember(data: {
  email: string;
  name: string;
  role: Role;
}) {
  try {
    // Admin Security Check
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || cookieStore.get('__session')?.value;
    if (!sessionCookie) return { success: false, error: 'Unauthorized.' };
    
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
    if (decodedClaims.role !== 'ADMIN') {
      return { success: false, error: 'Only administrators can create staff members.' };
    }

    // Generate a random temporary password
    const crypto = await import('crypto');
    const tempPassword = crypto.randomBytes(4).toString('hex') + 'A1!';

    // 1. Create user in Firebase Auth
    const firebaseUser = await adminAuth.createUser({
      email: data.email,
      displayName: data.name,
      password: tempPassword,
      emailVerified: true,
    });

    // 2. Set Custom Role Claim in Firebase Auth
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { role: data.role });

    // 3. Create User record in Prisma
    await prisma.user.create({
      data: {
        firebaseUid: firebaseUser.uid,
        email: data.email,
        name: data.name,
        role: data.role,
        isActive: true,
      },
    });

    revalidatePath('/admin/staff');
    return { success: true, tempPassword };
  } catch (error) {
    console.error('Error creating staff:', error);
    const message = error instanceof Error ? error.message : 'Failed to create staff member.';
    return { success: false, error: message };
  }
}

export async function updateStaffMember(
  firebaseUid: string,
  data: {
    role?: Role;
    isActive?: boolean;
    name?: string;
    password?: string;
  }
) {
  try {
    // Admin Security Check
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || cookieStore.get('__session')?.value;
    if (!sessionCookie) return { success: false, error: 'Unauthorized.' };
    
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
    if (decodedClaims.role !== 'ADMIN') {
      return { success: false, error: 'Only administrators can modify staff details.' };
    }

    // 1. Update Firebase Auth parameters
    const authUpdates: Parameters<typeof adminAuth.updateUser>[1] = {};
    if (data.isActive !== undefined) {
      authUpdates.disabled = !data.isActive;
    }
    if (data.name !== undefined) {
      authUpdates.displayName = data.name;
    }
    if (data.password !== undefined && data.password.trim() !== '') {
      authUpdates.password = data.password.trim();
    }

    if (Object.keys(authUpdates).length > 0) {
      await adminAuth.updateUser(firebaseUid, authUpdates);
    }

    // 2. Update Custom Claims if role is updated
    if (data.role !== undefined) {
      await adminAuth.setCustomUserClaims(firebaseUid, { role: data.role });
    }

    // 3. Update Database user record
    const prismaUpdates: Parameters<typeof prisma.user.update>[0]['data'] = {};
    if (data.role !== undefined) prismaUpdates.role = data.role;
    if (data.isActive !== undefined) prismaUpdates.isActive = data.isActive;
    if (data.name !== undefined) prismaUpdates.name = data.name;

    if (Object.keys(prismaUpdates).length > 0) {
      await prisma.user.update({
        where: { firebaseUid },
        data: prismaUpdates,
      });
    }

    revalidatePath('/admin/staff');
    return { success: true };
  } catch (error) {
    console.error('Error updating staff:', error);
    const message = error instanceof Error ? error.message : 'Failed to update staff member.';
    return { success: false, error: message };
  }
}

/**
 * Updates the calling user's own profile parameters (name and/or password).
 */
export async function updateUserProfile(
  firebaseUid: string,
  data: {
    name?: string;
    password?: string;
  }
) {
  try {
    // Ownership Security Verification
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || cookieStore.get('__session')?.value;
    if (!sessionCookie) {
      return { success: false, error: 'Unauthorized session.' };
    }

    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
    if (decodedClaims.uid !== firebaseUid) {
      return { success: false, error: 'Unauthorized action. You can only modify your own profile.' };
    }

    // 1. Update Firebase auth details
    const authUpdates: Parameters<typeof adminAuth.updateUser>[1] = {};
    if (data.name !== undefined) {
      authUpdates.displayName = data.name.trim();
    }
    if (data.password !== undefined && data.password.trim() !== '') {
      authUpdates.password = data.password.trim();
    }

    if (Object.keys(authUpdates).length > 0) {
      await adminAuth.updateUser(firebaseUid, authUpdates);
    }

    // 2. Update local database user name
    if (data.name !== undefined) {
      await prisma.user.update({
        where: { firebaseUid },
        data: { name: data.name.trim() },
      });
    }

    revalidatePath('/admin/staff');
    return { success: true };
  } catch (error) {
    console.error('Error updating profile:', error);
    const message = error instanceof Error ? error.message : 'Failed to update profile.';
    return { success: false, error: message };
  }
}
