import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, User, Role } from '../context/AuthContext';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, X, Shield, Building2, User as UserIcon } from 'lucide-react';
import { clsx } from 'clsx';

export function UsersList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [newId, setNewId] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Role>('personal_user');
  const [newMaxMembers, setNewMaxMembers] = useState(5);
  const [newExpiryDuration, setNewExpiryDuration] = useState(31536000000);
  const [newOrgId, setNewOrgId] = useState('');

  const fetchUsers = async () => {
    if (user?.role !== 'super_admin' && user?.role !== 'organization') return;
    setLoading(true);
    try {
      let q;
      if (user.role === 'super_admin') {
        q = collection(db, 'users');
      } else {
        q = query(collection(db, 'users'), where('organizationId', '==', user.id));
      }
      const snap = await getDocs(q);
      const res: User[] = [];
      snap.forEach(d => res.push(d.data() as User));
      setAllUsers(res);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
     e.preventDefault();
     if (user?.role !== 'super_admin' && user?.role !== 'organization') return;
     
     const roleToAssign = user.role === 'organization' ? 'personal_user' : newRole;

     const newUser: User = {
        id: newId,
        password: newPass,
        name: newName,
        role: roleToAssign,
     };

     if (user.role === 'organization') {
        newUser.organizationId = user.id;
     } else {
         if (roleToAssign === 'organization') {
            newUser.maxMembers = newMaxMembers;
            newUser.expiryDate = Date.now() + newExpiryDuration;
         }

         if (roleToAssign === 'personal_user' && newOrgId) {
            newUser.organizationId = newOrgId;
         }
     }

     try {
        await setDoc(doc(db, 'users', newId), newUser);
        setShowModal(false);
        setNewId('');
        setNewPass('');
        setNewName('');
        setNewRole('personal_user');
        setNewOrgId('');
        fetchUsers();
     } catch (e) {
        console.error(e);
        alert("Failed to create user");
     }
  };

  if (!user || (user.role !== 'super_admin' && user.role !== 'organization')) {
    return <div className="p-10 text-center font-bold">Access Denied</div>;
  }

  const filteredUsers = allUsers.filter(u => {
    // Hide students from the main super_admin view if they belong to an organization
    if (user.role === 'super_admin' && u.role === 'personal_user' && u.organizationId) {
      return false;
    }
    return (
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="flex flex-col gap-6 w-full h-full flex-1 min-h-0 mx-auto">
      {/* Header Card */}
      <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center w-full gap-4 shrink-0 px-2 lg:px-4">
         <div>
            <h1 className="text-2xl font-bold mb-1">Users Module</h1>
            <p className="text-slate-500 text-sm">
              Manage all organizations and individual users in the system.
            </p>
         </div>
         <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
           <div className="relative flex-grow sm:w-64 w-full">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input 
               type="text" 
               placeholder="Search users..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full h-10 pl-10 pr-4 bg-white lg:bg-transparent dark:bg-transparent border border-slate-200 dark:border-white/10 rounded-full text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all dark:text-white"
             />
           </div>
           <button 
             onClick={() => setShowModal(true)}
             className="bg-blue-600 hover:bg-blue-700 text-white h-10 px-5 rounded-full font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 whitespace-nowrap w-full sm:w-auto text-sm"
           >
             <Plus className="w-4 h-4" /> 
             {user.role === 'organization' ? 'Add Member' : 'Add User'}
           </button>
         </div>
      </div>

      {/* Main List Container */}
      <div className="bg-white dark:bg-[#111116] rounded-[2rem] border border-slate-200 dark:border-white/10 overflow-hidden flex-1 flex flex-col min-h-0">
        {loading ? (
           <div className="p-20 text-center text-slate-500 flex flex-col items-center justify-center flex-1 gap-3">
             <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
             <span className="font-medium">Loading ecosystem data...</span>
           </div>
        ) : (
           <div className="w-full flex-1 flex flex-col min-h-0">
             {/* Table Header - lg only */}
             <div className="hidden lg:grid lg:grid-cols-[1.5fr_1fr_1.5fr_120px] px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest shrink-0">
               <div>User Details</div>
               <div>Access Level</div>
               <div>Organization / Plan</div>
               <div className="text-right">Manage</div>
             </div>

             <div className="flex flex-col overflow-y-auto min-h-0 custom-scrollbar">
                {filteredUsers.map((u, index) => (
                   <div 
                     key={u.id} 
                     onClick={() => navigate(`/users/${u.id}`)}
                     className={clsx(
                       "flex flex-col p-6 lg:p-0 transition-all hover:bg-slate-50/50 dark:hover:bg-white/5 cursor-pointer group relative",
                       "lg:grid lg:grid-cols-[1.5fr_1fr_1.5fr_120px] lg:items-center lg:px-8 lg:py-6 lg:gap-4",
                       index !== filteredUsers.length - 1 && "border-b border-dashed border-slate-400/40 dark:border-white/20"
                     )}
                   >
                      {/* User Info Column */}
                      <div className="flex items-center gap-4 min-w-0">
                         <div className={clsx(
                           "w-10 h-10 rounded-full border flex items-center justify-center p-0.5 shrink-0 transition-transform group-hover:scale-105",
                           u.role === 'super_admin' ? 'border-rose-500/20' :
                           u.role === 'organization' ? 'border-violet-500/20' :
                           'border-blue-500/20'
                         )}>
                            <div className={clsx(
                              "w-full h-full rounded-full flex items-center justify-center text-white font-bold text-[10px]",
                              u.role === 'super_admin' ? 'bg-gradient-to-tr from-rose-500 to-orange-500' :
                              u.role === 'organization' ? 'bg-gradient-to-tr from-violet-500 to-fuchsia-500' :
                              'bg-gradient-to-tr from-blue-500 to-sky-500'
                            )}>
                               {u.name.substring(0, 2).toUpperCase()}
                            </div>
                         </div>
                         <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate text-sm">
                              {u.name}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400 truncate">@{u.id}</span>
                         </div>
                      </div>

                      {/* Role Info Column */}
                      <div className="mt-4 lg:mt-0 flex items-center">
                         <div className={clsx(
                           "flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-full border whitespace-nowrap",
                           u.role === 'super_admin' ? 'text-red-600 bg-red-50 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' :
                           u.role === 'organization' ? 'text-purple-600 bg-purple-50 border-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20' :
                           'text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                         )}>
                            {u.role === 'super_admin' ? <Shield className="w-3 h-3" /> : 
                             u.role === 'organization' ? <Building2 className="w-3 h-3" /> : 
                             <UserIcon className="w-3 h-3" />}
                            <span className="uppercase tracking-wider">{u.role.replace('_', ' ')}</span>
                         </div>
                      </div>

                      {/* Org / Plan Settings Column */}
                      <div className="mt-4 lg:mt-0 flex flex-col justify-center text-sm">
                         {u.role === 'organization' ? (
                            <div className="flex flex-col gap-0.5">
                               <div className="flex items-center gap-2">
                                 <span className="text-slate-400 text-[11px] font-medium uppercase">Limit:</span>
                                 <span className="font-bold text-slate-700 dark:text-slate-300">{u.maxMembers} Users</span>
                               </div>
                               {u.expiryDate && (
                                 <div className="flex items-center gap-2">
                                   <span className="text-slate-400 text-[11px] font-medium uppercase">Expires:</span>
                                   <span className="text-slate-500 dark:text-slate-400 font-bold">{new Date(u.expiryDate).toLocaleDateString()}</span>
                                 </div>
                               )}
                            </div>
                         ) : u.role === 'personal_user' && u.organizationId ? (
                            <div className="flex flex-col gap-0.5">
                               <span className="text-slate-400 text-[11px] font-medium uppercase">Member of:</span>
                               <span className="font-bold text-blue-600 dark:text-blue-400">@{u.organizationId}</span>
                            </div>
                         ) : (
                            <span className="text-slate-300 dark:text-white/10 hidden lg:block">—</span>
                         )}
                      </div>

                      {/* Row Actions Column */}
                      <div className="mt-5 lg:mt-0 flex lg:justify-end">
                         <button 
                           onClick={(e) => { e.stopPropagation(); navigate(`/users/${u.id}`); }} 
                           className="flex-1 lg:flex-none px-5 py-2.5 text-xs font-bold bg-white hover:bg-slate-50 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-xl transition-all active:scale-95"
                         >
                           View Profile
                         </button>
                      </div>
                   </div>
                ))}

                {filteredUsers.length === 0 && (
                   <div className="p-20 text-center text-slate-400 font-medium italic">
                     No matching users found in the system.
                   </div>
                )}
             </div>
           </div>
        )}
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm "
              onClick={() => setShowModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar bg-white dark:bg-[#1a1a24] rounded-[2.5rem] p-8 border border-slate-200 dark:border-white/10"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                   <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                     {user.role === 'organization' ? 'Add Student/Member' : 'Create Access'}
                   </h2>
                   <p className="text-slate-500 text-sm">Provision new credentials for the system.</p>
                </div>
                <button 
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-all hover:rotate-90"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-5">
                 {user.role === 'super_admin' && (
                   <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Access Level</label>
                      <div className="grid grid-cols-3 gap-2">
                         {(['super_admin', 'organization', 'personal_user'] as Role[]).map(roleOption => (
                           <button 
                             type="button"
                             key={roleOption}
                             onClick={() => setNewRole(roleOption)}
                             className={clsx(
                               "p-3 border rounded-2xl text-center transition-all",
                               newRole === roleOption 
                                 ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-4 ring-blue-500/5 '
                                 : 'border-slate-100 dark:border-white/5 text-slate-500 hover:border-slate-300 dark:hover:border-white/20'
                             )}
                           >
                              <span className="text-[10px] font-bold uppercase whitespace-nowrap">{roleOption.replace('_', ' ')}</span>
                           </button>
                         ))}
                      </div>
                   </div>
                 )}
                 
                 <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest px-1">
                      {user.role === 'organization' ? 'Full Name' : 'Profile / Org Name'}
                    </label>
                    <input 
                      type="text" required value={newName} onChange={e => setNewName(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-slate-900 dark:text-white border border-slate-100 dark:border-white/5 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                      placeholder="Enter legal or brand name"
                    />
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Login ID</label>
                       <input 
                         type="text" required value={newId} onChange={e => setNewId(e.target.value)}
                         className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-slate-900 dark:text-white border border-slate-100 dark:border-white/5 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                         placeholder="user_123"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Password</label>
                       <input 
                         type="text" required value={newPass} onChange={e => setNewPass(e.target.value)}
                         className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-slate-900 dark:text-white border border-slate-100 dark:border-white/5 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                         placeholder="Secure key"
                       />
                    </div>
                 </div>

                 {user.role === 'super_admin' && newRole === 'organization' && (
                    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="p-5 bg-blue-50/50 dark:bg-blue-500/5 rounded-3xl border border-blue-100 dark:border-blue-500/10 flex flex-col gap-4">
                       <div className="flex-1">
                          <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2 px-1">Seat Capacity</label>
                          <input 
                            type="number" min="1" value={newMaxMembers} onChange={e => setNewMaxMembers(parseInt(e.target.value))}
                            className="w-full px-4 py-3 bg-white dark:bg-white/5 rounded-xl border border-blue-200 dark:border-blue-500/20 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                          />
                       </div>
                       <div className="flex-1">
                          <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2 px-1">Subscription Cycle</label>
                          <select
                            onChange={(e) => setNewExpiryDuration(parseInt(e.target.value))}
                            className="w-full px-4 py-3 bg-white dark:bg-white/5 rounded-xl border border-blue-200 dark:border-blue-500/20 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 appearance-none font-bold"
                          >
                            <option value={31536000000}>1 Year License</option>
                            <option value={15768000000}>6 Month License</option>
                            <option value={2592000000}>1 Month License</option>
                            <option value={86400000}>24h Evaluation</option>
                          </select>
                       </div>
                    </motion.div>
                 )}

                 {user.role === 'super_admin' && newRole === 'personal_user' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Parent Organization (UID)</label>
                       <input 
                         type="text" value={newOrgId} onChange={e => setNewOrgId(e.target.value)}
                         placeholder="e.g. harvard_edu"
                         className="w-full px-5 py-4 bg-slate-50 dark:bg-white/5 rounded-2xl text-slate-900 dark:text-white border border-slate-100 dark:border-white/5 focus:ring-2 focus:ring-blue-500 outline-none"
                       />
                    </motion.div>
                 )}

                 <button type="submit" className="w-full py-5 mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-[1.5rem] font-bold uppercase tracking-widest transition-all active:scale-95">
                    Create User
                 </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
