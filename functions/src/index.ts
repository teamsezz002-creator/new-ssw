import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn } from 'child_process';
// @ts-ignore
import AdmZip from 'adm-zip';

admin.initializeApp();
const db = admin.firestore();

export const processTrackingEvent = functions.firestore
  .document('events/{eventId}')
  .onCreate(async (snap, context) => {
    const event = snap.data();
    if (!event) return;

    const {
      studentId,
      simulationId,
      sessionId,
      eventType,
      data,
      timestamp
    } = event;

    const metricRef = db.collection('user_metrics').doc(studentId);
    const sessionRef = db.collection('simulation_sessions').doc(sessionId);

    await db.runTransaction(async (transaction) => {
      // 1. Read existing
      const metricDoc = await transaction.get(metricRef);
      const sessionDoc = await transaction.get(sessionRef);

      const metric = metricDoc.exists ? metricDoc.data()! : {
        studentId,
        totalXP: 0,
        currentLevel: 1,
        totalTimeSpent: 0,
        totalCorrect: 0,
        totalAttempts: 0,
        totalTasksCompleted: 0,
        totalSimulationsCompleted: 0
      };

      const session = sessionDoc.exists ? sessionDoc.data()! : {
        sessionId,
        studentId,
        simulationId,
        startTime: timestamp, // Default to first event seen
        endTime: null,
        timeSpent: 0,
        xpEarned: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        attempts: 0,
        tasksCompleted: 0,
        hintsUsed: 0
      };

      // 2. Process logic based on eventType
      switch (eventType) {
        case 'SESSION_START':
          session.startTime = timestamp;
          break;

        case 'SESSION_END':
          session.endTime = timestamp;
          if (session.startTime) {
             const durationSecs = Math.max(0, Math.floor((timestamp - session.startTime) / 1000));
             session.timeSpent = durationSecs;
             metric.totalTimeSpent += durationSecs;
          }
          metric.totalSimulationsCompleted += 1;
          break;

        case 'HEARTBEAT':
          // Update end time progressively in case of crash (will be overwritten by SESSION_END if clean)
          session.endTime = timestamp;
          if (session.startTime) {
            session.timeSpent = Math.max(0, Math.floor((timestamp - session.startTime) / 1000));
          }
          break;

        case 'XP_EARNED':
          const earned = data?.xp || 0;
          metric.totalXP += earned;
          session.xpEarned += earned;
          break;

        case 'LEVEL_UP':
          metric.currentLevel += 1;
          break;

        case 'ANSWER_CORRECT':
          metric.totalCorrect += 1;
          metric.totalAttempts += 1;
          session.correctAnswers += 1;
          session.attempts += 1;
          break;

        case 'ANSWER_WRONG':
          metric.totalAttempts += 1;
          session.wrongAnswers += 1;
          session.attempts += 1;
          break;

        case 'QUESTION_ATTEMPT':
          metric.totalAttempts += 1;
          session.attempts += 1;
          break;

        case 'TASK_COMPLETED':
          metric.totalTasksCompleted += 1;
          session.tasksCompleted += 1;
          break;

        case 'HINT_USED':
          session.hintsUsed += 1;
          break;

        case 'SIMULATION_START':
        case 'SIMULATION_END':
          // Can be used for broader simulation analytics later
          break;
      }

      // 3. Write back
      transaction.set(metricRef, metric);
      transaction.set(sessionRef, session);
    });
  });

function findPackageJsonDir(dir: string): string | null {
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory() && !['node_modules', '__MACOSX', '.git'].includes(file.name)) {
      const found = findPackageJsonDir(path.join(dir, file.name));
      if (found) return found;
    }
  }
  return null;
}

/**
 * Cloud Function to build React apps from uploaded ZIP files.
 * Memory and Timeout must be increased in Firebase Console for this.
 */
export const onSimulationUpload = functions.runWith({
  memory: '4GB',
  timeoutSeconds: 540 // 9 minutes
}).storage.object().onFinalize(async (object) => {
  const filePath = object.name; // e.g., 'pending-builds/sim_123.zip'
  if (!filePath?.startsWith('pending-builds/') || !filePath.endsWith('.zip')) return;

  const bucket = admin.storage().bucket(object.bucket);
  const tempZipPath = path.join(os.tmpdir(), 'upload.zip');
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-'));
  const simId = path.basename(filePath, '.zip');

  const updateProgress = (step: string) => 
    db.collection('simulations').doc(simId).update({ buildStep: step });

  try {
    // 1. Download from Storage
    await updateProgress("Downloading source files...");
    await bucket.file(filePath).download({ destination: tempZipPath });

    // 2. Extract
    await updateProgress("Extracting project...");
    const zip = new AdmZip(tempZipPath);
    zip.extractAllTo(extractDir, true);

    // 3. Find directory with package.json
    const buildDir = findPackageJsonDir(extractDir);
    console.log(`Build directory identified: ${buildDir}`);
    if (!buildDir) {
      throw new Error("Could not find package.json in the uploaded ZIP.");
    }

    // 4. Run Build (spawn commands)
    const runCmd = (cmd: string, args: string[]) => new Promise((res, rej) => {
      const p = spawn(cmd, args, { 
        cwd: buildDir, 
        shell: true,
        env: { ...process.env, CI: 'true' } 
      });
      p.on('close', code => code === 0 ? res(null) : rej(new Error(`${cmd} failed`)));
    });

    await updateProgress("Installing dependencies (this takes a minute)...");
    await runCmd('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund', '--quiet']);
    
    await updateProgress("Building React application...");
    await runCmd('npm', ['run', 'build']);

    // 5. Zip the 'dist' folder
    await updateProgress("Zipping build artifacts...");
    const distPath = path.join(buildDir, 'dist');
    const outZip = new AdmZip();
    outZip.addLocalFolder(distPath);
    const finalZipBuffer = outZip.toBuffer();

    // 6. Upload back to Storage
    await updateProgress("Saving to cloud storage...");
    const destination = `simulations/${simId}.zip`;
    const file = bucket.file(destination);
    await file.save(finalZipBuffer, { 
      contentType: 'application/zip',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });

    // 7. Update Firestore
    await db.collection('simulations').doc(simId).update({
      status: 'ready',
      buildStep: 'Completed'
    });

    // Clean up
    await bucket.file(filePath).delete();
  } catch (error) {
    console.error("Build failed:", error);
    // બિલ્ડ ફેલ થાય તો Firestore માં એરર મોકલો જેથી UI અપડેટ થાય
    await db.collection('simulations').doc(simId).update({
      status: 'error',
      errorMessage: error instanceof Error ? error.message : "Cloud build failed unexpectedly."
    });
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
  }
});
