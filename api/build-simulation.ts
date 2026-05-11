import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

type BuildResult = {
  logs: string[];
  zipBase64: string;
  outputFolder: string;
};

class BuildError extends Error {
  logs: string[];

  constructor(message: string, logs: string[]) {
    super(message);
    this.name = 'BuildError';
    this.logs = logs;
  }
}

function addLog(logs: string[], message: string) {
  logs.push(message);
}

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

async function runCommand(command: string, args: string[], cwd: string, logs: string[]) {
  await new Promise<void>((resolve, reject) => {
    const fullCommand = `${command} ${args.join(' ')}`;
    addLog(logs, `Running: ${fullCommand}`);

    const proc = spawn(command, args, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        CI: 'true',
        NODE_OPTIONS: '--max-old-space-size=3072',
        npm_config_cache: path.join(os.tmpdir(), '.npm'),
      },
      timeout: 280_000,
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) addLog(logs, `[${command}] ${text}`);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) addLog(logs, `[${command} stderr] ${text}`);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        addLog(logs, `Completed: ${fullCommand}`);
        resolve();
        return;
      }

      reject(new Error(`Command failed with code ${code}: ${fullCommand}`));
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

function patchBuildFiles(buildDir: string, logs: string[]) {
  const pkgJsonPath = path.join(buildDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    if (pkg.scripts && typeof pkg.scripts.build === 'string' && pkg.scripts.build.includes('vite build') && !pkg.scripts.build.includes('--base')) {
      pkg.scripts.build = pkg.scripts.build.replace('vite build', 'vite build --base=./');
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2));
      addLog(logs, 'Patched package.json build script for relative asset paths.');
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

    if (content.includes('maxParallelFileOps')) {
      content = content.replace(/maxParallelFileOps:\s*\d+/g, 'maxParallelFileOps: 32');
    } else if (content.includes('return {')) {
      content = content.replace(/return\s*\{/, 'return { build: { rollupOptions: { maxParallelFileOps: 32 } },');
    } else if (content.includes('defineConfig({')) {
      content = content.replace(/defineConfig\(\s*\{/, 'defineConfig({ build: { rollupOptions: { maxParallelFileOps: 32 } },');
    } else if (content.includes('export default {')) {
      content = content.replace(/export default\s*\{/, 'export default { build: { rollupOptions: { maxParallelFileOps: 32 } },');
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
      addLog(logs, `Patched ${configName} for relative assets / reduced parallel file opens.`);
    }
    break;
  }
}

async function buildUploadedProject(zipBuffer: Buffer): Promise<BuildResult> {
  const logs: string[] = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vercel-build-'));
  const extractDir = path.join(tempRoot, 'source');
  const zipPath = path.join(tempRoot, 'upload.zip');

  try {
    fs.mkdirSync(extractDir, { recursive: true });
    fs.writeFileSync(zipPath, zipBuffer);
    addLog(logs, 'Source ZIP received.');

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
    addLog(logs, 'ZIP extracted.');

    const buildDir = findPackageJsonDir(extractDir);
    if (!buildDir) {
      throw new Error('Could not find package.json in the uploaded ZIP.');
    }
    addLog(logs, `Project root found: ${buildDir}`);

    patchBuildFiles(buildDir, logs);
    await runCommand('npm', ['install', '--include=dev', '--legacy-peer-deps', '--no-audit', '--no-fund', '--loglevel=error'], buildDir, logs);

    try {
      await runCommand('npm', ['run', 'build'], buildDir, logs);
    } catch (primaryBuildError) {
      addLog(logs, 'Primary build command failed. Trying a Vite fallback build...');
      try {
        await runCommand('npx', ['vite', 'build', '--base=./'], buildDir, logs);
      } catch (fallbackError) {
        const primaryMessage = primaryBuildError instanceof Error ? primaryBuildError.message : String(primaryBuildError);
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new BuildError(`Build failed. Primary: ${primaryMessage}. Fallback: ${fallbackMessage}`, logs);
      }
    }

    const distDir = fs.existsSync(path.join(buildDir, 'dist'))
      ? path.join(buildDir, 'dist')
      : fs.existsSync(path.join(buildDir, 'build'))
        ? path.join(buildDir, 'build')
        : null;

    if (!distDir) {
      throw new Error("Build completed but no 'dist' or 'build' folder was found.");
    }

    const outZip = new AdmZip();
    outZip.addLocalFolder(distDir);
    const builtZip = outZip.toBuffer();
    addLog(logs, `Build output ready from ${path.basename(distDir)}.`);

    return {
      logs,
      zipBase64: builtZip.toString('base64'),
      outputFolder: path.basename(distDir),
    };
  } catch (error) {
    if (error instanceof BuildError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Build failed unexpectedly.';
    throw new BuildError(message, logs);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('zipFile');

    if (!(file instanceof File)) {
      return Response.json({ error: 'zipFile is required.' }, { status: 400 });
    }

    if (file.size > 30 * 1024 * 1024) {
      return Response.json(
        { error: `Source ZIP is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Remove node_modules and dist/build before zipping.` },
        { status: 400 },
      );
    }

    const zipBuffer = Buffer.from(await file.arrayBuffer());
    const result = await buildUploadedProject(zipBuffer);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Build failed unexpectedly.';
    const logs = error instanceof BuildError ? error.logs : [];
    return Response.json({ error: message, logs }, { status: 500 });
  }
}
