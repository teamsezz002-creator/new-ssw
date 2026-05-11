import JSZip from 'jszip';

const mimeTypes: Record<string, string> = {
  'html': 'text/html',
  'htm': 'text/html',
  'js': 'text/javascript',
  'mjs': 'text/javascript',
  'css': 'text/css',
  'json': 'application/json',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'svg': 'image/svg+xml',
  'gif': 'image/gif',
  'wav': 'audio/wav',
  'mp3': 'audio/mpeg',
  'txt': 'text/plain',
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'ttf': 'font/ttf',
  'eot': 'application/vnd.ms-fontobject',
  'wasm': 'application/wasm'
};

/**
 * Downloads a ZIP file, extracts it in memory, and caches the files 
 * for the Service Worker to serve transparently.
 */
export async function extractAndHostZip(simId: string, zipBlob: Blob | Response): Promise<string> {
  const container = zipBlob instanceof Response ? await zipBlob.blob() : zipBlob;
  const zip = await JSZip.loadAsync(container);
  
  // Use a cache that the SW looks into
  const cache = await caches.open('zip-host');
  
  // Attempt to find root folder (where index.html is located)
  let rootPath = '';
  const files = Object.keys(zip.files);
  const indexFile = files.find(f => f.endsWith('index.html') && !f.includes('__MACOSX/'));
  
  if (indexFile) {
    rootPath = indexFile.replace('index.html', '');
  }

  const cachePromises: Promise<void>[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
     if (!file.dir && !path.includes('__MACOSX') && path.startsWith(rootPath)) {
        const fileData = await file.async("blob");
        const ext = path.split('.').pop()?.toLowerCase() || '';
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        
        const relativePath = path.substring(rootPath.length);
        const virtualUrl = `/virtual-games/${simId}/${relativePath}`;
        
        cachePromises.push(
          cache.put(
            virtualUrl, 
            new Response(fileData, { 
               headers: { 
                 "Content-Type": mimeType,
                 "Cache-Control": "no-cache" // Allows overwrites to show up immediately
               } 
            })
          )
        );
     }
  }

  await Promise.all(cachePromises);
  
  // Return the main entrypoint URL to be loaded in the internal iframe
  return `/virtual-games/${simId}/index.html`;
}
