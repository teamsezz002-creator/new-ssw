import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Mail, Trash2, Plus, X, Save, Edit } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

interface Plan {
  id: string;
  name: string;
  price: string;
  duration: string;
  desc: string;
  features: string[];
  popular: boolean;
}

const DEFAULT_PLANS: Plan[] = [
  {
    id: 'plan_personal',
    name: 'Personal User',
    price: '$9',
    duration: 'per month',
    desc: 'Perfect for individual students or enthusiasts.',
    features: ['Access to all public simulations', 'Save your progress', 'Basic analytics', '1 Active Device'],
    popular: false,
  },
  {
    id: 'plan_org',
    name: 'Organization / School',
    price: '$199',
    duration: 'per year',
    desc: 'Ideal for schools and educational institutions.',
    features: ['Up to 50 student accounts', 'Advanced analytics & reports', 'Admin dashboard', 'Custom assignments', 'Priority support'],
    popular: true,
  },
];

export function Pricing() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'plans'));
      if (snap.empty) {
        // Seed
        for (const p of DEFAULT_PLANS) {
          await setDoc(doc(db, 'plans', p.id), p);
        }
        setPlans(DEFAULT_PLANS);
      } else {
        const fetchedPlans: Plan[] = [];
        snap.forEach(d => fetchedPlans.push(d.data() as Plan));
        // Sort slightly so popular is maybe second, or just alphabetical by name
        fetchedPlans.sort((a, b) => a.price.localeCompare(b.price));
        setPlans(fetchedPlans);
      }
    } catch (e) {
      console.error(e);
      // Fallback
      setPlans(DEFAULT_PLANS);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleEdit = (plan: Plan) => {
    setEditingPlan({ ...plan });
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingPlan({
      id: 'plan_' + Date.now(),
      name: 'New Plan',
      price: '$0',
      duration: 'per month',
      desc: '',
      features: ['Feature 1'],
      popular: false,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editingPlan) return;
    try {
      await setDoc(doc(db, 'plans', editingPlan.id), editingPlan);
      setShowModal(false);
      setEditingPlan(null);
      fetchPlans();
    } catch (error) {
      console.error("Error saving plan:", error);
      alert("Failed to save plan.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this plan?")) {
      try {
        await deleteDoc(doc(db, 'plans', id));
        fetchPlans();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const isAdmin = user?.role === 'super_admin';

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-12 items-center py-10 relative">
      <div className="text-center max-w-2xl relative w-full">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">{isAdmin ? 'Manage Plans' : 'Choose Your Plan'}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg">
          {isAdmin ? 'Add, edit, or remove the pricing tiers available to users below.' : 'Unlock the full potential of immersive learning. Choose the plan that fits you or your organization.'}
        </p>
        {isAdmin && (
          <button 
            onClick={handleAdd}
            className="mt-6 mx-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" /> Add New Plan
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-slate-500 font-medium">Loading plans...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl px-4">
          {plans.map((plan, i) => (
            <motion.div 
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`p-8 rounded-3xl border flex flex-col justify-between relative group ${
                plan.popular 
                  ? 'bg-blue-600 border-blue-600 text-white md:scale-[1.02]' 
                  : 'bg-white dark:bg-[#111116] border-slate-200 dark:border-white/10'
              }`}
            >
              {isAdmin && (
                 <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(plan)} className="p-2 bg-white/20 hover:bg-white/40 text-black dark:text-white backdrop-blur-md rounded-xl transition-colors">
                       <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(plan.id)} className="p-2 bg-red-500/80 hover:bg-red-600 text-white backdrop-blur-md rounded-xl transition-colors">
                       <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
              )}

              <div>
                {plan.popular && <span className="px-3 py-1 bg-white/20 text-white rounded-full text-xs font-bold uppercase tracking-widest mb-4 inline-block">Best Value</span>}
                <h3 className={`text-xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{plan.name}</h3>
                <p className={`text-sm mb-6 ${plan.popular ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>{plan.desc}</p>
                
                <div className="flex items-baseline gap-2 mb-8">
                  <span className={`text-5xl font-bold ${plan.popular ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{plan.price}</span>
                  <span className={`font-semibold ${plan.popular ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>{plan.duration}</span>
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-center gap-3">
                      <Check className={`w-5 h-5 flex-shrink-0 ${plan.popular ? 'text-blue-200' : 'text-blue-500'}`} />
                      <span className={`font-medium leading-tight ${plan.popular ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a 
                href="mailto:contact@sezsimulation.com"
                className={`w-full py-4 text-center rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  plan.popular 
                    ? 'bg-white text-blue-600 hover:bg-slate-50' 
                    : 'bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                <Mail className="w-5 h-5" /> Contact Us to Upgrade
              </a>
            </motion.div>
          ))}

          {plans.length === 0 && !loading && (
            <div className="col-span-2 text-center text-slate-500 py-10">No plans configured yet.</div>
          )}
        </div>
      )}

      {!isAdmin && (
        <div className="text-center mt-10 p-6 bg-blue-50 dark:bg-blue-950/20 rounded-2xl w-full max-w-4xl border border-blue-100 dark:border-blue-900/50">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Need a custom enterprise solution?</h3>
          <p className="text-slate-600 dark:text-slate-400">If you need more than 50 students or a custom simulation developed, please contact our team for enterprise pricing.</p>
          <a href="mailto:contact@sezsimulation.com" className="inline-flex mt-4 items-center gap-2 font-bold text-blue-600 hover:text-blue-700 transition-colors">
            Contact Sales <Mail className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Plan Edit Modal */}
      <AnimatePresence>
        {showModal && editingPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#1a1a24] rounded-3xl p-6 border border-slate-200 dark:border-white/10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Plan</h2>
                <button 
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Plan Name</label>
                  <input 
                    type="text" 
                    value={editingPlan.name} 
                    onChange={e => setEditingPlan({...editingPlan, name: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-900 dark:text-white border-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Price (e.g. $99)</label>
                    <input 
                      type="text" 
                      value={editingPlan.price} 
                      onChange={e => setEditingPlan({...editingPlan, price: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-900 dark:text-white border-none focus:ring-2 focus:ring-blue-500" 
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Duration (e.g. per month)</label>
                    <input 
                      type="text" 
                      value={editingPlan.duration} 
                      onChange={e => setEditingPlan({...editingPlan, duration: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-900 dark:text-white border-none focus:ring-2 focus:ring-blue-500" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <input 
                    type="text" 
                    value={editingPlan.desc} 
                    onChange={e => setEditingPlan({...editingPlan, desc: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-900 dark:text-white border-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Features (one per line)</label>
                  <textarea 
                    rows={5}
                    value={editingPlan.features.join('\n')} 
                    onChange={e => setEditingPlan({...editingPlan, features: e.target.value.split('\n').filter(f => f.trim() !== '')})}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-900 dark:text-white border-none focus:ring-2 focus:ring-blue-500 resize-none" 
                  />
                </div>
                
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={editingPlan.popular}
                    onChange={e => setEditingPlan({...editingPlan, popular: e.target.checked})}
                    className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300">Highlight as "Best Value" (Popular)</span>
                </label>

                <button 
                  onClick={handleSave}
                  className="w-full py-4 mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex justify-center items-center gap-2"
                >
                  <Save className="w-5 h-5" /> Save Plan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
