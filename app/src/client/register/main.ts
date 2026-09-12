const loadingEl = document.getElementById("register-loading")!;
const invalidView = document.getElementById("register-view-invalid")!;
const formView = document.getElementById("register-view-form")!;

function getToken(): string | null {
  return new URLSearchParams(window.location.search).get("token");
}

document.getElementById("register-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = getToken();
  const username = (document.getElementById("register-username") as HTMLInputElement).value;
  const password = (document.getElementById("register-password") as HTMLInputElement).value;
  const errorEl = document.getElementById("register-error")!;

  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, username, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    errorEl.textContent = body.error === "username_taken" ? "Die gebruikersnaam is al in gebruik." : "Er ging iets mis, probeer het opnieuw.";
    errorEl.hidden = false;
    return;
  }

  window.location.href = "/parent.html";
});

async function init() {
  const token = getToken();
  loadingEl.hidden = false;

  if (!token) {
    loadingEl.hidden = true;
    invalidView.hidden = false;
    return;
  }

  const res = await fetch(`/api/register/${encodeURIComponent(token)}`);
  const { valid } = await res.json();

  loadingEl.hidden = true;
  if (valid) {
    formView.hidden = false;
  } else {
    invalidView.hidden = false;
  }
}

init();
