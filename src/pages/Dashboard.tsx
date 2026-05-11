import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useSimulationsSync } from '../data';
import { Simulation, ActivityLog } from '../types';
import { Trophy, Clock, Target, Flame, ChevronRight, Loader2, Zap, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getStudentActivities } from '../services/trackingService';
import clsx from 'clsx';

export function Dashboard() {
  const { user } = useAuth();
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats
  const [totalXp, setTotalXp] = useState(0);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);
  const [totalSimsCount, setTotalSimsCount] = useState(0);

  const formatDuration = (seconds: number) => {
    const h = Math.floor((seconds || 0) / 3600);
    const m = Math.floor(((seconds || 0) % 3600) / 60);
    const s = (seconds || 0) % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  useEffect(() => {
    return useSimulationsSync((newData) => {
      setSimulations(newData);
    });
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      setLoading(true);
      try {
        const logs = await getStudentActivities(user.id);
        setActivities(logs);
        const xp = logs.reduce((acc, curr) => acc + (curr.xpEarned || 0), 0);
        const seconds = logs.reduce((acc, curr) => acc + (curr.timeSpent || 0), 0);
        const uniqueSimIds = new Set(logs.map(l => l.simulationId));
        
        setTotalXp(xp);
        setTotalTimeSpent(seconds);
        setTotalSimsCount(uniqueSimIds.size);
      } catch (e) {
        console.error("Dashboard data fetch error:", e);
      }
      setLoading(false);
    }
    fetchData();
  }, [user]);

  // Derive "Recent Simulations" from activities
  const recentActivityMap = new Map<string, ActivityLog>();
  activities.forEach(log => {
    if (!recentActivityMap.has(log.simulationId)) {
      recentActivityMap.set(log.simulationId, log);
    }
  });

  const recentPlayedSimsIds = Array.from(recentActivityMap.keys()).slice(0, 4);
  const recentSims = recentPlayedSimsIds.map(id => {
    const sim = simulations.find(s => s.id === id);
    const lastActivity = recentActivityMap.get(id);
    return { sim, lastActivity };
  }).filter(item => item.sim);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] w-full">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) return <div className="p-10 text-center">Please login.</div>;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">My Learning Space</h1>

      {/* Profile Overview Card */}
      <section className="relative overflow-hidden rounded-[2rem] bg-white dark:bg-[#111116] border border-slate-200 dark:border-white/5 p-6 sm:p-10 flex flex-col sm:flex-row gap-6 sm:gap-10 items-center">
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

         <div className="flex flex-col gap-3 relative z-10 w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
               <div className="text-center sm:text-left">
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{user.name}</h2>
                  <p className="text-slate-600 dark:text-gray-400 font-medium">Student Learner • {user.id}</p>
               </div>
               <div className="self-center sm:self-start px-4 py-2 bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl font-bold text-sm flex items-center gap-2">
                  <Flame className="w-4 h-4 fill-purple-600 dark:fill-purple-400" />
                  Active Streak: {activities.length > 0 ? '7 days' : '0 days'}
               </div>
            </div>

            <div className="mt-2 sm:mt-4 flex flex-col gap-2">
               <div className="flex justify-between text-sm font-bold">
                  <span className="text-blue-600 dark:text-blue-400">Level {Math.floor(totalXp / 500) + 1}</span>
                  <span className="text-slate-500 dark:text-gray-400">{totalXp.toLocaleString()} / {(Math.floor(totalXp / 500) + 1) * 500} XP</span>
               </div>
               <div className="h-2.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-1000" 
                    style={{ width: `${(totalXp % 500) / 500 * 100}%` }}
                  ></div>
               </div>
            </div>
         </div>
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <StatCard 
           icon={Clock} 
           label="Time Learned" 
           value={formatDuration(totalTimeSpent)} 
           trend="Total focus time"
           color="text-emerald-500 dark:text-emerald-400"
           bg="bg-emerald-50 dark:bg-emerald-500/10"
         />
         <StatCard 
           icon={Target} 
           label="Simulations" 
           value={totalSimsCount} 
           trend="Unique experiences"
           color="text-blue-600 dark:text-blue-400"
           bg="bg-blue-50 dark:bg-blue-500/10"
         />
         <StatCard 
           icon={Zap} 
           label="Earned XP" 
           value={totalXp} 
           trend="Knowledge points"
           color="text-amber-500 dark:text-amber-400"
           bg="bg-amber-50 dark:bg-amber-500/10"
         />
      </section>

      {/* Recent Activity */}
      <section className="flex flex-col gap-6">
         <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Jump Back In</h2>
            <Link to="/library" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-white transition">Full Library →</Link>
         </div>

         <div className="flex flex-col gap-4">
            {recentSims.length > 0 ? recentSims.map(({ sim, lastActivity }, i) => (
              <motion.div 
                key={sim!.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-[2rem] bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 group transition-all"
              >
                <div className="flex flex-row items-center gap-4 sm:gap-6 mb-4 sm:mb-0 w-full sm:w-auto">
                   <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 relative bg-slate-50 dark:bg-black/20 p-2 border border-black/5 dark:border-white/5">
                      <img src={sim!.thumbnail} alt={sim!.title} className="w-full h-full object-cover rounded-xl" />
                   </div>
                   <div className="flex flex-col gap-1">
                      <h3 className="text-slate-900 dark:text-white font-bold text-lg">{sim!.title}</h3>
                      <div className="flex items-center gap-3">
                         <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold">{sim!.category}</span>
                         <span className="text-xs text-slate-400">• Last played: {lastActivity ? new Date((lastActivity.timestamp as any) instanceof Object ? (lastActivity.timestamp as any).seconds * 1000 : lastActivity.timestamp).toLocaleDateString() : 'Unknown'}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                         <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                            <Zap className="w-3 h-3 text-amber-500" /> +{lastActivity?.xpEarned} XP
                         </div>
                         {lastActivity?.quizStats && (
                           <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
                              <CheckCircle className="w-3 h-3" /> {lastActivity.quizStats.correct}/{lastActivity.quizStats.attempted} Quiz
                           </div>
                         )}
                      </div>
                   </div>
                </div>
                <Link 
                  to={`/play/${sim!.id}`}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-50 dark:bg-white/5 border border-blue-100 dark:border-white/5 flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white transition-all font-bold text-sm"
                >
                  Resume Simulation
                </Link>
              </motion.div>
            )) : (
              <div className="p-12 text-center rounded-[2rem] border-2 border-dashed border-slate-400/40 dark:border-white/20 text-slate-500">
                 No simulation activity yet. Start your journey in the Library!
              </div>
            )}
         </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, trend, color, bg }: any) {
  return (
    <div className="bg-white dark:bg-[#111116] border border-slate-200 dark:border-white/5 p-6 rounded-[2rem] flex flex-col gap-4 relative overflow-hidden group hover:border-blue-200 dark:hover:border-blue-500/30 transition ">
       <div className={clsx(`w-14 h-14 rounded-2xl flex items-center justify-center mb-2`, bg, color)}>
          <Icon className="w-7 h-7" />
       </div>
       <div className="flex flex-col gap-1 z-10">
          <span className="text-sm font-semibold text-slate-500 dark:text-gray-400">{label}</span>
          <span className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</span>
       </div>
       <div className="font-bold text-xs text-slate-400 dark:text-slate-500 mt-2">
          {trend}
       </div>
    </div>
  );
}
