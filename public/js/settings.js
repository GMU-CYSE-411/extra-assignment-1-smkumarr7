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
  const statusPreviewContainer = document.getElementById("status-preview");
  statusPreviewContainer.replaceChildren(); // this is safe because we are avoiding innerHTML and instead using DOM manipulation.

  // This chunk of code creates two paragraph elements for the display name and status message and sets their text content to the corresponding values from the settings object.
  const nameContainer = document.createElement("p");
  const strongElement = document.createElement("strong");
  strongElement.textContent = settings.displayName;
  nameContainer.appendChild(strongElement);

  const statusContainer = document.createElement("p");
  statusContainer.textContent = settings.statusMessage;

  // This chunk of code appends the display name and status message elements to the status preview element.
  statusPreviewContainer.appendChild(nameContainer);
  statusPreviewContainer.appendChild(statusContainer);

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

  // I added the following two lines of code to load the current user and pass their id. This is a safe way to do so because it ensures that the user can only query their own settings, preventing information disclosure of someone else's settings.
  const currentUser = await loadCurrentUser();
  await loadSettings(currentUser.id);
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
  // I added const currentUser b/c loadSettings requires a userId. B/c I removed userId from the payload, I need to load the current user to get their id to pass to loadSettings.
  const currentUser = await loadCurrentUser();
  await loadSettings(currentUser.id);
});

// The following code is vulnerable to CSRF as it allows any website to make a GET request to the toggle-email endpoint and change the user's email preferences without their knowledge.
/* document.getElementById("enable-email").addEventListener("click", async () => {
  const result = await api("/api/settings/toggle-email?enabled=1");
  writeJson("settings-output", result);
});
*/
// To fix the CSRF vulnerability, I will change the method to POST and include a valid session cookie for authentication so that only authenticated users can change their email preferences.
// This chunk of code adds an event listener that adds a click event listener to the "enable-email" button.
document.getElementById("enable-email").addEventListener("click", async () => {
  const result = await api("/api/settings/toggle-email", {
    method: "POST",
    body: JSON.stringify({ enabled: true })
  });
  writeJson("settings-output", result);
});

// This chunk of code adds a click event listener to the "disable-email" button in a safe way as it includes authentication of the current user.
document.getElementById("disable-email").addEventListener("click", async () => {
  const result = await api("/api/settings/toggle-email", {
    method: "POST",
    body: JSON.stringify({ enabled: false })
  });
  writeJson("settings-output", result);
});
