(function () {
  const HELP_STATE = {
    open: false,
    tab: 'home',
    messages: [
      {
        role: 'assistant',
        content: 'Hi, I am Lancify AI Agent. Tell me what you are trying to do, what broke, or where you are stuck. I will give you the fastest Lancify-specific fix.',
      },
    ],
    busy: false,
    pendingAttachments: [],
  };

  const quickTopics = [
    {
      title: 'Credits or plan limits',
      text: 'Explain why my credits or plan limits are blocking an action and what I can do next.',
      icon: 'gauge',
    },
    {
      title: 'Find better clients',
      text: 'Help me use Opportunity Finder to find stronger leads for my freelance niche.',
      icon: 'search',
    },
    {
      title: 'Proposal not generating',
      text: 'My proposal is not generating or the result is weak. Walk me through the fix.',
      icon: 'file-text',
    },
    {
      title: 'Set up my profile',
      text: 'Help me fill my Lancify profile so the AI tools give more personalized results.',
      icon: 'user-round',
    },
  ];

  const helpArticles = [
    {
      title: 'Start with your profile',
      body: 'Add your niche, skills, experience, and offer first. Lancify uses that context across Proposal Writer, emails, audits, and growth tools.',
    },
    {
      title: 'When AI output feels generic',
      body: 'Paste more specific client context: industry, pain point, platform, current offer, and the result you want. The more concrete the input, the stronger the output.',
    },
    {
      title: 'Credits and locked tools',
      body: 'Free plans have monthly credits and some feature limits. If a tool is locked or a scan limit is reached, check Subscription from the profile menu. For billing issues, contact support@lancifyai.com.',
    },
    {
      title: 'Best first workflow',
      body: 'Use Opportunity Finder to pick a lead, Proposal Writer to shape the offer, Email Generator for outreach, and CRM to track the conversation.',
    },
  ];

  const icon = (name, size = 18) => `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
  const SUPPORT_EMAIL = 'support@lancifyai.com';

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isTextLike(file) {
    return /^text\//.test(file.type || '') || /\.(txt|md|json|csv|js|jsx|ts|tsx|html|css|log)$/i.test(file.name || '');
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('File read failed.'));
      reader.readAsDataURL(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').slice(0, 9000));
      reader.onerror = () => reject(reader.error || new Error('File read failed.'));
      reader.readAsText(file);
    });
  }

  async function buildAttachment(file) {
    const isImage = /^image\//.test(file.type || '');
    const attachment = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name || 'attachment',
      type: file.type || 'application/octet-stream',
      size: file.size || 0,
      kind: isImage ? 'image' : 'file',
    };

    if (isImage && file.size <= 4 * 1024 * 1024) {
      attachment.dataUrl = await readFileAsDataUrl(file);
    } else if (isTextLike(file) && file.size <= 1024 * 1024) {
      attachment.text = await readFileAsText(file);
    } else {
      attachment.note = 'File metadata attached. For deep review, paste the relevant text or upload a smaller image/text file.';
    }

    return attachment;
  }

  function getAppContext() {
    const safe = (reader, fallback = null) => {
      try { return reader(); } catch (_) { return fallback; }
    };

    return {
      page: safe(() => currentPage, 'unknown'),
      plan: safe(() => typeof _currentPlanKey === 'function' ? _currentPlanKey() : 'free', 'free'),
      profile: safe(() => ({
        name: userProfile?.name || '',
        niche: userProfile?.niche || '',
        skills: userProfile?.skills || '',
        experience: userProfile?.experience || '',
        offer: userProfile?.offer || '',
        goal: userProfile?.goal || '',
      }), {}),
      credits: safe(() => ({
        total: billingState?.total || 0,
        remaining: billingState?.remaining || 0,
      }), {}),
      leadsCount: safe(() => Array.isArray(userLeads) ? userLeads.length : 0, 0),
      clientsCount: safe(() => Array.isArray(opportunityClients) ? opportunityClients.length : 0, 0),
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    };
  }

  function ensureStyles() {
    if (document.getElementById('lancify-help-styles')) return;
    const style = document.createElement('style');
    style.id = 'lancify-help-styles';
    style.textContent = `
      .lhelp-backdrop{position:fixed;inset:0;z-index:9990;background:transparent;backdrop-filter:none;display:none;pointer-events:none}
      .lhelp-backdrop.show{display:block}
      .lhelp-panel{position:fixed;top:29px;right:29px;width:400px;max-width:calc(100vw - 58px);height:calc(100vh - 58px);max-height:768px;z-index:9991;background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:22px;box-shadow:0 30px 90px rgba(15,23,42,.28);display:none;overflow:hidden;color:#171a1f;font-family:Inter,system-ui,sans-serif;pointer-events:auto}
      .lhelp-panel.show{display:flex;flex-direction:column;animation:lhelpPop .2s cubic-bezier(.16,1,.3,1)}
      @keyframes lhelpPop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
      .lhelp-hero{background:#171717;color:#fff;padding:34px 28px 92px;position:relative;overflow:hidden}
      .lhelp-topbar{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:1}
      .lhelp-brand{font-size:42px;line-height:1;font-weight:800;letter-spacing:0}
      .lhelp-close{width:34px;height:34px;border:0;background:transparent;color:#fff;border-radius:9px;display:grid;place-items:center;cursor:pointer}
      .lhelp-close:hover{background:rgba(255,255,255,.12)}
      .lhelp-title{position:relative;z-index:1;margin-top:78px;font-size:33px;line-height:1.18;font-weight:750;letter-spacing:0;max-width:340px}
      .lhelp-body{background:#f6f7f9;flex:1;min-height:0;margin-top:-48px;border-top-left-radius:0;border-top-right-radius:0;display:flex;flex-direction:column;position:relative}
      .lhelp-scroll{overflow:auto;padding:0 20px 92px;flex:1}
      .lhelp-card{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:14px;box-shadow:0 14px 34px rgba(15,23,42,.08);margin-bottom:14px}
      .lhelp-support-card{padding:14px 18px;font-size:13.5px;line-height:1.5;color:#59616d}
      .lhelp-support-card strong{display:block;color:#171a1f;font-size:14px;margin-bottom:2px}
      .lhelp-support-card a{color:#009bd7;font-weight:700;text-decoration:none}
      .lhelp-status{display:flex;align-items:center;gap:14px;padding:18px 20px}
      .lhelp-recent{display:flex;align-items:center;gap:12px;padding:17px 18px}
      .lhelp-recent-mark{width:48px;height:48px;border-radius:12px;background:#111;color:#fff;display:grid;place-items:center;font-size:24px;font-weight:800;flex:none}
      .lhelp-recent-title{font-size:14px;font-weight:800;color:#171a1f;margin-bottom:3px}
      .lhelp-recent-copy{font-size:13px;color:#737b86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lhelp-status-dot{width:36px;height:36px;border-radius:50%;background:#2ecc71;color:#fff;display:grid;place-items:center;flex:none}
      .lhelp-muted{color:#727985}
      .lhelp-action{width:100%;border:0;background:#fff;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;text-align:left;font:inherit;font-weight:700;color:#1b1f25;cursor:pointer}
      .lhelp-action:hover{background:#fafbfc}
      .lhelp-blue{color:#009bd7}
      .lhelp-search{display:flex;align-items:center;gap:12px;background:#f3f4f6;border-radius:10px;padding:13px 14px;margin:10px 12px 12px}
      .lhelp-search input{border:0;outline:0;background:transparent;flex:1;font:inherit;color:#1b1f25;min-width:0}
      .lhelp-topic{display:flex;align-items:center;gap:12px;width:100%;border:0;background:#fff;padding:14px 18px;color:#6d737d;text-align:left;font:inherit;cursor:pointer;border-top:1px solid rgba(15,23,42,.06)}
      .lhelp-topic:hover{background:#fafbfc;color:#1b1f25}
      .lhelp-topic-icon{width:30px;height:30px;border-radius:9px;background:#eef8fc;color:#009bd7;display:grid;place-items:center;flex:none}
      .lhelp-nav{position:absolute;left:0;right:0;bottom:0;height:78px;background:#fff;border-top:1px solid rgba(15,23,42,.08);display:grid;grid-template-columns:repeat(3,1fr);z-index:3}
      .lhelp-nav button{border:0;background:#fff;color:#777d86;display:flex;flex-direction:column;gap:5px;align-items:center;justify-content:center;font:inherit;font-size:13px;cursor:pointer}
      .lhelp-nav button.active{color:#009bd7;font-weight:700}
      .lhelp-chat-head{height:70px;background:#fff;border-bottom:1px solid rgba(15,23,42,.08);display:flex;align-items:center;gap:12px;padding:0 18px;flex:none}
      .lhelp-back{border:0;background:transparent;color:#6b7280;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;cursor:pointer}
      .lhelp-back:hover{background:#f3f4f6}
      .lhelp-agent-mark{width:38px;height:38px;border-radius:11px;background:#111;color:#fff;display:grid;place-items:center;font-weight:800}
      .lhelp-chat-title{font-weight:750;color:#111827}
      .lhelp-chat-sub{font-size:12px;color:#737b86}
      .lhelp-menu-dots{margin-left:auto;color:#6b7280}
      .lhelp-chat{background:#fff;flex:1;min-height:0;display:flex;flex-direction:column}
      .lhelp-messages{flex:1;overflow:auto;padding:18px 22px 16px;background:#fff}
      .lhelp-note{border:1px solid #dfe4ea;border-radius:22px;padding:16px 18px;color:#68717d;line-height:1.55;margin-bottom:18px;display:flex;gap:12px}
      .lhelp-note a{color:#009bd7;font-weight:700;text-decoration:none}
      .lhelp-bubble{max-width:82%;padding:14px 16px;border-radius:18px;margin:0 0 12px;white-space:pre-wrap;line-height:1.55;font-size:14px}
      .lhelp-bubble.assistant{background:#f2f3f5;color:#1f2329;border-bottom-left-radius:6px}
      .lhelp-bubble.user{background:#111827;color:#fff;margin-left:auto;border-bottom-right-radius:6px}
      .lhelp-typing{display:inline-flex;gap:4px;align-items:center}
      .lhelp-typing span{width:6px;height:6px;background:#8c939d;border-radius:50%;animation:lhelpBlink 1s infinite ease-in-out}
      .lhelp-typing span:nth-child(2){animation-delay:.15s}.lhelp-typing span:nth-child(3){animation-delay:.3s}
      @keyframes lhelpBlink{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
      .lhelp-composer{padding:12px 18px 16px;background:#fff;border-top:1px solid rgba(15,23,42,.06);flex:none}
      .lhelp-input-wrap{border:2px solid #00a3dc;border-radius:22px;min-height:106px;padding:14px;display:flex;flex-direction:column;gap:10px}
      .lhelp-textarea{border:0;outline:0;resize:none;min-height:42px;max-height:110px;font:inherit;color:#111827;background:transparent}
      .lhelp-tools{display:flex;align-items:center;gap:16px;color:#8a9099}
      .lhelp-tool-btn{border:0;background:transparent;color:inherit;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;cursor:pointer}
      .lhelp-tool-btn:hover{background:#f1f3f5;color:#009bd7}
      .lhelp-send{margin-left:auto;width:44px;height:44px;border-radius:50%;border:0;background:#e8eaed;color:#a3a8b0;display:grid;place-items:center;cursor:pointer}
      .lhelp-send.ready{background:#009bd7;color:#fff}
      .lhelp-attachments{display:flex;gap:8px;flex-wrap:wrap}
      .lhelp-chip{display:inline-flex;align-items:center;gap:7px;max-width:100%;border:1px solid rgba(15,23,42,.1);background:#f7f8fa;color:#444b55;border-radius:999px;padding:6px 9px;font-size:12px}
      .lhelp-chip button{border:0;background:transparent;color:#7b828c;cursor:pointer;display:grid;place-items:center;padding:0}
      .lhelp-bubble .lhelp-chip{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.18);color:inherit;margin-top:8px}
      .lhelp-section-title{font-size:13px;font-weight:800;color:#8a9099;text-transform:uppercase;letter-spacing:0;margin:10px 0 12px}
      .lhelp-article{padding:16px 18px}
      .lhelp-article h4{font-size:15px;margin:0 0 5px;color:#171a1f}
      .lhelp-article p{font-size:13.5px;color:#6d737d;line-height:1.55;margin:0}
      html.dark .lhelp-panel{background:#101010;border-color:#27272a;color:#f4f4f5}
      html.dark .lhelp-body,html.dark .lhelp-scroll{background:#141414}
      html.dark .lhelp-card,html.dark .lhelp-action,html.dark .lhelp-nav,html.dark .lhelp-nav button,html.dark .lhelp-chat,html.dark .lhelp-chat-head,html.dark .lhelp-messages,html.dark .lhelp-composer{background:#101010;color:#f4f4f5;border-color:#27272a}
      html.dark .lhelp-search,html.dark .lhelp-back:hover{background:#1f1f23}
      html.dark .lhelp-search input,html.dark .lhelp-chat-title,html.dark .lhelp-article h4{color:#f4f4f5}
      html.dark .lhelp-bubble.assistant{background:#1f1f23;color:#f4f4f5}
      html.dark .lhelp-bubble.user{background:#f4f4f5;color:#111}
      html.dark .lhelp-input-wrap{border-color:#0ea5d7}
      html.dark .lhelp-support-card strong{color:#f4f4f5}
      html.dark .lhelp-recent-title{color:#f4f4f5}
      html.dark .lhelp-tool-btn:hover{background:#1f1f23}
      html.dark .lhelp-chip{background:#1f1f23;border-color:#303036;color:#d4d4d8}
      @media(max-width:640px){
        .lhelp-backdrop{background:transparent}
        .lhelp-panel{top:8px;right:8px;left:8px;width:auto;height:calc(100vh - 16px);border-radius:18px}
        .lhelp-hero{padding:26px 26px 82px}
        .lhelp-title{margin-top:58px;font-size:30px}
        .lhelp-scroll{padding-left:16px;padding-right:16px}
        .lhelp-bubble{max-width:92%}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureShell() {
    if (document.getElementById('lancify-help-panel')) return;
    ensureStyles();

    const backdrop = document.createElement('div');
    backdrop.className = 'lhelp-backdrop';
    backdrop.id = 'lancify-help-backdrop';
    backdrop.addEventListener('click', closeHelp);
    document.body.appendChild(backdrop);

    const panel = document.createElement('section');
    panel.className = 'lhelp-panel';
    panel.id = 'lancify-help-panel';
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = '<div id="lancify-help-view"></div>';
    document.body.appendChild(panel);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && HELP_STATE.open) closeHelp();
    });
  }

  function render() {
    ensureShell();
    const view = document.getElementById('lancify-help-view');
    if (!view) return;
    if (HELP_STATE.tab === 'messages') {
      view.outerHTML = renderMessagesView();
    } else {
      view.outerHTML = renderHomeLikeView();
    }
    bindEvents();
    if (window.lucide) window.lucide.createIcons();
  }

  function renderHomeLikeView() {
    const isHelp = HELP_STATE.tab === 'help';
    return `
      <div id="lancify-help-view" style="height:100%;display:flex;flex-direction:column;position:relative;">
        <div class="lhelp-hero">
          <div class="lhelp-topbar">
            <div class="lhelp-brand">AI</div>
            <button class="lhelp-close" data-help-close aria-label="Close">${icon('x', 22)}</button>
          </div>
          <div class="lhelp-title">${isHelp ? 'Helpful answers for Lancify.' : 'Need support?<br>How can we help?'}</div>
        </div>
        <div class="lhelp-body">
          <div class="lhelp-scroll">
            ${isHelp ? renderHelpArticles() : renderHomeContent()}
          </div>
          ${renderNav()}
        </div>
      </div>
    `;
  }

  function renderHomeContent() {
    return `
      <div class="lhelp-card lhelp-recent" data-help-tab="messages" role="button" tabindex="0">
        <div class="lhelp-recent-mark">L</div>
        <div style="min-width:0;flex:1">
          <div class="lhelp-recent-title">Recent message</div>
          <div class="lhelp-recent-copy">Lancify AI Agent · Fast help for your workspace</div>
        </div>
        <span class="lhelp-muted" style="font-size:12px">now</span>
      </div>
      <div class="lhelp-card lhelp-status">
        <div class="lhelp-status-dot">${icon('check', 22)}</div>
        <div>
          <div><strong>Status:</strong> All Systems Operational</div>
          <div class="lhelp-muted">Lancify AI support is ready</div>
        </div>
      </div>
      <div class="lhelp-card lhelp-support-card">
        <strong>Issue not solved?</strong>
        Contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. We reply within 1 hour.
      </div>
      <div class="lhelp-card">
        <button class="lhelp-action" data-help-tab="messages">
          <span>Send us a message</span>
          <span class="lhelp-blue">${icon('send-horizontal', 22)}</span>
        </button>
      </div>
      <div class="lhelp-card">
        <form class="lhelp-search" data-help-search>
          ${icon('search', 20)}
          <input type="search" name="query" placeholder="Search for help" autocomplete="off">
        </form>
        ${quickTopics.map(topic => `
          <button class="lhelp-topic" data-help-topic="${esc(topic.text)}">
            <span class="lhelp-topic-icon">${icon(topic.icon, 16)}</span>
            <span>${esc(topic.title)}</span>
            <span style="margin-left:auto;color:#009bd7">${icon('chevron-right', 18)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderHelpArticles() {
    return `
      <div class="lhelp-card" style="padding:18px 20px;margin-bottom:16px">
        <div class="lhelp-section-title" style="margin-top:0">Lancify Guide</div>
        <div style="font-size:24px;font-weight:800;letter-spacing:0;line-height:1.15;margin-bottom:8px">Quick fixes and best-practice answers</div>
        <div class="lhelp-muted" style="line-height:1.55">Open a message for personalized help, or use these common answers to unblock yourself fast.</div>
      </div>
      ${helpArticles.map(article => `
        <div class="lhelp-card lhelp-article">
          <h4>${esc(article.title)}</h4>
          <p>${esc(article.body)}</p>
        </div>
      `).join('')}
    `;
  }

  function renderAttachmentChips(attachments = [], removable = false) {
    if (!attachments.length) return '';
    return `
      <div class="lhelp-attachments">
        ${attachments.map(file => `
          <span class="lhelp-chip">
            ${icon(file.kind === 'image' ? 'image' : 'paperclip', 13)}
            <span>${esc(file.name)} · ${esc(formatBytes(file.size))}</span>
            ${removable ? `<button type="button" data-help-remove-attachment="${esc(file.id)}" aria-label="Remove ${esc(file.name)}">${icon('x', 13)}</button>` : ''}
          </span>
        `).join('')}
      </div>
    `;
  }

  function renderMessagesView() {
    return `
      <div id="lancify-help-view" style="height:100%;display:flex;flex-direction:column;">
        <div class="lhelp-chat-head">
          <button class="lhelp-back" data-help-tab="home" aria-label="Back">${icon('chevron-left', 22)}</button>
          <div class="lhelp-agent-mark">L</div>
          <div>
            <div class="lhelp-chat-title">Lancify AI Agent</div>
            <div class="lhelp-chat-sub">Groq-powered support</div>
          </div>
          <div class="lhelp-menu-dots">${icon('more-horizontal', 21)}</div>
          <button class="lhelp-back" data-help-close aria-label="Close">${icon('x', 22)}</button>
        </div>
        <div class="lhelp-chat">
          <div class="lhelp-messages" id="lhelp-messages">
            <div style="text-align:center;color:#757c86;margin:6px 0 24px">Contact support</div>
            <div class="lhelp-note">
              <span class="lhelp-blue">${icon('info', 20)}</span>
              <span>I can help with Lancify setup, proposal writing, lead finding, CRM, invoices, credits, billing questions, and errors inside the app. If the issue is not solved, contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. We reply within 1 hour.</span>
            </div>
            ${HELP_STATE.messages.map(msg => `
              <div class="lhelp-bubble ${msg.role === 'user' ? 'user' : 'assistant'}">
                ${esc(msg.content)}
                ${renderAttachmentChips(msg.attachments || [], false)}
              </div>
            `).join('')}
            ${HELP_STATE.busy ? '<div class="lhelp-bubble assistant"><span class="lhelp-typing"><span></span><span></span><span></span></span></div>' : ''}
          </div>
          <form class="lhelp-composer" data-help-compose>
            <div class="lhelp-input-wrap">
              <textarea class="lhelp-textarea" name="message" placeholder="Message..." rows="2"></textarea>
              ${renderAttachmentChips(HELP_STATE.pendingAttachments, true)}
              <div class="lhelp-tools">
                <input type="file" data-help-file-input multiple style="display:none">
                <input type="file" data-help-image-input accept="image/*" multiple style="display:none">
                <button class="lhelp-tool-btn" type="button" data-help-add-files title="Attach files">${icon('paperclip', 19)}</button>
                <button class="lhelp-tool-btn" type="button" data-help-add-images title="Attach images">${icon('image', 19)}</button>
                ${icon('mic', 19)}
                <button class="lhelp-send" type="submit" aria-label="Send message">${icon('arrow-up', 21)}</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderNav() {
    return `
      <div class="lhelp-nav">
        <button class="${HELP_STATE.tab === 'home' ? 'active' : ''}" data-help-tab="home">${icon('inbox', 22)}<span>Home</span></button>
        <button class="${HELP_STATE.tab === 'messages' ? 'active' : ''}" data-help-tab="messages">${icon('message-square', 22)}<span>Messages</span></button>
        <button class="${HELP_STATE.tab === 'help' ? 'active' : ''}" data-help-tab="help">${icon('circle-help', 22)}<span>Help</span></button>
      </div>
    `;
  }

  function bindEvents() {
    document.querySelectorAll('[data-help-close]').forEach(btn => btn.addEventListener('click', closeHelp));
    document.querySelectorAll('[data-help-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        HELP_STATE.tab = btn.getAttribute('data-help-tab') || 'home';
        render();
        scrollMessagesToBottom();
      });
    });
    document.querySelectorAll('[data-help-topic]').forEach(btn => {
      btn.addEventListener('click', () => {
        HELP_STATE.tab = 'messages';
        render();
        sendMessage(btn.getAttribute('data-help-topic') || '');
      });
    });

    const search = document.querySelector('[data-help-search]');
    if (search) {
      search.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(search);
        const query = String(data.get('query') || '').trim();
        if (!query) return;
        HELP_STATE.tab = 'messages';
        render();
        sendMessage(query);
      });
    }

    const compose = document.querySelector('[data-help-compose]');
    if (compose) {
      const textarea = compose.querySelector('textarea');
      const send = compose.querySelector('.lhelp-send');
      const fileInput = compose.querySelector('[data-help-file-input]');
      const imageInput = compose.querySelector('[data-help-image-input]');
      const syncReady = () => send?.classList.toggle('ready', !!textarea?.value.trim() || HELP_STATE.pendingAttachments.length > 0);
      compose.querySelector('[data-help-add-files]')?.addEventListener('click', () => fileInput?.click());
      compose.querySelector('[data-help-add-images]')?.addEventListener('click', () => imageInput?.click());
      fileInput?.addEventListener('change', () => { addPendingAttachments(fileInput.files); fileInput.value = ''; });
      imageInput?.addEventListener('change', () => { addPendingAttachments(imageInput.files); imageInput.value = ''; });
      compose.querySelectorAll('[data-help-remove-attachment]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-help-remove-attachment');
          HELP_STATE.pendingAttachments = HELP_STATE.pendingAttachments.filter(file => file.id !== id);
          render();
        });
      });
      textarea?.addEventListener('input', syncReady);
      textarea?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          compose.requestSubmit();
        }
      });
      compose.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = textarea?.value.trim();
        const attachments = HELP_STATE.pendingAttachments.slice();
        if ((!text && !attachments.length) || HELP_STATE.busy) return;
        textarea.value = '';
        HELP_STATE.pendingAttachments = [];
        syncReady();
        sendMessage(text || 'Please review the attached file or image and help me fix this Lancify issue.', attachments);
      });
      syncReady();
      setTimeout(() => textarea?.focus(), 20);
    }
  }

  function openHelp(tab = 'home') {
    ensureShell();
    HELP_STATE.open = true;
    HELP_STATE.tab = tab;
    render();
    document.getElementById('lancify-help-backdrop')?.classList.add('show');
    document.getElementById('lancify-help-panel')?.classList.add('show');
    scrollMessagesToBottom();
  }

  function closeHelp() {
    HELP_STATE.open = false;
    document.getElementById('lancify-help-backdrop')?.classList.remove('show');
    document.getElementById('lancify-help-panel')?.classList.remove('show');
  }

  function scrollMessagesToBottom() {
    const box = document.getElementById('lhelp-messages');
    if (box) box.scrollTop = box.scrollHeight;
  }

  async function addPendingAttachments(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const slots = Math.max(0, 5 - HELP_STATE.pendingAttachments.length);
    const selected = files.slice(0, slots);
    if (!selected.length) return;

    try {
      const built = await Promise.all(selected.map(buildAttachment));
      HELP_STATE.pendingAttachments = HELP_STATE.pendingAttachments.concat(built);
      render();
    } catch (error) {
      HELP_STATE.messages.push({
        role: 'assistant',
        content: `I could not attach that file. Try a smaller image or paste the relevant text. For urgent file-related issues, email ${SUPPORT_EMAIL}.`,
      });
      render();
    }
  }

  async function sendMessage(text, attachments = []) {
    if (!text || HELP_STATE.busy) return;
    HELP_STATE.messages.push({ role: 'user', content: text, attachments });
    HELP_STATE.busy = true;
    render();
    scrollMessagesToBottom();

    try {
      const response = await fetch('/api/gethelp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: HELP_STATE.messages.slice(0, -1).slice(-10),
          context: getAppContext(),
          attachments,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Help request failed.');

      HELP_STATE.messages.push({
        role: 'assistant',
        content: data.reply || 'I could not generate a full answer, but try refreshing Lancify and sending the exact error again.',
      });
    } catch (error) {
      HELP_STATE.messages.push({
        role: 'assistant',
        content: `I could not reach Lancify AI support right now. Quick fix: refresh the app, check your plan and credits, then try again. If this is urgent or pricing-related, email ${SUPPORT_EMAIL}; we reply within 1 hour.\n\nTechnical detail: ${error.message}`,
      });
    } finally {
      HELP_STATE.busy = false;
      render();
      scrollMessagesToBottom();
    }
  }

  window.openLancifyHelp = openHelp;
  window.closeLancifyHelp = closeHelp;
  window.LancifyHelp = { open: openHelp, close: closeHelp };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureShell);
  } else {
    ensureShell();
  }
})();
