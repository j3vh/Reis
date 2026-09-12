// Lichte toegangsdrempel, geen echte beveiliging: de site en de media zijn
// via GitHub Pages voor iedereen met de link technisch bereikbaar. Dit
// scherm houdt alleen toevallige bezoekers en zoekmachines buiten.
// Wachtwoord wijzigen: open wachtwoord-hash.html, genereer een nieuwe hash
// en vervang PASSWORD_HASH hieronder.
const PASSWORD_HASH = "ca4e77f4a691875ef92cdbd114ac8a1b11761443e5d8c967543a6c72531b8ca3";
const SESSION_KEY = "noordzee-reis-toegang";

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function showApp() {
  document.getElementById("gate").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.dispatchEvent(new Event("gate-passed"));
}

if (sessionStorage.getItem(SESSION_KEY) === "ok") {
  showApp();
} else {
  document.getElementById("gate-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("gate-password");
    const errorEl = document.getElementById("gate-error");
    const hash = await sha256(input.value);
    if (hash === PASSWORD_HASH) {
      sessionStorage.setItem(SESSION_KEY, "ok");
      showApp();
    } else {
      errorEl.textContent = "Onjuist wachtwoord, probeer opnieuw.";
      input.value = "";
      input.focus();
    }
  });
}
