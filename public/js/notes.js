function noteCard(note) {
  // The following lines are vulnerable to XSS since they directly insert user-generated content into the HTML without proper sanitization/escaping. 
  // To fix this, I will create DOM elements and set their textContent instead of using innerHTML.
  
  // The purpose of the noteCardElement is to create a card for each note that displays the note's title, owner, ID, etc.
  const noteCardElement = document.createElement("article");
  noteCardElement.className = "note-card";

  // The purpose of the titleElement is to display the title of the note.
  const titleElement = document.createElement("h3");
  titleElement.textContent = note.title;

  // The purpose of the metaElement is to display metadata about the note.
  const metaElement = document.createElement("p");
  metaElement.className = "note-meta";
  metaElement.textContent = `Owner: ${note.ownerUsername} | ID: ${note.id} | Pinned: ${note.pinned}`;

  // The purpose of the bodyElement is to display the body of the note.
  const bodyElement = document.createElement("div");
  bodyElement.className = "note-body";
  bodyElement.textContent = note.body;

  // The following lines append the title, meta, and body elements to the note card element.
  noteCardElement.appendChild(titleElement);
  noteCardElement.appendChild(metaElement);
  noteCardElement.appendChild(bodyElement);

  return noteCardElement;
}

async function loadNotes(ownerId, search) {
  const query = new URLSearchParams();

  if (ownerId) {
    query.set("ownerId", ownerId);
  }

  if (search) {
    query.set("search", search);
  }

  const result = await api(`/api/notes?${query.toString()}`);
  const notesList = document.getElementById("notes-list");
  // This is vulnerable to XSS since it uses innerHTML, which can execute any scripts included in the note's title or body.
  //notesList.innerHTML = result.notes.map(noteCard).join("");
  // To fix this, I will insert the following code to append the note cards to the notesList element instead of using innerHTML.
  notesList.innerHTML = "";
  for (const note of result.notes) {
    notesList.appendChild(noteCard(note));
  }
}

(async function bootstrapNotes() {
  try {
    const user = await loadCurrentUser();

    if (!user) {
      document.getElementById("notes-list").textContent = "Please log in first.";
      return;
    }

    document.getElementById("notes-owner-id").value = user.id;
    document.getElementById("create-owner-id").value = user.id;
    await loadNotes(user.id, "");
  } catch (error) {
    document.getElementById("notes-list").textContent = error.message;
  }
})();

document.getElementById("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  await loadNotes(formData.get("ownerId"), formData.get("search"));
});

document.getElementById("create-note-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  // The following lines are vulnerable because it allows users to create notes on behalf of other users by specifying a different ownerId in the form data.
  // To fix this, I will remove ownerId from the payload.
  const payload = {
    title: formData.get("title"),
    body: formData.get("body"),
    pinned: formData.get("pinned") === "on"
  };

  await api("/api/notes", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  await loadNotes(payload.ownerId, "");
  event.currentTarget.reset();
  document.getElementById("create-owner-id").value = payload.ownerId;
});
