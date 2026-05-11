export interface Simulation {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  heroImage: string;
  category: string; // e.g. "Physics", "Chemistry", "Math"
  targetClass: string; // e.g. "STD 8", "STD 9", "STD 10"
  duration: string;
  rating: number;
  featured?: boolean;
  
  // Studio Upload Fields
  sourceFileName?: string;
  buildFileName?: string;
  screenshots?: string[];
  iframeUrl?: string;
  sourceType?: string;
  storageUrl?: string;
  simulationType?: 'play' | 'task' | 'quiz';
}

export interface ActivityLog {
  id: string;
  userId: string;
  simulationId: string;
  simulationTitle: string;
  startTime: number;
  endTime?: number;
  duration: number; // in seconds
  xpEarned: number;
  tasksCompleted: number;
  levelsCompleted: number;
  quizStats?: {
    attempted: number;
    correct: number;
    incorrect: number;
  };
  type: 'play' | 'task' | 'quiz';
  timestamp: number;
}
