async function loadSettings(userId) {
  const result = await api(`/api/settings?userId=${encodeURIComponent(userId)}`);
  const settings = result.settings;

  document.getElementById("settings-form-user-id").value = settings.userId;
  document.getElementById("settings-user-id").value = settings.userId;

  const form = document.getElementById("settings-form");
  form.elements.displayName.value = settings.displayName;
  form.elements.theme.value = settings.theme;
  form.elements.statusMessage.value = settings.statusMessage;
  form.elements.emailOptIn.checked = Boolean(settings.emailOptIn);
  // The following line is vulnerable to XSS due to the use of innerHTML.
  // As a result, we need to use DOM creation and textContent.
  /* document.getElementById("status-preview").innerHTML = `
    <p><strong>${settings.displayName}</strong></p>
    <p>${settings.statusMessage}</p>
  `;
  */

  // This chunk of code creates DOM elements which display the user's display name and status message.
  const statusPreview = document.getElementById("status-preview");
  statusPreview.innerHTML = "";

  // This chunk of code creates two paragraph elements for the display name and status message and sets their text content to the corresponding values from the settings object.
  const displayNameElement = document.createElement("p");
  displayNameElement.innerHTML = `<strong>${settings.displayName}</strong>`;
  const statusMessageElement = document.createElement("p");
  statusMessageElement.textContent = settings.statusMessage;

  // This chunk of code appends the display name and status message elements to the status preview element.
  statusPreview.appendChild(displayNameElement);
  statusPreview.appendChild(statusMessageElement);

  writeJson("settings-output", settings);
}

(async function bootstrapSettings() {
  try {
    const user = await loadCurrentUser();

    if (!user) {
      writeJson("settings-output", { error: "Please log in first." });
      return;
    }

    await loadSettings(user.id);
  } catch (error) {
    writeJson("settings-output", { error: error.message });
  }
})();

document.getElementById("settings-query-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  await loadSettings(formData.get("userId"));
});

document.getElementById("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  // I will remove userId from the payload since it can be modified to update another user's settings (IDOR vulnerability).
  const payload = {
    // userId: formData.get("userId"),
    displayName: formData.get("displayName"),
    theme: formData.get("theme"),
    statusMessage: formData.get("statusMessage"),
    emailOptIn: formData.get("emailOptIn") === "on"
  };

  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  writeJson("settings-output", result);
  await loadSettings(payload.userId);
});

// The following code is vulnerable to CSRF as it allows any website to make a GET request to the toggle-email endpoint and change the user's email preferences without their knowledge.
/* document.getElementById("enable-email").addEventListener("click", async () => {
  const result = await api("/api/settings/toggle-email?enabled=1");
  writeJson("settings-output", result);
});
*/
// To fix the CSRF vulnerability, I will change the method to POST and include a valid session cookie for authentication.
// This chunk of code adds an event listener that adds a click event listener to the "enable-email" button.
document.getElementById("enable-email").addEventListener("click", async () => {
  const result = await api("/api/settings/toggle-email", {
    method: "POST",
    body: JSON.stringify({ enabled: true })
  });
  writeJson("settings-output", result);
});

// This chunk of code adds a click event listener to the "disable-email" button.
document.getElementById("disable-email").addEventListener("click", async () => {
  const result = await api("/api/settings/toggle-email", {
    method: "POST",
    body: JSON.stringify({ enabled: false })
  });
  writeJson("settings-output", result);
});
