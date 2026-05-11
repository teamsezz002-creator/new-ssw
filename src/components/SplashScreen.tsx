import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Fallback timer in case video doesn't load or play
    const timer = setTimeout(() => {
      console.log("Splash fallback triggered");
      onComplete();
    }, 15000); 

    const video = videoRef.current;
    if (video) {
      // Browsers often block auto-play even if muted if not interacted with.
      // We try to play it explicitly.
      video.play().catch(err => {
        console.warn("Video auto-play failed, maybe check silent policy:", err);
      });
    }

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.8, ease: "easeInOut" } }}
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden cursor-pointer"
      onClick={onComplete}
    >
      <video
        ref={videoRef}
        src="/SplashScreenvideo.mp4"
        className="w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        onEnded={onComplete}
        onError={(e) => {
          console.error("Splash video error:", e);
          onComplete();
        }}
        preload="auto"
      />
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/20 text-[10px] uppercase tracking-widest pointer-events-none">
        Click to skip
      </div>
    </motion.div>
  );
}
