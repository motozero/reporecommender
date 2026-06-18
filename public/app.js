// One script, loaded on the home page and the contact page. Each block guards on
// the element it needs, so it is safe wherever it runs.

const form = document.getElementById("form");
const submit = document.getElementById("submit");
const statusEl = document.getElementById("status");
const sourceEl = document.getElementById("source");
const resultsEl = document.getElementById("results");

// Home page: the recommender.
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(document.getElementById("repoUrl").value.trim(), document.getElementById("goal").value.trim());
  });

  // Example buttons fill the form and run it, so a first-time visitor sees a real
  // result without having to think of an input.
  document.querySelectorAll(".example").forEach((btn) => {
    btn.addEventListener("click", () => {
      const site = btn.getAttribute("data-site");
      const goal = btn.getAttribute("data-goal");
      document.getElementById("repoUrl").value = site;
      document.getElementById("goal").value = goal;
      run(site, goal);
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function run(repoUrl, goal) {
  if (!repoUrl || !goal) return;
  setBusy(true);
  showStatus("Reading your site, then searching GitHub for projects that add this. This takes a few seconds.");
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
}

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
    showStatus("Nothing found for that goal. Try rephrasing it.", false);
    return;
  }
  showStatus(`${recs.length} projects to add "${escapeHtml(data.goal)}".`);
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
  submit.textContent = busy ? "Working..." : "Find enhancements";
}

function showStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", Boolean(isError));
  statusEl.hidden = false;
}

// Contact page: post to the Resend-backed endpoint.
const contactForm = document.getElementById("contact-form");
if (contactForm) {
  const contactStatus = document.getElementById("contact-status");
  const contactSubmit = document.getElementById("contact-submit");

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      message: document.getElementById("message").value.trim(),
      website: document.getElementById("website").value.trim(), // honeypot
    };
    if (!payload.name || !payload.email || !payload.message) return;

    contactSubmit.disabled = true;
    contactSubmit.textContent = "Sending...";
    setContactStatus("Sending your message.");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Could not send (${res.status}).`);
      contactForm.reset();
      setContactStatus("Thanks. Your message is on its way.");
    } catch (err) {
      setContactStatus(err.message || "Something went wrong.", true);
    } finally {
      contactSubmit.disabled = false;
      contactSubmit.textContent = "Send";
    }
  });

  function setContactStatus(msg, isError) {
    contactStatus.textContent = msg;
    contactStatus.classList.toggle("error", Boolean(isError));
    contactStatus.hidden = false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function escapeAttr(s) {
  return escapeHtml(s);
}
