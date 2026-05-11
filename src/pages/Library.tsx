import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSimulationsSync } from '../data';
import { Simulation } from '../types';
import { LayoutGrid, Zap, FlaskConical, Dna, Calculator, Heart, Globe, Book, History, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const filterCategories = [
  { name: 'All', icon: LayoutGrid, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-500/20' },
  { name: 'Physics', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-500/20' },
  { name: 'Chemistry', icon: FlaskConical, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-500/20' },
  { name: 'Biology', icon: Dna, color: 'text-rose-500', bg: 'bg-rose-100 dark:bg-rose-500/20' },
  { name: 'Math', icon: Calculator, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-500/20' },
  { name: 'Geography', icon: Globe, color: 'text-teal-500', bg: 'bg-teal-100 dark:bg-teal-500/20' },
  { name: 'English', icon: Book, color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-500/20' },
  { name: 'History', icon: History, color: 'text-stone-500', bg: 'bg-stone-100 dark:bg-stone-500/20' },
];

const grades = ['All', 'General', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

export function Library() {
  const [activeSubject, setActiveSubject] = useState('All');
  const [activeGrade, setActiveGrade] = useState('All');
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);

  const subjectScrollRef = useRef<HTMLDivElement>(null);
  const gradeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;

    const targets = new WeakMap<HTMLElement, number>();
    const animating = new WeakMap<HTMLElement, boolean>();

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
      } else if (e.ctrlKey) {
        e.preventDefault();
        const el = e.currentTarget as HTMLElement;
        
        // initialize target scroll location
        if (!targets.has(el)) {
          targets.set(el, el.scrollLeft);
        }
        
        // Update target based on wheel delta
        let target = targets.get(el)! + e.deltaY * 2;
        target = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
        targets.set(el, target);

        // start animation loop if not currently animating
        if (!animating.get(el)) {
          animating.set(el, true);
          
          const smoothScroll = () => {
            const currentTarget = targets.get(el)!;
            const diff = currentTarget - el.scrollLeft;
            
            if (Math.abs(diff) < 0.5) {
              el.scrollLeft = currentTarget;
              animating.set(el, false);
            } else {
              el.scrollLeft += diff * 0.15; // easing factor 0.15
              requestAnimationFrame(smoothScroll);
            }
          };
          requestAnimationFrame(smoothScroll);
        }
      }
    };

    const subjectEl = subjectScrollRef.current;
    const gradeEl = gradeScrollRef.current;

    if (subjectEl) subjectEl.addEventListener('wheel', handleWheel, { passive: false });
    if (gradeEl) gradeEl.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      if (subjectEl) subjectEl.removeEventListener('wheel', handleWheel);
      if (gradeEl) gradeEl.removeEventListener('wheel', handleWheel);
    };
  }, [loading]);

  useEffect(() => {
    return useSimulationsSync((newData) => {
      setSimulations(newData);
      setLoading(false);
    });
  }, []);

  const filteredSims = simulations.filter(sim => {
    const matchSubject = activeSubject === 'All' || sim.category === activeSubject;
    const matchGrade = activeGrade === 'All' || sim.targetClass.replace('STD', 'Grade') === activeGrade || (activeGrade === 'General' && sim.targetClass === 'General');
    return matchSubject && matchGrade;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] w-full">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 max-w-7xl mx-auto items-start w-full">
      <div className="flex flex-col gap-10 w-full mb-4">
        {/* Subject Filters */}
        <div 
          ref={subjectScrollRef}
          className="flex overflow-x-auto pb-4 gap-4 sm:gap-6 hide-scrollbar w-full"
        >
          {filterCategories.map((cat) => {
            const isActive = activeSubject === cat.name;
            return (
              <button
                key={cat.name}
                onClick={() => setActiveSubject(cat.name)}
                className={`relative flex flex-col items-center justify-center min-w-[120px] h-[140px] rounded-[2rem] transition-all bg-white dark:bg-white/5 border-2 ${
                  isActive 
                    ? 'border-blue-500 ' 
                    : 'border-transparent hover:border-black/5 dark:hover:border-white/10'
                }`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${cat.bg}`}>
                  <cat.icon className={`w-6 h-6 ${cat.color}`} />
                </div>
                <span className={`text-sm font-bold ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-gray-400'}`}>
                  {cat.name}
                </span>
                
              </button>
            );
          })}
        </div>

        {/* Grade Filters */}
        <div className="flex flex-col gap-4 w-full">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Browse by Grade <span className="text-slate-400 font-normal">›</span>
          </h2>
          <div 
            ref={gradeScrollRef}
            className="flex overflow-x-auto pb-4 gap-3 hide-scrollbar w-full"
          >
            {grades.map(grade => (
              <button
                key={grade}
                onClick={() => setActiveGrade(grade)}
                className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all whitespace-nowrap border ${
                  activeGrade === grade 
                    ? 'bg-blue-500 text-white border-blue-500' 
                    : 'bg-white text-slate-600 border-transparent hover:bg-slate-50 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10'
                }`}
              >
                {grade}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Simulations Grid */}
      <div className="flex flex-col gap-4 w-full">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 mt-4">
          All Simulations <span className="text-slate-400 font-normal">›</span>
        </h2>
        
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
          <AnimatePresence>
            {filteredSims.map((sim, index) => {
              let tagColor = 'bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400';
              if (sim.category === 'Biology') tagColor = 'bg-rose-50 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400';
              if (sim.category === 'Chemistry') tagColor = 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400';
              if (sim.category === 'Math') tagColor = 'bg-purple-50 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400';

              return (
                <motion.div 
                  layout
                  key={sim.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                >
                  <Link 
                    to={`/play/${sim.id}`}
                    className="group flex flex-row items-center gap-5 rounded-[2rem] p-4 bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 hover:border-blue-500/50 transition-all duration-300 h-full"
                  >
                    <div className="w-24 h-24 sm:w-[100px] sm:h-[100px] shrink-0 rounded-[1.5rem] overflow-hidden bg-slate-50 dark:bg-black/20 p-2.5">
                      <img 
                        src={sim.thumbnail} 
                        alt={sim.title} 
                        className="w-full h-full object-cover rounded-xl transition-transform duration-700 group-hover:scale-105" 
                      />
                    </div>
                    <div className="flex flex-col flex-1 min-w-0 pr-2">
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">{sim.title}</h3>
                        <button className="text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors shrink-0">
                          <Heart className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-gray-400 line-clamp-1 mb-3 font-medium">
                        {sim.description}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-auto">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${tagColor}`}>
                          {sim.category}
                        </span>
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-gray-300">
                          {sim.targetClass === 'General' ? 'General' : sim.targetClass}
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredSims.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 dark:text-gray-500">
               <p className="text-lg font-bold text-slate-800 dark:text-slate-300">No matching simulations.</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
