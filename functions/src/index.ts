import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
// @ts-ignore
import AdmZip from 'adm-zip';

admin.initializeApp();

const db = admin.firestore();

export const processTrackingEvent = functions.firestore
  .document('events/{eventId}')
  .onCreate(async (snap) => {
    const event = snap.data();
    if (!event) return;

    const { studentId, simulationId, sessionId, eventType, data, timestamp } = event;
    const metricRef = db.collection('user_metrics').doc(studentId);
    const sessionRef = db.collection('simulation_sessions').doc(sessionId);

    await db.runTransaction(async (transaction) => {
      const metricDoc = await transaction.get(metricRef);
      const sessionDoc = await transaction.get(sessionRef);

      const metric = metricDoc.exists
        ? metricDoc.data()!
        : {
            studentId,
            totalXP: 0,
            currentLevel: 1,
            totalTimeSpent: 0,
            totalCorrect: 0,
            totalAttempts: 0,
            totalTasksCompleted: 0,
            totalSimulationsCompleted: 0,
          };

      const session = sessionDoc.exists
        ? sessionDoc.data()!
        : {
            sessionId,
            studentId,
            simulationId,
            startTime: timestamp,
            endTime: null,
            timeSpent: 0,
            xpEarned: 0,
            correctAnswers: 0,
            wrongAnswers: 0,
            attempts: 0,
            tasksCompleted: 0,
            hintsUsed: 0,
          };

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
          session.endTime = timestamp;
          if (session.startTime) {
            session.timeSpent = Math.max(0, Math.floor((timestamp - session.startTime) / 1000));
          }
          break;
        case 'XP_EARNED': {
          const earned = data?.xp || 0;
          metric.totalXP += earned;
          session.xpEarned += earned;
          break;
        }
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
        default:
          break;
      }

      transaction.set(metricRef, metric);
      transaction.set(sessionRef, session);
    });
  });

function findPackageJsonDir(dir: string): string | null {
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir;

  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    if (file.isDirectory() && !['node_modules', '__MACOSX', '.git'].includes(file.name)) {
      const found = findPackageJsonDir(path.join(dir, file.name));
      if (found) return found;
    }
  }

  return null;
}

function createFirebaseDownloadUrl(bucketName: string, filePath: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
}

export const onSimulationUpload = functions
  .runWith({
    memory: '4GB',
    timeoutSeconds: 540,
  })
  .storage.object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    if (!filePath?.startsWith('pending-builds/') || !filePath.endsWith('.zip')) return;

    const bucket = admin.storage().bucket(object.bucket);
    const simId = path.basename(filePath, '.zip');
    const tempZipPath = path.join(os.tmpdir(), `${simId}.zip`);
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-build-'));

    const simulationRef = db.collection('simulations').doc(simId);

    const updateBuildStatus = async (
      status: 'building' | 'error' | 'ready',
      buildStep?: string,
      errorMessage?: string,
      storageUrl?: string,
    ) => {
      const updateData: Record<string, unknown> = {
        status,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (buildStep) updateData.buildStep = buildStep;
      if (errorMessage) updateData.errorMessage = errorMessage;
      if (storageUrl) updateData.storageUrl = storageUrl;
      if (status === 'ready') updateData.sourceType = 'uploaded';

      await simulationRef.set(updateData, { merge: true });
    };

    const addBuildLog = async (message: string) => {
      await simulationRef.set(
        {
          buildLogs: admin.firestore.FieldValue.arrayUnion(`[${new Date().toISOString()}] ${message}`),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    };

    const runCmd = async (command: string, args: string[], cwd: string) =>
      new Promise<void>((resolve, reject) => {
        const fullCommand = `${command} ${args.join(' ')}`;
        void addBuildLog(`Running command: ${fullCommand}`);

        const proc = spawn(command, args, {
          cwd,
          shell: true,
          env: {
            ...process.env,
            CI: 'true',
            NODE_OPTIONS: '--max-old-space-size=3072',
            npm_config_cache: path.join(os.tmpdir(), '.npm'),
          },
          timeout: 300_000,
        });

        proc.stdout.on('data', (data) => {
          const text = data.toString().trim();
          if (text) void addBuildLog(`[${command} STDOUT] ${text}`);
        });

        proc.stderr.on('data', (data) => {
          const text = data.toString().trim();
          if (!text) return;
          if (text.toLowerCase().includes('warn') || text.toLowerCase().includes('deprecated')) {
            void addBuildLog(`[${command} WARN] ${text}`);
            return;
          }
          void addBuildLog(`[${command} STDERR] ${text}`);
        });

        proc.on('close', (code) => {
          if (code === 0) {
            void addBuildLog(`Command "${fullCommand}" exited with code 0`);
            resolve();
            return;
          }

          const errorMessage = `Command "${fullCommand}" exited with code ${code}`;
          void addBuildLog(`[ERROR] ${errorMessage}`);
          reject(new Error(errorMessage));
        });

        proc.on('error', (err) => {
          const errorMessage = `Failed to start command "${fullCommand}": ${err.message}`;
          void addBuildLog(`[ERROR] ${errorMessage}`);
          reject(new Error(errorMessage));
        });
      });

    try {
      await addBuildLog(`Cloud Build triggered for ${simId}`);
      await updateBuildStatus('building', 'Downloading source files (ZIP)...');
      await bucket.file(filePath).download({ destination: tempZipPath });
      await addBuildLog('Source ZIP downloaded.');

      await updateBuildStatus('building', 'Extracting project...');
      const zip = new AdmZip(tempZipPath);
      zip.extractAllTo(extractDir, true);
      await addBuildLog('Project extracted.');

      const buildDir = findPackageJsonDir(extractDir);
      if (!buildDir) {
        throw new Error('Could not find package.json in the uploaded ZIP. Please upload the full project source.');
      }
      await addBuildLog(`Found package.json in ${buildDir}`);

      await updateBuildStatus('building', 'Applying build patches...');
      const pkgJsonPath = path.join(buildDir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.scripts && typeof pkg.scripts.build === 'string' && pkg.scripts.build.includes('vite build') && !pkg.scripts.build.includes('--base')) {
          pkg.scripts.build = pkg.scripts.build.replace('vite build', 'vite build --base=./');
          fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2));
          await addBuildLog('Patched package.json build script with --base=./');
        }
      }

      for (const configName of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs']) {
        const configPath = path.join(buildDir, configName);
        if (!fs.existsSync(configPath)) continue;

        let content = fs.readFileSync(configPath, 'utf8');
        const original = content;

        if (!content.includes('base:')) {
          content = content.replace(/defineConfig\(\s*\{/, 'defineConfig({ base: "./",');
        }

        if (content.includes('VitePWA')) {
          if (!content.includes('maximumFileSizeToCacheInBytes')) {
            content = content.replace(/workbox:\s*\{/, 'workbox: { maximumFileSizeToCacheInBytes: 52428800,');
          } else {
            content = content.replace(/maximumFileSizeToCacheInBytes:\s*\d+/g, 'maximumFileSizeToCacheInBytes: 52428800');
          }
        }

        if (content !== original) {
          fs.writeFileSync(configPath, content);
          await addBuildLog(`Patched ${configName} for relative assets / large Workbox files.`);
        }
        break;
      }

      await updateBuildStatus('building', 'Installing dependencies...');
      await runCmd('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund', '--loglevel=error'], buildDir);
      await addBuildLog('Dependencies installed.');

      await updateBuildStatus('building', 'Building React application...');
      await runCmd('npm', ['run', 'build'], buildDir);
      await addBuildLog('React application built.');

      const distPath = fs.existsSync(path.join(buildDir, 'dist'))
        ? path.join(buildDir, 'dist')
        : fs.existsSync(path.join(buildDir, 'build'))
          ? path.join(buildDir, 'build')
          : null;

      if (!distPath) {
        throw new Error("Build succeeded but no 'dist' or 'build' folder was found.");
      }

      await updateBuildStatus('building', 'Uploading compiled simulation...');
      const outZip = new AdmZip();
      outZip.addLocalFolder(distPath);
      const finalZipBuffer = outZip.toBuffer();

      const destination = `simulations/${simId}.zip`;
      const downloadToken = randomUUID();
      await bucket.file(destination).save(finalZipBuffer, {
        contentType: 'application/zip',
        metadata: {
          cacheControl: 'public, max-age=31536000',
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });

      const downloadUrl = createFirebaseDownloadUrl(bucket.name, destination, downloadToken);
      await updateBuildStatus('ready', 'Completed', undefined, downloadUrl);
      await addBuildLog('Cloud build successful.');

      await bucket.file(filePath).delete();
      await addBuildLog(`Cleaned pending build file ${filePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Cloud build failed unexpectedly.';
      console.error(`Cloud build for ${simId} failed:`, error);
      await addBuildLog(`Build failed: ${errorMessage}`);
      await updateBuildStatus('error', 'Failed', errorMessage);
    } finally {
      try {
        if (fs.existsSync(extractDir)) {
          fs.rmSync(extractDir, { recursive: true, force: true });
        }
        if (fs.existsSync(tempZipPath)) {
          fs.unlinkSync(tempZipPath);
        }
      } catch (cleanupError) {
        console.error(`Cleanup failed for ${simId}:`, cleanupError);
      }
    }
  });
