import { Simulation } from './types';
import { db } from './services/firebase';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';

// Initial simulations as seed data
export let simulations: Simulation[] = [];

const listeners: ((sims: Simulation[]) => void)[] = [];

// Call this from top-level to setup sync
let initialized = false;
export function initializeSimulationsSync() {
  if (initialized) return;
  initialized = true;

  onSnapshot(collection(db, "simulations"), (snapshot) => {
    const fetchedSims = snapshot.docs.map(doc => {
       const data = { id: doc.id, ...doc.data() } as Simulation;
       const NO_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='400' viewBox='0 0 800 400' fill='none'%3E%3Crect width='800' height='400' fill='%23F4F4F5'/%3E%3Cg transform='translate(260, 150)'%3E%3Cpath d='M8 64C8 68.4183 11.5817 72 16 72H64C68.4183 72 72 68.4183 72 64V16C72 11.5817 68.4183 8 64 8H16C11.5817 8 8 11.5817 8 16V64ZM16 16H64V64H16V16Z' fill='%23A1A1AA'/%3E%3Cpath d='M28 28C25.7909 28 24 29.7909 24 32C24 34.2091 25.7909 36 28 36C30.2091 36 32 34.2091 32 32C32 29.7909 30.2091 28 28 28Z' fill='%23A1A1AA'/%3E%3Cpath d='M16 64L32 40L44 56L56 44L64 56V64H16Z' fill='%23A1A1AA'/%3E%3Ctext x='100' y='52' font-family='system-ui, -apple-system, sans-serif' font-size='48' font-weight='800' fill='%23A1A1AA'%3ENo logo%3C/text%3E%3C/g%3E%3C/svg%3E";
       if (!data.thumbnail || data.thumbnail.includes('unsplash.com')) {
           data.thumbnail = NO_LOGO;
       }
       if (!data.heroImage || data.heroImage.includes('unsplash.com')) {
           data.heroImage = NO_LOGO;
       }
       return data;
    });

    simulations = fetchedSims;
    // trigger listeners
    listeners.forEach(l => l([...simulations]));
  }, (error) => {
    console.error("Failed to sync simulations:", error);
  });
}

export function useSimulationsSync(callback: (sims: Simulation[]) => void) {
  listeners.push(callback);
  callback([...simulations]); // initial call

  return () => {
    const idx = listeners.indexOf(callback);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

export function saveSimulation(sim: Simulation) {
  const index = simulations.findIndex(s => s.id === sim.id);
  if (index >= 0) {
    simulations[index] = sim;
  } else {
    simulations.unshift(sim);
  }
}

export async function deleteSimulation(id: string) {
  const { doc, deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'simulations', id));
}


