function noteCard(note) {
  // The following lines are vulnerable to XSS since they directly insert user-generated content into the HTML without proper sanitization/escaping. 
  // To fix this, I will create DOM elements and set their textContent instead of using innerHTML.
  
  // The purpose of the cardElement is to create a card for each note that displays the note's title, owner, ID, etc.
  const cardElement = document.createElement("article");
  cardElement.className = "note-card";

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
  cardElement.appendChild(titleElement);
  cardElement.appendChild(metaElement);
  cardElement.appendChild(bodyElement);

  return cardElement;
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
  notesList.replaceChildren(); // this is safe because we are avoiding innerHTML and instead using DOM manipulation.
  for (const noteInList of result.notes) {
    notesList.appendChild(noteCard(noteInList));
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
  // I added the two following lines to load the current user and pass their id. This is a safe way to do so because it ensures that the user can only search their own notes, preventing information disclosure of someone else's notes.
  const currentUser = await loadCurrentUser();
  await loadNotes(currentUser.id, formData.get("search"));

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

  // I added const currentUser because loadNotes requires an ownerId. B/c I removed ownerId from the payload, I need to load the current user to get their id to pass to loadNotes.
  // The following code is safe bc it ensures that the user can only load their own notes, preventing information disclosure of someone else's notes.
  const currentUser = await loadCurrentUser();
  await loadNotes(currentUser.id, "");
  event.currentTarget.reset();
  document.getElementById("create-owner-id").value = currentUser.id;
});
