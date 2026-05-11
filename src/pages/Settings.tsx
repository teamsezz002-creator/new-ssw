import React from 'react';
import { Settings as SettingsIcon, Bell, Moon, Shield } from 'lucide-react';

export function Settings() {
  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full pb-10">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h1>

      <section className="bg-white dark:bg-[#111116] border border-slate-200 dark:border-white/5 p-8 rounded-[2rem] flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-blue-600 dark:text-blue-400">
               <Bell className="w-6 h-6" />
            </div>
            <div>
               <h3 className="font-bold text-slate-900 dark:text-white">Notifications</h3>
               <p className="text-sm text-slate-500 dark:text-gray-400">Manage your simulation alerts.</p>
            </div>
          </div>
          <input type="checkbox" className="w-6 h-6 rounded-md accent-blue-600" defaultChecked />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-2xl text-purple-600 dark:text-purple-400">
               <Moon className="w-6 h-6" />
            </div>
            <div>
               <h3 className="font-bold text-slate-900 dark:text-white">Dark Mode</h3>
               <p className="text-sm text-slate-500 dark:text-gray-400">Toggle dark theme.</p>
            </div>
          </div>
          <input type="checkbox" className="w-6 h-6 rounded-md accent-purple-600" defaultChecked />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl text-emerald-600 dark:text-emerald-400">
               <Shield className="w-6 h-6" />
            </div>
            <div>
               <h3 className="font-bold text-slate-900 dark:text-white">Privacy</h3>
               <p className="text-sm text-slate-500 dark:text-gray-400">Manage your data sharing.</p>
            </div>
          </div>
          <input type="checkbox" className="w-6 h-6 rounded-md accent-emerald-600" />
        </div>
      </section>
    </div>
  );
}
