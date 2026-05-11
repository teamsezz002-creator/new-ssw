import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSimulationsSync } from "../data";
import { useAuth } from "../context/AuthContext";
import { trackEvent } from "../services/trackingService";
import {
  Maximize2,
  X,
  Info,
  Share2,
  Star,
  Download,
  Play,
  ChevronLeft,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import clsx from "clsx";
import { Simulation } from "../types";
import { v4 as uuidv4 } from "uuid";
export function Player() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sims, setSims] = useState<Simulation[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [virtualUrl, setVirtualUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  useEffect(() => {
    return useSimulationsSync((newData) => {
      setSims(newData);
    });
  }, []);
  const sim = sims.find((s) => s.id === id);
  // Tracking state
  const sessionStartTime = useRef<number | null>(null);
  const sessionId = useRef<string>("");
  const [xpToEarn, setXpToEarn] = useState(0);
  const [tasksDone, setTasksDone] = useState(0);
  const [levelsDone, setLevelsDone] = useState(0);
  const [quizResults, setQuizResults] = useState({
    attempted: 0,
    correct: 0,
    incorrect: 0,
  });

  const stopTrackingAndSave = async (sim: Simulation) => {
    if (!sessionStartTime.current || !user || !sessionId.current) return;
    const endTime = Date.now();
    const duration = Math.floor((endTime - sessionStartTime.current) / 1000);

    await trackEvent(user.id, "SESSION_END", sim.id, sessionId.current, {
      duration,
    });

    if (xpToEarn === 0 && duration > 60) {
      await trackEvent(user.id, "XP_EARNED", sim.id, sessionId.current, {
        xp: Math.min(Math.floor(duration / 60) * 10, 100),
      });
    }
    sessionStartTime.current = null;
  };

  useEffect(() => {
    return () => {
      if (sessionStartTime.current && sim) {
        stopTrackingAndSave(sim);
      }
    };
  }, [sim]);

  useEffect(() => {
    let heartbeatInterval: any;
    if (isPlaying && sim && user) {
      sessionStartTime.current = Date.now();
      sessionId.current = uuidv4();
      trackEvent(user.id, "SESSION_START", sim.id, sessionId.current, {
        type: sim.simulationType || "play",
      });

      heartbeatInterval = setInterval(() => {
        trackEvent(user.id, "HEARTBEAT", sim.id, sessionId.current);
      }, 15000);

      const handleMessage = (event: MessageEvent) => {
        if (event.data && typeof event.data === "object" && event.data.type === "SIM_PROGRESS") {
          const { xp, taskCompleted, levelCompleted, quizResult } = event.data;
          if (xp) {
            setXpToEarn((prev) => prev + xp);
            trackEvent(user.id, "XP_EARNED", sim.id, sessionId.current, { xp });
          }
          if (taskCompleted) {
            setTasksDone((prev) => prev + 1);
            trackEvent(user.id, "TASK_COMPLETED", sim.id, sessionId.current);
            if (!xp) {
              setXpToEarn((prev) => prev + 25);
              trackEvent(user.id, "XP_EARNED", sim.id, sessionId.current, {
                xp: 25,
              });
            }
          }
          if (levelCompleted) {
            setLevelsDone((prev) => prev + 1);
            trackEvent(user.id, "LEVEL_UP", sim.id, sessionId.current);
            if (!xp) {
              setXpToEarn((prev) => prev + 50);
              trackEvent(user.id, "XP_EARNED", sim.id, sessionId.current, {
                xp: 50,
              });
            }
          }
          if (quizResult) {
            const isCorrect = quizResult.correct === true;
            setQuizResults((prev) => ({
              attempted: prev.attempted + 1,
              correct: prev.correct + (isCorrect ? 1 : 0),
              incorrect: prev.incorrect + (isCorrect ? 0 : 1),
            }));
            trackEvent(
              user.id,
              isCorrect ? "ANSWER_CORRECT" : "ANSWER_WRONG",
              sim.id,
              sessionId.current,
              quizResult,
            );
            if (isCorrect && !xp) {
              setXpToEarn((prev) => prev + 10);
              trackEvent(user.id, "XP_EARNED", sim.id, sessionId.current, {
                xp: 10,
              });
            }
          }
        }
      };
      window.addEventListener("message", handleMessage);
      return () => {
        window.removeEventListener("message", handleMessage);
        clearInterval(heartbeatInterval);
      };
    } else if (sessionStartTime.current && sim) {
      stopTrackingAndSave(sim);
      clearInterval(heartbeatInterval);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!sim) return;
    if (sim.sourceType !== "uploaded") {
      setIsReady(true);
      return;
    }
    fetch(`/api/check-installed/${sim.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.installed) {
          setVirtualUrl(data.url);
          setIsReady(true);
        }
      })
      .catch((err) => console.error("Check install error:", err));
  }, [sim]);

  if (!sim) {
    return (
      <div className="text-white flex flex-col items-center justify-center text-xl bg-[#0a0a0a] min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />{" "}
        Loading...
      </div>
    );
  }

  const handleDownloadAndInstall = async () => {
    if (sim.sourceType === "uploaded" && sim.storageUrl) {
      setDownloading(true);
      setDownloadProgress(0);
      setErrorMsg(null);

      const progressInterval = setInterval(() => {
        setDownloadProgress((prev) => {
          if (prev < 80) return prev + Math.floor(Math.random() * 5) + 1;
          return prev;
        });
      }, 300);
      try {
        const response = await fetch("/api/mount-zip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ simId: sim.id, zipUrl: sim.storageUrl }),
        });
        clearInterval(progressInterval);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to extract zip on server");
        }
        const data = await response.json();
        if (data.url) setVirtualUrl(data.url);
        setDownloadProgress(100);
        setTimeout(() => {
          setDownloading(false);
          setIsReady(true);
        }, 800);
      } catch (err: any) {
        clearInterval(progressInterval);
        console.error("Extraction error:", err);
        setErrorMsg(err.message || "Something went wrong during installation.");
        setDownloading(false);
        setDownloadProgress(0);
      }
    } else {
      setIsReady(true);
    }
  };

  const handlePlayClick = () => {
    setIsPlaying(true);
  };

  if (isPlaying) {
    return (
      <div className="fixed inset-0 z-50 bg-[#050505] w-full h-full block">
        <button
          onClick={() => setIsPlaying(false)}
          className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-black/40 hover:bg-black/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition-all "
        >
          <X className="w-5 h-5" />
        </button>
        <iframe
          src={virtualUrl || sim.iframeUrl || `/games/${sim.id}/index.html`}
          title={sim.title}
          className="w-full h-full border-0 z-10 bg-white"
          style={{ width: "100%", height: "100vh", display: "block" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] text-slate-900 dark:text-white font-sans overflow-x-hidden">
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 py-4 px-4 sm:px-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex gap-4">
          <button className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex gap-6 sm:gap-8 items-start mb-8">
          <div className="w-28 h-28 sm:w-36 sm:h-36 shrink-0 rounded-3xl overflow-hidden border border-black/5 dark:border-white/10 bg-white dark:bg-black/50">
            <img
              src={sim.thumbnail}
              alt={sim.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col pt-2 flex-1">
            <h1 className="text-2xl sm:text-4xl font-bold mb-2 leading-tight">
              {sim.title}
            </h1>
            <p className="text-blue-600 dark:text-blue-400 font-bold text-sm sm:text-base mb-4">
              Educational Space Studio
            </p>
            <div className="flex text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium divide-x divide-slate-300 dark:divide-white/20">
              <div className="px-3 md:px-4 first:pl-0 flex flex-col items-center">
                <span className="flex items-center gap-1 font-bold text-slate-800 dark:text-white mb-1">
                  <Star className="w-4 h-4 fill-current" />{" "}
                  {sim.rating || "4.8"}
                </span>
                <span>Extremely Positive</span>
              </div>
              <div className="px-3 md:px-4 flex flex-col items-center">
                <span className="font-bold text-slate-800 dark:text-white mb-1">
                  {sim.duration || "10M+"}
                </span>
                <span>Downloads</span>
              </div>
              <div className="px-3 md:px-4 flex flex-col items-center">
                <div className="w-5 h-5 rounded bg-slate-200 dark:bg-white/10 flex items-center justify-center font-bold text-[10px] mb-1">
                  E
                </div>
                <span>Everyone</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mb-10 w-full sm:w-2/3 md:w-1/2 flex flex-col gap-3">
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/50">
              {errorMsg}
            </div>
          )}
          {isReady ? (
            <button
              onClick={handlePlayClick}
              className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" /> Play Simulation
            </button>
          ) : downloading ? (
            <div className="w-full flex flex-col gap-3 bg-slate-100 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/5">
              <div className="flex justify-between text-sm font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />{" "}
                  {downloadProgress === 100
                    ? "Ready..."
                    : "Downloading Resources..."}
                </span>
                <span>{downloadProgress}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 dark:bg-black/50 rounded-full overflow-hidden relative shadow-inner">
                <motion.div
                  className="absolute top-0 left-0 bottom-0 bg-blue-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${downloadProgress}%` }}
                  transition={{ duration: Math.random() * 0.5 + 0.1 }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleDownloadAndInstall}
              className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" /> Install
            </button>
          )}
        </div>
        <div className="mb-10 overflow-x-auto pb-4 custom-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-4">
            {sim.screenshots && sim.screenshots.length > 0 ? (
              sim.screenshots.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`Screenshot ${idx}`}
                  className="h-48 sm:h-64 lg:h-72 rounded-2xl shrink-0 object-cover border border-black/5 dark:border-white/10 "
                />
              ))
            ) : (
              <img
                src={sim.heroImage}
                alt="Hero"
                className="h-48 sm:h-64 lg:h-72 rounded-2xl shrink-0 object-cover border border-black/5 dark:border-white/10 "
              />
            )}
          </div>
        </div>
        <div className="mb-10">
          <h2 className="text-xl font-bold mb-4">About this build</h2>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm sm:text-base whitespace-pre-wrap">
            {sim.description}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-bold uppercase tracking-wider">
              {sim.category}
            </span>
            <span className="px-4 py-2 rounded-full border border-black/10 dark:border-white/10 text-xs font-bold uppercase tracking-wider">
              {sim.targetClass}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
