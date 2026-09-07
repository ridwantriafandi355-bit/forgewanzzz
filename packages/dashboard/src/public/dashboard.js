// FORGE WANZZ — Autonomous Software Factory Frontend Controller
(function() {
  // DOM Elements - Navigation & Header
  const elConnectionBadge = document.getElementById('connectionBadge');
  const elConnectionText = document.getElementById('connectionText');
  const elValMissions = document.getElementById('valMissions');
  const elValTasks = document.getElementById('valTasks');
  const elValVerified = document.getElementById('valVerified');
  const elValLeases = document.getElementById('valLeases');
  const elPillSwarmBurnRate = document.getElementById('pillSwarmBurnRate');
  const elBadgeApprovalsCount = document.getElementById('badgeApprovalsCount');

  // Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabViews = document.querySelectorAll('.tab-view');

  // DAG & Terminal View
  const elDagEmptyState = document.getElementById('dagEmptyState');
  const elMissionDagList = document.getElementById('missionDagList');
  const elTerminalLog = document.getElementById('terminalLog');
  const elChkAutoScroll = document.getElementById('chkAutoScroll');
  const elBtnClearLogs = document.getElementById('btnClearLogs');
  const elBtnRefresh = document.getElementById('btnRefresh');

  // Swarm Inspector View
  const elSwarmActiveCount = document.getElementById('swarmActiveCount');
  const elSwarmTokensBurned = document.getElementById('swarmTokensBurned');
  const elSwarmLeasesCount = document.getElementById('swarmLeasesCount');
  const elSwarmGrid = document.getElementById('swarmGrid');
  const elBtnRefreshSwarm = document.getElementById('btnRefreshSwarm');

  // Diff Viewer View
  const elSelectDiffTask = document.getElementById('selectDiffTask');
  const elDiffStatsSummary = document.getElementById('diffStatsSummary');
  const elDiffFileList = document.getElementById('diffFileList');
  const elDiffCodeContainer = document.getElementById('diffCodeContainer');
  const elDiffActiveFilePath = document.getElementById('diffActiveFilePath');
  const elBtnRefreshDiffs = document.getElementById('btnRefreshDiffs');

  // Approvals View
  const elApprovalsList = document.getElementById('approvalsList');
  const elApprovalsEmpty = document.getElementById('approvalsEmpty');
  const elBtnRefreshApprovals = document.getElementById('btnRefreshApprovals');

  // Mission Modal
  const elBtnNewMission = document.getElementById('btnNewMission');
  const elMissionModal = document.getElementById('missionModal');
  const elBtnCloseModal = document.getElementById('btnCloseModal');
  const elBtnCancelModal = document.getElementById('btnCancelModal');
  const elMissionForm = document.getElementById('missionForm');
  const elInputMissionName = document.getElementById('inputMissionName');
  const elInputGoal = document.getElementById('inputGoal');

  let sseSource = null;
  let activeTabId = 'tabTopology';
  let currentDiffFiles = [];
  let currentMissions = [];

  // Utilities
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

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

  // --- TAB NAVIGATION ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  function switchTab(tabId) {
    activeTabId = tabId;
    tabButtons.forEach(b => {
      if (b.getAttribute('data-tab') === tabId) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    tabViews.forEach(v => {
      if (v.id === tabId) {
        v.classList.add('active');
      } else {
        v.classList.remove('active');
      }
    });

    // Trigger on-demand fetches
    if (tabId === 'tabSwarm') fetchSwarm();
    if (tabId === 'tabDiffs') fetchDiffs();
    if (tabId === 'tabApprovals') fetchApprovals();
  }

  // --- SSE STREAM CONNECTION ---
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
          } else if (payload.type === 'APPROVAL_GRANTED') {
            appendLog('success', `🛡️ Human Approval Granted for Task [${payload.taskId}]`);
            fetchApprovals();
            fetchState();
          } else if (payload.type === 'APPROVAL_REJECTED') {
            appendLog('warn', `⛔ Human Approval Rejected for Task [${payload.taskId}]`);
            fetchApprovals();
            fetchState();
          } else if (payload.type === 'TASK_PAUSED') {
            appendLog('warn', `⏸️ Task Paused by Operator: [${payload.taskId}]`);
            fetchApprovals();
            fetchState();
          } else if (payload.type === 'TASK_RESUMED') {
            appendLog('info', `▶️ Task Resumed: [${payload.taskId}]`);
            fetchApprovals();
            fetchState();
          } else if (payload.type === 'EVENT_BUS') {
            appendLog('info', `[EventBus] ${payload.data.type || 'event'}: ${JSON.stringify(payload.data.payload || payload.data)}`);
            fetchStatus();
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

  // --- STATUS & TOPOLOGY ---
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

  async function fetchMissions() {
    try {
      const res = await fetch('/api/missions');
      const data = await res.json();
      if (!data.success || !data.missions || data.missions.length === 0) {
        elDagEmptyState.style.display = 'flex';
        elMissionDagList.innerHTML = '';
        currentMissions = [];
        updateDiffTaskOptions();
        return;
      }

      currentMissions = data.missions;
      updateDiffTaskOptions();

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
            node.className = `task-node ${escapeHtml(t.state || t.status)}`;
            node.innerHTML = `
              <div>
                <div class="task-title">🎯 ${escapeHtml(t.title || t.name || t.id)}</div>
                <div class="task-meta">
                  <span>Role: ${escapeHtml(t.role || 'WORKER')}</span>
                  ${t.dependencies && t.dependencies.length ? `<span>• Deps: [${t.dependencies.join(', ')}]</span>` : ''}
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="badge-state">${escapeHtml(t.status || t.state || 'QUEUED')}</span>
                ${(t.status === 'RUNNING' || t.state === 'RUNNING') ? `<button class="btn btn-secondary btn-sm" onclick="pauseTask('${escapeHtml(t.id)}')">Pause</button>` : ''}
                ${(t.status === 'PAUSED' || t.state === 'PAUSED') ? `<button class="btn btn-approve btn-sm" onclick="resumeTask('${escapeHtml(t.id)}')">Resume</button>` : ''}
              </div>
            `;
            taskList.appendChild(node);
          });
          card.appendChild(taskList);
        }

        elMissionDagList.appendChild(card);
      });
    } catch {}
  }

  // --- SWARM INSPECTOR ---
  async function fetchSwarm() {
    try {
      const res = await fetch('/api/swarm');
      const data = await res.json();
      if (!data.success) return;

      elSwarmActiveCount.textContent = data.telemetry.activeAgentsCount;
      elSwarmTokensBurned.textContent = data.telemetry.totalTokensBurned.toLocaleString();
      elSwarmLeasesCount.textContent = data.telemetry.activeLeasesCount;
      elPillSwarmBurnRate.textContent = `Tokens: ${data.telemetry.totalTokensBurned.toLocaleString()} | Rate: 18.5 rpm`;

      elSwarmGrid.innerHTML = '';
      data.agents.forEach(agent => {
        const card = document.createElement('div');
        card.className = 'agent-card';

        const header = document.createElement('div');
        header.className = 'agent-card-header';
        header.innerHTML = `
          <div>
            <div class="agent-name">${escapeHtml(agent.name)}</div>
            <div class="agent-id">${escapeHtml(agent.id)}</div>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <span class="agent-role-pill role-${escapeHtml(agent.role)}">${escapeHtml(agent.role)}</span>
            <span class="agent-status-badge status-${escapeHtml(agent.status)}">${escapeHtml(agent.status)}</span>
          </div>
        `;
        card.appendChild(header);

        // Active Lease details
        const leaseBox = document.createElement('div');
        leaseBox.className = 'agent-lease-box';
        if (agent.lease) {
          leaseBox.innerHTML = `
            <div class="agent-lease-title">🔒 Active Worktree Lease</div>
            <div>Task: <strong>${escapeHtml(agent.lease.taskId)}</strong></div>
            <div>Runtime: ${escapeHtml(agent.lease.runtimeId)} | Path: ${escapeHtml(agent.lease.workspacePath)}</div>
            <div>Expires: ${escapeHtml(new Date(agent.lease.expiresAt).toLocaleTimeString())}</div>
          `;
        } else {
          leaseBox.innerHTML = `
            <div class="agent-lease-title">💤 Standby</div>
            <div style="color: #64748b;">No active workspace lock held</div>
          `;
        }
        card.appendChild(leaseBox);

        // Token burn meter
        const burnRow = document.createElement('div');
        burnRow.className = 'token-burn-row';
        burnRow.innerHTML = `
          <span>Tokens: ${agent.tokenUsage?.totalTokens || 0} (${agent.tokenUsage?.promptTokens || 0} in / ${agent.tokenUsage?.completionTokens || 0} out)</span>
          <span class="token-burn-val">${agent.model || 'gemini-2.5-pro'}</span>
        `;
        card.appendChild(burnRow);

        // Prompt snippet
        const promptSnippet = document.createElement('div');
        promptSnippet.className = 'agent-prompt-snippet';
        promptSnippet.textContent = agent.systemPromptSnippet || 'Standard Forge Invariants active.';
        card.appendChild(promptSnippet);

        elSwarmGrid.appendChild(card);
      });
    } catch {}
  }

  // --- GIT DIFF VIEWER ---
  function updateDiffTaskOptions() {
    const currentVal = elSelectDiffTask.value;
    elSelectDiffTask.innerHTML = '<option value="">Current Workspace (Uncommitted / Staged)</option>';

    currentMissions.forEach(m => {
      if (m.tasks && m.tasks.length > 0) {
        m.tasks.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `Task [${t.id}] - ${t.name || t.title || 'Task'}`;
          elSelectDiffTask.appendChild(opt);
        });
      }
    });

    if (currentVal) elSelectDiffTask.value = currentVal;
  }

  async function fetchDiffs() {
    const taskId = elSelectDiffTask.value;
    const url = taskId ? `/api/diffs?taskId=${encodeURIComponent(taskId)}` : '/api/diffs';

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      currentDiffFiles = data.files || [];

      if (!data.hasDiff || currentDiffFiles.length === 0) {
        elDiffStatsSummary.textContent = 'Working tree clean (No patch diff)';
        elDiffFileList.innerHTML = '<div class="diff-empty-files">No modified files</div>';
        elDiffActiveFilePath.textContent = 'No active changes';
        elDiffCodeContainer.innerHTML = '<div class="diff-placeholder">Working tree clean. All files verified and synced.</div>';
        return;
      }

      const totalAdd = currentDiffFiles.reduce((s, f) => s + f.additions, 0);
      const totalDel = currentDiffFiles.reduce((s, f) => s + f.deletions, 0);
      elDiffStatsSummary.textContent = `${currentDiffFiles.length} file(s) changed (+${totalAdd}, -${totalDel})`;

      // Render file list
      elDiffFileList.innerHTML = '';
      currentDiffFiles.forEach((f, idx) => {
        const item = document.createElement('div');
        item.className = `diff-file-item ${idx === 0 ? 'active' : ''}`;
        item.innerHTML = `
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(f.path)}</span>
          <span class="file-status-indicator status-${escapeHtml(f.status)}">${escapeHtml(f.status.slice(0, 3).toUpperCase())}</span>
        `;
        item.addEventListener('click', () => {
          document.querySelectorAll('.diff-file-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          renderFileDiff(f);
        });
        elDiffFileList.appendChild(item);
      });

      // Show first file by default
      if (currentDiffFiles.length > 0) {
        renderFileDiff(currentDiffFiles[0]);
      }
    } catch (err) {
      elDiffStatsSummary.textContent = `Error: ${err.message}`;
    }
  }

  function renderFileDiff(file) {
    elDiffActiveFilePath.textContent = `${file.path} (+${file.additions}, -${file.deletions})`;
    elDiffCodeContainer.innerHTML = '';

    if (!file.chunks || file.chunks.length === 0) {
      elDiffCodeContainer.innerHTML = '<div class="diff-placeholder">No line modifications recorded for this file.</div>';
      return;
    }

    file.chunks.forEach(chunk => {
      const headerDiv = document.createElement('div');
      headerDiv.className = 'diff-chunk-header';
      headerDiv.textContent = chunk.header;
      elDiffCodeContainer.appendChild(headerDiv);

      chunk.lines.forEach(line => {
        const lineDiv = document.createElement('div');
        lineDiv.className = `diff-line ${line.type}`;
        lineDiv.textContent = line.text;
        elDiffCodeContainer.appendChild(lineDiv);
      });
    });
  }

  // --- APPROVALS QUEUE ---
  async function fetchApprovals() {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      if (!data.success) return;

      const approvals = data.approvals || [];
      elBadgeApprovalsCount.textContent = approvals.length;
      if (approvals.length === 0) {
        elBadgeApprovalsCount.classList.add('hidden');
        elApprovalsEmpty.style.display = 'flex';
        // Remove existing cards
        const existingCards = elApprovalsList.querySelectorAll('.approval-card');
        existingCards.forEach(c => c.remove());
        return;
      }

      elBadgeApprovalsCount.classList.remove('hidden');
      elApprovalsEmpty.style.display = 'none';

      // Clear previous approval cards
      const existingCards = elApprovalsList.querySelectorAll('.approval-card');
      existingCards.forEach(c => c.remove());

      approvals.forEach(app => {
        const card = document.createElement('div');
        card.className = 'approval-card';

        const header = document.createElement('div');
        header.className = 'approval-card-header';
        header.innerHTML = `
          <div>
            <div class="approval-card-title">🎯 ${escapeHtml(app.taskTitle || app.taskId)}</div>
            <div class="approval-meta">
              <span>Mission: <strong>${escapeHtml(app.missionName || app.missionId)}</strong></span>
              <span>Task ID: ${escapeHtml(app.taskId)}</span>
              <span>Retries: ${escapeHtml(app.retryCount)}/${escapeHtml(app.maxRetries)}</span>
            </div>
          </div>
          <span class="approval-badge">${escapeHtml(app.status)}</span>
        `;
        card.appendChild(header);

        // Diagnostic / Rationale
        const reasonBox = document.createElement('div');
        reasonBox.className = 'approval-reason-box';
        const reasonText = app.outputPayload?.error ||
                           app.inputPayload?.policyReason ||
                           'Intervention triggered: Task reached circuit breaker limit or requires human sign-off (AD-005).';
        reasonBox.textContent = `⚠️ RATIONALE: ${reasonText}`;
        card.appendChild(reasonBox);

        // Action controls
        const actionRow = document.createElement('div');
        actionRow.className = 'approval-actions';
        actionRow.innerHTML = `
          <input type="text" class="approval-notes-input" id="notes_${escapeHtml(app.taskId)}" placeholder="Operator notes / attestation reason...">
          <button class="btn btn-reject btn-sm" onclick="rejectApproval('${escapeHtml(app.taskId)}')">Reject & Fail</button>
          <button class="btn btn-approve btn-sm" onclick="approveApproval('${escapeHtml(app.taskId)}')">Approve & Resume</button>
        `;
        card.appendChild(actionRow);

        elApprovalsList.appendChild(card);
      });
    } catch {}
  }

  // --- ACTIONS (APPROVE / REJECT / PAUSE / RESUME) ---
  window.approveApproval = async function(taskId) {
    const input = document.getElementById(`notes_${taskId}`);
    const notes = input ? input.value.trim() : '';
    appendLog('info', `Sending Human Approval for Task [${taskId}]...`);

    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(taskId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE', notes }),
      });
      const data = await res.json();
      if (data.success) {
        appendLog('success', `Task [${taskId}] Approved & Resumed.`);
        await fetchApprovals();
        await fetchState();
      } else {
        appendLog('error', `Failed to approve: ${data.error}`);
      }
    } catch (err) {
      appendLog('error', `Approval network error: ${err.message}`);
    }
  };

  window.rejectApproval = async function(taskId) {
    const input = document.getElementById(`notes_${taskId}`);
    const notes = input ? input.value.trim() : '';
    appendLog('warn', `Sending Human Rejection for Task [${taskId}]...`);

    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(taskId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REJECT', notes }),
      });
      const data = await res.json();
      if (data.success) {
        appendLog('warn', `Task [${taskId}] Rejected and marked FAILED.`);
        await fetchApprovals();
        await fetchState();
      } else {
        appendLog('error', `Failed to reject: ${data.error}`);
      }
    } catch (err) {
      appendLog('error', `Rejection network error: ${err.message}`);
    }
  };

  window.pauseTask = async function(taskId) {
    appendLog('warn', `Manually pausing task [${taskId}]...`);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/pause`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        appendLog('warn', `Task [${taskId}] PAUSED.`);
        await fetchState();
        await fetchApprovals();
      }
    } catch (err) {
      appendLog('error', `Pause failed: ${err.message}`);
    }
  };

  window.resumeTask = async function(taskId) {
    appendLog('info', `Manually resuming task [${taskId}]...`);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/resume`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        appendLog('success', `Task [${taskId}] RESUMED.`);
        await fetchState();
        await fetchApprovals();
      }
    } catch (err) {
      appendLog('error', `Resume failed: ${err.message}`);
    }
  };

  // --- STATE REFRESH ---
  async function fetchState() {
    await fetchStatus();
    await fetchMissions();
    await fetchApprovals();
    if (activeTabId === 'tabSwarm') await fetchSwarm();
    if (activeTabId === 'tabDiffs') await fetchDiffs();
  }

  // --- MODAL CONTROLS ---
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
  elBtnRefreshSwarm.addEventListener('click', fetchSwarm);
  elBtnRefreshDiffs.addEventListener('click', fetchDiffs);
  elSelectDiffTask.addEventListener('change', fetchDiffs);
  elBtnRefreshApprovals.addEventListener('click', fetchApprovals);

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

  // Initialization
  connectSSE();
  fetchState();
  setInterval(fetchState, 4000);
})();
