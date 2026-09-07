// FORGE WANZZ — Autonomous Software Factory Frontend Controller
(function() {
  const elConnectionBadge = document.getElementById('connectionBadge');
  const elConnectionText = document.getElementById('connectionText');
  const elValMissions = document.getElementById('valMissions');
  const elValTasks = document.getElementById('valTasks');
  const elValVerified = document.getElementById('valVerified');
  const elValLeases = document.getElementById('valLeases');
  const elDagEmptyState = document.getElementById('dagEmptyState');
  const elMissionDagList = document.getElementById('missionDagList');
  const elTerminalLog = document.getElementById('terminalLog');
  const elChkAutoScroll = document.getElementById('chkAutoScroll');
  const elBtnClearLogs = document.getElementById('btnClearLogs');
  const elBtnRefresh = document.getElementById('btnRefresh');
  const elBtnNewMission = document.getElementById('btnNewMission');
  const elMissionModal = document.getElementById('missionModal');
  const elBtnCloseModal = document.getElementById('btnCloseModal');
  const elBtnCancelModal = document.getElementById('btnCancelModal');
  const elMissionForm = document.getElementById('missionForm');
  const elInputMissionName = document.getElementById('inputMissionName');
  const elInputGoal = document.getElementById('inputGoal');

  let sseSource = null;

  // Append entry to live log terminal
  function appendLog(type, text) {
    const time = new Date().toLocaleTimeString();
    const row = document.createElement('div');
    row.className = `log-entry ${type}`;
    row.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-text">${escapeHtml(text)}</span>`;
    elTerminalLog.appendChild(row);

    if (elChkAutoScroll.checked) {
      elTerminalLog.scrollTop = elTerminalLog.scrollHeight;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Connect to SSE Stream
  function connectSSE() {
    try {
      sseSource = new EventSource('/api/stream');

      sseSource.onopen = function() {
        elConnectionBadge.classList.add('connected');
        elConnectionText.textContent = 'FACTORY ONLINE';
        appendLog('success', 'Connected to Forge EventStream (SSE).');
      };

      sseSource.onmessage = function(e) {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'CONNECTED') {
            appendLog('system', payload.message);
          } else if (payload.type === 'MISSION_STARTED') {
            appendLog('info', `🚀 Mission Started: [${payload.missionId}] "${payload.name}"`);
            fetchState();
          } else if (payload.type === 'MISSION_COMPLETED') {
            appendLog('success', `✅ Mission Finished: [${payload.missionId}] COMPLETED`);
            fetchState();
          } else if (payload.type === 'MISSION_FAILED') {
            appendLog('error', `❌ Mission Failed: [${payload.missionId}] ${payload.error}`);
            fetchState();
          } else if (payload.type === 'EVENT_BUS') {
            appendLog('info', `[EventBus] ${JSON.stringify(payload.data)}`);
            fetchState();
          }
        } catch (err) {
          appendLog('info', e.data);
        }
      };

      sseSource.onerror = function() {
        elConnectionBadge.classList.remove('connected');
        elConnectionText.textContent = 'RECONNECTING...';
      };
    } catch (e) {
      appendLog('error', `Failed to initialize SSE: ${e.message}`);
    }
  }

  // Fetch Factory Status & Metrics
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.success && data.metrics) {
        elValMissions.textContent = data.metrics.missionsCount;
        elValTasks.textContent = data.metrics.tasksCount;
        elValVerified.textContent = data.metrics.verifiedCount;
        elValLeases.textContent = data.metrics.leasesCount;
      }
    } catch {}
  }

  // Fetch Missions & Build DAG Tree
  async function fetchMissions() {
    try {
      const res = await fetch('/api/missions');
      const data = await res.json();
      if (!data.success || !data.missions || data.missions.length === 0) {
        elDagEmptyState.style.display = 'flex';
        elMissionDagList.innerHTML = '';
        return;
      }

      elDagEmptyState.style.display = 'none';
      elMissionDagList.innerHTML = '';

      data.missions.forEach(m => {
        const card = document.createElement('div');
        card.className = 'mission-card';

        const header = document.createElement('div');
        header.className = 'mission-card-header';
        header.innerHTML = `
          <div>
            <div class="mission-name">${escapeHtml(m.name || 'Unnamed Mission')}</div>
            <div style="font-size: 11px; color: #64748b;">ID: ${escapeHtml(m.id)}</div>
          </div>
          <span class="mission-status ${escapeHtml(m.status)}">${escapeHtml(m.status)}</span>
        `;
        card.appendChild(header);

        if (m.tasks && m.tasks.length > 0) {
          const taskList = document.createElement('div');
          taskList.className = 'task-node-list';

          m.tasks.forEach(t => {
            const node = document.createElement('div');
            node.className = `task-node ${escapeHtml(t.state)}`;
            node.innerHTML = `
              <div>
                <div class="task-title">🎯 ${escapeHtml(t.title || t.id)}</div>
                <div class="task-meta">
                  <span>Role: ${escapeHtml(t.role || 'WORKER')}</span>
                  ${t.dependencies && t.dependencies.length ? `<span>• Deps: [${t.dependencies.join(', ')}]</span>` : ''}
                </div>
              </div>
              <span class="badge-state">${escapeHtml(t.state)}</span>
            `;
            taskList.appendChild(node);
          });
          card.appendChild(taskList);
        }

        elMissionDagList.appendChild(card);
      });
    } catch {}
  }

  async function fetchState() {
    await fetchStatus();
    await fetchMissions();
  }

  // Modal Controls
  window.openMissionModal = function() {
    elMissionModal.classList.add('open');
    elInputMissionName.focus();
  };

  function closeModal() {
    elMissionModal.classList.remove('open');
    elMissionForm.reset();
  }

  // Event Listeners
  elBtnNewMission.addEventListener('click', openMissionModal);
  elBtnCloseModal.addEventListener('click', closeModal);
  elBtnCancelModal.addEventListener('click', closeModal);
  elBtnClearLogs.addEventListener('click', () => { elTerminalLog.innerHTML = ''; });
  elBtnRefresh.addEventListener('click', fetchState);

  elMissionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = elInputMissionName.value.trim();
    const goal = elInputGoal.value.trim();
    if (!name || !goal) return;

    closeModal();
    appendLog('info', `Submitting new mission: "${name}"...`);

    try {
      const res = await fetch('/api/missions/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, goal }),
      });
      const data = await res.json();
      if (data.success) {
        appendLog('success', `Mission accepted by Factory! Mission ID: ${data.missionId}`);
        await fetchState();
      } else {
        appendLog('error', `Failed to start mission: ${data.error}`);
      }
    } catch (err) {
      appendLog('error', `Network error: ${err.message}`);
    }
  });

  // Init
  connectSSE();
  fetchState();
  setInterval(fetchState, 3000);
})();
