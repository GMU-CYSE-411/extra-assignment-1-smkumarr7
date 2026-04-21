// The following function enables session fixation, which allows an attacker to send a login link with a certain session ID, force the victim to log in using that session, and then use the same session ID to access the victim's account.
// Due to this reason, I will comment out the function.
/*
(function setupFixationHelper() {
  const params = new URLSearchParams(window.location.search);
  const fixedSession = params.get("sid");

  if (fixedSession) {
    document.cookie = `sid=${fixedSession}; path=/`;
  }
})();
*/

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());

  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    writeJson("login-output", result);
  } catch (error) {
    writeJson("login-output", { error: error.message });
  }
});
