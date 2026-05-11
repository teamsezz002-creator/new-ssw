import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import crypto from "crypto";

import "stream";

const app = express();
const PORT = 3000;
const upload = multer({ dest: os.tmpdir() });

const buildJobs = new Map<string, { status: 'building' | 'completed' | 'error', message?: string, zipPath?: string, logs: string[] }>();

// Modified runCommand to accept a log callback
function runCommand(command: string, args: string[], cwd: string, logCallback: (message: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const fullCommand = `${command} ${args.join(' ')}`;
    logCallback(`Running: ${fullCommand} in ${cwd}`);
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
      timeout: 300 * 1000 // 5 minutes timeout for each command
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) logCallback(`[${command} STDOUT] ${text}`);
    });
    proc.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
           if (text.toLowerCase().includes('warn') || text.toLowerCase().includes('deprecated')) {
               console.log(`[${command} WARN] ${text}`);
           } else {
               console.error(`[${command} ERR] ${text}`);
               logCallback(`[${command} STDERR] ${text}`);
           }
        }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        logCallback(`Command "${fullCommand}" exited with code ${code}`);
        resolve();
      }
      else {
        const errorMessage = `Command "${fullCommand}" exited with code ${code}`;
        logCallback(`[ERROR] ${errorMessage}`);
        reject(new Error(errorMessage));
      }
    });

    proc.on('error', (err) => {
      const errorMessage = `Failed to start command "${fullCommand}": ${err.message}`;
      logCallback(`[ERROR] ${errorMessage}`);
      reject(new Error(errorMessage));
    });
  });
}

function findPackageJsonDir(dir: string): string | null {
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    if (file.isDirectory() && !file.name.includes("node_modules") && !file.name.includes("__MACOSX") && !file.name.includes(".git")) { // Added .git
      const found = findPackageJsonDir(path.join(dir, file.name));
      if (found) return found;
    }
  }
  return null;
}

async function startServer() {
  // Endpoint to check if a simulation is already cached/extracted
  app.get("/api/check-installed/:simId", (req, res) => {
    const simId = req.params.simId;
    const extractDir = path.join(os.tmpdir(), "sims", simId);
    if (fs.existsSync(path.join(extractDir, "index.html"))) {
      return res.json({ installed: true, url: `/virtual-games/${simId}/index.html` });
    }
    return res.json({ installed: false });
  });

  // Endpoint to extract and host a simulation on the server
  app.post("/api/mount-zip", express.json(), async (req, res) => {
    try {
      const { simId, zipUrl } = req.body;
      if (!simId || !zipUrl) return res.status(400).send("Missing simId or zipUrl");

      const extractDir = path.join(os.tmpdir(), "sims", simId);

      // Check if already extracted
      if (fs.existsSync(path.join(extractDir, "index.html"))) {
          return res.json({ success: true, url: `/virtual-games/${simId}/index.html` });
      }

      console.log(`Downloading zip for sim ${simId} from URL: ${zipUrl}`);
      const response = await fetch(zipUrl);
      console.log(`Fetch response status: ${response.status} ${response.statusText}`);
      console.log(`Fetch response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch zip from storage HTTP ${response.status}: ${errText.substring(0, 1000)}`);
      }

      const zipPath = path.join(os.tmpdir(), `sim_${simId}.zip`);
      
      const buffer = await response.arrayBuffer();
      const nodeBuffer = Buffer.from(buffer);
      console.log(`Downloaded ${nodeBuffer.length} bytes for sim ${simId}. First 50 bytes: `, nodeBuffer.slice(0, 50).toString('utf8'));
      
      fs.writeFileSync(zipPath, nodeBuffer);

      console.log(`Extracting zip for sim ${simId}...`);
      fs.mkdirSync(extractDir, { recursive: true });
      
      const stats = fs.statSync(zipPath);
      if (stats.size === 0) {
          throw new Error("The downloaded zip file is empty. The storage URL may be invalid.");
      }
      
      const fd = fs.openSync(zipPath, 'r');
      const sigBuffer = Buffer.alloc(4);
      fs.readSync(fd, sigBuffer, 0, 4, 0);
      fs.closeSync(fd);
      
      if (sigBuffer.toString('hex') !== '504b0304' && sigBuffer.toString('hex') !== '504b0506' && sigBuffer.toString('hex') !== '504b0708') {
        
         const firstBytes = fs.readFileSync(zipPath).toString('utf8', 0, Math.min(stats.size, 1000));

         throw new Error(`The downloaded file does not appear to be a valid ZIP archive (signature ${sigBuffer.toString('hex')}). The storage URL may be pointing to a corrupted file or non-zip format. First 1000 bytes: ${firstBytes}`);
      }
      
      try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractDir, true);
      } catch (zipError: any) {
        throw new Error(`Failed to extract ZIP. Original error: ${zipError.message}`);
      }

      // Clean up zip
      fs.unlinkSync(zipPath);

      res.json({ success: true, url: `/virtual-games/${simId}/index.html` });
    } catch (e: any) {
      console.error("Mount zip error:", e);
      res.status(500).send(e.message);
    }
  });

  // Serve the extracted virtual games
  app.use("/virtual-games", express.static(path.join(os.tmpdir(), "sims")));

  // API routes FIRST
  app.post("/api/build-react", upload.single("zipFile"), (req, res) => {
    if (!req.file) {
      return res.status(400).send("No zip file uploaded");
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "react-build-"));
    const zipPath = req.file.path;
    
    let jobId: string;
    try {
        jobId = crypto.randomUUID();
    } catch(e) {
        jobId = Math.random().toString(36).substring(2, 15);
    }
    
    // Initialize job with empty logs
    buildJobs.set(jobId, { status: 'building', logs: [] });
    res.json({ jobId });

    // Define a logging function for this job
    const jobLog = (message: string) => {
      const job = buildJobs.get(jobId);
      if (job) job.logs.push(message);
    };

    // Run build in background
    (async () => {
      try {
        jobLog(`Extracting uploaded ZIP to ${tempDir}...`);
      const stats = fs.statSync(zipPath);
      console.log(`Uploaded file size: ${stats.size} bytes`);
      if (stats.size === 0) {
        throw new Error("The uploaded file is empty (0 bytes). Please ensure you are uploading a valid ZIP file.");
      }
      
      // Read first 4 bytes to check ZIP signature
      const fd = fs.openSync(zipPath, 'r');
      const sigBuffer = Buffer.alloc(4);
      fs.readSync(fd, sigBuffer, 0, 4, 0);
      fs.closeSync(fd);
      
      if (sigBuffer.toString('hex') !== '504b0304' && sigBuffer.toString('hex') !== '504b0506' && sigBuffer.toString('hex') !== '504b0708') {
         throw new Error(`The uploaded file does not appear to be a valid ZIP archive (Invalid signature: ${sigBuffer.toString('hex')}). Please ensure you are not uploading a .rar or corrupted file.`);
      }

      try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(tempDir, true);
        jobLog("✓ ZIP extracted.");
      } catch (zipError: any) {
        throw new Error(`Failed to read ZIP file. It may be corrupted, in an unsupported format (like .rar), or use unsupported ZIP64 features. Original error: ${zipError.message}`);
      }

      const buildDir = findPackageJsonDir(tempDir);
      if (!buildDir) {
        throw new Error("Could not find package.json in the uploaded ZIP.");
      }
      jobLog(`Found package.json in ${buildDir}.`);

      jobLog(`Installing dependencies...`);
      await runCommand("npm", ["install", "--legacy-peer-deps", "--no-audit", "--no-fund", "--loglevel=error"], buildDir, jobLog);
      jobLog("✓ Dependencies installed.");

      jobLog(`Ensuring missing dependencies are installed (react-is)...`);
      try {
          await runCommand("npm", ["install", "react-is", "--legacy-peer-deps", "--no-audit", "--no-fund", "--loglevel=error"], buildDir, jobLog);
      } catch(e) {
          console.warn("Failed to install react-is, continuing...");
      }

      console.log(`Applying Workbox filesize limit patches...`);
      try { // This block should also use jobLog
          const defaultsJs = path.join(buildDir, 'node_modules', 'workbox-build', 'build', 'options', 'defaults.js');
          if (fs.existsSync(defaultsJs)) {
              let content = fs.readFileSync(defaultsJs, 'utf8');
              content = content.replace(/maximumFileSizeToCacheInBytes:\s*\d+/g, 'maximumFileSizeToCacheInBytes: 52428800'); // 50MB
              fs.writeFileSync(defaultsJs, content);
          }
          
          const pwaConfigPaths = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.cjs'];
          for (const conf of pwaConfigPaths) {
              const fullPath = path.join(buildDir, conf);
              if (fs.existsSync(fullPath)) {
                  let content = fs.readFileSync(fullPath, 'utf8');
                  if (!content.includes('maximumFileSizeToCacheInBytes')) {
                      content = content.replace(/(VitePWA\(\s*\{)/g, '$1 workbox: { maximumFileSizeToCacheInBytes: 52428800 }, ');
                  } else {
                      content = content.replace(/maximumFileSizeToCacheInBytes:\s*\d+/g, 'maximumFileSizeToCacheInBytes: 52428800');
                  }
                  fs.writeFileSync(fullPath, content);
              }
          }
          jobLog("✓ Workbox patches applied.");
      } catch(e) {
          jobLog(`[WARN] Workbox patch failed: ${e}`);
      }

      try {
          const pkgJsonPath = path.join(buildDir, 'package.json');
          if (fs.existsSync(pkgJsonPath)) {
              let pkgContent = fs.readFileSync(pkgJsonPath, 'utf8');
              const pkgJson = JSON.parse(pkgContent);
              if (pkgJson.scripts) {
                  let changed = false;
                  for (const key of Object.keys(pkgJson.scripts)) {
                      if (typeof pkgJson.scripts[key] === 'string' && pkgJson.scripts[key].includes('vite build') && !pkgJson.scripts[key].includes('--base')) {
                          pkgJson.scripts[key] = pkgJson.scripts[key].replace('vite build', 'vite build --base=./');
                          changed = true;
                      }
                  }
                  if (changed) {
                      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
                  }
              }
          } // This block should also use jobLog

          // Also patch vite.config.* to have base if not present
          const viteConfigs = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs']; // This block should also use jobLog
          for (const conf of viteConfigs) {
              const confPath = path.join(buildDir, conf);
              if (fs.existsSync(confPath)) {
                  let content = fs.readFileSync(confPath, 'utf8');
                  if (!content.includes('base:')) {
                     content = content.replace(/(defineConfig\(\{)/, '$1 base: "./",');
                     fs.writeFileSync(confPath, content);
                  }
              }
          } jobLog("✓ Vite base set to relative.");
      } catch(e) {
          jobLog(`[WARN] Failed to patch vite base: ${e}`);
      }
      jobLog(`Setting Vite base to relative...`);
      console.log(`Building React app...`);
      await runCommand("npm", ["run", "build"], buildDir, jobLog);

      // Vite typically outputs to 'dist' or 'build'
      const distDirVite = path.join(buildDir, "dist");
      const distDirCra = path.join(buildDir, "build");
      
      const finalDistDir = fs.existsSync(distDirVite) ? distDirVite : (fs.existsSync(distDirCra) ? distDirCra : null);

      if (!finalDistDir) {
        throw new Error("No 'dist' or 'build' folder generated. Did the build script succeed?");
      }

      jobLog(`Build complete. Zipping ${finalDistDir}...`);
      const outZip = new AdmZip();
      outZip.addLocalFolder(finalDistDir);
      const buffer = outZip.toBuffer();

      const finalZipPath = path.join(os.tmpdir(), `build_out_${jobId}.zip`);
      fs.writeFileSync(finalZipPath, buffer);
      jobLog(`✓ Build output zipped to: ${finalZipPath}`);

      jobLog(`Build job ${jobId} completed successfully.`);
      buildJobs.set(jobId, { status: 'completed', zipPath: finalZipPath, logs: buildJobs.get(jobId)?.logs || [] });
    } catch (e: any) {
      jobLog(`[ERROR] Build failed for ${jobId}: ${e}`);
      buildJobs.set(jobId, { status: 'error', message: e.message || String(e), logs: buildJobs.get(jobId)?.logs || [] });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }
    })();
  });

  app.get("/api/build-status/:jobId", (req, res) => {
    const job = buildJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  });

  app.get("/api/build-download/:jobId", (req, res) => {
    const job = buildJobs.get(req.params.jobId);
    if (!job || job.status !== 'completed' || !job.zipPath) {
      return res.status(400).send("Job not completed or zip not found");
    }
    
    res.download(job.zipPath, 'compiled.zip', (err) => {
       if (err) {
         console.error("Download error:", err);
       }
       // Clean up after download
       try { if (fs.existsSync(job.zipPath!)) fs.unlinkSync(job.zipPath!); } catch(e){}
       buildJobs.delete(req.params.jobId);
    });
  });

  // Health endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the built dist directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
