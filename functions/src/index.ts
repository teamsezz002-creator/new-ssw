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
  memory: '4GB', // Ensure this is 4GB for faster npm installs
  timeoutSeconds: 540 // 9 minutes
}).storage.object().onFinalize(async (object) => {
  const filePath = object.name; // e.g., 'pending-builds/sim_123.zip'
  if (!filePath?.startsWith('pending-builds/') || !filePath.endsWith('.zip')) return;

  const bucket = admin.storage().bucket(object.bucket);
  const tempZipPath = path.join(os.tmpdir(), 'upload.zip');
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-'));
  const simId = path.basename(filePath, '.zip');

  // Helper to update Firestore build step and status
  const updateBuildStatus = async (status: 'building' | 'completed' | 'error' | 'ready', buildStep?: string, errorMessage?: string) => {
    const updateData: { status: string; buildStep?: string; errorMessage?: string; lastUpdated: admin.firestore.FieldValue } = {
      status: status,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    if (buildStep) updateData.buildStep = buildStep;
    if (errorMessage) updateData.errorMessage = errorMessage;
    await db.collection('simulations').doc(simId).update(updateData);
  };

  // Helper to add log messages to Firestore
  const addBuildLog = async (message: string) => {
    await db.collection('simulations').doc(simId).update({
      buildLogs: admin.firestore.FieldValue.arrayUnion(`[${new Date().toISOString()}] ${message}`)
    });
  };

  try {
    await addBuildLog(`Cloud Build triggered for: ${simId}`);
    await updateBuildStatus('building', "Cloud Engine is waking up...");

    // 1. Download from Storage
    await updateBuildStatus('building', "Downloading source files (ZIP)...");
    await addBuildLog("Downloading source files (ZIP)...");
    await bucket.file(filePath).download({ destination: tempZipPath });
    await addBuildLog("✓ Source ZIP downloaded.");

    // 2. Extract
    await updateBuildStatus('building', "Extracting project...");
    await addBuildLog("Extracting project...");
    const zip = new AdmZip(tempZipPath);
    zip.extractAllTo(extractDir, true);
    await addBuildLog("✓ Project extracted.");

    // 3. Find directory with package.json
    const buildDir = findPackageJsonDir(extractDir);
    if (!buildDir) {
      throw new Error("Could not find package.json in the uploaded ZIP. Please ensure your project structure is correct.");
    }
    await addBuildLog(`Found package.json in: ${buildDir}`);

    // 4. Run Build (spawn commands)
    const runCmd = (command: string, args: string[]): Promise<void> => {
      return new Promise((resolve, reject) => {
        const fullCommand = `${command} ${args.join(' ')}`;
        addBuildLog(`Running command: ${fullCommand} in ${buildDir}`);
        const proc = spawn(command, args, {
          cwd: buildDir,
          shell: true,
          env: {
            ...process.env,
            CI: 'true',
            NODE_OPTIONS: '--max-old-space-size=3072', // 3GB
            npm_config_cache: path.join(os.tmpdir(), '.npm')
          },
          timeout: 300 * 1000 // 5 minutes timeout for each command
        });

        proc.stdout.on('data', (data) => {
          const text = data.toString().trim();
          if (text) addBuildLog(`[${command} STDOUT] ${text}`);
        });
        proc.stderr.on('data', (data) => {
          const text = data.toString().trim();
          if (text) {
            if (text.toLowerCase().includes('warn') || text.toLowerCase().includes('deprecated')) {
              addBuildLog(`[${command} WARN] ${text}`);
            } else {
              addBuildLog(`[${command} STDERR] ${text}`);
            }
          }
        });

        proc.on('close', (code) => {
          if (code === 0) {
            addBuildLog(`Command "${fullCommand}" exited with code ${code}`);
            resolve();
          } else {
            const errorMessage = `Command "${fullCommand}" exited with code ${code}`;
            addBuildLog(`[ERROR] ${errorMessage}`);
            reject(new Error(errorMessage));
          }
        });

        proc.on('error', (err) => {
          const errorMessage = `Failed to start command "${fullCommand}": ${err.message}`;
          addBuildLog(`[ERROR] ${errorMessage}`);
          reject(new Error(errorMessage));
        });

        proc.on('timeout', () => {
            const errorMessage = `Command "${fullCommand}" timed out after ${proc.spawnargs.timeout / 1000} seconds.`;
            addBuildLog(`[ERROR] ${errorMessage}`);
            proc.kill(); // Ensure the process is killed
            reject(new Error(errorMessage));
        });
      });
    };

    await updateBuildStatus('building', "Initializing build environment...");
    await addBuildLog("Initializing build environment...");
    
    // Patching: Ensure build is optimized for hosting (Same as local server logic)
    try {
      await addBuildLog("Applying pre-build patches (Vite base, Workbox config)...");
      const pkgJsonPath = path.join(buildDir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        let pkgContent = fs.readFileSync(pkgJsonPath, 'utf8');
        const pkg = JSON.parse(pkgContent);
        if (pkg.scripts && pkg.scripts.build && !pkg.scripts.build.includes('--base')) {
          pkg.scripts.build = pkg.scripts.build.replace('vite build', 'vite build --base=./');
          fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2));
          await addBuildLog("Patched package.json build script with --base=./");
        }
      }

      const viteConfigPaths = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.cjs'];
      let viteConfigFound = false;
      for (const conf of viteConfigPaths) {
          const fullPath = path.join(buildDir, conf);
          if (fs.existsSync(fullPath)) {
              viteConfigFound = true;
              let content = fs.readFileSync(fullPath, 'utf8');
              let originalContent = content;

              // Patch base
              if (!content.includes('base:')) {
                 content = content.replace(/(defineConfig\(\{)/, '$1 base: "./",');
                 await addBuildLog(`Patched ${conf} with base: "./"`);
              }
              
              // Workbox patch for larger files
              if (content.includes('VitePWA')) {
                if (!content.includes('maximumFileSizeToCacheInBytes')) {
                  content = content.replace(/(workbox:\s*\{)/, '$1 maximumFileSizeToCacheInBytes: 52428800, ');
                  await addBuildLog(`Patched ${conf} Workbox config for larger files.`);
                } else {
                  content = content.replace(/maximumFileSizeToCacheInBytes:\s*\d+/g, 'maximumFileSizeToCacheInBytes: 52428800');
                  await addBuildLog(`Updated ${conf} Workbox maximumFileSizeToCacheInBytes.`);
                }
              }

              if (content !== originalContent) {
                  fs.writeFileSync(fullPath, content);
              }
              break; // Only patch one vite config file
          }
      }
      if (!viteConfigFound) {
          await addBuildLog("No Vite config file found, skipping Vite-specific patches.");
      }
      await addBuildLog("✓ Pre-build patches applied.");
    } catch (patchErr: any) {
      // Report patching errors as critical, as they can lead to build failures
      throw new Error(`Failed to apply pre-build patches: ${patchErr.message || String(patchErr)}`);
    }

    await updateBuildStatus('building', "Installing dependencies...");
    await runCmd('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund', '--loglevel=error']);
    await addBuildLog("✓ Dependencies installed.");
    
    await updateBuildStatus('building', "Building React application...");
    await runCmd('npm', ['run', 'build']);
    await addBuildLog("✓ React application built.");

    // 5. Find output folder (Vite uses 'dist', CRA uses 'build')
    await updateBuildStatus('building', "Zipping build artifacts...");
    await addBuildLog("Zipping build artifacts...");
    const distPathVite = path.join(buildDir, 'dist');
    const distPathCRA = path.join(buildDir, 'build');
    const finalDistPath = fs.existsSync(distPathVite) ? distPathVite : (fs.existsSync(distPathCRA) ? distPathCRA : null);

    if (!finalDistPath) {
      throw new Error("Build succeeded but no 'dist' or 'build' folder was found. Please check your build script output.");
    }
    await addBuildLog(`Found build output in: ${finalDistPath}`);

    const outZip = new AdmZip();
    outZip.addLocalFolder(finalDistPath);
    const finalZipBuffer = outZip.toBuffer();
    await addBuildLog("✓ Build artifacts zipped.");

    // 6. Upload back to Storage
    await updateBuildStatus('building', "Saving to cloud storage...");
    await addBuildLog("Saving final build ZIP to Firebase Storage...");
    const destination = `simulations/${simId}.zip`;
    const file = bucket.file(destination);
    await file.save(finalZipBuffer, { 
      contentType: 'application/zip',
      metadata: { cacheControl: 'public, max-age=31536000' }
    });
    await addBuildLog(`✓ Final build saved to: gs://${bucket.name}/${destination}`);

    // 7. Update Firestore
    await updateBuildStatus('ready', 'Completed'); // Use 'ready' status for success
    await addBuildLog('🚀 Cloud build successful!');

    // Clean up pending-builds zip
    await bucket.file(filePath).delete();
    await addBuildLog(`Cleaned up pending build file: ${filePath}`);

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : "Cloud build failed unexpectedly.";
    await addBuildLog(`❌ Build failed: ${errorMessage}`);
    console.error(`Cloud Build for ${simId} failed:`, error);
    await updateBuildStatus('error', 'Failed', errorMessage);
  } finally {
    // Ensure all temporary files are cleaned up
    try {
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
        await addBuildLog(`Cleaned up temporary extraction directory: ${extractDir}`);
      }
      if (fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
        await addBuildLog(`Cleaned up temporary ZIP file: ${tempZipPath}`);
      }
    } catch (cleanupError: any) {
      await addBuildLog(`⚠️ Error during cleanup: ${cleanupError.message}`);
      console.error(`Error during cleanup for ${simId}:`, cleanupError);
    }
  }
});
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

  try {
    console.log(`Cloud Build triggered for: ${simId}`);
    // તાત્કાલિક અપડેટ જેથી UI માં "Waiting" નીકળી જાય
    await updateProgress("Cloud Engine is waking up...");

    // 1. Download from Storage
    await updateProgress("Downloading source files (ZIP)...");
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
      console.log(`Executing: ${cmd} ${args.join(' ')} in ${buildDir}`);
      const p = spawn(cmd, args, { 
        cwd: buildDir, 
        shell: true,
        env: { 
          ...process.env, 
          CI: 'true', 
          NODE_OPTIONS: '--max-old-space-size=3072',
          npm_config_cache: path.join(os.tmpdir(), '.npm') 
        } 
      });

      p.stdout.on('data', (data) => console.log(`[${cmd}]: ${data.toString()}`));
      p.stderr.on('data', (data) => console.error(`[${cmd} ERR]: ${data.toString()}`));

      p.on('close', code => code === 0 ? res(null) : rej(new Error(`${cmd} failed with code ${code}`)));
    });

    await updateProgress("Initializing build environment...");
    
    // Patching: Ensure build is optimized for hosting (Same as local server logic)
    try {
      const pkgJsonPath = path.join(buildDir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.scripts && pkg.scripts.build && !pkg.scripts.build.includes('--base')) {
          pkg.scripts.build = pkg.scripts.build.replace('vite build', 'vite build --base=./');
          fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2));
        }
      }

      const viteConfigPath = fs.readdirSync(buildDir).find(f => f.startsWith('vite.config.'));
      if (viteConfigPath) {
        const fullPath = path.join(buildDir, viteConfigPath);
        let content = fs.readFileSync(fullPath, 'utf8');
        if (!content.includes('base:')) {
          content = content.replace(/(defineConfig\(\{)/, '$1 base: "./",');
          fs.writeFileSync(fullPath, content);
        }
        
        // Workbox patch for larger files
        if (content.includes('VitePWA')) {
          if (!content.includes('maximumFileSizeToCacheInBytes')) {
            content = content.replace(/(workbox:\s*\{)/, '$1 maximumFileSizeToCacheInBytes: 52428800, ');
          }
          fs.writeFileSync(fullPath, content);
        }
      }
    } catch (patchErr) {
      console.warn("Pre-build patch warning:", patchErr);
    }

    await updateProgress("Installing dependencies...");
    await runCmd('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund', '--loglevel=error']);
    
    await updateProgress("Building React application...");
    await runCmd('npm', ['run', 'build']);

    // 5. Find output folder (Vite uses 'dist', CRA uses 'build')
    await updateProgress("Zipping build artifacts...");
    const distPathVite = path.join(buildDir, 'dist');
    const distPathCRA = path.join(buildDir, 'build');
    const finalDistPath = fs.existsSync(distPathVite) ? distPathVite : (fs.existsSync(distPathCRA) ? distPathCRA : null);

    if (!finalDistPath) {
      throw new Error("Build succeeded but no 'dist' or 'build' folder was found.");
    }

    const outZip = new AdmZip();
    outZip.addLocalFolder(finalDistPath);
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
