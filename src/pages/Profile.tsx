import React, { useState, useEffect } from 'react';
import { User as UserIcon, Mail, Shield, BookOpen, Settings as SettingsIcon, Clock, Target, Zap, Activity, CheckCircle, ChevronRight, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getUserMetrics, getStudentSessions } from '../services/trackingService';
import { useSimulationsSync } from '../data';
import { Simulation } from '../types';
import { Timestamp } from 'firebase/firestore';
import clsx from 'clsx';

export function Profile() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats
  const [metrics, setMetrics] = useState<any>(null);
  const [totalXp, setTotalXp] = useState(0);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);
  const [totalSims, setTotalSims] = useState(0);

  const totalHours = totalTimeSpent / 3600;

  useEffect(() => {
    return useSimulationsSync((newData) => {
      setSimulations(newData);
    });
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      setLoading(true);
      const [userMetrics, userSessions] = await Promise.all([
        getUserMetrics(user.id),
        getStudentSessions(user.id)
      ]);
      setSessions(userSessions);
      if (userMetrics) {
        setMetrics(userMetrics);
        setTotalXp(userMetrics.totalXP || 0);
        setTotalTimeSpent(userMetrics.totalTimeSpent || 0);
        setTotalSims(userMetrics.totalSimulationsCompleted || 0);
      }
      setLoading(false);
    }
    fetchData();
  }, [user]);

  if (!user) return <div className="p-20 text-center">Please login to view profile.</div>;
  if (loading) {
    return (
      <div className="flex py-20 justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const formatActivityDate = (timestamp: any) => {
    if (!timestamp) return 'Recently';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor((seconds || 0) / 3600);
    const m = Math.floor(((seconds || 0) % 3600) / 60);
    const s = (seconds || 0) % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  return (
    <div className="flex flex-col gap-10 w-full max-w-6xl mx-auto py-8">
      {/* Profile Header */}
      <section className="relative overflow-hidden rounded-[2rem] bg-white dark:bg-[#111116] border border-slate-200 dark:border-white/5 p-6 sm:p-10 flex flex-col md:flex-row gap-8 items-center">
         <div className="relative shrink-0 flex items-center justify-center">
            <div className={clsx(
              "w-24 h-24 rounded-full border-2 flex items-center justify-center p-1.5 transition-all text-white",
              user.role === 'super_admin' ? 'border-rose-500/30' :
              user.role === 'organization' ? 'border-violet-500/30' :
              'border-blue-500/30'
            )}>
              <div className={`w-full h-full rounded-full flex items-center justify-center text-3xl font-bold text-white ${
                user.role === 'super_admin' ? 'bg-gradient-to-tr from-rose-500 to-orange-500' :
                user.role === 'organization' ? 'bg-gradient-to-tr from-violet-500 to-fuchsia-500' :
                'bg-gradient-to-tr from-blue-500 to-sky-500'
              }`}>
                 {user.name.substring(0, 2).toUpperCase()}
              </div>
            </div>
         </div>

         <div className="flex flex-col gap-4 flex-1 text-center md:text-left w-full">
            <div>
               <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-2">
                  <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{user.name}</h2>
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-full w-fit mx-auto md:mx-0">
                    <UserIcon className="w-3 h-3 text-blue-500" />
                    <span className="text-[10px] font-bold text-slate-500">Learner profile</span>
                  </div>
               </div>
               <p className="text-slate-500 dark:text-gray-400 font-medium">
                  Student ID: {user.id} • Active Learner Since 2025
               </p>
            </div>

            <div className="w-full max-w-md">
               <div className="flex justify-between text-[11px] font-bold mb-2">
                  <span className="text-blue-600 dark:text-blue-400">Experience points</span>
                  <span className="text-slate-500 font-bold">{totalXp.toLocaleString()} / {metrics?.currentLevel ? metrics.currentLevel * 500 : 500} XP</span>
               </div>
               <div className="h-3 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full shadow-inner transition-all duration-1000" 
                    style={{ width: `${(totalXp % 500) / 500 * 100}%` }}
                  ></div>
               </div>
            </div>
         </div>

         <div className="shrink-0">
            <div className="px-6 py-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-2xl font-bold text-center">
               <div className="text-[10px] font-bold mb-1">Learning level</div>
               <div className="text-3xl">{metrics?.currentLevel || 1}</div>
            </div>
         </div>
      </section>

      {/* Stats Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         <StatCard icon={Clock} label="Learning Time" value={formatDuration(totalTimeSpent)} trend="Time spent in sims" color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-500/10" />
         <StatCard icon={Target} label="Simulations Done" value={totalSims} trend="Experiences visited" color="text-blue-500" bg="bg-blue-50 dark:bg-blue-500/10" />
         <StatCard icon={Zap} label="Earned XP" value={totalXp} trend="Knowledge score" color="text-amber-500" bg="bg-amber-50 dark:bg-amber-500/10" />
         <StatCard icon={CheckCircle} label="Total Accuracy" value={metrics?.totalAttempts > 0 ? `${Math.round((metrics.totalCorrect / metrics.totalAttempts) * 100)}%` : 'N/A'} trend="Average score" color="text-indigo-500" bg="bg-indigo-50 dark:bg-indigo-500/10" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
         {/* Left Side: Achievements / Info */}
         <div className="lg:col-span-1 space-y-8">
            <div className="bg-white dark:bg-[#111116] p-8 rounded-[2rem] border border-slate-200 dark:border-white/5 ">
               <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-500" /> Unlocked achievement
               </h3>
               <div className="space-y-4">
                  {[
                    { name: "Quick Learner", desc: "Played for 5+ hours", achieved: totalHours >= 5 },
                    { name: "Explorer", desc: "Attempted 10 simulations", achieved: totalSims >= 10 },
                    { name: "Quiz Master", desc: "Got 100% in a quiz", achieved: sessions.some(s => s.correctAnswers > 0 && s.correctAnswers === s.attempts) }
                  ].map((ach, i) => (
                    <div key={i} className={clsx(
                      "px-5 py-4 rounded-2xl border transition-all flex items-center gap-4",
                      ach.achieved ? "bg-amber-50 border-amber-100 dark:bg-amber-500/5 dark:border-amber-500/20" : "bg-slate-50 border-slate-100 dark:bg-white/5 dark:border-white/5 opacity-50"
                    )}>
                      <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", ach.achieved ? "bg-amber-200 dark:bg-amber-500/20" : "bg-slate-200 dark:bg-white/10")}>
                        <Zap className={clsx("w-5 h-5", ach.achieved ? "text-amber-600" : "text-slate-400")} />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-800 dark:text-slate-200">{ach.name}</div>
                        <div className="text-[10px] text-slate-500 font-medium">{ach.desc}</div>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
         </div>

         {/* Right Side: Learning History */}
         <div className="lg:col-span-2">
            <section>
               <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Detailed learning log</h3>
                  <div className="text-xs font-bold text-slate-400">Your activity</div>
               </div>

               <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[500px] custom-scrollbar pr-2">
                  {sessions.length > 0 ? sessions.map((session, i) => {
                    const sim = simulations.find(s => s.id === session.simulationId);
                    const type = sim?.simulationType || 'play';
                    return (
                      <div key={session.id} className="p-5 rounded-[2rem] bg-white dark:bg-[#111116] border border-slate-200 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between group hover:border-blue-500/30 transition-all gap-4">
                         <div className="flex items-center gap-5">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 dark:bg-black/40 p-1.5 border border-slate-100 dark:border-white/5 shrink-0">
                               <img src={sim?.thumbnail?.includes('unsplash') ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400' viewBox='0 0 800 400' fill='none'%3E%3Crect width='800' height='400' fill='%23F4F4F5'/%3E%3Cg transform='translate(260, 150)'%3E%3Cpath d='M8 64C8 68.4183 11.5817 72 16 72H64C68.4183 72 72 68.4183 72 64V16C72 11.5817 68.4183 8 64 8H16C11.5817 8 8 11.5817 8 16V64ZM16 16H64V64H16V16Z' fill='%23A1A1AA'/%3E%3Cpath d='M28 28C25.7909 28 24 29.7909 24 32C24 34.2091 25.7909 36 28 36C30.2091 36 32 34.2091 32 32C32 29.7909 30.2091 28 28 28Z' fill='%23A1A1AA'/%3E%3Cpath d='M16 64L32 40L44 56L56 44L64 56V64H16Z' fill='%23A1A1AA'/%3E%3Ctext x='100' y='52' font-family='system-ui, -apple-system, sans-serif' font-size='48' font-weight='800' fill='%23A1A1AA'%3ENo logo%3C/text%3E%3C/g%3E%3C/svg%3E" : (sim?.thumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400' viewBox='0 0 800 400' fill='none'%3E%3Crect width='800' height='400' fill='%23F4F4F5'/%3E%3Cg transform='translate(260, 150)'%3E%3Cpath d='M8 64C8 68.4183 11.5817 72 16 72H64C68.4183 72 72 68.4183 72 64V16C72 11.5817 68.4183 8 64 8H16C11.5817 8 8 11.5817 8 16V64ZM16 16H64V64H16V16Z' fill='%23A1A1AA'/%3E%3Cpath d='M28 28C25.7909 28 24 29.7909 24 32C24 34.2091 25.7909 36 28 36C30.2091 36 32 34.2091 32 32C32 29.7909 30.2091 28 28 28Z' fill='%23A1A1AA'/%3E%3Cpath d='M16 64L32 40L44 56L56 44L64 56V64H16Z' fill='%23A1A1AA'/%3E%3Ctext x='100' y='52' font-family='system-ui, -apple-system, sans-serif' font-size='48' font-weight='800' fill='%23A1A1AA'%3ENo logo%3C/text%3E%3C/g%3E%3C/svg%3E")} className="w-full h-full object-cover rounded-xl" alt="" />
                            </div>
                            <div className="flex flex-col gap-1">
                               <h4 className="font-bold text-slate-900 dark:text-white">{sim?.title || 'Unknown Simulation'}</h4>
                               <div className="flex flex-wrap items-center gap-3">
                                  <span className={clsx(
                                    "text-[9px] font-bold px-2 py-0.5 rounded-full capitalize",
                                    type === 'quiz' ? "bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400" : 
                                    type === 'task' ? "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" : 
                                    "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                                  )}>
                                     {type}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                     <Clock className="w-3 h-3" /> {formatDuration(session.timeSpent)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                     <Activity className="w-3 h-3" /> {formatActivityDate(session.startTime)}
                                  </span>
                               </div>
                            </div>
                         </div>

                         <div className="flex items-center gap-6 self-end sm:self-center bg-slate-50 dark:bg-black/20 px-4 py-2 rounded-2xl border border-slate-100 dark:border-white/5 shadow-inner">
                            {session.tasksCompleted > 0 && (
                              <div className="flex flex-col items-center">
                                 <span className="text-[9px] font-bold text-slate-400">Tasks</span>
                                 <div className="flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                                    <span className="font-bold text-slate-900 dark:text-white">{session.tasksCompleted}</span>
                                 </div>
                              </div>
                            )}
                            {session.attempts > 0 && (
                              <div className="flex flex-col items-center">
                                 <span className="text-[9px] font-bold text-slate-400">Accuracy</span>
                                 <div className="flex flex-col items-center">
                                    <span className={clsx(
                                      "font-bold text-sm",
                                      (session.correctAnswers / session.attempts) >= 0.7 ? "text-emerald-500" : "text-amber-500"
                                    )}>
                                       {session.correctAnswers}/{session.attempts}
                                    </span>
                                    <div className="w-10 h-1 bg-slate-200 dark:bg-white/10 rounded-full mt-1 overflow-hidden">
                                       <div className="h-full bg-emerald-500" style={{ width: `${(session.correctAnswers / session.attempts) * 100}%` }}></div>
                                    </div>
                                 </div>
                              </div>
                            )}
                            <div className="flex flex-col items-center">
                               <span className="text-[9px] font-bold text-blue-500">XP earned</span>
                               <div className="flex items-center gap-1">
                                  <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                                  <span className="font-bold text-blue-600 dark:text-blue-400">+{session.xpEarned || 0}</span>
                               </div>
                            </div>
                         </div>
                      </div>
                    );
                  }) : (
                    <div className="p-12 text-center rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-white/5 text-slate-400 font-medium">
                       You haven't played any simulations yet. Go to Library!
                    </div>
                  )}
               </div>
            </section>
         </div>
      </div>
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
