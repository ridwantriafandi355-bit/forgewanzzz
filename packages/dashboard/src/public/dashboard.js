// FORGE WANZZ — Paperclip Autonomous Company Controller
(function() {
  // Navigation elements
  const navItems = document.querySelectorAll('.nav-item');
  const viewPanels = document.querySelectorAll('.view-panel');
  const elActiveBreadcrumb = document.getElementById('activeBreadcrumb');
  const elTopbarBurn = document.getElementById('topbarBurn');
  const elTopbarHeadcount = document.getElementById('topbarHeadcount');
  const elNavCountAgents = document.getElementById('navCountAgents');
  const elNavCountTickets = document.getElementById('navCountTickets');
  const elNavBadgeApprovals = document.getElementById('navBadgeApprovals');
  const elBoardSessionText = document.getElementById('boardSessionText');

  // Org Chart Elements
  const elOrgChartWorkspace = document.getElementById('orgChartWorkspace');
  const elBtnRefreshOrg = document.getElementById('btnRefreshOrg');

  // Tickets / Kanban Elements
  const elColTodo = document.getElementById('colTodo');
  const elColInProgress = document.getElementById('colInProgress');
  const elColInReview = document.getElementById('colInReview');
  const elColDone = document.getElementById('colDone');
  const elCountTodo = document.getElementById('countTodo');
  const elCountInProgress = document.getElementById('countInProgress');
  const elCountInReview = document.getElementById('countInReview');
  const elCountDone = document.getElementById('countDone');
  const elBtnRefreshTickets = document.getElementById('btnRefreshTickets');

  // Approvals Elements
  const elApprovalsList = document.getElementById('approvalsList');
  const elApprovalsEmpty = document.getElementById('approvalsEmpty');
  const elBtnRefreshApprovals = document.getElementById('btnRefreshApprovals');

  // Budgets Elements
  const elValMonthlyCap = document.getElementById('valMonthlyCap');
  const elValSpentUsd = document.getElementById('valSpentUsd');
  const elValTokensBurned = document.getElementById('valTokensBurned');
  const elValBurnRate = document.getElementById('valBurnRate');
  const elModelBars = document.getElementById('modelBars');
  const elPayrollTableBody = document.getElementById('payrollTableBody');
  const elBtnRefreshBudgets = document.getElementById('btnRefreshBudgets');

  // Heartbeats Elements
  const elHeartbeatsList = document.getElementById('heartbeatsList');
  const elBtnRefreshHeartbeats = document.getElementById('btnRefreshHeartbeats');
  const elBtnTriggerHeartbeat = document.getElementById('btnTriggerHeartbeat');

  // Diffs Elements
  const elSelectDiffTask = document.getElementById('selectDiffTask');
  const elDiffFileList = document.getElementById('diffFileList');
  const elDiffCodeContainer = document.getElementById('diffCodeContainer');
  const elDiffActiveFilePath = document.getElementById('diffActiveFilePath');
  const elBtnRefreshDiffs = document.getElementById('btnRefreshDiffs');

  // Audit / Terminal Elements
  const elTerminalLog = document.getElementById('terminalLog');
  const elChkAutoScroll = document.getElementById('chkAutoScroll');
  const elBtnClearLogs = document.getElementById('btnClearLogs');

  // Modal Elements
  const elBtnNewTicket = document.getElementById('btnNewTicket');
  const elTicketModal = document.getElementById('ticketModal');
  const elBtnCloseModal = document.getElementById('btnCloseModal');
  const elBtnCancelModal = document.getElementById('btnCancelModal');
  const elTicketForm = document.getElementById('ticketForm');
  const elInputTicketTitle = document.getElementById('inputTicketTitle');
  const elSelectTicketPriority = document.getElementById('selectTicketPriority');
  const elSelectTicketAssignee = document.getElementById('selectTicketAssignee');
  const elInputTicketDesc = document.getElementById('inputTicketDesc');

  // Auth & Connections Elements
  const elNavCountConnections = document.getElementById('navCountConnections');
  const elConnectionsGrid = document.getElementById('connectionsGrid');
  const elBtnRefreshConnections = document.getElementById('btnRefreshConnections');
  const elBtnOpenAddConnModal = document.getElementById('btnOpenAddConnModal');
  const elConnModal = document.getElementById('connModal');
  const elBtnCloseConnModal = document.getElementById('btnCloseConnModal');
  const elBtnCancelConnModal = document.getElementById('btnCancelConnModal');
  const elConnForm = document.getElementById('connForm');
  const elInputConnId = document.getElementById('inputConnId');
  const elInputConnName = document.getElementById('inputConnName');
  const elSelectConnType = document.getElementById('selectConnType');
  const elSelectConnAuth = document.getElementById('selectConnAuth');
  const elInputConnSecretRef = document.getElementById('inputConnSecretRef');
  const elInputConnEndpoint = document.getElementById('inputConnEndpoint');

  let activeViewId = 'viewOrgChart';
  let sseSource = null;
  let currentTickets = [];
  let currentDiffFiles = [];

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

    if (elChkAutoScroll && elChkAutoScroll.checked) {
      elTerminalLog.scrollTop = elTerminalLog.scrollHeight;
    }
  }

  // --- NAVIGATION CONTROLLER ---
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-view');
      const label = btn.querySelector('.nav-label')?.textContent || 'Dashboard';
      switchView(targetView, label);
    });
  });

  function switchView(viewId, labelText) {
    activeViewId = viewId;
    navItems.forEach(b => {
      if (b.getAttribute('data-view') === viewId) b.classList.add('active');
      else b.classList.remove('active');
    });

    viewPanels.forEach(p => {
      if (p.id === viewId) p.classList.add('active');
      else p.classList.remove('active');
    });

    if (elActiveBreadcrumb && labelText) {
      elActiveBreadcrumb.textContent = labelText;
    }

    // Refresh view data on demand
    if (viewId === 'viewOrgChart') fetchOrgChart();
    if (viewId === 'viewTickets') fetchTickets();
    if (viewId === 'viewApprovals') fetchApprovals();
    if (viewId === 'viewBudgets') fetchBudgets();
    if (viewId === 'viewHeartbeats') fetchHeartbeats();
    if (viewId === 'viewDiffs') fetchDiffs();
    if (viewId === 'viewConnections') fetchConnections();
  }

  // --- 1. ORG CHART VIEW ---
  async function fetchOrgChart() {
    try {
      const res = await fetch('/api/org');
      const data = await res.json();
      if (!data.success) return;

      if (elNavCountAgents) elNavCountAgents.textContent = data.company.headcount;
      if (elTopbarHeadcount) elTopbarHeadcount.textContent = `${data.company.headcount} Agents`;
      if (elTopbarBurn) elTopbarBurn.textContent = `$${data.company.currentBurnUsd.toFixed(2)} / $${data.company.monthlyBudgetUsd.toFixed(2)}`;

      renderOrgHierarchy(data.hierarchy);
    } catch {}
  }

  function renderOrgHierarchy(members) {
    if (!elOrgChartWorkspace) return;
    elOrgChartWorkspace.innerHTML = '';

    const boardMember = members.find(m => m.id === 'board');
    const execs = members.filter(m => m.reportsTo === 'board' && m.id !== 'board');
    const workers = members.filter(m => m.reportsTo && m.reportsTo !== 'board');

    // Tier 0: Board of Directors
    if (boardMember) {
      const tier0 = document.createElement('div');
      tier0.className = 'org-tier';
      tier0.innerHTML = `
        <div class="org-tier-label">Executive Board of Directors</div>
        <div class="org-nodes-row">
          <div class="org-node-card board-node">
            <div class="node-header">
              <div class="node-avatar">${escapeHtml(boardMember.avatar)}</div>
              <div class="node-title-group">
                <div class="node-name">${escapeHtml(boardMember.name)}</div>
                <div class="node-role-title">${escapeHtml(boardMember.title)}</div>
              </div>
              <span class="node-dept-tag">${escapeHtml(boardMember.department)}</span>
            </div>
            <div class="node-status-row">
              <span class="node-status-pill ONLINE">BOARD IN SESSION</span>
              <span style="color: #94a3b8; font-size: 11px;">Supreme Decision Authority</span>
            </div>
          </div>
        </div>
      `;
      elOrgChartWorkspace.appendChild(tier0);
    }

    // Tier 1: Vice Presidents / Supervisors
    if (execs.length > 0) {
      const tier1 = document.createElement('div');
      tier1.className = 'org-tier';
      tier1.innerHTML = `<div class="org-tier-label">Department Leadership (Reporting to Board)</div>`;
      const row1 = document.createElement('div');
      row1.className = 'org-nodes-row';

      execs.forEach(e => {
        row1.appendChild(createAgentNodeCard(e));
      });
      tier1.appendChild(row1);
      elOrgChartWorkspace.appendChild(tier1);
    }

    // Tier 2: Staff Engineers & Quality Directors
    if (workers.length > 0) {
      const tier2 = document.createElement('div');
      tier2.className = 'org-tier';
      tier2.innerHTML = `<div class="org-tier-label">Core Workforce & Individual Contributors</div>`;
      const row2 = document.createElement('div');
      row2.className = 'org-nodes-row';

      workers.forEach(w => {
        row2.appendChild(createAgentNodeCard(w));
      });
      tier2.appendChild(row2);
      elOrgChartWorkspace.appendChild(tier2);
    }
  }

  function createAgentNodeCard(agent) {
    const card = document.createElement('div');
    card.className = 'org-node-card';

    const spent = agent.budget?.spentUsd || 0;
    const allocated = agent.budget?.allocatedUsd || 10;
    const pct = Math.min(100, Math.round((spent / allocated) * 100));

    card.innerHTML = `
      <div class="node-header">
        <div class="node-avatar">${escapeHtml(agent.avatar || '🤖')}</div>
        <div class="node-title-group">
          <div class="node-name">${escapeHtml(agent.name)}</div>
          <div class="node-role-title">${escapeHtml(agent.title || agent.role)}</div>
        </div>
        <span class="node-dept-tag">${escapeHtml(agent.department || 'Engineering')}</span>
      </div>

      <div class="node-status-row">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="node-status-pill ${escapeHtml(agent.status)}">${escapeHtml(agent.status)}</span>
          <span style="font-family: var(--font-mono); color: #8b5cf6; font-size: 10px;">${escapeHtml(agent.model || 'gemini-2.5-pro')}</span>
        </div>
        ${agent.lease ? '<span style="color: #00f0ff; font-size: 11px;">🔒 Worktree Active</span>' : '<span style="color: #64748b; font-size: 11px;">Standby</span>'}
      </div>

      <div class="node-budget-box">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">Monthly Budget</span>
          <span style="font-family: var(--font-mono); font-weight: 700;">$${spent.toFixed(2)} / $${allocated.toFixed(2)} (${pct}%)</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width: ${pct}%;"></div>
        </div>
      </div>

      ${agent.responsibilities && agent.responsibilities.length ? `
        <ul class="node-responsibilities">
          ${agent.responsibilities.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
      ` : ''}
    `;

    return card;
  }

  // --- 2. ISSUES & TICKETS (LINEAR-STYLE BOARD) ---
  async function fetchTickets() {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      if (!data.success) return;

      currentTickets = data.tickets || [];
      if (elNavCountTickets) elNavCountTickets.textContent = currentTickets.length;

      // Filter by status
      const todos = currentTickets.filter(t => t.status === 'TODO');
      const inProg = currentTickets.filter(t => t.status === 'IN_PROGRESS');
      const inRev = currentTickets.filter(t => t.status === 'IN_REVIEW');
      const done = currentTickets.filter(t => t.status === 'DONE');

      if (elCountTodo) elCountTodo.textContent = todos.length;
      if (elCountInProgress) elCountInProgress.textContent = inProg.length;
      if (elCountInReview) elCountInReview.textContent = inRev.length;
      if (elCountDone) elCountDone.textContent = done.length;

      renderTicketColumn(elColTodo, todos);
      renderTicketColumn(elColInProgress, inProg);
      renderTicketColumn(elColInReview, inRev);
      renderTicketColumn(elColDone, done);

      updateDiffTaskOptions();
    } catch {}
  }

  function renderTicketColumn(container, tickets) {
    if (!container) return;
    container.innerHTML = '';

    if (tickets.length === 0) {
      container.innerHTML = '<div style="color: #64748b; font-size: 11px; text-align: center; padding: 20px;">No issues</div>';
      return;
    }

    tickets.forEach(t => {
      const card = document.createElement('div');
      card.className = 'ticket-card';
      card.innerHTML = `
        <div class="ticket-header-row">
          <span class="ticket-code">${escapeHtml(t.ticketCode || t.id)}</span>
          <span class="priority-pill priority-${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span>
        </div>
        <div class="ticket-title">${escapeHtml(t.title)}</div>
        <div class="ticket-footer">
          <div class="ticket-assignee">
            <span>${escapeHtml(t.assignee?.avatar || '⚡')}</span>
            <span>${escapeHtml(t.assignee?.name || 'Worker')}</span>
          </div>
          <span class="ticket-cost">$${t.cost?.usd?.toFixed(2) || '0.04'}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        appendLog('info', `Selected Ticket [${t.ticketCode}] "${t.title}" (${t.status})`);
      });
      container.appendChild(card);
    });
  }

  // --- 3. BOARD APPROVALS (GOVERNANCE ROOM) ---
  async function fetchApprovals() {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      if (!data.success) return;

      const approvals = data.approvals || [];
      if (elNavBadgeApprovals) {
        elNavBadgeApprovals.textContent = approvals.length;
        if (approvals.length === 0) elNavBadgeApprovals.classList.add('hidden');
        else elNavBadgeApprovals.classList.remove('hidden');
      }

      if (approvals.length === 0) {
        if (elApprovalsEmpty) elApprovalsEmpty.style.display = 'flex';
        const existing = elApprovalsList.querySelectorAll('.board-motion-card');
        existing.forEach(c => c.remove());
        return;
      }

      if (elApprovalsEmpty) elApprovalsEmpty.style.display = 'none';
      const existing = elApprovalsList.querySelectorAll('.board-motion-card');
      existing.forEach(c => c.remove());

      approvals.forEach(app => {
        const card = document.createElement('div');
        card.className = 'board-motion-card';

        const reason = app.outputPayload?.error ||
                       app.inputPayload?.policyReason ||
                       'Board Intervention: Circuit breaker retry limit tripped or policy HUMAN_ATTESTED sign-off required (AD-005).';

        card.innerHTML = `
          <div class="motion-header">
            <div>
              <div class="motion-title">🏛️ Board Motion: [${escapeHtml(app.taskId)}] ${escapeHtml(app.taskTitle || 'Objective')}</div>
              <div class="motion-meta">
                <span>Mission: <strong>${escapeHtml(app.missionName || app.missionId)}</strong></span>
                <span>Retries: ${escapeHtml(app.retryCount)}/${escapeHtml(app.maxRetries)}</span>
              </div>
            </div>
            <span class="motion-tag">PENDING BOARD APPROVAL</span>
          </div>

          <div class="motion-box">
            ⚠️ INCIDENT RATIONALE: ${escapeHtml(reason)}
          </div>

          <div class="motion-actions">
            <input type="text" class="motion-notes-input" id="notes_${escapeHtml(app.taskId)}" placeholder="Enter Chairman justification / attestation notes...">
            <button class="btn btn-reject btn-sm" onclick="boardReject('${escapeHtml(app.taskId)}')">Veto Decision</button>
            <button class="btn btn-approve btn-sm" onclick="boardApprove('${escapeHtml(app.taskId)}')">Approve as Board</button>
          </div>
        `;

        elApprovalsList.appendChild(card);
      });
    } catch {}
  }

  window.boardApprove = async function(taskId) {
    const input = document.getElementById(`notes_${taskId}`);
    const notes = input ? input.value.trim() : '';
    appendLog('success', `Chairman approved board motion for task [${taskId}]`);

    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(taskId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE', notes: notes || 'Approved by Chairman of the Board' }),
      });
      const data = await res.json();
      if (data.success) {
        appendLog('success', `Task [${taskId}] resumed by Board.`);
        await fetchApprovals();
        await fetchTickets();
      }
    } catch (e) {
      appendLog('error', `Approval failed: ${e.message}`);
    }
  };

  window.boardReject = async function(taskId) {
    const input = document.getElementById(`notes_${taskId}`);
    const notes = input ? input.value.trim() : '';
    appendLog('warn', `Chairman vetoed board motion for task [${taskId}]`);

    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(taskId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REJECT', notes: notes || 'Vetoed by Chairman of the Board' }),
      });
      const data = await res.json();
      if (data.success) {
        appendLog('warn', `Task [${taskId}] vetoed and terminated.`);
        await fetchApprovals();
        await fetchTickets();
      }
    } catch (e) {
      appendLog('error', `Veto failed: ${e.message}`);
    }
  };

  // --- 4. COSTS & BUDGETS ---
  async function fetchBudgets() {
    try {
      const res = await fetch('/api/budgets');
      const data = await res.json();
      if (!data.success) return;

      const b = data.companyBudget;
      if (elValMonthlyCap) elValMonthlyCap.textContent = `$${b.monthlyCapUsd.toFixed(2)}`;
      if (elValSpentUsd) elValSpentUsd.textContent = `$${b.spentUsd.toFixed(2)}`;
      if (elValTokensBurned) elValTokensBurned.textContent = `${b.totalTokensBurned.toLocaleString()} total tokens`;
      if (elValBurnRate) elValBurnRate.textContent = `$${b.burnRateUsdPerHour.toFixed(2)} / hr`;

      // Model bars
      if (elModelBars && data.modelBreakdown) {
        elModelBars.innerHTML = '';
        data.modelBreakdown.forEach(m => {
          const item = document.createElement('div');
          item.className = 'model-bar-item';
          item.innerHTML = `
            <div class="model-bar-labels">
              <span><strong>${escapeHtml(m.model)}</strong> (${m.usagePercent}%)</span>
              <span style="font-family: var(--font-mono); color: #00f0ff;">$${m.costUsd.toFixed(3)}</span>
            </div>
            <div class="model-bar-track">
              <div class="model-bar-fill" style="width: ${m.usagePercent}%;"></div>
            </div>
          `;
          elModelBars.appendChild(item);
        });
      }

      // Payroll table
      if (elPayrollTableBody && data.agentPayroll) {
        elPayrollTableBody.innerHTML = '';
        data.agentPayroll.forEach(p => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${escapeHtml(p.role)}</strong></td>
            <td style="font-family: var(--font-mono); color: #94a3b8;">${escapeHtml(p.agentId)}</td>
            <td><span class="pill-badge" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">gemini-2.5-pro</span></td>
            <td style="font-family: var(--font-mono); font-weight: 700; color: #00f0ff;">$${p.costUsd.toFixed(3)}</td>
          `;
          elPayrollTableBody.appendChild(tr);
        });
      }
    } catch {}
  }

  // --- 5. HEARTBEATS & LEASES ---
  async function fetchHeartbeats() {
    try {
      const res = await fetch('/api/heartbeats');
      const data = await res.json();
      if (!data.success || !elHeartbeatsList) return;

      elHeartbeatsList.innerHTML = '';
      data.heartbeats.forEach(h => {
        const card = document.createElement('div');
        card.className = 'heartbeat-card';
        card.innerHTML = `
          <div class="hb-left">
            <div class="hb-icon">⚡</div>
            <div>
              <div class="hb-role">${escapeHtml(h.role)} <span style="font-size: 11px; color: #64748b;">(${escapeHtml(h.agentId)})</span></div>
              <div class="hb-state">${escapeHtml(h.wakeState)}</div>
            </div>
          </div>
          <div class="hb-right">
            <div>Interval: <span style="color: #00f0ff;">${escapeHtml(h.interval)}</span></div>
            <div>Status: <span style="color: #10b981;">${escapeHtml(h.status)}</span></div>
            <div>Next Wake: <span style="color: #8b5cf6;">${new Date(h.nextWake).toLocaleTimeString()}</span></div>
          </div>
        `;
        elHeartbeatsList.appendChild(card);
      });
    } catch {}
  }

  // --- 6. CODE PATCHES & DIFFS ---
  function updateDiffTaskOptions() {
    if (!elSelectDiffTask) return;
    const currentVal = elSelectDiffTask.value;
    elSelectDiffTask.innerHTML = '<option value="">Current Workspace Working Tree</option>';

    currentTickets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `[${t.ticketCode || t.id}] ${t.title}`;
      elSelectDiffTask.appendChild(opt);
    });

    if (currentVal) elSelectDiffTask.value = currentVal;
  }

  async function fetchDiffs() {
    const taskId = elSelectDiffTask ? elSelectDiffTask.value : '';
    const url = taskId ? `/api/diffs?taskId=${encodeURIComponent(taskId)}` : '/api/diffs';

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      currentDiffFiles = data.files || [];

      if (!data.hasDiff || currentDiffFiles.length === 0) {
        if (elDiffFileList) elDiffFileList.innerHTML = '<div class="diff-empty-files">No modified files</div>';
        if (elDiffActiveFilePath) elDiffActiveFilePath.textContent = 'Working tree clean';
        if (elDiffCodeContainer) elDiffCodeContainer.innerHTML = '<div class="diff-placeholder">No active git modifications recorded.</div>';
        return;
      }

      if (elDiffFileList) {
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
      }

      if (currentDiffFiles.length > 0) {
        renderFileDiff(currentDiffFiles[0]);
      }
    } catch {}
  }

  function renderFileDiff(file) {
    if (elDiffActiveFilePath) elDiffActiveFilePath.textContent = `${file.path} (+${file.additions}, -${file.deletions})`;
    if (!elDiffCodeContainer) return;
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

  // --- 7. AUTH & CONNECTIONS VIEW ---
  async function fetchConnections() {
    try {
      const res = await fetch('/api/connections');
      const data = await res.json();
      if (!data.success) return;

      if (elNavCountConnections) elNavCountConnections.textContent = data.count !== undefined ? data.count : data.connections.length;
      renderConnections(data.connections);
    } catch {}
  }

  function renderConnections(connections) {
    if (!elConnectionsGrid) return;
    elConnectionsGrid.innerHTML = '';

    if (!connections || connections.length === 0) {
      elConnectionsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted); background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border-subtle);">
          No AI Provider or Runtime Connections registered yet. Click "+ Add Connection" to link Anthropic, OpenAI, Local Ollama, or custom host.
        </div>
      `;
      return;
    }

    connections.forEach(conn => {
      const card = document.createElement('div');
      card.className = 'connection-card';

      const status = conn.status || 'CONFIGURED';
      let badgeClass = 'badge-configured';
      if (status === 'CONNECTED') badgeClass = 'badge-connected';
      else if (status === 'DISCONNECTED') badgeClass = 'badge-disconnected';

      const typeIcon = conn.type === 'PROVIDER' ? '⚡' : (conn.type === 'RUNTIME' ? '💻' : '🔌');
      const healthMsg = conn.health?.message || 'Awaiting status check';
      const latencyStr = conn.health?.latencyMs ? ` (${conn.health.latencyMs}ms)` : '';

      card.innerHTML = `
        <div class="connection-header">
          <div>
            <div class="connection-title">${typeIcon} ${escapeHtml(conn.name)}</div>
            <div class="connection-id">${escapeHtml(conn.id)}</div>
          </div>
          <div class="connection-badges">
            <span class="badge-pill" style="background: rgba(99, 102, 241, 0.15); color: var(--indigo); border: 1px solid rgba(99, 102, 241, 0.3);">${escapeHtml(conn.type)}</span>
            <span class="badge-pill ${badgeClass}">${escapeHtml(status)}</span>
          </div>
        </div>

        <div class="connection-meta-row">
          <span class="connection-meta-label">Auth Method</span>
          <span class="connection-meta-val">${escapeHtml(conn.authType)}</span>
        </div>

        <div class="connection-meta-row">
          <span class="connection-meta-label">Credential Vault Ref</span>
          <span class="connection-meta-val">${escapeHtml(conn.credentialRef || 'None (Public/Local)')}</span>
        </div>

        ${conn.targetEndpoint ? `
        <div class="connection-meta-row">
          <span class="connection-meta-label">Target Endpoint</span>
          <span class="connection-meta-val">${escapeHtml(conn.targetEndpoint)}</span>
        </div>
        ` : ''}

        <div class="connection-health-msg">
          <strong>Health:</strong> ${escapeHtml(healthMsg)}${latencyStr}
        </div>

        <div class="connection-actions">
          <button class="btn btn-secondary btn-sm btn-test-conn" data-id="${escapeHtml(conn.id)}">
            ⚡ Test Health
          </button>
        </div>
      `;

      const btnTest = card.querySelector('.btn-test-conn');
      if (btnTest) {
        btnTest.addEventListener('click', () => testConnection(conn.id, btnTest));
      }

      elConnectionsGrid.appendChild(card);
    });
  }

  async function testConnection(connId, buttonEl) {
    if (!connId) return;
    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = 'Testing...';
    }
    appendLog('info', `Testing connection health for [${connId}]...`);

    try {
      const res = await fetch('/api/connections/' + encodeURIComponent(connId) + '/test', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        const isHealthy = data.health?.isHealthy;
        const statusType = isHealthy ? 'success' : 'warn';
        appendLog(statusType, `[${connId}] Health Probe: ${data.status} - ${data.health?.message || 'OK'}`);
        await fetchConnections();
      } else {
        appendLog('error', `[${connId}] Test failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      appendLog('error', `[${connId}] Health test network error: ${err.message}`);
    } finally {
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = '⚡ Test Health';
      }
    }
  }

  function openConnModal() {
    if (elConnModal) {
      elConnModal.classList.add('open');
      if (elInputConnId) elInputConnId.focus();
    }
  }

  function closeConnModal() {
    if (elConnModal) {
      elConnModal.classList.remove('open');
      if (elConnForm) elConnForm.reset();
    }
  }

  // --- SSE STREAM ---
  function connectSSE() {
    try {
      sseSource = new EventSource('/api/stream');

      sseSource.onopen = function() {
        appendLog('success', 'Connected to Forge Wanzz Paperclip EventStream.');
      };

      sseSource.onmessage = function(e) {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'CONNECTED') {
            appendLog('system', payload.message);
          } else if (payload.type === 'TICKET_CREATED' || payload.type === 'MISSION_STARTED') {
            appendLog('info', `🎫 New Issue Created: "${payload.title || payload.name}"`);
            fetchTickets();
            fetchOrgChart();
          } else if (payload.type === 'TICKET_COMPLETED' || payload.type === 'MISSION_COMPLETED') {
            appendLog('success', `✅ Issue Verified & Completed: [${payload.taskId || payload.missionId}]`);
            fetchTickets();
            fetchOrgChart();
            fetchBudgets();
          } else if (payload.type === 'APPROVAL_GRANTED') {
            appendLog('success', `🏛️ Board Approval Granted for [${payload.taskId}]`);
            fetchApprovals();
            fetchTickets();
          } else if (payload.type === 'APPROVAL_REJECTED') {
            appendLog('warn', `⛔ Board Veto on [${payload.taskId}]`);
            fetchApprovals();
            fetchTickets();
          } else if (payload.type === 'TASK_PAUSED') {
            appendLog('warn', `⏸️ Task Paused: [${payload.taskId}]`);
            fetchApprovals();
            fetchTickets();
          } else if (payload.type === 'CONNECTION_REGISTERED' || payload.type === 'CONNECTION_HEALTH_UPDATED') {
            fetchConnections();
          }
        } catch {}
      };
    } catch {}
  }

  // --- MODAL CONTROLS ---
  window.openTicketModal = function() {
    if (elTicketModal) {
      elTicketModal.classList.add('open');
      if (elInputTicketTitle) elInputTicketTitle.focus();
    }
  };

  function closeTicketModal() {
    if (elTicketModal) {
      elTicketModal.classList.remove('open');
      if (elTicketForm) elTicketForm.reset();
    }
  }

  // Event Listeners
  if (elBtnNewTicket) elBtnNewTicket.addEventListener('click', openTicketModal);
  if (elBtnCloseModal) elBtnCloseModal.addEventListener('click', closeTicketModal);
  if (elBtnCancelModal) elBtnCancelModal.addEventListener('click', closeTicketModal);
  if (elBtnRefreshOrg) elBtnRefreshOrg.addEventListener('click', fetchOrgChart);
  if (elBtnRefreshTickets) elBtnRefreshTickets.addEventListener('click', fetchTickets);
  if (elBtnRefreshApprovals) elBtnRefreshApprovals.addEventListener('click', fetchApprovals);
  if (elBtnRefreshBudgets) elBtnRefreshBudgets.addEventListener('click', fetchBudgets);
  if (elBtnRefreshHeartbeats) elBtnRefreshHeartbeats.addEventListener('click', fetchHeartbeats);
  if (elBtnRefreshDiffs) elBtnRefreshDiffs.addEventListener('click', fetchDiffs);
  if (elSelectDiffTask) elSelectDiffTask.addEventListener('change', fetchDiffs);
  if (elBtnClearLogs) elBtnClearLogs.addEventListener('click', () => { if (elTerminalLog) elTerminalLog.innerHTML = ''; });
  if (elBtnTriggerHeartbeat) {
    elBtnTriggerHeartbeat.addEventListener('click', () => {
      appendLog('info', 'Autonomous Heartbeat Cycle Triggered by Chairman.');
      fetchHeartbeats();
      fetchTickets();
    });
  }

  if (elTicketForm) {
    elTicketForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = elInputTicketTitle.value.trim();
      const priority = elSelectTicketPriority.value;
      const desc = elInputTicketDesc.value.trim();
      if (!title) return;

      closeTicketModal();
      appendLog('info', `Dispatching Issue to Workforce: "${title}" (${priority})...`);

      try {
        const res = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, priority, description: desc }),
        });
        const data = await res.json();
        if (data.success) {
          appendLog('success', `Issue Accepted by Workforce! Ticket: ${data.ticketId}`);
          await fetchTickets();
          await fetchOrgChart();
        } else {
          appendLog('error', `Failed to create issue: ${data.error}`);
        }
      } catch (err) {
        appendLog('error', `Network error: ${err.message}`);
      }
    });
  }

  // Connections Modal and Event Listeners
  if (elBtnOpenAddConnModal) elBtnOpenAddConnModal.addEventListener('click', openConnModal);
  if (elBtnCloseConnModal) elBtnCloseConnModal.addEventListener('click', closeConnModal);
  if (elBtnCancelConnModal) elBtnCancelConnModal.addEventListener('click', closeConnModal);
  if (elBtnRefreshConnections) elBtnRefreshConnections.addEventListener('click', fetchConnections);

  if (elConnForm) {
    elConnForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = elInputConnId.value.trim();
      const name = elInputConnName.value.trim();
      const type = elSelectConnType.value;
      const authType = elSelectConnAuth.value;
      const secretRef = elInputConnSecretRef.value.trim();
      const targetEndpoint = elInputConnEndpoint.value.trim();

      if (!id || !name) return;

      closeConnModal();
      appendLog('info', `Registering Connection: ${name} (${id})...`);

      try {
        const payload = {
          id,
          name,
          type,
          authType,
          targetEndpoint: targetEndpoint || undefined,
          credentialRef: secretRef.startsWith('secret://') ? secretRef : undefined,
          secretValue: (!secretRef.startsWith('secret://') && secretRef) ? secretRef : undefined
        };

        const res = await fetch('/api/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          appendLog('success', `Connection [${id}] registered successfully!`);
          await fetchConnections();
        } else {
          appendLog('error', `Failed to register connection: ${data.error}`);
        }
      } catch (err) {
        appendLog('error', `Network error saving connection: ${err.message}`);
      }
    });
  }

  // Init
  connectSSE();
  fetchOrgChart();
  fetchTickets();
  fetchApprovals();
  fetchBudgets();
  fetchHeartbeats();
  fetchConnections();
  setInterval(() => {
    if (activeViewId === 'viewOrgChart') fetchOrgChart();
    if (activeViewId === 'viewTickets') fetchTickets();
    if (activeViewId === 'viewApprovals') fetchApprovals();
    if (activeViewId === 'viewBudgets') fetchBudgets();
    if (activeViewId === 'viewHeartbeats') fetchHeartbeats();
    if (activeViewId === 'viewConnections') fetchConnections();
  }, 4000);
})();
