import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, User } from '../context/AuthContext';
import { db } from '../services/firebase';
import { doc, getDoc, collection, query, where, getDocs, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';
import { ArrowLeft, User as UserIcon, Building2, Shield, Trash2, Save, Edit2, Users, Trophy, Clock, Target, Zap, CheckCircle, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { useSimulationsSync } from '../data';
import { Simulation } from '../types';
import { getUserMetrics, getStudentSessions } from '../services/trackingService';
import { PieChart, Pie, AreaChart, Area, CartesianGrid, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';

export function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  
  const [profile, setProfile] = useState<User | null>(null);
  const [orgMembers, setOrgMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  
  // Analytics State
  const [metrics, setMetrics] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  
  const [totalXp, setTotalXp] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [totalSims, setTotalSims] = useState(0);
  
  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editMaxMembers, setEditMaxMembers] = useState(0);
  const [saving, setSaving] = useState(false);
  const [disableIdPass, setDisableIdPass] = useState(false); // Can be used to disable for non-orgs if strict interpretation needed.

  useEffect(() => {
    return useSimulationsSync((newData) => {
      setSimulations(newData);
    });
  }, []);

  const fetchProfile = async () => {
    if (!id || (currentUser?.role !== 'super_admin' && currentUser?.role !== 'organization')) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'users', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as User;
        
        if (currentUser.role === 'organization' && data.organizationId !== currentUser.id && data.id !== currentUser.id) {
            navigate('/users');
            return;
        }
        
        setProfile(data);
        setEditId(data.id);
        setEditName(data.name);
        setEditPassword(data.password);
        setEditMaxMembers(data.maxMembers || 0);

        if (data.role === 'personal_user') {
           setDisableIdPass(true);
        } else {
           setDisableIdPass(false);
        }

        if (data.role === 'personal_user') {
           const [userMetrics, userSessions] = await Promise.all([
             getUserMetrics(data.id),
             getStudentSessions(data.id)
           ]);
           
           if (userMetrics) {
              setMetrics(userMetrics);
              setTotalXp(userMetrics.totalXP || 0);
              setTotalTime(userMetrics.totalTimeSpent || 0);
              setTotalSims(userMetrics.totalSimulationsCompleted || 0);
           }
           setSessions(userSessions);
        }

        if (data.role === 'organization') {
           const q = query(collection(db, 'users'), where('organizationId', '==', data.id));
           const memberSnap = await getDocs(q);
           const members: User[] = [];
           memberSnap.forEach(d => members.push(d.data() as User));
           setOrgMembers(members);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();
  }, [id, currentUser]);

  const handleDelete = async () => {
     if (profile?.id === currentUser?.id) {
        alert("You cannot delete yourself.");
        return;
     }
     if (confirm(`Are you sure you want to delete ${profile?.name}?`)) {
        try {
           await deleteDoc(doc(db, 'users', profile!.id));
           navigate('/users');
        } catch (e) {
           console.error("Deletion failed", e);
        }
     }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor((seconds || 0) / 3600);
    const m = Math.floor(((seconds || 0) % 3600) / 60);
    const s = (seconds || 0) % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const handleUpdate = async () => {
     if (!profile) return;
     try {
       setSaving(true);
       const updates: Partial<User> = { name: editName };
       if (!disableIdPass) {
          updates.password = editPassword;
       }
       if (profile.role === 'organization' && currentUser?.role === 'super_admin') {
          updates.maxMembers = editMaxMembers;
       }
       
       if (!disableIdPass && editId && editId.trim() !== profile.id) {
           const newId = editId.trim();
           if (newId.includes('/') || newId.includes('\\') || newId.includes(' ')) {
               alert("Invalid ID format. Avoid spaces and slashes.");
               setSaving(false);
               return;
           }
           
           const newDocRef = doc(db, 'users', newId);
           const newDocSnap = await getDoc(newDocRef);
           if (newDocSnap.exists()) {
               alert("Username ID is already taken!");
               setSaving(false);
               return;
           }

           const newUser = { ...profile, ...updates, id: newId };
           await setDoc(newDocRef, newUser);

           // Update all members if it's an organization
           if (profile.role === 'organization') {
               const q = query(collection(db, 'users'), where('organizationId', '==', profile.id));
               const memberSnaps = await getDocs(q);
               for (const mDoc of memberSnaps.docs) {
                   await updateDoc(doc(db, 'users', mDoc.id), { organizationId: newId });
               }
           }
           
           await deleteDoc(doc(db, 'users', profile.id));
           setProfile(newUser);
           setIsEditing(false);
           navigate(`/users/${newId}`, { replace: true });
       } else {
           await updateDoc(doc(db, 'users', profile.id), updates);
           setProfile({ ...profile, ...updates });
           setIsEditing(false);
       }
     } catch (e) {
       console.error("Update failed", e);
       alert("Failed to update profile");
     } finally {
       setSaving(false);
     }
  };

  if (!currentUser || (currentUser.role !== 'super_admin' && currentUser.role !== 'organization')) return <div>Access Denied</div>;
  if (loading) return <div className="flex py-20 justify-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!profile) return <div className="p-8 text-center text-slate-500">Profile not found.</div>;

  const isPersonal = profile.role === 'personal_user';
  
  const hasAttempts = metrics && metrics.totalAttempts > 0;
  const accuracyRaw = hasAttempts ? (metrics.totalCorrect / metrics.totalAttempts) : 0;
  const accuracy = Math.round(accuracyRaw * 100);
  const accuracyData = hasAttempts ? [
    { name: 'Correct', value: metrics.totalCorrect, color: '#10b981' },
    { name: 'Missed', value: Math.max(0, metrics.totalAttempts - metrics.totalCorrect), color: '#f43f5e' }
  ] : [
    { name: 'No Data', value: 1, color: '#94a3b8' }
  ];

  const simPerformance = sessions.reduce((acc: any, s: any) => {
     const title = simulations.find(sim => sim.id === s.simulationId)?.title || `Sim ${s.simulationId.substring(0,4)}`;
     if (!acc[title]) acc[title] = { name: title, xp: 0, timeSpent: 0 };
     acc[title].xp += s.xpEarned || 0;
     acc[title].timeSpent += s.timeSpent || 0;
     return acc;
  }, {});
  const performanceData = Object.values(simPerformance);

  // Generate 8-day Simple Heatmap Array
  const today = new Date();
  const heatmapDays = Array.from({ length: 8 }).map((_, i) => {
    const d = new Date();
    d.setDate(today.getDate() - (7 - i));
    const dayStr = d.toISOString().split('T')[0];
    const sessionsThatDay = sessions.filter(s => new Date(s.startTime).toISOString().split('T')[0] === dayStr);
    const xpThatDay = sessionsThatDay.reduce((sum, s) => sum + (s.xpEarned || 0), 0);
    return { date: dayStr, count: sessionsThatDay.length, xp: xpThatDay };
  });

  return (
    <div className="flex flex-col gap-10 w-full max-w-6xl mx-auto py-8">
      {/* Top Banner / Back */}
      <div className="flex items-center justify-between">
         <div className="flex items-center gap-4">
            <button onClick={() => navigate('/users')} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-[#111116] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ">
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profile Overview</h1>
         </div>
         {isPersonal && metrics && (
           <div className="px-4 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-sm">
             Learning Level: {metrics.currentLevel}
           </div>
         )}
      </div>

      {/* Profile Header Card */}
      <section className="relative overflow-hidden rounded-[2rem] bg-white dark:bg-[#111116] border border-slate-200 dark:border-white/10 p-6 sm:p-10 flex flex-col md:flex-row gap-8 items-center">
         <div className="relative shrink-0 flex items-center justify-center">
            <div className={clsx(
              "w-24 h-24 rounded-full border-2 flex items-center justify-center p-1.5 transition-all text-white",
              profile.role === 'super_admin' ? 'border-rose-500/30' :
              profile.role === 'organization' ? 'border-violet-500/30' :
              'border-blue-500/30'
            )}>
              <div className={`w-full h-full rounded-full flex items-center justify-center text-3xl font-bold text-white ${
                profile.role === 'super_admin' ? 'bg-gradient-to-tr from-rose-500 to-orange-500' :
                profile.role === 'organization' ? 'bg-gradient-to-tr from-violet-500 to-fuchsia-500' :
                'bg-gradient-to-tr from-blue-500 to-sky-500'
              }`}>
                 {profile.name.substring(0, 2).toUpperCase()}
              </div>
            </div>
         </div>

         <div className="flex flex-col gap-4 flex-1 text-center md:text-left w-full">
            <div>
               <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-2">
                 <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{profile.name}</h2>
                 <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-full w-fit mx-auto md:mx-0">
                   <Shield className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                   <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">{profile.role.replace('_', ' ')}</span>
                 </div>
               </div>
               <p className="text-slate-500 dark:text-slate-400 font-medium">Platform Member</p>
            </div>

            {isPersonal && metrics && (
              <div className="w-full max-w-md">
                <div className="flex justify-between text-[11px] font-bold mb-2">
                  <span className="text-blue-600">Experience points</span>
                  <span className="text-slate-500 dark:text-slate-400 font-bold">{totalXp.toLocaleString()} / {(metrics.currentLevel) * 500} XP</span>
                </div>
                <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden p-0.5">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full shadow-inner" style={{ width: `${(totalXp % 500) / 500 * 100}%` }}></div>
                </div>
              </div>
            )}
         </div>

         <div className="flex flex-col gap-2 shrink-0">
            <button onClick={() => setIsEditing(true)} className="px-8 py-3 bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"><Edit2 className="w-4 h-4"/> Edit</button>
         </div>
      </section>

      {/* Stats Grid */}
      {isPersonal && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
           <StatCard icon={Clock} label="Learning Time" value={formatDuration(totalTime)} trend="Time spent in sims" color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-500/10" />
           <StatCard icon={Target} label="Simulations Done" value={totalSims} trend="Experiences visited" color="text-blue-500" bg="bg-blue-50 dark:bg-blue-500/10" />
           <StatCard icon={Zap} label="Earned XP" value={totalXp} trend="Knowledge score" color="text-amber-500" bg="bg-amber-50 dark:bg-amber-500/10" />
           <StatCard icon={CheckCircle} label="Total Accuracy" value={metrics?.totalAttempts > 0 ? `${Math.round((metrics.totalCorrect / metrics.totalAttempts) * 100)}%` : 'N/A'} trend="Average score" color="text-indigo-500" bg="bg-indigo-50 dark:bg-indigo-500/10" />
        </section>
      )}

      {isPersonal && (
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-6">
               <div className="bg-white dark:bg-[#111116] p-6 rounded-[2rem] border border-slate-200 dark:border-white/10 flex flex-col overflow-hidden">
                  <h3 className="text-lg font-bold mb-6 dark:text-white shrink-0">Detailed Learning Log</h3>
                  <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2 max-h-[480px]">
                    {sessions.length > 0 ? sessions.map((session, i) => {
                      const sim = simulations.find(s => s.id === session.simulationId);
                      const type = sim?.simulationType || 'play';
                      return (
                        <div key={session.id} className="p-4 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-lg overflow-hidden bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 shrink-0">
                                 <img src={sim?.thumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400' viewBox='0 0 800 400' fill='none'%3E%3Crect width='800' height='400' fill='%23F4F4F5'/%3E%3C/svg%3E"} className="w-full h-full object-cover" alt="" />
                              </div>
                              <div className="flex flex-col">
                                 <h4 className="font-bold text-slate-900 dark:text-white text-sm">{sim?.title || 'Unknown Simulation'}</h4>
                                 <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                                       <Clock className="w-3 h-3" /> {formatDuration(session.timeSpent)}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                                       XP: +{session.xpEarned || 0}
                                    </span>
                                 </div>
                              </div>
                           </div>
                           <div className="flex items-center gap-4 self-end sm:self-center">
                              {session.attempts > 0 && (
                                <div className="flex flex-col items-center">
                                   <span className="text-[9px] font-bold text-slate-400 uppercase">Accuracy</span>
                                   <span className={clsx("font-bold text-xs", (session.correctAnswers / session.attempts) >= 0.7 ? "text-emerald-500" : "text-amber-500")}>
                                      {session.correctAnswers}/{session.attempts}
                                   </span>
                                </div>
                              )}
                              {session.tasksCompleted > 0 && (
                                <div className="flex flex-col items-center">
                                   <span className="text-[9px] font-bold text-slate-400 uppercase">Tasks</span>
                                   <span className="font-bold text-xs text-slate-900 dark:text-white">
                                      {session.tasksCompleted}
                                   </span>
                                </div>
                              )}
                           </div>
                        </div>
                      );
                    }) : (
                      <div className="text-center text-slate-400 py-10 font-medium">No sessions found.</div>
                    )}
                  </div>
               </div>

               <div className="bg-white dark:bg-[#111116] p-6 rounded-[2rem] border border-slate-200 dark:border-white/10 ">
                  <h3 className="text-lg font-bold mb-6 dark:text-white">Activity Overview</h3>
                  <div className="h-64 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={heatmapDays} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                           <defs>
                              <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.6} />
                                 <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.6} />
                                 <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                              </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--fallback-border, rgba(148, 163, 184, 0.1))" />
                           <XAxis 
                              dataKey="date" 
                              tickFormatter={(val) => val.substring(5)} 
                              tick={{ fontSize: 11, fill: '#94a3b8' }} 
                              axisLine={false} 
                              tickLine={false} 
                              tickMargin={12}
                           />
                           <Tooltip 
                              contentStyle={{ borderRadius: '1rem', border: 'none', background: 'rgba(17, 17, 22, 0.9)', color: '#fff', backdropFilter: 'blur(10px)' }}
                              itemStyle={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}
                              labelStyle={{ color: '#94a3b8', marginBottom: '8px', fontSize: '12px', fontWeight: 500 }}
                           />
                           <YAxis yAxisId="left" hide />
                           <YAxis yAxisId="right" orientation="right" hide />
                           <Area yAxisId="left" type="monotone" dataKey="xp" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorXp)" name="XP Earned" activeDot={{ r: 6, strokeWidth: 0, fill: '#4f46e5' }} />
                           <Area yAxisId="right" type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" name="Sessions" activeDot={{ r: 6, strokeWidth: 0, fill: '#0ea5e9' }} />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
               </div>
            </div>

            <div className="lg:col-span-1 space-y-6">
               <div className="bg-white dark:bg-[#111116] p-6 rounded-[2rem] border border-slate-200 dark:border-white/10 ">
                  <h3 className="text-lg font-bold mb-6 dark:text-white">Overall Accuracy</h3>
                  <div className="flex flex-col items-center">
                     <div className="w-40 h-40 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={accuracyData} innerRadius={50} outerRadius={70} paddingAngle={5} stroke="none" dataKey="value">
                              {accuracyData.map((e, index) => <Cell key={`cell-${index}`} fill={e.color} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: 'none' }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                           <span className="text-2xl font-bold text-slate-900 dark:text-white">{hasAttempts ? `${accuracy}%` : 'N/A'}</span>
                        </div>
                     </div>
                     <div className="w-full flex justify-between mt-4 text-xs font-bold px-4">
                        <span className="text-emerald-500">{metrics?.totalCorrect || 0} Correct</span>
                        <span className="text-slate-400">{metrics?.totalAttempts || 0} Total</span>
                     </div>
                  </div>
               </div>

               <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden ">
                  <div className="relative z-10">
                     <h3 className="text-xl font-bold mb-2">Metrics Summary</h3>
                     <p className="text-indigo-100 text-sm mb-6">Tracking complete profile performance globally.</p>
                     <div className="space-y-3">
                        <div className="flex justify-between border-b border-indigo-400/30 pb-2">
                           <span className="text-indigo-200 font-medium">Avg Tasks/Sim</span>
                           <span className="font-bold">{metrics ? (metrics.totalTasksCompleted / (metrics.totalSimulationsCompleted || 1)).toFixed(1) : 0}</span>
                        </div>
                        <div className="flex justify-between border-b border-indigo-400/30 pb-2">
                           <span className="text-indigo-200 font-medium">Total Sessions</span>
                           <span className="font-bold">{sessions?.length || 0}</span>
                        </div>
                     </div>
                  </div>
                  <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
               </div>
            </div>
         </div>
      )}

      {/* Organization Members List */}
      {profile.role === 'organization' && (
        <div className="bg-white dark:bg-[#111116] p-6 rounded-[2rem] border border-slate-200 dark:border-white/10 mt-4">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Organization Members</h3>
            <span className="text-sm font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full">
              {orgMembers.length} {profile.maxMembers ? `/ ${profile.maxMembers}` : ''}
            </span>
          </div>
          {orgMembers.length > 0 ? (
            <div className="flex flex-col">
              {/* Table Header */}
              <div className="grid grid-cols-[1.5fr_1.5fr_1fr] px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500 rounded-t-2xl">
                <div>User</div>
                <div>Username ID</div>
                <div className="text-right pr-4">Access Level</div>
              </div>

              <div className="flex flex-col">
                {orgMembers.map((member, index) => (
                  <div 
                    key={member.id} 
                    onClick={() => navigate(`/users/${member.id}`)}
                    className={clsx(
                      "grid grid-cols-[1.5fr_1.5fr_1fr] items-center px-6 py-5 cursor-pointer group transition-all hover:bg-slate-50/50 dark:hover:bg-white/5",
                      index !== orgMembers.length - 1 && "border-b border-dashed border-slate-400/40 dark:border-white/20"
                    )}
                  >
                    <div className="font-bold text-slate-900 dark:text-white truncate pr-4">{member.name}</div>
                    <div className="font-mono text-sm text-slate-500 dark:text-slate-400 truncate pr-4">@{member.id}</div>
                    <div className="flex justify-end pr-4">
                      <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20 whitespace-nowrap">
                        {member.role.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-300 dark:border-white/20">No members found in this organization.</div>
          )}
        </div>
      )}

      {/* Account Details Footer */}
      <div className="bg-white dark:bg-[#111116] p-8 rounded-[2rem] border border-slate-200 dark:border-white/10 mt-4">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Security & Access Management</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
             <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Username ID</label>
                <div className="font-mono text-sm font-bold bg-slate-50 dark:bg-[#1a1a24] p-3 rounded-xl border border-slate-100 dark:border-white/5 dark:text-slate-300">{profile.id}</div>
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Password</label>
                <div className="font-mono text-sm font-bold bg-slate-50 dark:bg-[#1a1a24] p-3 rounded-xl border border-slate-100 dark:border-white/5 dark:text-slate-300">{profile.password}</div>
             </div>
             {profile.role === 'organization' && (
                <div className="space-y-2">
                   <label className="text-[10px] font-bold text-slate-400 uppercase">Capacity</label>
                   <div className="font-bold text-sm bg-slate-50 dark:bg-[#1a1a24] p-3 rounded-xl border border-slate-100 dark:border-white/5 dark:text-slate-300">{profile.maxMembers || 'Unlimited'} seats</div>
                </div>
             )}
          </div>
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/10">
             <button onClick={handleDelete} className="text-rose-600 hover:text-rose-700 font-bold flex items-center justify-center gap-2 px-4 py-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors"><Trash2 className="w-4 h-4"/> Delete Permanently</button>
          </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditing(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white dark:bg-[#1a1a24] rounded-[2rem] p-6 sm:p-8 border border-slate-200 dark:border-white/10 z-10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Edit Profile</h2>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1.5">Name</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
                    Username ID
                    {disableIdPass && <span className="text-[10px] text-slate-400 font-medium">Read Only</span>}
                  </label>
                  <input 
                    type="text" 
                    value={editId}
                    onChange={(e) => setEditId(e.target.value)}
                    disabled={disableIdPass}
                    className={clsx(
                      "w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:outline-none dark:text-white",
                      disableIdPass ? "opacity-50 cursor-not-allowed" : "focus:ring-2 focus:ring-blue-500"
                    )}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
                    Password
                    {disableIdPass && <span className="text-[10px] text-slate-400 font-medium">Read Only</span>}
                  </label>
                  <input 
                    type="text" 
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    disabled={disableIdPass}
                    className={clsx(
                      "w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:outline-none dark:text-white",
                      disableIdPass ? "opacity-50 cursor-not-allowed" : "focus:ring-2 focus:ring-blue-500"
                    )}
                  />
                </div>

                {profile.role === 'organization' && currentUser?.role === 'super_admin' && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-gray-300 mb-1.5">Capacity (Max Members)</label>
                    <input 
                      type="number" 
                      value={editMaxMembers}
                      onChange={(e) => setEditMaxMembers(parseInt(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-700 dark:text-gray-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpdate}
                  disabled={saving}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4" /> Save</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, trend, color, bg }: any) {
  return (
    <div className="bg-white dark:bg-[#111116] border border-slate-200 dark:border-white/5 p-8 rounded-[2rem] flex flex-col gap-5 relative overflow-hidden group hover:border-blue-500/20 transition ">
       <div className={clsx(`w-16 h-16 rounded-2xl flex items-center justify-center mb-2 shadow-inner`, bg, color)}>
          <Icon className="w-8 h-8" />
       </div>
       <div className="flex flex-col gap-1 z-10">
          <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-500 transition-colors uppercase">{label}</span>
          <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</span>
       </div>
       {trend && (
         <div className="font-bold text-[11px] text-slate-400 tracking-tight flex items-center gap-2">
            {trend}
         </div>
       )}
    </div>
  );
}
