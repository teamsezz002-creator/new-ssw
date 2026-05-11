import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Library, User, Settings, Search, Bell, Sun, Moon, Menu, X, MonitorUp, Users, LogOut, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { useTheme } from './ThemeProvider';
import { simulations } from '../data';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isPlayer = location.pathname.includes('/play/');
  const { theme, toggleTheme } = useTheme();
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [orgName, setOrgName] = useState<string>('');

  useEffect(() => {
    const fetchOrgName = async () => {
      if (user?.role === 'personal_user' && user.organizationId) {
        try {
          const orgDoc = await getDoc(doc(db, 'users', user.organizationId));
          if (orgDoc.exists()) {
            setOrgName(orgDoc.data().name);
          }
        } catch (error) {
          console.error("Error fetching org name", error);
        }
      }
    };
    fetchOrgName();
  }, [user]);

  // Dynamic Navigation Items
  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Library, label: 'Library', path: '/library' },
  ];

  if (user?.role === 'super_admin') {
    navItems.push({ icon: MonitorUp, label: 'Studio', path: '/studio' });
  }

  navItems.push({ icon: User, label: 'Profile', path: '/profile' });
  navItems.push({ icon: Settings, label: 'Settings', path: '/settings' });

  if (user?.role === 'super_admin' || user?.role === 'organization') {
     navItems.push({ icon: Users, label: 'Users', path: '/users' });
  }

  // If in player mode, we might want a different layout, but let's hide sidebar
  if (isPlayer) {
    return <Outlet />;
  }

  const searchResults = searchQuery ? simulations.filter(sim => 
    sim.title.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 3) : [];

  const handleProfileClick = () => {
     navigate('/profile');
     setMobileMenuOpen(false);
  };

  const handleUpgrade = () => {
    navigate('/pricing');
  };

  return (
    <div className="w-full h-[100dvh] bg-slate-50 dark:bg-[#020208] text-slate-900 dark:text-slate-100 font-sans overflow-hidden relative transition-colors duration-300">
      
      {/* Blur Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-blue-500/20 dark:bg-blue-600/20 rounded-full blur-[100px] md:blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-purple-500/20 dark:bg-purple-600/20 rounded-full blur-[100px] md:blur-[120px] pointer-events-none z-0"></div>
      
      <div className="flex h-full w-full relative z-10 flex-col md:flex-row">
        
        {/* Mobile Header (Shows only on small screens) */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-xl z-40 relative">
          <div className="flex items-center gap-2">
             <img src="/logo.png" alt="SSWorld" className="w-[58px] h-[58px] object-contain" />
          </div>
          <div className="flex items-center gap-4 relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className="p-2 text-slate-600 dark:text-slate-400 hover:text-blue-500 transition-colors relative">
               <Bell className="w-5 h-5" />
               <span className="absolute top-1 right-2 w-2 h-2 bg-blue-500 rounded-full"></span>
            </button>
            
            {/* Mobile Notifications Dropdown */}
            <AnimatePresence>
               {showNotifications && (
                 <motion.div
                   initial={{ opacity: 0, y: 10, scale: 0.95 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   exit={{ opacity: 0, y: 10, scale: 0.95 }}
                   className="absolute top-12 right-0 w-72 bg-white dark:bg-[#111116] border border-black/10 dark:border-white/10 rounded-2xl p-4 z-50 flex flex-col gap-4"
                 >
                   <div className="flex justify-between items-center px-1">
                      <h3 className="font-bold text-slate-900 dark:text-white">Notifications</h3>
                      <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-4 h-4" /></button>
                   </div>
                   <div className="flex flex-col gap-2">
                     <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
                           <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                           <p className="text-sm font-semibold text-slate-900 dark:text-white">New Simulation</p>
                           <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">Gravity Simulator 3D is available.</p>
                        </div>
                     </div>
                   </div>
                 </motion.div>
               )}
            </AnimatePresence>

            <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-slate-900 dark:text-white">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Sidebar Navigation (Hidden on mobile by default) */}
        <nav className="hidden md:flex w-64 flex-shrink-0 border-r border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-2xl flex-col relative">
          
          {/* Fixed Sidebar Header (Logo) */}
          <div className="flex items-center justify-center w-full px-8 py-8 flex-shrink-0">
             <img src="/logo.png" alt="SSWorld" className="w-[58px] h-[58px] object-contain transition-all" />
          </div>

          {/* Scrollable Navigation Middle */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-8 flex flex-col gap-2">
            {navItems.map((item) => (
              <NavLink 
                key={item.path} 
                to={item.path}
                className={({ isActive }) => clsx(
                  "flex items-center gap-4 px-6 py-4 rounded-lg transition-all duration-300 relative group",
                  isActive ? "text-blue-600 dark:text-slate-100" : "text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white transition-colors"
                )}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div 
                        layoutId="sidebar-active" 
                        className="absolute inset-0 bg-blue-50 dark:bg-white/10 rounded-lg"
                        initial={false}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                    <item.icon className={clsx("w-6 h-6 relative z-10 transition-transform duration-300 group-hover:scale-110", isActive && "text-blue-600 dark:text-blue-400")} />
                    <span className="font-medium tracking-wide text-sm relative z-10">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>

          {/* Fixed Sidebar Footer */}
          <div className="mt-auto p-4 w-full flex flex-col gap-4 border-t border-black/5 dark:border-white/5 bg-white/10 dark:bg-black/10 backdrop-blur-md">
            
            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme} 
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors text-slate-700 dark:text-slate-300 "
            >
              {theme === 'dark' ? (
                <><Sun className="w-5 h-5 text-amber-400" /><span className="text-sm font-medium">Light Mode</span></>
              ) : (
                <><Moon className="w-5 h-5 text-indigo-600" /><span className="text-sm font-medium">Dark Mode</span></>
              )}
            </button>

            <div className="flex flex-col gap-1 items-center bg-white/30 dark:bg-[#111116]/50 p-4 rounded-xl border border-black/5 dark:border-white/5">
               <div className="flex justify-between items-start w-full cursor-pointer" onClick={handleProfileClick}>
                  <div className="flex items-center gap-3 min-w-0 pr-1 text-white">
                      <div className={clsx(
                        "w-10 h-10 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center p-0.5 shrink-0"
                      )}>
                        <div className={clsx(
                          "w-full h-full rounded-full flex items-center justify-center text-white",
                          user?.role === 'super_admin' ? 'bg-gradient-to-tr from-rose-500 to-orange-500' :
                          user?.role === 'organization' ? 'bg-gradient-to-tr from-violet-500 to-fuchsia-500' :
                          'bg-gradient-to-tr from-blue-500 to-sky-500'
                        )}>
                           <span className="font-bold text-xs tracking-tighter">{user?.name?.substring(0, 2).toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="flex flex-col overflow-hidden">
                         <span className="text-sm font-semibold truncate text-slate-800 dark:text-slate-200">{user?.name}</span>
                         <span className="text-xs text-slate-500 font-bold truncate">{user?.role.replace('_', ' ')}</span>
                      </div>
                  </div>
               </div>
               <button 
                 onClick={logout}
                 className="mt-2 w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
               >
                 <LogOut className="w-4 h-4" /> Sign Out
               </button>
            </div>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto relative perspective-1000 custom-scrollbar flex flex-col min-h-0">
          
          {/* Top Header (Desktop) */}
          <header className="hidden md:flex sticky top-0 z-30 h-20 items-center justify-between px-6 lg:px-10 bg-gradient-to-b from-slate-50 dark:from-[#020208] to-transparent pointer-events-none transition-colors duration-300 flex-shrink-0">
             
             <div className="pointer-events-auto relative">
                <div className="flex items-center space-x-4 bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10 px-4 py-2 rounded-full w-60 lg:w-80 backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-blue-500/50 ">
                   <Search className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                   <input 
                     type="text" 
                     placeholder="Search simulations..." 
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     onFocus={() => setIsSearchFocused(true)}
                     onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                     className="w-full bg-transparent text-sm focus:outline-none text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                   />
                </div>

                {/* Search Dropdown */}
                <AnimatePresence>
                   {isSearchFocused && searchQuery && (
                     <motion.div
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0, y: 10 }}
                       className="absolute top-14 left-0 w-full bg-white dark:bg-[#111116] border border-black/10 dark:border-white/10 rounded-2xl p-2 z-50 flex flex-col gap-1"
                     >
                       {searchResults.length > 0 ? (
                         searchResults.map(sim => (
                           <div 
                             key={sim.id}
                             onClick={() => navigate(`/play/${sim.id}`)}
                             className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl cursor-pointer transition-colors"
                           >
                              <img src={sim.thumbnail} alt={sim.title} className="w-10 h-10 rounded-lg object-cover" />
                              <div className="flex flex-col">
                                 <span className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">{sim.title}</span>
                                 <span className="text-xs text-slate-500 dark:text-gray-400">{sim.category}</span>
                              </div>
                           </div>
                         ))
                       ) : (
                         <div className="p-4 text-center text-sm text-slate-500 dark:text-gray-400">
                           No simulations found.
                         </div>
                       )}
                     </motion.div>
                   )}
                </AnimatePresence>
             </div>

             <div className="pointer-events-auto flex items-center space-x-3 sm:space-x-4 md:space-x-6 relative">
                
                <button 
                  onClick={handleUpgrade}
                  className="hidden lg:flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-4 py-2 rounded-full font-bold transition-all hover:scale-105"
                >
                  <Crown className="w-4 h-4 fill-white flex-shrink-0" />
                  <span>{user?.role === 'super_admin' ? 'Plans' : 'Upgrade'}</span>
                </button>

                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-white transition"
                >
                  <Bell className="w-6 h-6" />
                  <span className="absolute top-1 right-2 w-2 h-2 bg-blue-500 rounded-full"></span>
                </button>

                {/* Notifications Dropdown */}
                <AnimatePresence>
                   {showNotifications && (
                     <motion.div
                       initial={{ opacity: 0, y: 10, scale: 0.95 }}
                       animate={{ opacity: 1, y: 0, scale: 1 }}
                       exit={{ opacity: 0, y: 10, scale: 0.95 }}
                       className="absolute top-14 right-48 w-80 bg-white dark:bg-[#111116] border border-black/10 dark:border-white/10 rounded-3xl p-4 z-50 flex flex-col gap-4"
                     >
                       <div className="flex justify-between items-center px-1">
                          <h3 className="font-bold text-slate-900 dark:text-white">Notifications</h3>
                          <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-4 h-4" /></button>
                       </div>
                       <div className="flex flex-col gap-2">
                         <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
                               <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                               <p className="text-sm font-semibold text-slate-900 dark:text-white">New Simulation Available</p>
                               <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Check out "Gravity Simulator 3D" in the Library.</p>
                            </div>
                         </div>
                       </div>
                     </motion.div>
                   )}
                </AnimatePresence>

                <div className="text-right flex flex-col justify-center items-end border-l border-black/10 dark:border-white/10 pl-6 h-10">
                   {user?.role !== 'super_admin' && (
                     <p className="text-xs text-slate-500 font-bold">
                       {user?.role === 'organization' && 'Platform Organization'}
                       {user?.role === 'personal_user' && 'Student Profile'}
                     </p>
                   )}
                   <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                     {user?.role === 'super_admin' && 'Super Admin'}
                     {user?.role === 'organization' && user?.name}
                     {user?.role === 'personal_user' && (orgName ? `${user?.name} • ${orgName}` : user?.name)}
                   </p>
                </div>

                <div 
                  onClick={handleProfileClick}
                  className="w-10 h-10 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center p-0.5 cursor-pointer hover:scale-105 transition-transform"
                >
                  <div className={clsx(
                    "w-full h-full rounded-full flex items-center justify-center text-white",
                    user?.role === 'super_admin' ? 'bg-gradient-to-tr from-rose-500 to-orange-500' :
                    user?.role === 'organization' ? 'bg-gradient-to-tr from-violet-500 to-fuchsia-500' :
                    'bg-gradient-to-tr from-blue-500 to-sky-500'
                  )}>
                     <span className="font-bold text-xs tracking-tighter">{user?.name?.substring(0, 2).toUpperCase()}</span>
                  </div>
                </div>
             </div>

          </header>

          {/* Dynamic Route Content */}
          <div className="px-4 md:px-10 mb-8 pt-6 md:pt-4 max-w-[1600px] w-full mx-auto flex-1 flex flex-col min-h-0">
             <Outlet />
          </div>

        </main>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/60 backdrop-blur-md md:hidden flex justify-end"
            >
              <motion.div 
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-4/5 max-w-sm h-full bg-white dark:bg-[#0a0a0a] border-l border-black/5 dark:border-white/5 flex flex-col"
              >
                <div className="p-6 flex justify-between items-center border-b border-black/5 dark:border-white/5">
                  <img src="/logo.png" alt="SSWorld" className="w-[58px] h-[58px] object-contain" />
                  <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-col gap-2 p-4 flex-1 overflow-y-auto custom-scrollbar">
                   {/* Mobile Upgrade Button */}
                  <button 
                    onClick={() => { handleUpgrade(); setMobileMenuOpen(false); }}
                    className="mb-4 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-4 py-3 rounded-xl font-bold active:scale-95 transition-all"
                  >
                    <Crown className="w-5 h-5 fill-white" />
                    <span>{user?.role === 'super_admin' ? 'Manage Plans' : 'Upgrade Plan'}</span>
                  </button>

                  {/* Mobile Search */}
                  <div className="relative mb-4">
                     <div className="flex items-center space-x-3 bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/10 px-4 py-3 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/50 ">
                        <Search className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Search simulations..." 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-transparent text-sm focus:outline-none text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                        />
                     </div>
                     {/* Mobile Search Results */}
                     {searchQuery && (
                       <div className="absolute top-14 left-0 w-full bg-white dark:bg-[#111116] border border-black/10 dark:border-white/10 rounded-xl p-2 z-50 flex flex-col gap-1 max-h-48 overflow-y-auto">
                          {searchResults.length > 0 ? (
                            searchResults.map(sim => (
                              <div 
                                key={sim.id}
                                onClick={() => { navigate(`/play/${sim.id}`); setMobileMenuOpen(false); }}
                                className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                              >
                                 <img src={sim.thumbnail} alt={sim.title} className="w-10 h-10 rounded-md object-cover" />
                                 <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">{sim.title}</span>
                                    <span className="text-xs text-slate-500 dark:text-gray-400">{sim.category}</span>
                                 </div>
                              </div>
                            ))
                          ) : (
                            <div className="p-4 text-center text-sm text-slate-500 dark:text-gray-400">
                              No results.
                            </div>
                          )}
                       </div>
                     )}
                  </div>

                  {navItems.map((item) => (
                    <NavLink 
                      key={item.path} 
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) => clsx(
                        "flex items-center gap-4 px-4 py-4 rounded-xl transition-all",
                        isActive ? "bg-blue-50 dark:bg-white/10 text-blue-600 dark:text-white font-semibold" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>

                <div className="p-6 border-t border-black/5 dark:border-white/5 flex flex-col gap-4">
                  <div 
                    onClick={handleProfileClick}
                    className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 p-2 -mx-2 rounded-xl transition-colors truncate"
                  >
                    <div className="w-12 h-12 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center p-0.5 shrink-0">
                       <div className={clsx(
                         "w-full h-full rounded-full flex items-center justify-center text-white text-lg",
                         user?.role === 'super_admin' ? 'bg-gradient-to-tr from-rose-500 to-orange-500' :
                         user?.role === 'organization' ? 'bg-gradient-to-tr from-violet-500 to-fuchsia-500' :
                         'bg-gradient-to-tr from-blue-500 to-sky-500'
                       )}>
                          <span className="font-bold tracking-tighter">{user?.name?.substring(0, 2).toUpperCase()}</span>
                       </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{user?.name}</p>
                      <p className="text-sm text-slate-500 capitalize truncate">{user?.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <button 
                    onClick={logout}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 rounded-xl font-bold transition-colors"
                  >
                    <LogOut className="w-5 h-5" /> Sign Out
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
