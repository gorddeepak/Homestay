
// ── 1. FORM VALIDATION (Bootstrap) ──
// Prevents form submission if fields are invalid
(() => {
  'use strict';
  document.querySelectorAll('.needs-validation').forEach(form => {
    form.addEventListener('submit', event => {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });
})();


// ── 2. NAVBAR TRANSPARENCY + SCROLL ──
// On the homepage the navbar starts transparent (over the hero).
// Once the user scrolls past 50px, add .scrolled to switch to solid.
const navbar = document.querySelector('.homestay-nav');

if (navbar && navbar.classList.contains('navbar-transparent')) {
  // Run once on load in case page is already scrolled (e.g. after redirect)
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  }

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}


// ── 3. CATEGORY FILTER TABS ──
// Targets .listing-col (the Bootstrap col wrapper) which has data-category.
// The old code targeted .listing-card (the <a> inside) — updated to match new HTML.
document.querySelectorAll('.category-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Mark clicked tab as active
    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const selected = tab.dataset.category;

    if (selected === 'all') {
      resultsContainer.innerHTML = originalListingsHTML; // restore full original set
      document.getElementById("aiSearchInput").value = ""; // clear search box too
      return;
    }

    // Show/hide the column wrappers
    document.querySelectorAll('.listing-col').forEach(col => {
      if (selected === 'all' || col.dataset.category === selected) {
        col.style.display = '';     // show
      } else {
        col.style.display = 'none'; // hide
      }
    });
  });
});

// Generate description with ai
const descriptionInput = document.getElementById("description");
const generateBtn = document.getElementById("generateBtn");

if (descriptionInput && generateBtn) {
  descriptionInput.addEventListener("keypress", async () => {
    if (descriptionInput.value.trim()) {
      generateBtn.textContent = "Refine with AI";
    } else {
      generateBtn.textContent = "Generate with AI";
    }
  });

  generateBtn.addEventListener("click", async () => {
    const originalText = generateBtn.textContent;
    generateBtn.textContent = "Generating...";
    generateBtn.disabled = true;

    try {
      const title = document.getElementById("title").value.trim();
      const location = document.getElementById("location").value.trim();
      const category = document.getElementById("category").value.trim();

      const res = await fetch("/listings/ai/generate_description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, location, category }),
      });

      const data = await res.json();
      descriptionInput.value = data.description;
    } catch (err) {
      console.error(err);
      alert("Something went wrong generating the description.");
    } finally {
      generateBtn.textContent = originalText;
      generateBtn.disabled = false;
    }
  });
}


// ai chatbot
let conversation = JSON.parse(sessionStorage.getItem("chatConversation") || "[]");
let welcomeShown = sessionStorage.getItem("chatWelcomeShown") === "true";

conversation.forEach(msg => appendMessage(msg.role, msg.content));

function saveConversation() {
  sessionStorage.setItem("chatConversation", JSON.stringify(conversation));
}

document.getElementById("chatToggleBtn").addEventListener("click", () => {
  document.getElementById("chatBox").style.display = "flex";
  document.getElementById("chatToggleBtn").style.display = "none";
  sessionStorage.setItem("chatOpen", "true");
  if (!welcomeShown) {
    const intro_msg = "Hi! I can help you find listings, check prices, or summarize reviews. What are you looking for?"
    appendMessage("assistant", intro_msg);
    conversation.push({ role: "assistant", content: intro_msg });
    saveConversation();
    welcomeShown = true;
    sessionStorage.setItem("chatWelcomeShown", "true")
  }
});

document.getElementById("chatCloseBtn").addEventListener("click", () => {
  document.getElementById("chatBox").style.display = "none";
  document.getElementById("chatToggleBtn").style.display = "block";
  sessionStorage.setItem("chatOpen", "false");
});

document.getElementById("chatSendBtn").addEventListener("click", sendChatMessage);
document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatMessage();
});

if (sessionStorage.getItem("chatOpen") === "true") {
  document.getElementById("chatBox").style.display = "flex";
  document.getElementById("chatToggleBtn").style.display = "none";
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const userText = input.value.trim();
  if (!userText) return;

  const sendBtn = document.getElementById("chatSendBtn");
  sendBtn.disabled = true;
  input.disabled = true;

  conversation.push({ role: "user", content: userText });
  saveConversation();
  appendMessage("user", userText);
  input.value = "";

  const assistantEl = appendMessage("assistant", "Thinking...");

  try {
    const res = await fetch("/listings/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation }),
    });
    if (!res.ok) throw new Error("Chat request failed");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assistantReply = "";
    assistantEl.textContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      assistantReply += decoder.decode(value);
      assistantEl.textContent = assistantReply;
      document.getElementById("chatWindow").scrollTop = document.getElementById("chatWindow").scrollHeight;
    }

    conversation.push({ role: "assistant", content: assistantReply });
    saveConversation();
  } catch (err) {
    console.error(err);
    assistantEl.textContent = "Something went wrong. Please try again.";
  } finally {
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  div.textContent = text;
  document.getElementById("chatWindow").appendChild(div);
  document.getElementById("chatWindow").scrollTop = document.getElementById("chatWindow").scrollHeight;
  return div;
}

document.getElementById("aiSearchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendSearchMessage();
});

document.getElementById("aiSearchBtn").addEventListener("click", async () => {
  sendSearchMessage();
});

const resultsContainer = document.querySelector(".row.row-cols-1");
const originalListingsHTML = resultsContainer.innerHTML;

async function sendSearchMessage() {
  const query = document.getElementById("aiSearchInput").value.trim();
  if (!query) return;


  const btn = document.getElementById("aiSearchBtn");

  btn.disabled = true;
  btn.textContent = "Searching...";
  resultsContainer.innerHTML = `<p class="text-sand">Searching...</p>`;

  try {
    const res = await fetch("/listings/ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const html = await res.text();

    if (!html.trim()) {
      resultsContainer.innerHTML = `<p class="text-sand">No listings matched your search. Try a different query.</p>`;
    } else {
      resultsContainer.innerHTML = html;
    }
  } catch (err) {
    console.error(err);
    resultsContainer.innerHTML = `<p class="text-danger">Something went wrong. Please try again.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Search";
  }
}
