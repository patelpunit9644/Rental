'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createStaffMember, updateStaffMember } from '@/actions/staff-actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { 
  Plus, Power, AlertTriangle, CheckCircle2, 
  Copy, Check, Edit3
} from 'lucide-react';
import { Role } from '@prisma/client';

interface StaffUser {
  firebaseUid: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}

interface StaffClientProps {
  initialStaff: StaffUser[];
}

export default function StaffClient({ initialStaff }: StaffClientProps) {
  const router = useRouter();
  
  // Register Staff Modal States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(Role.EMPLOYEE);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit Staff Modal States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editMember, setEditMember] = useState<StaffUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<Role>(Role.EMPLOYEE);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Submit Handler for Add Staff
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError('');
    setTempPassword('');

    if (!name.trim() || !email.trim()) {
      setFormError('Please fill out all required fields.');
      setLoading(false);
      return;
    }

    try {
      const res = await createStaffMember({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to register employee.');
      }

      setTempPassword(res.tempPassword || '');
      setName('');
      setEmail('');
      setRole(Role.EMPLOYEE);
      router.refresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Handler for Edit Staff
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMember) return;
    setEditSaving(true);
    setEditError('');

    if (!editName.trim()) {
      setEditError('Full name is required.');
      setEditSaving(false);
      return;
    }

    if (editPassword && editPassword.trim().length < 6) {
      setEditError('Password must be at least 6 characters.');
      setEditSaving(false);
      return;
    }

    try {
      const res = await updateStaffMember(editMember.firebaseUid, {
        name: editName.trim(),
        role: editRole,
        password: editPassword.trim() || undefined,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to update employee details.');
      }

      setIsEditOpen(false);
      setEditPassword('');
      router.refresh();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setEditSaving(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (member: StaffUser) => {
    setEditMember(member);
    setEditName(member.name);
    setEditRole(member.role);
    setEditPassword('');
    setEditError('');
    setIsEditOpen(true);
  };

  // Toggle active status
  const handleActiveToggle = async (uid: string, currentStatus: boolean) => {
    try {
      const res = await updateStaffMember(uid, { isActive: !currentStatus });
      if (!res.success) {
        alert(res.error || 'Failed to update login status.');
      }
      router.refresh();
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* Add Staff Trigger */}
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => {
          setTempPassword('');
          setFormError('');
          setIsAddOpen(true);
        }}>
          <Plus className="w-4 h-4 mr-1" /> Add Staff Member
        </Button>
      </div>

      {/* Staff Table */}
      <div className="bg-slate-900 border border-slate-850 rounded-3xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="text-xs uppercase font-semibold text-slate-500 border-b border-slate-850 bg-slate-950/20">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">System Role</th>
                <th className="px-6 py-4">Account Access</th>
                <th className="px-6 py-4">Registered</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60">
              {initialStaff.map((member) => (
                <tr key={member.firebaseUid} className={`hover:bg-slate-850/10 transition ${!member.isActive ? 'opacity-60' : ''}`}>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-200 block">{member.name}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-300 font-mono text-xs">
                    {member.email}
                  </td>
                  <td className="px-6 py-4 text-xs font-semibold text-slate-300">
                    {member.role === Role.ADMIN ? 'ADMIN (Owner)' : 'EMPLOYEE (Staff)'}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleActiveToggle(member.firebaseUid, member.isActive)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        member.isActive 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 group' 
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/20'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5 cursor-pointer" />
                      <span className="group-hover:hidden">{member.isActive ? 'Active' : 'Suspended'}</span>
                      <span className="hidden group-hover:inline">{member.isActive ? 'Suspend Access' : 'Restore Access'}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openEditModal(member)}
                      className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white rounded-lg transition"
                      title="Edit Staff Member Details"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD STAFF MODAL */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register Staff Member">
        {!tempPassword ? (
          <form onSubmit={handleAddSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> {formError}
              </div>
            )}

            <Input 
              label="Full Name *" 
              required 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="E.g. David Miller" 
            />
            
            <Input 
              label="Email Address *" 
              required 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="E.g. david@rentalflow.com" 
            />

            <Select
              label="Default Security Role *"
              options={[
                { value: Role.EMPLOYEE, label: 'Employee (Desk & Operations)' },
                { value: Role.ADMIN, label: 'Administrator (Full Access)' },
              ]}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
              <Button variant="secondary" type="button" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button variant="primary" type="submit" loading={loading}>Register Staff</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-5 text-sm text-slate-300 py-2">
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-emerald-400">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>Staff account has been registered successfully!</span>
            </div>

            <p className="text-xs text-slate-400">
              Please share these temporary credentials with the employee. They can sign in immediately at the portal.
            </p>

            <div className="space-y-3 bg-slate-950/40 border border-slate-850 p-4 rounded-2xl">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Email:</span>
                <span className="font-bold text-slate-200">{email}</span>
              </div>
              <div className="relative pt-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Temporary Password:</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono font-bold text-emerald-400 text-base">{tempPassword}</span>
                  <button 
                    onClick={copyToClipboard}
                    className="p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-850 rounded-lg transition"
                    title="Copy Password"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <Button variant="secondary" onClick={() => {
                setIsAddOpen(false);
                setTempPassword('');
              }}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* EDIT STAFF MODAL */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`Edit Staff Member: ${editMember?.name}`}>
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {editError}
            </div>
          )}

          <Input 
            label="Full Name *" 
            required 
            value={editName} 
            onChange={(e) => setEditName(e.target.value)} 
            placeholder="E.g. David Miller" 
          />
          
          <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-850 text-xs text-slate-400 space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Email Address (Cannot be modified)</span>
            <span className="font-mono text-slate-250 block mt-0.5">{editMember?.email}</span>
          </div>

          <Select
            label="System Role *"
            options={[
              { value: Role.EMPLOYEE, label: 'Employee (Desk & Operations)' },
              { value: Role.ADMIN, label: 'Administrator (Full Access)' },
            ]}
            value={editRole}
            onChange={(e) => setEditRole(e.target.value as Role)}
          />

          <Input 
            label="Reset Password (Leave blank to keep current)" 
            type="password" 
            value={editPassword} 
            onChange={(e) => setEditPassword(e.target.value)} 
            placeholder="Min 6 characters" 
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
            <Button variant="secondary" type="button" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={editSaving}>Save Changes</Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
