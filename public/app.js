// Step zero: confirm the Worker API is reachable from the static frontend.
// This file grows into the real form + card grid in the frontend lesson.
async function checkHealth() {
  const status = document.getElementById("status");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.ok) {
      status.textContent = `Step zero is live. API healthy (v${data.version}).`;
    }
  } catch {
    status.textContent = "Step zero is live. API not reachable yet.";
  }
}

checkHealth();
