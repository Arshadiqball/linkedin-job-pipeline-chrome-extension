chrome.runtime.onInstalled.addListener(async () => {
  const { jobs } = await chrome.storage.local.get(["jobs"]);
  if (!Array.isArray(jobs)) {
    await chrome.storage.local.set({ jobs: [] });
  }
  const { topContentPostLedger } = await chrome.storage.local.get(["topContentPostLedger"]);
  if (!topContentPostLedger || typeof topContentPostLedger !== "object") {
    await chrome.storage.local.set({
      topContentPostLedger: { version: 1, posts: {} }
    });
  }
});

function clampToThreeLines(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);
  return lines.join("\n");
}

function extractChatContent(data) {
  try {
    const choice = data && data.choices && data.choices[0];
    const msg = choice && choice.message;
    const content = msg && msg.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((p) => (p && p.text) || "")
        .join("")
        .trim();
    }
  } catch (_e) {}
  return "";
}

async function generateOpenAiComment(message) {
  const { openaiApiKey, openaiModel } = await chrome.storage.local.get([
    "openaiApiKey",
    "openaiModel"
  ]);
  const apiKey = typeof openaiApiKey === "string" ? openaiApiKey.trim() : "";
  if (!apiKey) {
    return { ok: false, error: "NO_API_KEY" };
  }

  const model = (typeof openaiModel === "string" && openaiModel.trim())
    ? openaiModel.trim()
    : "gpt-4o-mini";

  const title = String(message.title || "").trim().slice(0, 400);
  const description = String(
    message.description || message.postText || ""
  )
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 2500);

  if (!title && !description) {
    return { ok: false, error: "EMPTY_CONTEXT" };
  }

  const userContent = [
    "Write a LinkedIn comment for the post below.",
    "",
    "Rules:",
    "- At most 3 lines total. Use line breaks between lines.",
    "- Each line: one short sentence (roughly under 120 characters).",
    "- Summarize the post's main idea in your own words; be specific to this content.",
    "- Sound like a thoughtful professional; avoid generic praise ('great post', 'thanks for sharing').",
    "- No bullet symbols. No numbered lists.",
    "- At most one emoji only if it truly fits the tone; otherwise none.",
    "- No hashtags unless the post title is hashtag-heavy.",
    "",
    "Post title:",
    title || "(none provided)",
    "",
    "Post body / description:",
    description || "(none provided)"
  ].join("\n");

  const body = {
    model,
    temperature: 0.85,
    max_tokens: 220,
    messages: [
      {
        role: "system",
        content:
          "You write concise LinkedIn comments. Output plain text only — no markdown, no quotes around the whole reply."
      },
      { role: "user", content: userContent }
    ]
  };

  let res;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    return { ok: false, error: "NETWORK", message: e && e.message ? e.message : String(e) };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      (data && data.error && data.error.message) || res.statusText || "OpenAI request failed";
    return { ok: false, error: "OPENAI_HTTP", status: res.status, message: errMsg };
  }

  const raw = extractChatContent(data);
  const text = clampToThreeLines(raw);
  if (!text) {
    return { ok: false, error: "EMPTY_RESPONSE" };
  }
  return { ok: true, text };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING_PIPELINE") {
    sendResponse({ ok: true, tabId: sender?.tab?.id ?? null });
    return true;
  }

  if (message?.type === "OPENAI_GENERATE_COMMENT") {
    void generateOpenAiComment(message).then(sendResponse);
    return true;
  }

  return false;
});
