import { db, auth } from './firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';

export interface TrackingEventData {
  studentId: string;
  simulationId: string;
  sessionId: string;
  eventType: string;
  data: Record<string, any>;
  timestamp: number;
}

export const trackEvent = async (studentId: string, eventType: string, simulationId: string, sessionId: string, data: Record<string, any> = {}) => {
  try {
    if (!studentId) {
      console.warn("User not authenticated, cannot track event:", eventType);
      return;
    }

    const eventRecord: TrackingEventData = {
      eventType,
      studentId,
      simulationId,
      sessionId,
      data,
      timestamp: Date.now()
    };

    const eventRef = collection(db, 'events');
    await addDoc(eventRef, eventRecord);
    
    // Fallback for UI visualization in development preview (as Cloud Functions might not be deployed yet)
    // Uncomment when you have fully deployed the Cloud Functions:
    // console.log(`Dispatched ${eventType}`);
  } catch (error) {
    console.error("Error tracking event:", error);
  }
};

export const getUserMetrics = async (studentId: string) => {
  try {
    // We calculate from raw events directly to ensure data is 100% accurate and up-to-date
    const eventsQuery = query(collection(db, 'events'), where('studentId', '==', studentId));
    const eventsSnap = await getDocs(eventsQuery);
    
    const events: any[] = [];
    eventsSnap.forEach(doc => events.push(doc.data()));
    events.sort((a, b) => a.timestamp - b.timestamp);

    const sessionMap = new Map<string, any>();

    events.forEach(ev => {
       const sId = ev.sessionId;
       if (!sId) return;

       if (!sessionMap.has(sId)) {
          sessionMap.set(sId, { timeSpent: 0, xpEarned: 0, correctAnswers: 0, attempts: 0, tasksCompleted: 0, startTime: ev.timestamp });
       }
       const s = sessionMap.get(sId);
       
       if (ev.eventType === 'SESSION_START') s.startTime = ev.timestamp;
       if (ev.eventType === 'SESSION_END' || ev.eventType === 'HEARTBEAT') {
          if (ev.data?.duration) {
             s.timeSpent = Math.max(s.timeSpent || 0, ev.data.duration);
          } else if (s.startTime) {
             s.timeSpent = Math.max(s.timeSpent || 0, Math.floor((ev.timestamp - s.startTime) / 1000));
          }
       }
       if (ev.eventType === 'XP_EARNED') s.xpEarned += (ev.data?.xp || 0);
       if (ev.eventType === 'ANSWER_CORRECT') { s.correctAnswers++; s.attempts++; }
       if (ev.eventType === 'ANSWER_WRONG') { s.attempts++; }
       if (ev.eventType === 'QUESTION_ATTEMPT') s.attempts++;
       if (ev.eventType === 'TASK_COMPLETED') s.tasksCompleted++;
    });

    let totalXP = 0;
    let totalTimeSpent = 0;
    let totalCorrect = 0;
    let totalAttempts = 0;
    let totalTasksCompleted = 0;
    let totalSimulationsCompleted = sessionMap.size;

    sessionMap.forEach(s => {
       totalXP += s.xpEarned;
       totalTimeSpent += s.timeSpent;
       totalCorrect += s.correctAnswers;
       totalAttempts += s.attempts;
       totalTasksCompleted += s.tasksCompleted;
    });

    // We can also extract level ups directly if needed, or compute from XP
    // Level is derived as 1 + Math.floor(totalXp / 500) or check LEVEL_UP events
    let currentLevel = 1 + Math.floor(totalXP / 500);

    return {
      studentId, totalXP, currentLevel, totalTimeSpent, totalCorrect, totalAttempts, totalTasksCompleted, totalSimulationsCompleted
    };

  } catch (error) {
    console.error("Error fetching user metrics:", error);
  }
  return null;
};

export const getStudentSessions = async (studentId: string, limitCount: number = 50) => {
  try {
    // We calculate from raw events directly to ensure data is 100% accurate and up-to-date
    const eventsQuery = query(collection(db, 'events'), where('studentId', '==', studentId));
    const eventsSnap = await getDocs(eventsQuery);
    
    const events: any[] = [];
    eventsSnap.forEach(doc => events.push(doc.data()));
    events.sort((a, b) => a.timestamp - b.timestamp);
    
    const sessionMap = new Map<string, any>();
    
    events.forEach(ev => {
       const sId = ev.sessionId;
       if (!sId) return;

       if (!sessionMap.has(sId)) {
          sessionMap.set(sId, {
             id: sId,
             sessionId: sId,
             studentId,
             simulationId: ev.simulationId,
             startTime: ev.timestamp,
             timeSpent: 0,
             xpEarned: 0,
             correctAnswers: 0,
             wrongAnswers: 0,
             attempts: 0,
             tasksCompleted: 0,
             hintsUsed: 0
          });
       }
       const s = sessionMap.get(sId);
       
       if (ev.eventType === 'SESSION_START') s.startTime = ev.timestamp;
       if (ev.eventType === 'SESSION_END' || ev.eventType === 'HEARTBEAT') {
          s.endTime = ev.timestamp;
          if (ev.data?.duration) {
             s.timeSpent = Math.max(s.timeSpent || 0, ev.data.duration);
          } else if (s.startTime) {
             s.timeSpent = Math.max(s.timeSpent || 0, Math.floor((ev.timestamp - s.startTime) / 1000));
          }
       }
       if (ev.eventType === 'XP_EARNED') s.xpEarned += (ev.data?.xp || 0);
       if (ev.eventType === 'ANSWER_CORRECT') { s.correctAnswers++; s.attempts++; }
       if (ev.eventType === 'ANSWER_WRONG') { s.wrongAnswers++; s.attempts++; }
       if (ev.eventType === 'QUESTION_ATTEMPT') s.attempts++;
       if (ev.eventType === 'TASK_COMPLETED') s.tasksCompleted++;
       if (ev.eventType === 'HINT_USED') s.hintsUsed++;
    });

    const fallbackSessions = Array.from(sessionMap.values());
    return fallbackSessions.sort((a: any, b: any) => (b.startTime || 0) - (a.startTime || 0)).slice(0, limitCount);

  } catch (error) {
    console.error("Error fetching sessions:", error);
    return [];
  }
};

export const getStudentActivities = getStudentSessions; // legacy alias for compatibility

