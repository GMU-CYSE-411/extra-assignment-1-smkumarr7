(async function bootstrapAdmin() {
  try {
    const user = await loadCurrentUser();

    if (!user) {
      document.getElementById("admin-warning").textContent = "Please log in first.";
      return;
    }

    if (user.role !== "admin") {
      document.getElementById("admin-warning").textContent =
        "The client says this is not your area, but the page still tries to load admin data.";
    } else {
      document.getElementById("admin-warning").textContent = "Authenticated as admin.";
    }

    const result = await api("/api/admin/users");
    // This is vulnerable to XSS since it uses innerHTML (which is dangerous because it allows any HTML content to be inserted into the page).
    // As a result, I will use DOM creation and textContent to safely insert the user data into the page.
    const tableForUsers = document.getElementById("admin-users");
    tableForUsers.replaceChildren(); // this is safe because we are avoiding innerHTML and instead using DOM manipulation.

    // This chunk of code iterates over the list of users returned by the API and creates a table row for each user. This inserts their data into the appropriate cells. 
    for (const entry of result.users) {
      const tableRow = document.createElement("tr");

      for (const cellValue of [
        entry.id,
        entry.username,
        entry.role,
        entry.displayName,
        entry.noteCount
      ]) {
        const tableCell = document.createElement("td");
        tableCell.textContent = String(cellValue);
        tableRow.appendChild(tableCell);
      }
      tableForUsers.appendChild(tableRow);
    }
  } catch (error) {
    document.getElementById("admin-warning").textContent = error.message;
  }
})();
