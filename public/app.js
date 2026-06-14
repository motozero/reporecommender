const form = document.getElementById("form");
const submit = document.getElementById("submit");
const statusEl = document.getElementById("status");
const sourceEl = document.getElementById("source");
const resultsEl = document.getElementById("results");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const repoUrl = document.getElementById("repoUrl").value.trim();
  const goal = document.getElementById("goal").value.trim();
  if (!repoUrl || !goal) return;

  setBusy(true);
  showStatus("Reading the repo, then searching GitHub for complements. This takes a few seconds.");
  sourceEl.hidden = true;
  resultsEl.innerHTML = "";

  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repoUrl, goal }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    render(data);
  } catch (err) {
    showStatus(err.message || "Something went wrong.", true);
  } finally {
    setBusy(false);
  }
});

function render(data) {
  if (data.source) {
    sourceEl.innerHTML = `
      <h2>${escapeHtml(data.source.fullName)}</h2>
      <p>${escapeHtml(data.source.purpose)}</p>
      <div class="stack">${(data.source.stack || [])
        .map((s) => `<span class="chip">${escapeHtml(s)}</span>`)
        .join("")}</div>`;
    sourceEl.hidden = false;
  }

  const recs = data.recommendations || [];
  if (recs.length === 0) {
    showStatus("No complements found for that goal. Try rephrasing it.", false);
    return;
  }
  showStatus(`${recs.length} complements for "${escapeHtml(data.goal)}".`);
  resultsEl.innerHTML = recs.map(card).join("");
}

function card(r, i) {
  return `
    <article class="card">
      <div class="head">
        <span class="rank">#${i + 1}</span>
        <span class="stars">★ ${formatStars(r.stars)}</span>
      </div>
      <a class="name" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.fullName)}</a>
      <span class="lang">${escapeHtml(r.language || "")}</span>
      <p class="line"><b>What:</b> ${escapeHtml(r.whatIsIt || "")}</p>
      <p class="line"><b>Why:</b> ${escapeHtml(r.why || "")}</p>
      <p class="line"><b>How:</b> ${escapeHtml(r.how || "")}</p>
      <div class="ratings">
        ${ratingRow("Ease", r.ratings.easeOfUse)}
        ${ratingRow("Impact", r.ratings.impact)}
      </div>
      <div class="metrics">
        <span>Updated ${relativeTime(r.lastUpdated)}</span>
        <span>${metricNum(r.velocity90d)} commits/90d</span>
        <span>${metricNum(r.forks)} forks</span>
        <span>${metricNum(r.contributors)} contributors</span>
      </div>
    </article>`;
}

function relativeTime(iso) {
  if (!iso) return "unknown";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + "d ago";
  if (days < 365) return Math.floor(days / 30) + "mo ago";
  return Math.floor(days / 365) + "y ago";
}

function metricNum(n) {
  if (n === null || n === undefined) return "n/a";
  return formatStars(n);
}

function ratingRow(label, value) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  const color = value >= 4 ? "var(--green)" : value >= 3 ? "var(--amber)" : "var(--red)";
  return `<span class="rate">${label}<span class="bar"><i style="width:${pct}%;background:${color}"></i></span></span>`;
}

function formatStars(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function setBusy(busy) {
  submit.disabled = busy;
  submit.textContent = busy ? "Working..." : "Find complements";
}

function showStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", Boolean(isError));
  statusEl.hidden = false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function escapeAttr(s) {
  return escapeHtml(s);
}
