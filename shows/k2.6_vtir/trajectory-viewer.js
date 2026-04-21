(function () {
  const runs = [
    {
      id: "knight",
      tab: "Knight Tour",
      title: "Knight Tour Grid",
      runId: "run_20260422_030423",
      image: "trajectories/run_20260422_030423/image2.png",
      messages: "trajectories/run_20260422_030423/messages.json",
      prompt: "Number steps on a knights tour of the grid from 1 to 60.",
      artifact: "Knight path"
    },
    {
      id: "shadow",
      tab: "Hedgehog Shadow",
      title: "Shadow Match",
      runId: "run_20260422_042510",
      image: "trajectories/run_20260422_042510/image.jpg",
      messages: "trajectories/run_20260422_042510/messages.json",
      prompt: "Find the shadow that perfectly matches the hedgehog pattern above.",
      artifact: "IoU ranking"
    }
  ];

  const state = {
    activeRun: runs[0].id,
    activeFilters: new Map()
  };

  const roleCopy = {
    user: { label: "User", dot: "U" },
    assistant: { label: "Assistant", dot: "A" },
    tool: { label: "Tool", dot: "T" }
  };

  const escapeHtml = (value) => String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const stripAnsi = (value) => String(value || "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");

  const compactNumber = (value) => new Intl.NumberFormat("en", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0
  }).format(value);

  const normalizeItems = (message) => {
    if (Array.isArray(message.content)) {
      return message.content;
    }

    if (typeof message.content === "string") {
      return [{ type: "text", text: message.content }];
    }

    return [];
  };

  const itemText = (item) => {
    if (!item) {
      return "";
    }
    if (item.type === "text") {
      return item.text || "";
    }
    if (typeof item === "string") {
      return item;
    }
    return "";
  };

  const messageText = (message) => stripAnsi(
    normalizeItems(message)
      .map(itemText)
      .filter(Boolean)
      .join("\n")
      .replace(/^User uploaded an image at .*\n?/m, "")
      .trim()
  );

  const messageImages = (message, run, index) => normalizeItems(message)
    .filter((item) => item && item.type === "image_url" && item.image_url && item.image_url.url)
    .map((item, imageIndex) => {
      const isInput = message.role === "user" && index === 0 && imageIndex === 0;
      return {
        src: isInput ? run.image : item.image_url.url,
        label: isInput ? "Input image" : "Visual artifact"
      };
    });

  const finalAnswer = (messages) => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === "assistant") {
        const text = messageText(messages[index]);
        if (text) {
          return text;
        }
      }
    }
    return "";
  };

  const summarize = (messages) => {
    const counts = messages.reduce((acc, message) => {
      acc[message.role] = (acc[message.role] || 0) + 1;
      acc.reasoning += (message.reasoning_content || "").length;
      acc.images += normalizeItems(message).filter((item) => item.type === "image_url").length;
      return acc;
    }, { user: 0, assistant: 0, tool: 0, reasoning: 0, images: 0 });

    return {
      steps: counts.assistant,
      user: counts.user,
      assistant: counts.assistant,
      tool: counts.tool,
      reasoning: counts.reasoning,
      images: counts.images
    };
  };

  const findKnightGrid = (messages) => {
    const gridLine = /^\s*(?:#|\d+)(?:\s+(?:#|\d+)){7}\s*$/;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const lines = messageText(messages[i]).split("\n").filter((line) => gridLine.test(line));
      if (lines.length >= 8) {
        return lines.slice(0, 8).map((line) => line.trim().split(/\s+/));
      }
    }
    return null;
  };

  const renderKnightBoard = (grid) => {
    if (!grid) {
      return "<div class=\"loading-state\">No Knight Tour grid was found in the tool trace.</div>";
    }

    const positions = new Map();
    const cells = grid.flatMap((row, rowIndex) => row.map((value, colIndex) => {
      const number = Number(value);
      if (!Number.isNaN(number)) {
        positions.set(number, [colIndex + 0.5, rowIndex + 0.5]);
      }
      const cellClass = [
        "knight-cell",
        value === "#" ? "blocked" : "",
        number === 1 ? "start" : "",
        number === 60 ? "end" : ""
      ].filter(Boolean).join(" ");
      return `<div class="${cellClass}">${escapeHtml(value)}</div>`;
    })).join("");

    const points = Array.from(positions.keys())
      .sort((a, b) => a - b)
      .map((key) => positions.get(key).join(","))
      .join(" ");

    return `
      <div class="knight-board-wrap">
        <div class="knight-board" aria-label="Knight Tour path from 1 to 60">
          <svg class="knight-path" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="${points}" fill="none" stroke="rgba(45, 212, 191, 0.78)" stroke-width="0.055" stroke-linecap="round" stroke-linejoin="round"></polyline>
            <circle cx="${positions.get(1)[0]}" cy="${positions.get(1)[1]}" r="0.14" fill="#2dd4bf"></circle>
            <circle cx="${positions.get(60)[0]}" cy="${positions.get(60)[1]}" r="0.14" fill="#f59e0b"></circle>
          </svg>
          ${cells}
        </div>
      </div>
    `;
  };

  const parseIouRows = (messages) => {
    const rows = [];
    const pattern = /^([A-F]) IoU=([0-9.]+), diff=([0-9]+), inter=([0-9]+), union=([0-9]+)/gm;
    messages.forEach((message) => {
      const text = messageText(message);
      let match = pattern.exec(text);
      while (match) {
        rows.push({
          label: match[1],
          iou: Number(match[2]),
          diff: Number(match[3]),
          inter: Number(match[4]),
          union: Number(match[5])
        });
        match = pattern.exec(text);
      }
    });
    return rows;
  };

  const renderIouChart = (rows) => {
    if (!rows.length) {
      return "<div class=\"loading-state\">No IoU comparison was found in the tool trace.</div>";
    }
    const best = rows.reduce((winner, row) => row.iou > winner.iou ? row : winner, rows[0]);
    return `
      <div class="iou-list" aria-label="Shadow candidate IoU scores">
        ${rows.map((row) => `
          <div class="iou-row ${row.label === best.label ? "best" : ""}">
            <span class="iou-label">${row.label}</span>
            <span class="iou-track">
              <span class="iou-fill" style="width: ${Math.max(0, Math.min(100, row.iou * 100)).toFixed(1)}%"></span>
            </span>
            <strong>${row.iou.toFixed(4)}</strong>
          </div>
        `).join("")}
      </div>
    `;
  };

  const renderTaskVisual = (run, messages) => {
    if (run.id === "knight") {
      return `
        <div class="visual-grid">
          <div class="visual-card">${renderKnightBoard(findKnightGrid(messages))}</div>
          <div class="visual-card">
            <h3 class="section-title">Final Answer</h3>
            <pre class="answer-pre">${escapeHtml(finalAnswer(messages))}</pre>
          </div>
        </div>
      `;
    }

    if (run.id === "shadow") {
      return `
        <div class="visual-grid shadow-visual-grid">
          <div class="visual-card">
            <figure class="key-figure">
              <img src="trajectories/run_20260422_042510/shadow_matching.png" alt="Shadow matching difference grid" loading="lazy" decoding="async" />
            </figure>
            <h3 class="section-title">Candidate Ranking</h3>
            ${renderIouChart(parseIouRows(messages))}
          </div>
          <div class="visual-card">
            <h3 class="section-title">Final Answer</h3>
            <pre class="answer-pre">${escapeHtml(finalAnswer(messages))}</pre>
          </div>
        </div>
      `;
    }

    return "";
  };

  const renderMetricGrid = (summary) => `
    <div class="metric-grid" aria-label="Run metrics">
      <div class="metric"><span>Steps</span><strong>${summary.steps}</strong></div>
      <div class="metric"><span>Tool Calls</span><strong>${summary.tool}</strong></div>
      <div class="metric"><span>Images</span><strong>${summary.images}</strong></div>
    </div>
  `;

  const renderStepText = (message, run, index) => {
    const text = messageText(message);
    const reasoning = stripAnsi(message.reasoning_content || "").trim();
    const images = messageImages(message, run, index);
    const isTool = message.role === "tool";

    const visibleText = text
      ? isTool
        ? `<pre class="tool-pre">${escapeHtml(text)}</pre>`
        : `<p class="trace-text">${escapeHtml(text)}</p>`
      : "";

    const reasoningHtml = reasoning ? `
      <details class="reasoning-box">
        <summary>Reasoning trace (${compactNumber(reasoning.length)} chars)</summary>
        <p class="trace-text">${escapeHtml(reasoning)}</p>
      </details>
    ` : "";

    const imagesHtml = images.length ? `
      <div class="message-images">
        ${images.map((image) => `
          <img src="${image.src}" alt="${escapeHtml(image.label)}" loading="lazy" decoding="async" />
        `).join("")}
      </div>
    ` : "";

    if (!visibleText && !reasoningHtml && !imagesHtml) {
      return "<p class=\"trace-text\">Visual artifact recorded.</p>";
    }

    return `${visibleText}${imagesHtml}${reasoningHtml}`;
  };

  const renderTimeline = (run, messages) => {
    const filters = ["all", "user", "assistant", "tool"];
    const selected = state.activeFilters.get(run.id) || "all";

    const steps = messages.map((message, index) => {
      const role = roleCopy[message.role] || { label: message.role, dot: "?" };
      const hidden = selected !== "all" && message.role !== selected;
      const imageCount = messageImages(message, run, index).length;
      const reasoningLength = (message.reasoning_content || "").length;
      return `
        <article class="trace-step role-${escapeHtml(message.role)}" data-role="${escapeHtml(message.role)}" ${hidden ? "hidden" : ""}>
          <div class="step-dot">${role.dot}</div>
          <div class="step-card">
            <div class="step-meta">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <span>${role.label}</span>
              ${imageCount ? `<span>${imageCount} image${imageCount > 1 ? "s" : ""}</span>` : ""}
              ${reasoningLength ? `<span>${compactNumber(reasoningLength)} chars</span>` : ""}
            </div>
            ${renderStepText(message, run, index)}
          </div>
        </article>
      `;
    }).join("");

    return `
      <section class="trace-panel" aria-labelledby="${run.id}-trace-title">
        <div class="trace-head">
          <h2 class="section-title" id="${run.id}-trace-title">Message Trace</h2>
          <div class="trace-actions" role="group" aria-label="${run.title} trace filters">
            ${filters.map((filter) => `
              <button class="trace-filter ${filter === selected ? "active" : ""}" type="button" data-run="${run.id}" data-filter="${filter}">
                ${filter === "all" ? "All" : roleCopy[filter].label}
              </button>
            `).join("")}
          </div>
        </div>
        <div class="timeline">${steps}</div>
      </section>
    `;
  };

  const renderRun = (run, messages, isActive) => {
    const summary = summarize(messages);
    return `
      <section class="run-panel ${isActive ? "active" : ""}" id="panel-${run.id}" role="tabpanel" aria-labelledby="tab-${run.id}">
        <div class="run-overview">
          <figure class="media-card">
            <div class="media-frame">
              <img src="${run.image}" alt="${escapeHtml(run.title)} input" loading="lazy" decoding="async" />
            </div>
            <figcaption class="media-meta">
              <span class="pill">${escapeHtml(run.runId)}</span>
              <span class="pill">${escapeHtml(run.artifact)}</span>
            </figcaption>
          </figure>

          <div class="task-card">
            <div>
              <h2 class="section-title">${escapeHtml(run.title)}</h2>
              <p class="task-prompt">${escapeHtml(run.prompt)}</p>
            </div>
            ${renderMetricGrid(summary)}
            ${renderTaskVisual(run, messages)}
          </div>
        </div>
        ${renderTimeline(run, messages)}
      </section>
    `;
  };

  const renderTabs = (loadedRuns) => {
    const tabs = document.getElementById("run-tabs");
    tabs.innerHTML = loadedRuns.map(({ run }) => `
      <button
        class="run-tab"
        id="tab-${run.id}"
        type="button"
        role="tab"
        aria-selected="${run.id === state.activeRun ? "true" : "false"}"
        aria-controls="panel-${run.id}"
        data-run-tab="${run.id}">
        ${escapeHtml(run.tab)}
      </button>
    `).join("");
  };

  const setActiveRun = (runId) => {
    state.activeRun = runId;
    document.querySelectorAll("[data-run-tab]").forEach((button) => {
      const selected = button.dataset.runTab === runId;
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
    document.querySelectorAll(".run-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${runId}`);
    });
  };

  const bindEvents = () => {
    document.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-run-tab]");
      if (tab) {
        setActiveRun(tab.dataset.runTab);
        return;
      }

      const filter = event.target.closest("[data-filter]");
      if (filter) {
        const runId = filter.dataset.run;
        const value = filter.dataset.filter;
        state.activeFilters.set(runId, value);
        const panel = document.getElementById(`panel-${runId}`);
        panel.querySelectorAll(".trace-filter").forEach((button) => {
          button.classList.toggle("active", button.dataset.filter === value);
        });
        panel.querySelectorAll(".trace-step").forEach((step) => {
          step.hidden = value !== "all" && step.dataset.role !== value;
        });
      }
    });
  };

  const load = async () => {
    const root = document.getElementById("runs-root");
    try {
      const loadedRuns = await Promise.all(runs.map(async (run) => {
        const response = await fetch(run.messages);
        if (!response.ok) {
          throw new Error(`${run.messages}: ${response.status}`);
        }
        return { run, messages: await response.json() };
      }));

      renderTabs(loadedRuns);
      root.innerHTML = loadedRuns
        .map((item) => renderRun(item.run, item.messages, item.run.id === state.activeRun))
        .join("");
      bindEvents();
      setActiveRun(state.activeRun);
    } catch (error) {
      root.innerHTML = `<div class="error-state">Failed to load trajectories: ${escapeHtml(error.message)}</div>`;
    }
  };

  document.addEventListener("DOMContentLoaded", load);
})();
