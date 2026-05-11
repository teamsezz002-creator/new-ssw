import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronLeft, FileArchive, Image as ImageIcon, Plus, Terminal, UploadCloud, X } from 'lucide-react';
import { arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import { simulations, saveSimulation } from '../data';
import { db, storage, auth } from '../services/firebase';
import { Simulation } from '../types';

type BuildState = 'idle' | 'running' | 'success' | 'error';
type LogEntry = { time: string; message: string };
type UploadKind = 'sourceFileName' | 'buildFileName';

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function mapFirestoreLogs(messages: string[] = []): LogEntry[] {
  return messages.map((message) => ({ time: nowTime(), message }));
}

export function SimulationEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

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
    rating: 0,
  });
  const [sourceZipFile, setSourceZipFile] = useState<File | null>(null);
  const [buildZipFile, setBuildZipFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<BuildState>('idle');
  const [buildErrorMessage, setBuildErrorMessage] = useState<string | null>(null);
  const [buildLogs, setBuildLogs] = useState<LogEntry[]>([]);
  const [imageFiles, setImageFiles] = useState<{
    thumbnail: File | null;
    heroImage: File | null;
    screenshots: File[];
  }>({
    thumbnail: null,
    heroImage: null,
    screenshots: [],
  });

  useEffect(() => {
    if (!isEditing) return;

    const existingSim = simulations.find((simulation) => simulation.id === id);
    if (existingSim) {
      setFormData(existingSim);
    }
  }, [id, isEditing]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [buildLogs, buildStatus]);

  useEffect(() => {
    if (!jobId) return;

    unsubscribeRef.current?.();
    const simDocRef = doc(db, 'simulations', jobId);

    unsubscribeRef.current = onSnapshot(
      simDocRef,
      (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        if (Array.isArray(data.buildLogs)) {
          setBuildLogs(mapFirestoreLogs(data.buildLogs));
        }

        if (data.status === 'ready') {
          setBuildStatus('success');
          setBuildErrorMessage(null);
          saveSimulation({
            ...formData,
            id: jobId,
            storageUrl: data.storageUrl,
            sourceType: 'uploaded',
            status: 'ready',
          } as Simulation & { status?: string });
          setTimeout(() => navigate('/studio'), 1500);
          return;
        }

        if (data.status === 'error') {
          setBuildStatus('error');
          setBuildErrorMessage(data.errorMessage || 'Unknown build error.');
          return;
        }

        if (data.status === 'building') {
          setBuildStatus('running');
          setBuildErrorMessage(null);
        }
      },
      (error) => {
        const message = `Error monitoring build: ${error.message}`;
        setBuildStatus('error');
        setBuildErrorMessage(message);
        setBuildLogs((prev) => [...prev, { time: nowTime(), message }]);
      },
    );

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [formData, jobId, navigate]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'thumbnail' | 'heroImage') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setFormData((prev) => ({ ...prev, [fieldName]: url }));
    setImageFiles((prev) => ({ ...prev, [fieldName]: file }));
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const newFiles = files.slice(0, 3 - (formData.screenshots?.length || 0));
    const newUrls = newFiles.map((file) => URL.createObjectURL(file));

    setFormData((prev) => ({
      ...prev,
      screenshots: [...(prev.screenshots || []), ...newUrls].slice(0, 3),
    }));
    setImageFiles((prev) => ({
      ...prev,
      screenshots: [...prev.screenshots, ...newFiles].slice(0, 3),
    }));
  };

  const removeScreenshot = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      screenshots: prev.screenshots?.filter((_, currentIndex) => currentIndex !== index),
    }));
    setImageFiles((prev) => ({
      ...prev,
      screenshots: prev.screenshots.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleZipUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: UploadKind) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fieldName === 'sourceFileName') {
      setSourceZipFile(file);
    } else {
      setBuildZipFile(file);
    }

    setFormData((prev) => ({ ...prev, [fieldName]: file.name }));
  };

  const addLog = (message: string) => {
    setBuildLogs((prev) => [...prev, { time: nowTime(), message }]);
  };

  const uploadImages = async (finalId: string) => {
    let finalThumbnail = formData.thumbnail;
    let finalHero = formData.heroImage;
    let finalScreenshots = [...(formData.screenshots || [])];

    addLog('Uploading images to Firebase Storage...');

    try {
      if (imageFiles.thumbnail) {
        const thumbnailRef = ref(storage, `simulations/${finalId}_thumb`);
        await uploadBytes(thumbnailRef, imageFiles.thumbnail);
        finalThumbnail = await getDownloadURL(thumbnailRef);
      }

      if (imageFiles.heroImage) {
        const heroRef = ref(storage, `simulations/${finalId}_hero`);
        await uploadBytes(heroRef, imageFiles.heroImage);
        finalHero = await getDownloadURL(heroRef);
      }

      for (let i = 0; i < imageFiles.screenshots.length; i += 1) {
        const screenshot = imageFiles.screenshots[i];
        const screenshotRef = ref(storage, `simulations/${finalId}_screen_${i}`);
        await uploadBytes(screenshotRef, screenshot);
        const downloadUrl = await getDownloadURL(screenshotRef);
        finalScreenshots[i] = downloadUrl;
      }

      addLog('Images uploaded.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Image upload failed: ${message}. Proceeding anyway.`);
    }

    return { finalThumbnail, finalHero, finalScreenshots };
  };

  const uploadBuildZipDirectly = async (finalId: string) => {
    if (!buildZipFile) return '';

    addLog('Uploading pre-built simulation ZIP...');
    const zipRef = ref(storage, `simulations/${finalId}.zip`);
    await uploadBytes(zipRef, buildZipFile, { contentType: 'application/zip' });
    const downloadUrl = await getDownloadURL(zipRef);
    addLog('Build ZIP uploaded.');
    return downloadUrl;
  };

  const uploadSourceZipForCloudBuild = async (finalId: string) => {
    if (!sourceZipFile) return;

    addLog('Authenticating...');
    try {
      await signInAnonymously(auth);
      addLog('Authenticated anonymously.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Anonymous auth failed: ${message}. Upload will continue if Storage rules allow it.`);
    }

    if (sourceZipFile.size > 30 * 1024 * 1024) {
      throw new Error(
        `The uploaded ZIP file is too large (${(sourceZipFile.size / 1024 / 1024).toFixed(1)}MB). Remove node_modules and dist/build before zipping. Maximum allowed size is 30MB.`,
      );
    }

    await setDoc(
      doc(db, 'simulations', finalId),
      {
        ...formData,
        id: finalId,
        status: 'building',
        sourceType: 'uploaded',
        timestamp: Date.now(),
        buildLogs: arrayUnion(`[${new Date().toISOString()}] Preparing Cloud Build environment...`),
      },
      { merge: true },
    );

    addLog('Uploading source ZIP for cloud build...');
    const pendingRef = ref(storage, `pending-builds/${finalId}.zip`);
    const uploadTask = uploadBytesResumable(pendingRef, sourceZipFile, { contentType: 'application/zip' });

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          if (progress > 0 && progress % 10 === 0) {
            addLog(`Uploading source: ${progress}%`);
          }
        },
        reject,
        () => resolve(),
      );
    });

    addLog('Source ZIP uploaded. Cloud builder should start automatically.');
  };

  const simulateBuildProcess = async () => {
    const finalId = isEditing ? id! : `sim_${Date.now()}`;
    const hasHostedZip = Boolean(sourceZipFile || buildZipFile || formData.storageUrl);

    setJobId(finalId);
    setBuildStatus('running');
    setBuildErrorMessage(null);
    setBuildLogs([]);
    addLog('Initializing deployment pipeline...');

    try {
      const { finalThumbnail, finalHero, finalScreenshots } = await uploadImages(finalId);

      let storageUrl = formData.storageUrl || '';
      if (buildZipFile) {
        storageUrl = await uploadBuildZipDirectly(finalId);
      } else if (sourceZipFile) {
        await uploadSourceZipForCloudBuild(finalId);
      } else {
        addLog('No ZIP file provided, skipping ZIP upload.');
      }

      const finalSim: Simulation = {
        ...formData,
        id: finalId,
        title: formData.title || 'Untitled Simulation',
        description: formData.description || 'No description provided.',
        thumbnail:
          finalThumbnail ||
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400' viewBox='0 0 800 400' fill='none'%3E%3Crect width='800' height='400' fill='%23F4F4F5'/%3E%3Cg transform='translate(260, 150)'%3E%3Cpath d='M8 64C8 68.4183 11.5817 72 16 72H64C68.4183 72 72 68.4183 72 64V16C72 11.5817 68.4183 8 64 8H16C11.5817 8 8 11.5817 8 16V64ZM16 16H64V64H16V16Z' fill='%23A1A1AA'/%3E%3Cpath d='M28 28C25.7909 28 24 29.7909 24 32C24 34.2091 25.7909 36 28 36C30.2091 36 32 34.2091 32 32C32 29.7909 30.2091 28 28 28Z' fill='%23A1A1AA'/%3E%3Cpath d='M16 64L32 40L44 56L56 44L64 56V64H16Z' fill='%23A1A1AA'/%3E%3Ctext x='100' y='52' font-family='system-ui, -apple-system, sans-serif' font-size='48' font-weight='800' fill='%23A1A1AA'%3ENo logo%3C/text%3E%3C/g%3E%3C/svg%3E",
        heroImage:
          finalHero ||
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400' viewBox='0 0 800 400' fill='none'%3E%3Crect width='800' height='400' fill='%23F4F4F5'/%3E%3Cg transform='translate(260, 150)'%3E%3Cpath d='M8 64C8 68.4183 11.5817 72 16 72H64C68.4183 72 72 68.4183 72 64V16C72 11.5817 68.4183 8 64 8H16C11.5817 8 8 11.5817 8 16V64ZM16 16H64V64H16V16Z' fill='%23A1A1AA'/%3E%3Cpath d='M28 28C25.7909 28 24 29.7909 24 32C24 34.2091 25.7909 36 28 36C30.2091 36 32 34.2091 32 32C32 29.7909 30.2091 28 28 28Z' fill='%23A1A1AA'/%3E%3Cpath d='M16 64L32 40L44 56L56 44L64 56V64H16Z' fill='%23A1A1AA'/%3E%3Ctext x='100' y='52' font-family='system-ui, -apple-system, sans-serif' font-size='48' font-weight='800' fill='%23A1A1AA'%3ENo logo%3C/text%3E%3C/g%3E%3C/svg%3E",
        screenshots: finalScreenshots,
        category: formData.category || 'Physics',
        targetClass: formData.targetClass || 'STD 10',
        duration: formData.duration || '30 min',
        rating: formData.rating || 5,
        storageUrl,
        sourceType: hasHostedZip ? 'uploaded' : 'local',
      };

      await setDoc(doc(db, 'simulations', finalId), finalSim, { merge: true });
      addLog('Simulation metadata saved.');

      if (buildZipFile) {
        await setDoc(
          doc(db, 'simulations', finalId),
          { status: 'ready', buildStep: 'Completed', storageUrl, sourceType: 'uploaded' },
          { merge: true },
        );
        setBuildStatus('success');
        setTimeout(() => navigate('/studio'), 1200);
      }

      if (!buildZipFile && !sourceZipFile) {
        setBuildStatus('success');
        setTimeout(() => navigate('/studio'), 1200);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Build or upload failed: ${message}`);
      setBuildStatus('error');
      setBuildErrorMessage(message);
      await setDoc(
        doc(db, 'simulations', finalId),
        {
          status: 'error',
          errorMessage: message,
          buildLogs: arrayUnion(`[${new Date().toISOString()}] ${message}`),
        },
        { merge: true },
      );
    }
  };

  const handleSave = () => {
    void simulateBuildProcess();
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

          <section className="bg-white dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-3xl p-6 sm:p-8 dark:shadow-none">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Upload Build & Source</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative group cursor-pointer hover:border-blue-500 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all bg-slate-50/50 dark:bg-white/5">
                <input
                  type="file"
                  accept=".zip"
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
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
                    <span className="text-xs text-slate-500 font-medium">Already-built dist/build output</span>
                  </div>
                )}
              </div>

              <div className="relative group cursor-pointer hover:border-purple-500 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all bg-slate-50/50 dark:bg-white/5">
                <input
                  type="file"
                  accept=".zip"
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
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
                    <span className="text-xs text-slate-500 font-medium">Project source to auto-build in cloud</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

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
              {formData.screenshots?.map((url, index) => (
                <div key={index} className="relative aspect-video rounded-xl overflow-hidden border border-black/10 dark:border-white/10 group ">
                  <img src={url} alt={`Screenshot ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeScreenshot(index)}
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
                <span className="text-sm font-mono text-slate-300 font-bold">Build & Deployment Console ({jobId})</span>
              </div>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-600/50"></div>
                <div className="w-3 h-3 rounded-full bg-slate-600/50"></div>
                <div className="w-3 h-3 rounded-full bg-slate-600/50"></div>
              </div>
            </div>
            <div className="p-4 h-64 overflow-y-auto font-mono text-[13px] leading-relaxed relative custom-scrollbar flex flex-col gap-1">
              {buildErrorMessage && (
                <div className="flex gap-4 text-red-400 font-bold">
                  <span className="text-slate-500 shrink-0 min-w-[70px]">{nowTime()}</span>
                  <span>Error: {buildErrorMessage}</span>
                </div>
              )}
              {buildLogs.map((log, index) => (
                <div key={`${log.time}-${index}`} className="flex gap-4">
                  <span className="text-slate-500 shrink-0 min-w-[70px]">{log.time}</span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
              ))}
              {buildStatus === 'running' && (
                <div className="flex gap-4 mt-2">
                  <span className="text-slate-500 shrink-0">{nowTime()}</span>
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
