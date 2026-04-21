const fs = require("fs");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { DEFAULT_DB_FILE, openDatabase } = require("../db");

function sendPublicFile(response, fileName) {
  response.sendFile(path.join(__dirname, "..", "public", fileName));
}

// The following function is vulnerable to session fixation due to the fact that Math.random() is not secure. It can generate session IDs that can be easily predicted by an attacker, allowing them to create a valid session ID and hijack a user's session.
/*
function createSessionId() {
  return `SESSION-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}
*/
// I added the following function to fix the session fixation vulnerabiltiy. 
const cyrpto = require("crypto"); // This line is added to import the crypto module. This is a more secure way to generate random session IDs.
function createSessionId() {
  return `SESSION-${cyrpto.randomBytes(16).toString("hex")}-${Date.now()}`;
}


async function createApp() {
  if (!fs.existsSync(DEFAULT_DB_FILE)) {
    throw new Error(
      `Database file not found at ${DEFAULT_DB_FILE}. Run "npm run init-db" first.`
    );
  }

  const db = openDatabase(DEFAULT_DB_FILE);
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use("/css", express.static(path.join(__dirname, "..", "public", "css")));
  app.use("/js", express.static(path.join(__dirname, "..", "public", "js")));

  app.use(async (request, response, next) => {
    const sessionId = request.cookies.sid;

    if (!sessionId) {
      request.currentUser = null;
      next();
      return;
    }

    const row = await db.get(
      `
        SELECT
          sessions.id AS session_id,
          users.id AS id,
          users.username AS username,
          users.role AS role,
          users.display_name AS display_name
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ?
      `,
      [sessionId]
    );

    request.currentUser = row
      ? {
          sessionId: row.session_id,
          id: row.id,
          username: row.username,
          role: row.role,
          displayName: row.display_name
        }
      : null;

    next();
  });

  function requireAuth(request, response, next) {
    if (!request.currentUser) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }

    next();
  }

  app.get("/", (_request, response) => sendPublicFile(response, "index.html"));
  app.get("/login", (_request, response) => sendPublicFile(response, "login.html"));
  app.get("/notes", (_request, response) => sendPublicFile(response, "notes.html"));
  app.get("/settings", (_request, response) => sendPublicFile(response, "settings.html"));
  app.get("/admin", (_request, response) => sendPublicFile(response, "admin.html"));

  app.get("/api/me", (request, response) => {
    response.json({ user: request.currentUser });
  });

  app.post("/api/login", async (request, response) => {
    const username = String(request.body.username || "");
    const password = String(request.body.password || "");

    // The following lines are vulnerable to SQL injection due to the use of string interpolation to construct a SQL query.
    /*const query = `
      SELECT id, username, role, display_name
      FROM users
      WHERE username = '${username}' AND password = '${password}'
    `;
    const user = await db.get(query);
    */
    // In order to fix this SQL issue, I will use parameterized queries to safely include user input in the SQL query.
    const user = await db.get(
      `
        SELECT id, username, role, display_name
        FROM users
        WHERE username = ? AND password = ?
      `,
      [username, password]
    );

    if (!user) {
      response.status(401).json({ error: "Invalid username or password." });
      return;
    }

    // The following line is vulnerable to session fixation because if a user already has a SID, the server will reuse that SID instead of generating a new one.
    //const sessionId = request.cookies.sid || createSessionId();
    // To fix this issue on the server side, I will replace the above line with the following code, which always generates a new session ID when logging in and does not reuse an existing session ID from the cookies.
    const oldSessionId = request.cookies.sid;
    const newSessionId = createSessionId();

    if (oldSessionId) {
      await db.run("DELETE FROM sessions WHERE id = ?", [oldSessionId]);
    }
    await db.run(
      "INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)",
      [newSessionId, user.id, new Date().toISOString()]
    );
    
    // This is vulnerable to session fixation because it doesn't include security flags like HttpOnly and Secure, which can help mitigate the risk of session hijacking. 
    /*
    response.cookie("sid", newSessionId, {
      path: "/"
    });
    */
    // To fix this issue, I will include the HttpOnly, sameSite, and Secure flags on the cookie.
    response.cookie("sid", newSessionId, {
      path: "/",
      httpOnly: true, // This prevents client-side JavaScript from reading the cookie, which can help mitigate the risk of session hijacking through XSS attacks.
      secure: process.env.NODE_ENV === "production", // This ensures that the cookie is only sent over HTTPS connections (usually in production), which can ensure MITM attacks.
      sameSite: "lax" // This helps mitigate CSRF attacks. THis doesn't allow the cookie to be sent on cross-site requests, but it still allows it to be sent when navigating from an external site.
    }); 


    response.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name
      }
    });
  });

  app.post("/api/logout", async (request, response) => {
    if (request.cookies.sid) {
      await db.run("DELETE FROM sessions WHERE id = ?", [request.cookies.sid]);
    }

    response.clearCookie("sid");
    response.json({ ok: true });
  });

  app.get("/api/notes", requireAuth, async (request, response) => {
    // The use of ownerID is vulnerable to IDOR since it allows users to access notes they don't own.
    // const ownerId = request.query.ownerId || request.currentUser.id;
    // To fix this issue, I will set ownerId to the current user's Id by default, and the user cannot override it by providing a different ownerId in the query parameters. 
    const ReqOwnerId = request.query.ownerId ? Number(request.query.ownerId) : request.currentUser.id;
    const search = String(request.query.search || "");

    let ownerId = request.currentUser.id;
    if (request.currentUser.role === "admin" && ReqOwnerId) {
      ownerId = ReqOwnerId;
    }

    // The following lines are vulnerable to SQL injection due to the use of string interpolation to construct a SQL query.
    // I will replace the brackets with parameterized queries to fix the SQL injection issue.
    const notes = await db.all(`
      SELECT
        notes.id,
        notes.owner_id AS ownerId,
        users.username AS ownerUsername,
        notes.title,
        notes.body,
        notes.pinned,
        notes.created_at AS createdAt
      FROM notes
      JOIN users ON users.id = notes.owner_id
      WHERE notes.owner_id = ?
        AND (notes.title LIKE ? OR notes.body LIKE ?)
      ORDER BY notes.pinned DESC, notes.id DESC
    `, [ownerId, `%${search}%`, `%${search}%`]);

    response.json({ notes });
  });

  // To fix the IDOR vulnerability, I will set the ownerID to the current user's Id by default.
  app.post("/api/notes", requireAuth, async (request, response) => {
    const ownerId = request.currentUser.id;
    const title = String(request.body.title || "");
    const body = String(request.body.body || "");
    const pinned = request.body.pinned ? 1 : 0;

    const result = await db.run(
      "INSERT INTO notes (owner_id, title, body, pinned, created_at) VALUES (?, ?, ?, ?, ?)",
      [ownerId, title, body, pinned, new Date().toISOString()]
    );

    response.status(201).json({
      ok: true,
      noteId: result.lastID
    });
  });

  app.get("/api/settings", requireAuth, async (request, response) => {
    // The following line is vulnerable because userId can be modified to access another user's settings (IDOR vulnerability).
    // const userId = Number(request.query.userId || request.currentUser.id);
    // In order to fix this issue, I will add the following lines, which will check if the user is an admin and if a userId is provided in the query parameters. If they are true, it will use the provided userId. 
    const ReqUserId = request.query.userId ? Number(request.query.userId) : null;
    let userId = request.currentUser.id;
    if (request.currentUser.role === "admin" && ReqUserId) {
      userId = ReqUserId;
    }


    const settings = await db.get(
      `
        SELECT
          users.id AS userId,
          users.username,
          users.role,
          users.display_name AS displayName,
          settings.status_message AS statusMessage,
          settings.theme,
          settings.email_opt_in AS emailOptIn
        FROM settings
        JOIN users ON users.id = settings.user_id
        WHERE settings.user_id = ?
      `,
      [userId]
    );

    response.json({ settings });
  });

  app.post("/api/settings", requireAuth, async (request, response) => {
    // I commeted out the userId line and replaced it with the following line so that users can only update their own settings.
    // const userId = Number(request.body.userId || request.currentUser.id);
    const userId = request.currentUser.id;
    const displayName = String(request.body.displayName || "");
    const statusMessage = String(request.body.statusMessage || "");
    const theme = String(request.body.theme || "classic");
    const emailOptIn = request.body.emailOptIn ? 1 : 0;

    await db.run("UPDATE users SET display_name = ? WHERE id = ?", [displayName, userId]);
    await db.run(
      "UPDATE settings SET status_message = ?, theme = ?, email_opt_in = ? WHERE user_id = ?",
      [statusMessage, theme, emailOptIn, userId]
    );

    response.json({ ok: true });
  });

  // The following line is vulnerable to CSRF as it allows any website to make a GET request and change the user's email preferences without their knowledge. 
  //app.get("/api/settings/toggle-email", requireAuth, async (request, response) => {
  
  // The following code helps improve security against the CSRF vulnerability by using a POST request and requiring a valid session cookie for authentication.
  app.post("/api/settings/toggle-email", requireAuth, async (request, response) => {
  
    const enabled = request.body.enabled ? 1 : 0;
    await db.run("UPDATE settings SET email_opt_in = ? WHERE user_id = ?", [
      enabled,
      request.currentUser.id
    ]);

    response.json({
      ok: true,
      userId: request.currentUser.id,
      emailOptIn: enabled
    });
  });

  // I will add real server-side authorization to ensure that only admin users can access the list of all users.
  function onlyAdmin(request, response, next) {
    if (!request.currentUser) {
      return response.status(401).json({ error: "Authentication is required!!" });
    }
    if (request.currentUser.role !== "admin") {
      return response.status(403).json({ error: "Admin access required!!" });
    }
    next();
  }

  // I updated the following line with onlyAdmin to ensure that only admin users can access the list of all users. 
  app.get("/api/admin/users", onlyAdmin, async (_request, response) => {
    const users = await db.all(`
      SELECT
        users.id,
        users.username,
        users.role,
        users.display_name AS displayName,
        COUNT(notes.id) AS noteCount
      FROM users
      LEFT JOIN notes ON notes.owner_id = users.id
      GROUP BY users.id, users.username, users.role, users.display_name
      ORDER BY users.id
    `);

    response.json({ users });
  });

  return app;
}

module.exports = {
  createApp
};
