import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const revalidate = 0;

export default async function IndexPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value || cookieStore.get('__session')?.value;

  if (!sessionToken) {
    return redirect('/login');
  }

  try {
    const payload = JSON.parse(Buffer.from(sessionToken.split('.')[1], 'base64').toString());
    const role = payload.role || 'EMPLOYEE';
    
    if (role === 'ADMIN') {
      return redirect('/admin/dashboard');
    } else {
      return redirect('/employee/dashboard');
    }
  } catch (e) {
    console.error('Failed to parse landing session:', e);
    return redirect('/login');
  }
}
