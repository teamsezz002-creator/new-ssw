import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { UploadCloud, Image as ImageIcon, FileArchive, X, CheckCircle2, ChevronLeft, Plus, Terminal } from 'lucide-react';
import { simulations, saveSimulation } from '../data';
import { Simulation } from '../types';
import { db, storage, auth } from '../services/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';

export function SimulationEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState<Partial<Simulation>>({
    title: '',
    description: '',
    category: 'Physics',
    targetClass: 'STD 10',
    simulationType: 'play',
    thumbnail: '',
    heroImage: '',
    screenshots: [],
    sourceFileName: '',
    buildFileName: '',
    duration: '30 min',
    rating: 0
  });

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [buildStatus, setBuildStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [buildLogs, setBuildLogs] = useState<{ time: string, message: string }[]>([]);
  const [imageFiles, setImageFiles] = useState<{ 
    thumbnail: File | null; 
    heroImage: File | null; 
    screenshots: File[]; 
  }>({
    thumbnail: null,
    heroImage: null,
    screenshots: []
  });

  useEffect(() => {
    if (isEditing) {
      const existingSim = simulations.find(s => s.id === id);
      if (existingSim) {
        setFormData(existingSim);
      }
    }
  }, [id, isEditing]);

  const scrollToBottom = () => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [buildLogs, buildStatus]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'thumbnail' | 'heroImage') => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setFormData(prev => ({ ...prev, [fieldName]: url }));
      setImageFiles(prev => ({ ...prev, [fieldName]: file }));
    }
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      const newFiles = files.slice(0, 3 - (formData.screenshots?.length || 0));
      const newUrls = newFiles.map(f => URL.createObjectURL(f));
      setFormData(prev => ({ 
        ...prev, 
        screenshots: [...(prev.screenshots || []), ...newUrls].slice(0, 3) 
      }));
      setImageFiles(prev => ({ ...prev, screenshots: [...prev.screenshots, ...newFiles].slice(0, 3) }));
    }
  };

  const removeScreenshot = (index: number) => {
    setFormData(prev => ({ ...prev, screenshots: prev.screenshots?.filter((_, i) => i !== index) }));
    setImageFiles(prev => ({ ...prev, screenshots: prev.screenshots.filter((_, i) => i !== index) }));
  };

  const handleZipUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'sourceFileName' | 'buildFileName') => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setFormData(prev => ({ ...prev, [fieldName]: file.name }));
    }
  };

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString([], { 
        hour12: false, 
        hour: '2-digit', 
        minute:'2-digit', 
        second:'2-digit', 
        fractionalSecondDigits: 3 
    });
    setBuildLogs(prev => [...prev, { time, message }]);
  };

  const simulateBuildProcess = async () => {
    setBuildStatus('running');
    setBuildLogs([]);
    addLog('Initializing deployment pipeline...');

    const finalId = isEditing ? id! : `sim_new_${Date.now()}`;
    let storageUrl = formData.storageUrl || '';

    // Process Images
    let finalThumbnail = formData.thumbnail;
    let finalHero = formData.heroImage;
    let finalScreenshots = [...(formData.screenshots || [])];

    try {
      addLog('Uploading images to Firebase Storage...');
      if (imageFiles.thumbnail) {
        const tr = ref(storage, `simulations/${finalId}_thumb`);
        await uploadBytes(tr, imageFiles.thumbnail);
        finalThumbnail = await getDownloadURL(tr);
      }
      if (imageFiles.heroImage) {
        const hr = ref(storage, `simulations/${finalId}_hero`);
        await uploadBytes(hr, imageFiles.heroImage);
        finalHero = await getDownloadURL(hr);
      }
      for (let i = 0; i < imageFiles.screenshots.length; i++) {
        const img = imageFiles.screenshots[i];
        if (img) {
          const sr = ref(storage, `simulations/${finalId}_screen_${i}`);
          await uploadBytes(sr, img);
          const dl = await getDownloadURL(sr);
          // Replace the blob URL with the real one
          const blobUrl = URL.createObjectURL(img);
          const idx = finalScreenshots.findIndex(url => url.startsWith('blob:'));
          if (idx >= 0) finalScreenshots[idx] = dl;
          else finalScreenshots.push(dl);
        }
      }
      addLog('✓ Images uploaded.');
    } catch (err: any) {
      addLog(`⚠️ Image upload failed: ${err.message}. Proceeding anyway.`);
    }

    if (uploadFile) {
      addLog(`Authenticating...`);
      try {
        await signInAnonymously(auth);
        addLog(`✓ Authenticated anonymously.`);
      } catch (err: any) {
        addLog(`⚠️ Auth failed: ${err.message}. Enabling Anonymous Sign-in in Firebase Console is recommended.`);
        addLog(`Attempting upload anyway (depends on your Storage rules)...`);
      }

      if (uploadFile.size > 30 * 1024 * 1024) {
        throw new Error(`The uploaded ZIP file is too large (${(uploadFile.size / 1024 / 1024).toFixed(1)}MB). Please ensure you have removed the 'node_modules' folder and 'dist' folder before zipping your project. The maximum allowed size is 30MB.`);
      }

      try {
        addLog(`Preparing Cloud Build environment...`);
        
        // ૧. Firestore માં એન્ટ્રી બનાવો
        await setDoc(doc(db, "simulations", finalId), { ...formData, id: finalId, status: 'building', timestamp: Date.now() });

        // ૨. ZIP અપલોડ પ્રોસેસ વિથ પ્રોગ્રેસ
        const pendingRef = ref(storage, `pending-builds/${finalId}.zip`);
        const uploadTask = uploadBytesResumable(pendingRef, uploadFile);

        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              if (progress % 20 === 0) addLog(`Uploading source: ${progress}%`);
            },
            (error) => reject(error),
            () => resolve(true)
          );
        });

        addLog(`✓ Source uploaded. Notifying Cloud Builder...`);

        // Monitor Firestore for the 'ready' status from Cloud Function
        await new Promise((resolve, reject) => {
          let lastStep = "";
          // ૩૦ સેકન્ડનો વોર્નિંગ ટાઈમર
          const timeoutWatcher = setTimeout(() => {
            if (lastStep === "") {
              addLog("⚠️ Build is taking longer than usual to start. Please ensure Firebase Blaze Plan is active and check Cloud Function logs.");
            }
          }, 30000);

          const unsub = onSnapshot(doc(db, "simulations", finalId), (docSnap) => {
            const data = docSnap.data();
            
            if (data?.buildStep && data.buildStep !== lastStep) {
              addLog(`⚙️ ${data.buildStep}`);
              lastStep = data.buildStep;
            }

            if (data?.status === 'ready' || data?.storageUrl) {
              clearTimeout(timeoutWatcher);
              addLog(`🚀 Cloud build successful!`);
              const storageRef = ref(storage, `simulations/${finalId}.zip`);
              getDownloadURL(storageRef).then(url => {
                storageUrl = url;
                unsub();
                resolve(true);
              }).catch(reject);
            } else if (data?.status === 'error') {
              clearTimeout(timeoutWatcher);
              unsub();
              reject(new Error(data.errorMessage || "Cloud build failed."));
            }
          });
        });

      } catch (error: any) {
        console.error("Build/Upload error:", error);
        addLog(`❌ Build or Upload failed: ${error.message || String(error)}`);
        setBuildStatus('error');
        return;
      }
    } else {
       addLog('No ZIP file provided, skipping storage upload.');
    }

    addLog('Saving Simulation metadata to Firestore...');
    const finalSim: Simulation = {
      ...formData,
      id: finalId,
      title: formData.title || 'Untitled Simulation',
      description: formData.description || 'No description provided.',
      thumbnail: finalThumbnail || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400' viewBox='0 0 800 400' fill='none'%3E%3Crect width='800' height='400' fill='%23F4F4F5'/%3E%3Cg transform='translate(260, 150)'%3E%3Cpath d='M8 64C8 68.4183 11.5817 72 16 72H64C68.4183 72 72 68.4183 72 64V16C72 11.5817 68.4183 8 64 8H16C11.5817 8 8 11.5817 8 16V64ZM16 16H64V64H16V16Z' fill='%23A1A1AA'/%3E%3Cpath d='M28 28C25.7909 28 24 29.7909 24 32C24 34.2091 25.7909 36 28 36C30.2091 36 32 34.2091 32 32C32 29.7909 30.2091 28 28 28Z' fill='%23A1A1AA'/%3E%3Cpath d='M16 64L32 40L44 56L56 44L64 56V64H16Z' fill='%23A1A1AA'/%3E%3Ctext x='100' y='52' font-family='system-ui, -apple-system, sans-serif' font-size='48' font-weight='800' fill='%23A1A1AA'%3ENo logo%3C/text%3E%3C/g%3E%3C/svg%3E",
      heroImage: finalHero || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400' viewBox='0 0 800 400' fill='none'%3E%3Crect width='800' height='400' fill='%23F4F4F5'/%3E%3Cg transform='translate(260, 150)'%3E%3Cpath d='M8 64C8 68.4183 11.5817 72 16 72H64C68.4183 72 72 68.4183 72 64V16C72 11.5817 68.4183 8 64 8H16C11.5817 8 8 11.5817 8 16V64ZM16 16H64V64H16V16Z' fill='%23A1A1AA'/%3E%3Cpath d='M28 28C25.7909 28 24 29.7909 24 32C24 34.2091 25.7909 36 28 36C30.2091 36 32 34.2091 32 32C32 29.7909 30.2091 28 28 28Z' fill='%23A1A1AA'/%3E%3Cpath d='M16 64L32 40L44 56L56 44L64 56V64H16Z' fill='%23A1A1AA'/%3E%3Ctext x='100' y='52' font-family='system-ui, -apple-system, sans-serif' font-size='48' font-weight='800' fill='%23A1A1AA'%3ENo logo%3C/text%3E%3C/g%3E%3C/svg%3E",
      screenshots: finalScreenshots,
      category: formData.category || 'Physics',
      targetClass: formData.targetClass || 'STD 10',
      duration: formData.duration || '30 min',
      rating: formData.rating || 5, // give new sims 5 stars by default
      storageUrl: storageUrl,
      sourceType: storageUrl ? 'uploaded' : 'local'
    } as Simulation;

    try {
      await setDoc(doc(db, "simulations", finalId), finalSim);
      addLog('✓ Database record saved.');
    } catch(err) {
      addLog(`❌ Firestore error: ${String(err)}`);
      setBuildStatus('error');
      return;
    }

    addLog('🚀 Simulation deployed and ready!');
    setBuildStatus('success');
    saveSimulation(finalSim);

    setTimeout(() => {
      navigate('/studio');
    }, 2000);
  };

  const handleSave = () => {
    simulateBuildProcess();
  };

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-10 relative">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="w-12 h-12 rounded-full bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-white/10 transition-colors "
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {isEditing ? 'Edit Simulation' : 'Upload New Simulation'}
          </h1>
          <p className="text-slate-600 dark:text-gray-400 font-medium">Configure metadata and assets.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Form Info */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          <section className="bg-white dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-3xl p-6 sm:p-8 dark:shadow-none relative overflow-hidden">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Basic Information</h2>
            
            <div className="flex flex-col gap-6 relative z-10">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700 dark:text-gray-300 uppercase tracking-widest">Simulation Name</label>
                <input 
                  type="text" 
                  name="title"
                  value={formData.title}
                  onChange={handleTextChange}
                  placeholder="e.g. Gravity Simulator 3D"
                  className="w-full bg-slate-50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 dark:text-white transition-all shadow-inner" 
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-gray-300 uppercase tracking-widest">Type</label>
                  <select 
                    name="simulationType"
                    value={formData.simulationType}
                    onChange={handleTextChange}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all shadow-inner appearance-none"
                  >
                    <option value="play">Play (Free Explore)</option>
                    <option value="task">Task Based</option>
                    <option value="quiz">Quiz / Assessment</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-gray-300 uppercase tracking-widest">Category</label>
                  <select 
                    name="category"
                    value={formData.category}
                    onChange={handleTextChange}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all shadow-inner appearance-none"
                  >
                    <option>Physics</option>
                    <option>Chemistry</option>
                    <option>Biology</option>
                    <option>Math</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                   <label className="text-sm font-bold text-slate-700 dark:text-gray-300 uppercase tracking-widest">Target Class</label>
                   <select 
                    name="targetClass"
                    value={formData.targetClass}
                    onChange={handleTextChange}
                    className="w-full bg-slate-50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all shadow-inner appearance-none"
                  >
                    <option>STD 8</option>
                    <option>STD 9</option>
                    <option>STD 10</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700 dark:text-gray-300 uppercase tracking-widest">Description</label>
                <textarea 
                  name="description"
                  value={formData.description}
                  onChange={handleTextChange}
                  placeholder="Describe your simulation context, goals, and learning outcomes..."
                  rows={4}
                  className="w-full bg-slate-50 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 dark:text-white transition-all shadow-inner resize-none" 
                />
              </div>
            </div>
          </section>

          {/* Files Section */}
          <section className="bg-white dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-3xl p-6 sm:p-8 dark:shadow-none">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Upload Build & Source</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Build File */}
              <div className="relative group cursor-pointer hover:border-blue-500 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all bg-slate-50/50 dark:bg-white/5">
                <input 
                  type="file" accept=".zip" className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                  onChange={(e) => handleZipUpload(e, 'buildFileName')}
                />
                
                {formData.buildFileName ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-slate-900 dark:text-white font-bold text-sm truncate w-40">{formData.buildFileName}</span>
                    <span className="text-xs text-slate-500">Tap to replace</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-white dark:bg-black/20 rounded-full flex items-center justify-center border border-black/5 dark:border-white/5 group-hover:scale-110 transition-transform">
                      <FileArchive className="w-5 h-5 text-blue-500" />
                    </div>
                    <span className="text-slate-700 dark:text-gray-300 font-bold text-sm mt-2">Build ZIP (Optional)</span>
                    <span className="text-xs text-slate-500 font-medium">Dist/Build output</span>
                  </div>
                )}
              </div>

              {/* Source File */}
              <div className="relative group cursor-pointer hover:border-purple-500 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all bg-slate-50/50 dark:bg-white/5">
                <input 
                  type="file" accept=".zip" className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                  onChange={(e) => handleZipUpload(e, 'sourceFileName')}
                />
                {formData.sourceFileName ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-slate-900 dark:text-white font-bold text-sm truncate w-40">{formData.sourceFileName}</span>
                    <span className="text-xs text-slate-500">Tap to replace</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-white dark:bg-black/20 rounded-full flex items-center justify-center border border-black/5 dark:border-white/5 group-hover:scale-110 transition-transform">
                      <FileArchive className="w-5 h-5 text-purple-500" />
                    </div>
                    <span className="text-slate-700 dark:text-gray-300 font-bold text-sm mt-2">Source ZIP</span>
                    <span className="text-xs text-slate-500 font-medium">Raw project folder</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Visuals */}
        <div className="flex flex-col gap-8">
          <section className="bg-white dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-3xl p-6 dark:shadow-none">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Logo / Thumbnail</h2>
            
            <div className="relative w-32 sm:w-48 aspect-square mx-auto rounded-[2rem] overflow-hidden bg-slate-100 dark:bg-black/50 border border-black/10 dark:border-white/10 flex items-center justify-center group">
              {formData.thumbnail ? (
                <>
                  <img src={formData.thumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    <label className="cursor-pointer bg-white/20 hover:bg-white/40 text-white px-4 py-2 rounded-lg font-bold border border-white/20 transition-all ">
                      Change Logo
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'thumbnail')} />
                    </label>
                  </div>
                </>
              ) : (
                <label className="w-full h-full cursor-pointer flex flex-col items-center justify-center gap-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ImageIcon className="w-5 h-5 text-slate-400" />
                  </div>
                  <span className="text-sm font-semibold text-slate-600 dark:text-gray-400">Upload Base Logo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'thumbnail')} />
                </label>
              )}
            </div>
          </section>

          <section className="bg-white dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-3xl p-6 dark:shadow-none">
            <div className="flex items-center justify-between mb-6">
               <h2 className="text-xl font-bold text-slate-900 dark:text-white">Screenshots</h2>
               <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-md">{formData.screenshots?.length || 0}/3</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               {formData.screenshots?.map((url, i) => (
                 <div key={i} className="relative aspect-video rounded-xl overflow-hidden border border-black/10 dark:border-white/10 group ">
                    <img src={url} alt={`Screenshot ${i+1}`} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeScreenshot(i)}
                      className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 "
                    >
                      <X className="w-3 h-3" />
                    </button>
                 </div>
               ))}
               {(!formData.screenshots || formData.screenshots.length < 3) && (
                 <label className="aspect-video rounded-xl border-2 border-dashed border-slate-300 dark:border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                    <Plus className="w-6 h-6 text-slate-400 mb-1" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Add Photo</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleScreenshotUpload} />
                 </label>
               )}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button 
          onClick={handleSave}
          disabled={buildStatus === 'running'}
          className="relative px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all overflow-hidden group disabled:opacity-70"
        >
          {buildStatus === 'running' ? (
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>Deploying...</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <UploadCloud className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
              <span>{isEditing ? 'Save Changes' : 'Publish Simulation'}</span>
            </div>
          )}
        </button>
      </div>

      <AnimatePresence>
        {buildStatus !== 'idle' && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden z-50 flex flex-col"
          >
            <div className="h-12 bg-white/5 border-b border-white/10 flex items-center px-4 justify-between">
              <div className="flex items-center gap-3">
                <Terminal className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-mono text-slate-300 font-bold">Build & Deployment Console</span>
              </div>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-600/50"></div>
                <div className="w-3 h-3 rounded-full bg-slate-600/50"></div>
                <div className="w-3 h-3 rounded-full bg-slate-600/50"></div>
              </div>
            </div>
            <div className="p-4 h-64 overflow-y-auto font-mono text-[13px] leading-relaxed relative custom-scrollbar flex flex-col gap-1">
              {buildLogs.map((log, i) => (
                <div key={i} className="flex gap-4">
                  <span className="text-slate-500 shrink-0">{log.time}</span>
                  <span className={`${log.message.startsWith('✓') ? 'text-emerald-400' : log.message.startsWith('🚀') ? 'text-blue-400 font-bold' : 'text-slate-300'}`}>
                    {log.message}
                  </span>
                </div>
              ))}
              {buildStatus === 'running' && (
                <div className="flex gap-4 mt-2">
                  <span className="text-slate-500 shrink-0">{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits: 3 })}</span>
                  <span className="text-white animate-pulse">_</span>
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
