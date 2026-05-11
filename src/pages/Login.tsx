import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion } from 'motion/react';
import { Hexagon, Lock, User, Loader2 } from 'lucide-react';

export function Login() {
  const { login } = useAuth();
  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ok = await login(id, pass);
      if (!ok) {
        setError('Invalid ID or password');
      }
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-[#1a1a24] rounded-3xl p-8 border border-slate-200 dark:border-white/10"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center rotate-3 ">
            <Hexagon className="w-8 h-8 text-white -rotate-3" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">Welcome to Sez Simulation</h1>
        <p className="text-center text-slate-500 mb-8 font-medium text-sm">Sign in with your organizational or personal ID</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="text" 
                placeholder="User ID (e.g. admin, school_org, student1)"
                value={id}
                onChange={e => setId(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-white/5 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-[#0a0a0a] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="password" 
                placeholder="Password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-white/5 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-[#0a0a0a] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition-all"
              />
            </div>
          </div>

          {error && <div className="text-red-500 text-sm font-semibold">{error}</div>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 p-4 bg-slate-100 dark:bg-white/5 rounded-xl border border-dashed border-slate-300 dark:border-white/10 text-sm">
          <p className="font-bold text-slate-700 dark:text-slate-300 mb-2">Testing Credentials:</p>
          <ul className="space-y-2 text-slate-600 dark:text-slate-400 font-mono text-xs">
            <li><span className="font-bold text-blue-500">Super Admin:</span> ID: admin | Pass: adminpass</li>
            <li><span className="font-bold text-blue-500">Organization:</span> ID: school_org | Pass: orgpass</li>
            <li><span className="font-bold text-blue-500">Personal/Student:</span> ID: student1 | Pass: stupass</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
