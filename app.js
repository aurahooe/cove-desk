const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const $ = (id) => document.getElementById(id);
let user = null;
let profile = null;
function prettyTime(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}
function tickClock() {
  $("clock").textContent = new Date().toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function escapeHtml(str = "") {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
async function loadHours() {
  const { data } = await sb.from("cove_hours").select("*").order("published_at", { ascending: false }).limit(12);
  const hours = data || [];
  const current = hours[0];
  if (current) {
    $("hourHeadline").textContent = current.headline;
    $("hourBody").textContent = current.body;
  } else {
    $("hourHeadline").textContent = "Waiting on the first tide";
    $("hourBody").textContent = "The house has not posted an hour yet.";
  }
  $("hourList").innerHTML = hours.slice(1).map((h) => `<li data-id="${h.id}"><strong>${escapeHtml(h.headline)}</strong><br /><span>${prettyTime(h.published_at)}</span></li>`).join("");
  $("hourList").onclick = (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const h = hours.find((x) => x.id === li.dataset.id);
    if (!h) return;
    $("hourHeadline").textContent = h.headline;
    $("hourBody").textContent = h.body;
  };
}
async function loadBoard() {
  const { data } = await sb.from("cove_slips").select("id,title,body,created_at,author_id,cove_profiles(handle,display_name)").eq("is_public", true).order("created_at", { ascending: false }).limit(40);
  const slips = data || [];
  if (!slips.length) {
    $("boardGrid").innerHTML = '<p class="lede">The board is empty. Be the first to pin something.</p>';
    return;
  }
  $("boardGrid").innerHTML = slips.map((s) => {
    const who = s.cove_profiles?.display_name || s.cove_profiles?.handle || "anon";
    return `<article class="slip"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p><div class="who">${escapeHtml(who)} · ${prettyTime(s.created_at)}</div></article>`;
  }).join("");
}
function renderSession() {
  const box = $("session");
  if (!user) {
    box.innerHTML = `<button class="btn tiny" id="openAuth">Sign in</button>`;
    $("openAuth").onclick = () => document.getElementById("desk").scrollIntoView({ behavior: "smooth" });
    $("slipForm").classList.add("hidden");
    $("deskHint").textContent = "Sign in to keep slips. Public ones appear on the board immediately.";
    renderAuthPanel();
    $("mySlips").innerHTML = "";
    return;
  }
  const name = profile?.display_name || user.email;
  box.innerHTML = `<span>${escapeHtml(name)}</span><button class="btn tiny" id="signOut">Out</button>`;
  $("signOut").onclick = async () => { await sb.auth.signOut(); };
  $("slipForm").classList.remove("hidden");
  $("authPanel").innerHTML = "";
  $("deskHint").textContent = "Drafts stay private unless you hang them on the board.";
  loadMine();
}
function renderAuthPanel() {
  $("authPanel").innerHTML = `<div class="auth-tabs"><button class="btn tiny solid" data-mode="signin">Sign in</button><button class="btn tiny" data-mode="signup">Create account</button></div><form id="authForm"><label>Email <input type="email" name="email" required autocomplete="email" /></label><label>Password <input type="password" name="password" required minlength="6" autocomplete="current-password" /></label><button class="btn solid" type="submit">Continue</button><p class="auth-msg" id="authMsg"></p></form>`;
  let mode = "signin";
  $("authPanel").querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.mode;
      $("authPanel").querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("solid", x === b));
    };
  });
  $("authForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get("email");
    const password = fd.get("password");
    $("authMsg").textContent = "Working…";
    const fn = mode === "signup" ? sb.auth.signUp({ email, password }) : sb.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    $("authMsg").textContent = error ? error.message : mode === "signup" ? "Account created. If email confirm is on, check your inbox — then sign in." : "";
  };
}
$("slipForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!user) return;
  const fd = new FormData(e.target);
  const title = String(fd.get("title") || "").trim();
  const body = String(fd.get("body") || "").trim();
  const is_public = fd.get("is_public") === "on";
  $("formMsg").textContent = "Saving…";
  const { error } = await sb.from("cove_slips").insert({ author_id: user.id, title, body, is_public });
  $("formMsg").textContent = error ? error.message : "Saved.";
  if (!error) { e.target.reset(); loadBoard(); loadMine(); }
});
async function loadMine() {
  if (!user) return;
  const { data } = await sb.from("cove_slips").select("*").eq("author_id", user.id).order("created_at", { ascending: false });
  const slips = data || [];
  $("mySlips").innerHTML = slips.map((s) => `<article class="slip"><h3>${escapeHtml(s.title)} ${s.is_public ? "· public" : "· drawer"}</h3><p>${escapeHtml(s.body)}</p><div class="slip-actions"><button class="btn tiny" data-toggle="${s.id}" data-pub="${s.is_public}">${s.is_public ? "Make private" : "Make public"}</button><button class="btn tiny" data-del="${s.id}">Delete</button></div></article>`).join("");
  $("mySlips").onclick = async (e) => {
    const tog = e.target.closest("[data-toggle]");
    const del = e.target.closest("[data-del]");
    if (tog) {
      await sb.from("cove_slips").update({ is_public: tog.dataset.pub !== "true", updated_at: new Date().toISOString() }).eq("id", tog.dataset.toggle);
      loadMine(); loadBoard();
    }
    if (del) {
      await sb.from("cove_slips").delete().eq("id", del.dataset.del);
      loadMine(); loadBoard();
    }
  };
}
async function ensureProfile() {
  if (!user) { profile = null; return; }
  const { data } = await sb.from("cove_profiles").select("*").eq("id", user.id).maybeSingle();
  profile = data;
  if (!profile) {
    const handle = (user.email || "guest").split("@")[0] + user.id.replaceAll("-", "").slice(0, 4);
    await sb.from("cove_profiles").insert({ id: user.id, handle, display_name: (user.email || "Guest").split("@")[0] });
    const again = await sb.from("cove_profiles").select("*").eq("id", user.id).maybeSingle();
    profile = again.data;
  }
}
sb.auth.onAuthStateChange(async (_e, session) => {
  user = session?.user || null;
  await ensureProfile();
  renderSession();
});
tickClock();
setInterval(tickClock, 30000);
loadHours();
loadBoard();
sb.auth.getSession().then(async ({ data }) => {
  user = data.session?.user || null;
  await ensureProfile();
  renderSession();
});
