import express from 'express';
import multer from 'multer';
import cors from 'cors';
import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

// Firebase Admin Setup (Render ના Environment Variables માંથી લેશે)
if (!admin.apps || admin.apps.length === 0) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!serviceAccountJson) {
    console.error("Error: FIREBASE_SERVICE_ACCOUNT environment variable is not set.");
    process.exit(1); // Exit if critical environment variable is missing
  }
  if (!storageBucket) {
    console.error("Error: FIREBASE_STORAGE_BUCKET environment variable is not set.");
    process.exit(1); // Exit if critical environment variable is missing
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      storageBucket: storageBucket
    });
    console.log("Firebase Admin SDK initialized successfully.");
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
    process.exit(1); // Exit if initialization fails
  }
} else {
  console.log("Firebase Admin SDK already initialized.");
}

const db = admin.firestore();
const bucket = admin.storage().bucket();
const app = express();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB Limit

app.use(cors());
app.use(express.json());

function findPackageJsonDir(dir: string): string | null {
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    if (file.isDirectory() && !['node_modules', '.git'].includes(file.name)) {
      const found = findPackageJsonDir(path.join(dir, file.name));
      if (found) return found;
    }
  }
  return null;
}

async function addBuildLog(simId: string, message: string) {
  console.log(`[${simId}] ${message}`);
  await db.collection('simulations').doc(simId).set({
    buildLogs: admin.firestore.FieldValue.arrayUnion(`[${new Date().toLocaleTimeString()}] ${message}`),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function updateStatus(simId: string, status: string, step: string, extra = {}) {
  await db.collection('simulations').doc(simId).set({
    status,
    buildStep: step,
    ...extra,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

app.post('/build', upload.single('zipFile'), async (req, res) => {
  const simId = req.body.simId;
  const file = req.file;

  if (!simId || !file) {
    return res.status(400).json({ error: 'Missing simId or zipFile' });
  }

  res.json({ message: 'Build started on Render', simId });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'render-build-'));
  const extractDir = path.join(tempRoot, 'source');
  const zipPath = path.join(tempRoot, 'upload.zip');

  try {
    await updateStatus(simId, 'building', 'Extracting source...');
    fs.mkdirSync(extractDir, { recursive: true });
    fs.writeFileSync(zipPath, file.buffer);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
    await addBuildLog(simId, 'ZIP extracted successfully.');

    const buildDir = findPackageJsonDir(extractDir);
    if (!buildDir) throw new Error('package.json not found in ZIP');

    // Patch for Relative Paths (Crucial for IFrames)
    const viteConfigPath = path.join(buildDir, 'vite.config.ts');
    if (fs.existsSync(viteConfigPath)) {
      let content = fs.readFileSync(viteConfigPath, 'utf8');
      if (!content.includes('base:')) {
        content = content.replace(/defineConfig\(\s*\{/, 'defineConfig({ base: "./",');
        fs.writeFileSync(viteConfigPath, content);
        await addBuildLog(simId, 'Patched vite.config.ts for relative paths.');
      }
    }

    // 1. Install Dependencies
    await updateStatus(simId, 'building', 'Installing dependencies...');
    await runCommand('npm', ['install', '--legacy-peer-deps'], buildDir, simId);

    // 2. Run Build
    await updateStatus(simId, 'building', 'Building simulation...');
    await runCommand('npm', ['run', 'build'], buildDir, simId);

    const distDir = fs.existsSync(path.join(buildDir, 'dist')) 
      ? path.join(buildDir, 'dist') 
      : path.join(buildDir, 'build');

    if (!fs.existsSync(distDir)) throw new Error('Build output folder not found.');

    // 3. Zip and Upload
    await updateStatus(simId, 'building', 'Packaging build output...');
    const outZip = new AdmZip();
    outZip.addLocalFolder(distDir);
    const finalZipBuffer = outZip.toBuffer();

    const destination = `simulations/${simId}.zip`;
    const downloadToken = randomUUID();
    const fileRef = bucket.file(destination);

    await fileRef.save(finalZipBuffer, {
      contentType: 'application/zip',
      metadata: {
        firebaseStorageDownloadTokens: downloadToken
      }
    });

    const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${downloadToken}`;
    
    await updateStatus(simId, 'ready', 'Completed', { storageUrl, sourceType: 'uploaded' });
    await addBuildLog(simId, 'Build successful! Deployed to Firebase Storage.');

  } catch (error: any) {
    await addBuildLog(simId, `Error: ${error.message}`);
    await updateStatus(simId, 'error', 'Build Failed', { errorMessage: error.message });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

function runCommand(cmd: string, args: string[], cwd: string, simId: string) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, shell: true });
    proc.stdout.on('data', (d) => addBuildLog(simId, d.toString().trim()));
    proc.stderr.on('data', (d) => addBuildLog(simId, d.toString().trim()));
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} failed`)));
  });
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Render builder running on port ${PORT}`));