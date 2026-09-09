// Thirduni's post page intermittently renders "Page not found" for posts that
// exist. Every API involved returns 200 with full data even when the page fails,
// and reloading only sometimes wins the race. So we stop fighting the race: when
// the not-found screen shows, redraw the page from the API instead.
// Endpoints were read off the site's own network traffic. Everything user-authored
// goes in as textContent, never as markup.
(() => {
  const POST_PATH = /^\/course\/community\/posts\/([^/?#]+)/;
  const FEED = "/course/community";
  const API = "/course/api/community";
  let busy = null;

  const has404 = () =>
    /page not found/i.test(document.body?.innerText?.slice(0, 3000) || "");

  const kill = () => document.getElementById("td-rescue")?.remove();

  const get = async (u) => {
    try {
      const r = await fetch(u);
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };

  // POST/DELETE helper. Returns null on any failure so callers can try the next
  // candidate URL: a request to a route that does not exist is a harmless 404.
  const send = async (u, body, method) => {
    try {
      const r = await fetch(u, {
        method: method || "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!r.ok) return null;
      return (await r.json().catch(() => ({}))) || {};
    } catch {
      return null;
    }
  };

  // their payloads nest arrays at varying depths, so dig rather than assume
  const findList = (j, test) => {
    const found = [];
    const walk = (v, d) => {
      if (d > 3 || !v || typeof v !== "object") return;
      if (Array.isArray(v)) {
        if (v.length && typeof v[0] === "object") found.push(v);
        return;
      }
      Object.values(v).forEach((w) => walk(w, d + 1));
    };
    walk(j, 0);
    return (test ? found.find((l) => test(l[0])) : found[0]) || null;
  };

  const findNum = (j, keys) => {
    let hit = null;
    const walk = (v, d) => {
      if (d > 3 || !v || typeof v !== "object" || hit !== null) return;
      for (const k of keys) if (typeof v[k] === "number") return (hit = v[k]);
      Object.values(v).forEach((w) => walk(w, d + 1));
    };
    walk(j, 0);
    return hit;
  };

  const rel = (d) => {
    const s = (Date.now() - new Date(d)) / 1000;
    if (!isFinite(s)) return "";
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 2592000) return Math.floor(s / 86400) + "d ago";
    return new Date(d).toLocaleDateString();
  };

  const cap = (s) => String(s || "").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const flow = (t) => String(t ?? "").replace(/\s*\n+\s*/g, " ").trim();

  const who = (a) => a?.displayName || a?.profile?.name || a?.name || a?.handle || "Unknown";
  const pic = (a) => a?.profile?.avatarUrl || a?.avatarUrl || "";
  const sub = (a) =>
    a?.profile?.headline || a?.headline || a?.profile?.title || a?.title || a?.bio || "";
  const num = (o) => {
    for (const k of ["points", "score", "xp", "total", "count", "posts"])
      if (typeof o?.[k] === "number") return o[k];
    return "";
  };
  const inits = (n) =>
    String(n).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

  // tiny element builder: `text` sets textContent, so nothing is parsed as markup
  const h = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c || c === 0) n.append(c);
    return n;
  };

  const NS = "http://www.w3.org/2000/svg";
  const ICON = {
    comment: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    heart:
      "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.7 1.1-1a5.5 5.5 0 0 0 0-7.7z",
    bookmark: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
    share: "M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14",
  };

  const icon = (name, filled) => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", "18");
    s.setAttribute("height", "18");
    s.setAttribute("fill", filled ? "currentColor" : "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.7");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", ICON[name]);
    s.append(p);
    return s;
  };

  const face = (a, small) => {
    const cls = "td-face" + (small ? " td-sm" : "");
    return pic(a)
      ? h("img", { class: cls, src: pic(a), alt: "" })
      : h("span", { class: cls + " td-ini", text: inits(who(a)) });
  };

  const chip = (p) =>
    h("div", { class: "td-chip" },
      face(p, true),
      h("span", { class: "td-nm", text: who(p) }),
      h("i", { class: "td-dot" }));

  const rankRow = (p, i) =>
    h("div", { class: "td-row" },
      h("span", { class: "td-rank", text: String(i + 1) }),
      face(p, true),
      h("div", { class: "td-two" }, h("b", { text: who(p) }), h("span", { text: sub(p) })),
      h("span", { class: "td-pts", text: String(num(p)) }));

  const topicRow = (t, i) =>
    h("div", { class: "td-topic" },
      h("span", { class: "td-rank", text: String(i + 1) }),
      h("div", { class: "td-two" },
        h("b", { text: "#" + String(t.hashtag || t.tag || t.topic || "").replace(/^#/, "") }),
        h("span", { text: t.description || t.subtitle || "" })),
      h("span", { class: "td-cnt", text: num(t) + " posts" }));

  const reply = (r) =>
    h("div", { class: "td-reply" },
      face(r.author, true),
      h("div", { style: "flex:1 1 auto;min-width:0" },
        h("div", { class: "td-name", style: "font-size:14px" },
          who(r.author),
          h("span", { class: "td-meta", style: "font-weight:400", text: " · " + rel(r.createdAt) })),
        h("div", {
          class: "td-body",
          style: "font-size:14.5px;margin-top:2px",
          text: flow(r.body ?? r.content ?? r.text ?? ""),
        })));

  const panel = (title, subtitle, rows) =>
    h("div", { class: "td-panel" },
      h("div", { class: "td-ptitle", text: title }),
      h("div", { class: "td-psub", text: subtitle }),
      rows);

  const CSS = `
    #td-rescue{position:fixed;inset:0;z-index:2147483647;background:#fff;overflow:auto;
      font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#111827;
      -webkit-font-smoothing:antialiased}
    #td-rescue *{box-sizing:border-box}
    #td-rescue .td-bar{display:flex;justify-content:space-between;align-items:center;
      gap:10px;padding:8px 20px;border-bottom:1px solid #eef0f2;font-size:12px;color:#9ca3af}
    #td-rescue .td-bar button{border:1px solid #e5e7eb;background:#fff;border-radius:8px;
      padding:4px 12px;cursor:pointer;font:inherit;color:#374151;margin-left:8px}
    #td-rescue .td-crumb{max-width:1180px;margin:0 auto;padding:18px 32px 0;font-size:13px;
      color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #td-rescue .td-crumb a{color:#6b7280;text-decoration:none}
    #td-rescue .td-wrap{max-width:1180px;margin:0 auto;padding:18px 32px 60px;display:flex;
      gap:28px;align-items:flex-start;flex-wrap:wrap}
    #td-rescue .td-main{flex:1 1 620px;min-width:320px}
    #td-rescue .td-side{flex:0 1 320px;min-width:260px}
    #td-rescue .td-card,#td-rescue .td-panel{background:#fff;border:1px solid #eaecef;
      border-radius:14px}
    #td-rescue .td-card{padding:26px 30px}
    #td-rescue .td-panel{padding:20px 22px;margin-bottom:18px}
    #td-rescue .td-head{display:flex;align-items:center;gap:14px;font-weight:700;font-size:17px}
    #td-rescue .td-head a{color:#111827;text-decoration:none;font-size:22px;line-height:1}
    #td-rescue .td-rule{border:0;border-top:1px solid #eef0f2;margin:20px 0}
    #td-rescue .td-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;
      padding:5px 12px;font-size:12.5px;font-weight:600}
    #td-rescue .td-who{display:flex;align-items:center;gap:12px;margin:18px 0 14px}
    #td-rescue .td-face{width:46px;height:46px;border-radius:50%;object-fit:cover;flex:0 0 auto}
    #td-rescue .td-ini{display:inline-flex;align-items:center;justify-content:center;
      background:#f3f4f6;color:#374151;font-weight:700;font-size:13px}
    #td-rescue .td-sm{width:34px;height:34px;font-size:11px}
    #td-rescue .td-name{font-weight:700;font-size:15px}
    #td-rescue .td-meta{font-size:13px;color:#6b7280}
    #td-rescue .td-body{font-size:15px;line-height:1.75;color:#374151;overflow-wrap:anywhere}
    #td-rescue .td-acts{display:flex;align-items:center;gap:20px;color:#6b7280}
    #td-rescue .td-act{display:inline-flex;align-items:center;gap:7px;font-size:14px;
      background:none;border:0;padding:0;color:inherit;font-family:inherit;cursor:pointer}
    #td-rescue .td-act:hover{color:#111827}
    #td-rescue .td-act.on{color:#111827}
    #td-rescue .td-act[disabled]{cursor:default;opacity:.55}
    #td-rescue .td-spacer{margin-left:auto}
    #td-rescue .td-reply{display:flex;align-items:flex-start;gap:12px;margin:18px 0}
    #td-rescue .td-rep{border-top:1px solid #eef0f2;padding-top:8px;margin-top:16px}
    #td-rescue .td-compose{display:flex;align-items:flex-start;gap:12px;margin-top:18px}
    #td-rescue .td-compose textarea{flex:1 1 auto;border:1px solid #e5e7eb;border-radius:12px;
      padding:12px 16px;font:inherit;font-size:14.5px;resize:vertical;min-height:46px;
      color:#111827;outline:none}
    #td-rescue .td-compose textarea:focus{border-color:#c7cbd1}
    #td-rescue .td-send{align-self:flex-start;border:0;border-radius:10px;background:#111827;
      color:#fff;padding:11px 18px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
    #td-rescue .td-send[disabled]{background:#d1d5db;cursor:default}
    #td-rescue .td-note{font-size:12.5px;color:#9ca3af;margin-top:8px}
    #td-rescue .td-ptitle{font-weight:700;font-size:16px;margin-bottom:4px}
    #td-rescue .td-psub{font-size:14px;color:#6b7280;margin-bottom:14px;line-height:1.45}
    #td-rescue .td-chip{display:flex;align-items:center;gap:10px;border:1px solid #eaecef;
      border-radius:999px;padding:5px 14px 5px 6px;margin-bottom:8px}
    #td-rescue .td-chip .td-nm{flex:1 1 auto;font-size:14px;font-weight:600;overflow:hidden;
      text-overflow:ellipsis;white-space:nowrap}
    #td-rescue .td-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;flex:0 0 auto}
    #td-rescue .td-row{display:flex;align-items:center;gap:10px;margin-bottom:14px}
    #td-rescue .td-rank{font-size:13px;color:#9ca3af;width:12px;flex:0 0 auto}
    #td-rescue .td-two{flex:1 1 auto;min-width:0}
    #td-rescue .td-two b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;
      white-space:nowrap}
    #td-rescue .td-two span{display:block;font-size:12.5px;color:#9ca3af;overflow:hidden;
      text-overflow:ellipsis;white-space:nowrap}
    #td-rescue .td-pts{font-size:14px;font-weight:600;flex:0 0 auto}
    #td-rescue .td-topic{display:flex;gap:10px;margin-bottom:14px}
    #td-rescue .td-topic .td-cnt{margin-left:auto;font-size:13px;color:#9ca3af;
      white-space:nowrap}
  `;

  const PILL = {
    QUESTION: ["#eff6ff", "#2563eb"],
    REFLECTION: ["#f5f3ff", "#7c3aed"],
    WIN: ["#ecfdf5", "#059669"],
  };

  // Their like and reply routes were never observed directly, so try the plausible
  // ones in order and remember the first that works. A miss is a 404 and does nothing.
  const likeUrls = (id) => [API + "/posts/" + id + "/like", API + "/posts/" + id + "/likes"];
  const replyUrls = (id) => [API + "/posts/" + id + "/replies", API + "/posts/" + id + "/comments"];

  const run = async () => {
    const m = location.pathname.match(POST_PATH);
    if (!m || !has404()) return;
    const id = m[1];
    if (busy === id) return;
    busy = id;

    const [postRes, repRes, activeRes, boardRes, homeRes] = await Promise.all([
      get(API + "/posts/" + id),
      get(API + "/posts/" + id + "/replies"),
      get(API + "/active"),
      get(API + "/leaderboard?limit=10"),
      get(API + "/home"),
    ]);

    const post = postRes?.data;
    if (!post?.body) return;

    let replies = findList(repRes) || [];
    const active = findList(activeRes) || [];
    const board = findList(boardRes) || [];
    const topics =
      findList(homeRes, (x) => x && ("hashtag" in x || "tag" in x || "topic" in x)) || [];
    const total =
      findNum(activeRes, ["activeThisWeek", "activeCount", "weeklyActive", "total"]) ??
      active.length;

    const pill = PILL[post.postType] || ["#f3f4f6", "#4b5563"];

    // --- actions row ---
    let liked = !!post.likedByMe;
    let likes = post._count?.likes ?? 0;

    const replyCount = h("span", { text: String(replies.length || post._count?.replies || 0) });
    const likeCount = h("span", { text: String(likes) });
    const likeBtn = h("button", { class: "td-act" + (liked ? " on" : ""), title: "Like" });
    const repaintLike = () => {
      likeBtn.replaceChildren(icon("heart", liked), likeCount);
      likeBtn.className = "td-act" + (liked ? " on" : "");
      likeCount.textContent = String(likes);
    };
    repaintLike();

    likeBtn.onclick = async () => {
      const before = { liked, likes };
      liked = !liked;
      likes += liked ? 1 : -1;
      repaintLike();
      likeBtn.disabled = true;
      let ok = null;
      for (const u of likeUrls(id)) {
        ok = await send(u, before.liked ? undefined : {}, before.liked ? "DELETE" : "POST");
        if (ok) break;
        ok = await send(u, {}, "POST"); // some APIs toggle on POST
        if (ok) break;
      }
      likeBtn.disabled = false;
      if (!ok) {
        liked = before.liked;
        likes = before.likes;
        repaintLike();
        likeBtn.title = "Like failed: this build could not find the like endpoint";
      }
    };

    const commentBtn = h("button", { class: "td-act", title: "Replies" },
      icon("comment"), replyCount);
    commentBtn.onclick = () => box.focus();

    const acts = h("div", { class: "td-acts" },
      commentBtn,
      likeBtn,
      h("button", { class: "td-act td-spacer", title: "Bookmark", disabled: "" },
        icon("bookmark", !!post.bookmarkedByMe)),
      h("button", { class: "td-act", title: "Copy link" }, icon("share")));
    acts.lastChild.onclick = () => navigator.clipboard?.writeText(location.href);

    // --- composer ---
    const box = h("textarea", {
      rows: "1",
      placeholder: "Add to the conversation... Use @ to mention a cohort mate.",
    });
    const sendBtn = h("button", { class: "td-send", text: "Reply", disabled: "" });
    const note = h("div", { class: "td-note" });
    const repList = h("div", { class: "td-rep" }, replies.map(reply));

    box.oninput = () => {
      sendBtn.disabled = !box.value.trim();
      box.style.height = "auto";
      box.style.height = Math.min(box.scrollHeight, 240) + "px";
    };

    sendBtn.onclick = async () => {
      const body = box.value.trim();
      if (!body) return;
      sendBtn.disabled = true;
      note.textContent = "Sending...";
      let ok = null;
      for (const u of replyUrls(id)) {
        for (const payload of [{ body }, { content: body }, { text: body }]) {
          ok = await send(u, payload);
          if (ok) break;
        }
        if (ok) break;
      }
      if (!ok) {
        note.textContent = "Could not post the reply. Their reply endpoint did not accept it.";
        sendBtn.disabled = false;
        return;
      }
      box.value = "";
      box.style.height = "auto";
      note.textContent = "";
      const fresh = findList(await get(API + "/posts/" + id + "/replies"));
      if (fresh) {
        replies = fresh;
        repList.replaceChildren(...replies.map(reply));
        replyCount.textContent = String(replies.length);
      }
    };

    const style = document.createElement("style");
    style.textContent = CSS;

    const closeBtn = h("button", { text: "Close" });
    const retryBtn = h("button", { text: "Try real page" });
    closeBtn.onclick = kill;
    retryBtn.onclick = () => location.reload();

    const card = h("div", { class: "td-card" },
      h("div", { class: "td-head" },
        h("a", { href: FEED, title: "Back to feed", text: "‹" }),
        "Discussion"),
      h("hr", { class: "td-rule" }),
      h("span", {
        class: "td-pill",
        style: "background:" + pill[0] + ";color:" + pill[1],
        text: cap(post.postType || "Post"),
      }),
      h("div", { class: "td-who" },
        face(post.author, false),
        h("div", {},
          h("div", { class: "td-name", text: who(post.author) }),
          h("div", {
            class: "td-meta",
            text: cap(post.author?.role) + " · " + rel(post.createdAt),
          }))),
      h("div", { class: "td-body", text: flow(post.body) }),
      h("hr", { class: "td-rule" }),
      acts,
      h("div", { class: "td-compose" }, box, sendBtn),
      note,
      replies.length ? repList : repList);

    const side = h("div", { class: "td-side" },
      panel("Cohort pulse", total + " learners active this week", active.map(chip)),
      topics.length
        ? panel("Trending topics", "What the cohort is discussing this week", topics.map(topicRow))
        : null,
      panel("Top contributors", "Earn points by posting, replying, and showing up.",
        board.map(rankRow)));

    const el = h("div", { id: "td-rescue" },
      style,
      h("div", { class: "td-bar" },
        h("span", { text: "Rescued view" }),
        h("span", {}, retryBtn, closeBtn)),
      h("div", { class: "td-crumb" },
        h("a", { href: FEED, text: "Thirduni" }), " / ",
        h("a", { href: FEED, text: "Community" }), " / ",
        post.title),
      h("div", { class: "td-wrap" }, h("div", { class: "td-main" }, card), side));

    document.body.appendChild(el);
  };

  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  };

  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function (...a) {
      busy = null;
      kill();
      const r = orig.apply(this, a);
      schedule();
      return r;
    };
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  schedule();
})();
