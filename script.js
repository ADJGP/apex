const dynamicTerms = [
  'seguridad',
  'automatización',
  'innovación',
  'velocidad',
  'confianza',
  'inteligencia'
];

const termElement = document.getElementById('dynamic-term');
let currentIndex = 0;

function rotateTerm() {
  currentIndex = (currentIndex + 1) % dynamicTerms.length;
  termElement.textContent = dynamicTerms[currentIndex];
  termElement.classList.add('fade');
  setTimeout(() => termElement.classList.remove('fade'), 500);
}

function getConfigValues() {
  const token = window.GITHUB_CONFIG?.token || document.getElementById('github-token').value.trim();
  return {
    token,
    owner: document.getElementById('github-owner').value.trim(),
    repo: document.getElementById('github-repo').value.trim(),
    branch: document.getElementById('github-branch').value.trim() || 'main',
    filePath: document.getElementById('github-file').value.trim() || 'registros.txt',
    message: document.getElementById('github-message').value.trim() || 'Actualizar registros desde formulario'
  };
}

function saveConfigValues(config) {
  const safeConfig = {
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    filePath: config.filePath,
    message: config.message
  };
  localStorage.setItem('github-config', JSON.stringify(safeConfig));
}

function loadConfigValues() {
  const stored = localStorage.getItem('github-config');
  if (!stored) return;
  try {
    const values = JSON.parse(stored);
    document.getElementById('github-owner').value = values.owner || '';
    document.getElementById('github-repo').value = values.repo || '';
    document.getElementById('github-branch').value = values.branch || 'main';
    document.getElementById('github-file').value = values.filePath || 'registros.txt';
    document.getElementById('github-message').value = values.message || 'Actualizar registros desde formulario';
  } catch (error) {
    console.warn('No se pudieron restaurar las preferencias de GitHub.', error);
  }
}

function createRegistroSection() {
  const estados = [
    'Amazonas',
    'Anzoátegui',
    'Apure',
    'Aragua',
    'Barinas',
    'Bolívar',
    'Carabobo',
    'Cojedes',
    'Delta Amacuro',
    'Falcón',
    'Guárico',
    'Lara',
    'Mérida',
    'Miranda',
    'Monagas',
    'Nueva Esparta',
    'Portuguesa',
    'Sucre',
    'Táchira',
    'Trujillo',
    'Yaracuy',
    'Zulia',
    'Distrito Capital'
  ];

  const tabsContainer = document.getElementById('estado-tabs');
  const feedback = document.getElementById('registro-feedback');
  const entriesList = document.getElementById('registro-entries');
  const estadoLabel = document.getElementById('estado-actual-label');
  const form = document.getElementById('registro-form-main');
  const estadoSelect = document.getElementById('form-estado');
  const tipoSelect = form.querySelector('select[name="tipo"]');
  const cedulaInput = form.querySelector('input[name="cedula"]');

  if (!tabsContainer || !form || !estadoSelect || !entriesList || !feedback) return;

  loadConfigValues();

  estados.forEach((estado, index) => {
    const option = document.createElement('option');
    option.value = estado;
    option.textContent = estado;
    if (index === 0) option.selected = true;
    estadoSelect.appendChild(option);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tab-button${index === 0 ? ' active' : ''}`;
    button.dataset.state = estado;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.textContent = estado;

    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach((tab) => tab.classList.remove('active'));
      button.classList.add('active');
      estadoSelect.value = estado;
      document.querySelectorAll('.tab-button').forEach((tab) => {
        if (tab !== button) tab.setAttribute('aria-selected', 'false');
        else tab.setAttribute('aria-selected', 'true');
      });
      loadEntries(entriesList, feedback, getConfigValues(), estado, estadoLabel);
    });

    tabsContainer.appendChild(button);
  });

  tipoSelect.addEventListener('change', () => {
    form.classList.toggle('is-cedula', tipoSelect.value === 'cedula');
    if (tipoSelect.value === 'cedula') {
      cedulaInput.required = true;
    } else {
      cedulaInput.required = false;
      cedulaInput.value = '';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.textContent = 'Guardando registro en GitHub...';

    const config = getConfigValues();
    saveConfigValues(config);

    if (!config.token || !config.owner || !config.repo) {
      feedback.textContent = 'Complete el token, el propietario y el nombre del repositorio para guardar en GitHub.';
      return;
    }

    const formData = new FormData(form);
    const payload = {
      estado: formData.get('estado') || estados[0],
      tipo: formData.get('tipo') || 'cedula',
      cedula: formData.get('cedula') || '',
      nombre: formData.get('nombre') || '',
      salud: formData.get('salud') || '',
      ubicacion: formData.get('ubicacion') || ''
    };

    try {
      await saveEntryToGitHub(payload, config);
      feedback.textContent = 'Registro guardado y enviado a GitHub con commit automático.';
      form.reset();
      form.classList.remove('is-cedula');
      estadoSelect.value = payload.estado;
      await loadEntries(entriesList, feedback, config, payload.estado, estadoLabel);
    } catch (error) {
      feedback.textContent = error.message;
    }
  });

  const initialConfig = getConfigValues();
  loadEntries(entriesList, feedback, initialConfig, estados[0], estadoLabel);
}

function buildStructuredContent(existingContent, payload) {
  const timestamp = new Date().toISOString();
  const entryLine = `- ${timestamp} | Tipo: ${payload.tipo} | Cédula: ${payload.cedula || 'N/A'} | Nombre: ${payload.nombre} | Salud: ${payload.salud} | Ubicación: ${payload.ubicacion || 'N/A'}`;
  const stateHeading = `## Estado: ${payload.estado}`;

  if (!existingContent.trim()) {
    return `# Registros de emergencia en Venezuela\n\n${stateHeading}\n${entryLine}\n`;
  }

  if (existingContent.includes(`${stateHeading}\n`)) {
    return existingContent.replace(`${stateHeading}\n`, `${stateHeading}\n${entryLine}\n`);
  }

  return `${existingContent.trimEnd()}\n\n${stateHeading}\n${entryLine}\n`;
}

async function saveEntryToGitHub(payload, config) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(config.filePath)}`;

  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };

  let existingContent = '';
  let sha = null;

  try {
    const response = await fetch(`${url}?ref=${encodeURIComponent(config.branch)}`, { headers });
    if (response.ok) {
      const data = await response.json();
      sha = data.sha;
      const content = atob(data.content.replace(/\s/g, ''));
      existingContent = content;
    } else if (response.status !== 404) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'No se pudo leer el archivo de GitHub.');
    }
  } catch (error) {
    if (!error.message.includes('404')) {
      throw error;
    }
  }

  const nextContent = buildStructuredContent(existingContent, payload);
  const encodedContent = btoa(unescape(encodeURIComponent(nextContent)));

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: config.message || 'Actualizar registros desde formulario',
      content: encodedContent,
      branch: config.branch,
      sha
    })
  });

  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseData.message || 'No se pudo enviar el registro a GitHub.');
  }

  return responseData;
}

function parseStructuredEntries(content) {
  const sections = [];
  let currentState = null;
  const lines = content.split(/\r?\n/);

  lines.forEach((line) => {
    const heading = line.match(/^## Estado: (.+)$/);
    if (heading) {
      currentState = heading[1].trim();
      sections.push({ state: currentState, entries: [] });
      return;
    }

    if (currentState && line.startsWith('- ')) {
      sections[sections.length - 1].entries.push(line.replace('- ', '').trim());
    }
  });

  return sections;
}

async function loadEntries(entriesList, feedback, config, stateName, estadoLabel) {
  const effectiveConfig = config || getConfigValues();
  if (!effectiveConfig.owner || !effectiveConfig.repo) {
    entriesList.innerHTML = '<li>Complete la configuración de GitHub para cargar los registros.</li>';
    return;
  }

  if (estadoLabel) {
    estadoLabel.textContent = `Registros para: ${stateName}`;
  }

  try {
    const url = `https://api.github.com/repos/${effectiveConfig.owner}/${effectiveConfig.repo}/contents/${encodeURIComponent(effectiveConfig.filePath)}?ref=${encodeURIComponent(effectiveConfig.branch || 'main')}`;
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (response.status === 404) {
        entriesList.innerHTML = '<li>Aún no existe el archivo en GitHub.</li>';
        return;
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'No se pudieron cargar los registros recientes.');
    }

    const data = await response.json();
    const content = atob(data.content.replace(/\s/g, ''));
    const sections = parseStructuredEntries(content);
    const selectedSection = sections.find((section) => section.state === stateName) || { entries: [] };

    entriesList.innerHTML = '';
    if (!selectedSection.entries.length) {
      entriesList.innerHTML = '<li>No hay registros para este estado.</li>';
      return;
    }

    selectedSection.entries.slice(-10).reverse().forEach((entry) => {
      const item = document.createElement('li');
      const parts = entry.split('|').map((part) => part.trim());
      const timestamp = parts[0] ? parts[0].replace('T', ' ').slice(0, 19) : 'Sin fecha';
      const nombre = parts[3] ? parts[3].replace('Nombre:', '').trim() : '-';
      const salud = parts[4] ? parts[4].replace('Salud:', '').trim() : '-';
      const ubicacion = parts[5] ? parts[5].replace('Ubicación:', '').trim() : '-';
      item.textContent = `${timestamp} · ${nombre} · ${salud} · ${ubicacion}`;
      entriesList.appendChild(item);
    });
  } catch (error) {
    if (feedback) {
      feedback.textContent = error.message;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (termElement) {
    setInterval(rotateTerm, 3200);
  }
  createRegistroSection();
});
