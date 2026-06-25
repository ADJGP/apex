const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const workspaceRoot = __dirname;
const dataFile = path.join(workspaceRoot, 'registros.txt');
const githubToken = process.env.GITHUB_TOKEN;
const githubRepoOwner = process.env.GITHUB_REPO_OWNER;
const githubRepoName = process.env.GITHUB_REPO_NAME;
const githubBranch = process.env.GITHUB_BRANCH || 'main';
const githubFilePath = process.env.GITHUB_FILE_PATH || 'registros.txt';

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, '# Registros de personas\n', 'utf8');
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

function ensureDataFile() {
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, '# Registros de personas\n', 'utf8');
  }
}

function readEntries() {
  ensureDataFile();
  const content = fs.readFileSync(dataFile, 'utf8');
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .slice(-10)
    .map((line) => {
      const [timestamp, state, tipo, cedula, nombre, salud] = line.split('|');
      return { timestamp, state, tipo, cedula: cedula || '', nombre: nombre || '', salud: salud || '' };
    });
}

function appendEntry(entry) {
  ensureDataFile();
  const line = `${entry.timestamp}|${entry.state}|${entry.tipo}|${entry.cedula}|${entry.nombre}|${entry.salud}`;
  const current = fs.readFileSync(dataFile, 'utf8');
  const newContent = current.trimEnd() + '\n' + line + '\n';
  fs.writeFileSync(dataFile, newContent, 'utf8');
  return newContent;
}

async function publishToGitHub(content) {
  if (!githubToken || !githubRepoOwner || !githubRepoName) {
    return { published: false, reason: 'GitHub no configurado' };
  }

  const encodedContent = Buffer.from(content, 'utf8').toString('base64');
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  const currentUrl = `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/contents/${encodeURIComponent(githubFilePath)}?ref=${githubBranch}`;
  const currentResponse = await fetch(currentUrl, { headers });
  let sha = null;

  if (currentResponse.ok) {
    const currentJson = await currentResponse.json();
    sha = currentJson.sha;
  }

  const payload = {
    message: 'Actualizar registros desde formulario',
    content: encodedContent,
    branch: githubBranch,
  };

  if (sha) {
    payload.sha = sha;
  }

  const response = await fetch(`https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/contents/${encodeURIComponent(githubFilePath)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${errorText}`);
  }

  return { published: true, result: await response.json() };
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && requestUrl.pathname === '/api/registro') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ entries: readEntries() }));
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/registro') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const entry = {
          timestamp: new Date().toISOString(),
          state: payload.estado || 'Sin estado',
          tipo: payload.tipo || 'cedula',
          cedula: payload.cedula || '',
          nombre: payload.nombre || '',
          salud: payload.salud || '',
        };

        const newContent = appendEntry(entry);
        let githubResult = null;

        try {
          githubResult = await publishToGitHub(newContent);
        } catch (error) {
          githubResult = { published: false, error: error.message };
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: 'Registro guardado correctamente.',
          entry,
          github: githubResult,
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: 'Datos inválidos.' }));
      }
    });
    return;
  }

  let filePath = requestUrl.pathname === '/' ? path.join(workspaceRoot, 'index.html') : path.join(workspaceRoot, decodeURIComponent(requestUrl.pathname.replace(/^\//, '')));
  if (!filePath.startsWith(workspaceRoot)) {
    filePath = path.join(workspaceRoot, 'index.html');
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      const fallbackPath = path.join(workspaceRoot, 'index.html');
      fs.readFile(fallbackPath, (fallbackError, fallbackContent) => {
        if (fallbackError) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('No encontrado');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallbackContent);
      });
      return;
    }

    fs.readFile(filePath, (readError, content) => {
      if (readError) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Error al leer el archivo');
        return;
      }
      res.writeHead(200, { 'Content-Type': getContentType(filePath) });
      res.end(content);
    });
  });
});

server.listen(port, () => {
  console.log(`Servidor listo en http://localhost:${port}`);
});
