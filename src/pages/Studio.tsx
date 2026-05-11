import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSimulationsSync, deleteSimulation } from '../data';
import { Simulation } from '../types';
import { 
  Plus, 
  Edit3, 
  Image as ImageIcon, 
  FileArchive, 
  Search, 
  Filter, 
  BarChart2, 
  MoreVertical, 
  Loader2, 
  Trash2, 
  X, 
  AlertTriangle 
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function Studio() {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [simToDelete, setSimToDelete] = useState<Simulation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    return useSimulationsSync((newData) => {
      setSimulations(newData);
      setLoading(false);
    });
  }, []);

  const handleDelete = async () => {
    if (!simToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSimulation(simToDelete.id);
      setSimToDelete(null);
    } catch (error) {
      console.error("Error deleting simulation:", error);
      alert("Failed to delete simulation.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter to show simulations in Studio
  // If the user wants to see their works, we might need to filter by owner if we had auth-based ownership
  // For now, let's keep it simple but ensure it's not filtering out everything if sourceType is local
  const uploadedSims = simulations.filter(sim => sim.sourceType === 'uploaded' || sim.sourceType === 'local');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] w-full">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Creator Studio</h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-gray-400 mt-2 font-medium">Manage and monitor your uploaded simulations.</p>
        </div>
        <Link 
          to="/studio/new" 
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:scale-105 transition-transform shrink-0"
        >
          <Plus className="w-5 h-5" />
          <span>New Simulation</span>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search your simulations..." 
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 dark:text-white" 
          />
        </div>
        <button className="px-6 py-3 rounded-2xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 font-bold text-sm text-slate-700 dark:text-gray-300 flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {uploadedSims.length === 0 && (
          <div className="text-center py-20 text-slate-500 font-medium bg-white/50 dark:bg-white/5 rounded-[2rem] border border-dashed border-black/10 dark:border-white/10">
            No simulations uploaded yet. Create your first one!
          </div>
        )}

        {uploadedSims.map((sim, index) => (
          <motion.div 
            key={sim.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-[2rem] bg-white dark:bg-[#111116] border border-slate-200 dark:border-white/5 hover:border-blue-200 dark:hover:border-blue-500/30 transition-all gap-4"
          >
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl overflow-hidden bg-slate-50 dark:bg-black/20 p-2 border border-black/5 dark:border-white/5">
                <img 
                  src={sim.thumbnail} 
                  alt={sim.title} 
                  className="w-full h-full object-cover rounded-xl transition-transform duration-700 group-hover:scale-105" 
                />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight mb-1 truncate">{sim.title}</h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-gray-400 line-clamp-1 font-medium mb-3 max-w-md">
                  {sim.description}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded-lg">
                    {sim.category}
                  </span>
                  <div className="hidden sm:block w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-white/10"></div>
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-gray-400 flex items-center gap-1.5 bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5 px-2.5 py-1 rounded-lg">
                    <FileArchive className="w-3.5 h-3.5 text-emerald-500" />
                    {sim.sourceType === 'uploaded' ? 'Build Zip' : 'Local Source'}
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-gray-400 flex items-center gap-1.5 bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5 px-2.5 py-1 rounded-lg">
                    <ImageIcon className="w-3.5 h-3.5 text-purple-500" />
                    {sim.screenshots?.length || 0} Assets
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center sm:justify-end gap-3 w-full sm:w-auto pt-4 sm:pt-0 border-t border-black/5 dark:border-white/5 sm:border-0 pl-2 sm:pl-0 sm:pr-4">
              <div className="hidden md:flex flex-col items-end mr-4">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20 px-2.5 py-1 rounded-lg">Published</span>
                <span className="text-[11px] text-slate-400 font-medium mt-1.5">Updated 2d ago</span>
              </div>
              
              <div className="flex items-center gap-2 ml-auto sm:ml-0">
                <button className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors" title="Analytics">
                  <BarChart2 className="w-4 h-4" />
                </button>
                <Link 
                  to={`/studio/edit/${sim.id}`}
                  className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:hover:bg-blue-500/20 dark:hover:text-blue-400 dark:hover:border-blue-500/30 transition-all font-bold"
                >
                  <Edit3 className="w-4 h-4" />
                </Link>
                <button 
                  onClick={() => setSimToDelete(sim)}
                  className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10 flex items-center justify-center text-red-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-500/20 dark:hover:text-red-400 dark:hover:border-red-500/30 transition-all font-bold"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition-colors sm:hidden">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {simToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !isDeleting && setSimToDelete(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white dark:bg-[#1a1a24] rounded-[2rem] p-6 border border-slate-200 dark:border-white/10"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <button 
                  onClick={() => !isDeleting && setSimToDelete(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete Simulation?</h2>
              <p className="text-slate-600 dark:text-gray-400 mb-6">
                Are you sure you want to permanently delete <span className="font-bold text-slate-900 dark:text-white">{simToDelete.title}</span>? This action cannot be undone.
              </p>

              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setSimToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-700 dark:text-gray-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Delete Permanently'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
