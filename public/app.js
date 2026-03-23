// État de l'application
let currentUser = null;

// Éléments DOM
const loginScreen = document.getElementById("login-screen");
const timelineScreen = document.getElementById("timeline-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const currentUserSpan = document.getElementById("current-user");
const logoutBtn = document.getElementById("logout-btn");
const refreshBtn = document.getElementById("refresh-btn");
const postContent = document.getElementById("post-content");
const postBtn = document.getElementById("post-btn");
const postsList = document.getElementById("posts-list");

// ============================================
// AUTHENTIFICATION
// ============================================

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (data.success) {
      currentUser = data.username;
      showTimeline();
    } else {
      loginError.textContent = data.error || "Erreur de connexion";
    }
  } catch (e) {
    loginError.textContent = "Erreur réseau";
  }
});

logoutBtn.addEventListener("click", () => {
  currentUser = null;
  loginScreen.classList.remove("hidden");
  timelineScreen.classList.add("hidden");
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  loginError.textContent = "";
});

refreshBtn.addEventListener("click", () => {
  loadPosts();
});

function showTimeline() {
  loginScreen.classList.add("hidden");
  timelineScreen.classList.remove("hidden");
  currentUserSpan.textContent = `@${currentUser}`;
  loadPosts();
}

// ============================================
// POSTS
// ============================================

async function loadPosts() {
  try {
    const res = await fetch("/api/posts");
    const posts = await res.json();
    renderPosts(posts);
  } catch (e) {
    console.error("Erreur chargement posts:", e);
  }
}

function renderPosts(posts) {
  postsList.innerHTML = "";

  posts.forEach((post) => {
    const postDiv = document.createElement("div");
    postDiv.className = "post";

    // Construction du header (sécurisé - pas de données utilisateur)
    postDiv.innerHTML = `
      <div class="post-header">
        <span class="post-username">@${post.username}</span>
        <span class="post-date">${formatDate(post.created_at)}</span>
      </div>
      <div class="post-content"></div>
    `;

    // ⚠️ VULNÉRABLE - innerHTML avec données utilisateur
    postDiv.querySelector('.post-content').innerHTML = post.content;

    postsList.appendChild(postDiv);
  });
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================
// POSTER UN MESSAGE
// ============================================

postBtn.addEventListener("click", async () => {
  const content = postContent.value.trim();
  if (!content) return;

  try {
    // ⚠️ VULNÉRABLE - le username vient du client, on peut le falsifier
    await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: currentUser, content }),
    });

    postContent.value = "";
    loadPosts();
  } catch (e) {
    console.error("Erreur post:", e);
  }
});
