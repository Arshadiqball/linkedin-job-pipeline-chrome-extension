(function registerCommentGenerator(globalObj) {
  const ns = (globalObj.LinkedInTopContent = globalObj.LinkedInTopContent || {});

  const OPENERS = [
    "Really insightful",
    "Great perspective",
    "This resonates",
    "Appreciate the share",
    "Well articulated",
    "Solid take",
    "Love this framing",
    "Thoughtful post",
    "Genuinely useful read",
    "Sharp observation"
  ];

  const CONNECTORS = [" — ", ". ", ", ", " | "];

  const CLOSERS = [
    "thanks for posting.",
    "definitely worth reflecting on.",
    "a lot to unpack here.",
    "useful reminder for anyone building in this space.",
    "bookmarking for later.",
    "curious to hear how others approach this.",
    "this mirrors what I've been seeing as well.",
    "agree strongly with the underlying point.",
    "the nuance here is often missed.",
    "adding this to my reading list."
  ];

  const TOPIC_HINTS = [
    { match: /\b(ai|ml|llm|gpt|model|agent|prompt)\b/i, hint: "the AI angle" },
    { match: /\b(lead(er(ship)?)?|manage(r|ment)?|team|culture)\b/i, hint: "the leadership angle" },
    { match: /\b(product|customer|user|pmf|roadmap)\b/i, hint: "the product-mindset framing" },
    { match: /\b(design|ux|ui|craft)\b/i, hint: "the design thinking" },
    { match: /\b(startup|founder|bootstrap|build(ing)?|ship(ping)?)\b/i, hint: "the builder perspective" },
    { match: /\b(data|analytics?|metric|insight)\b/i, hint: "the data-driven framing" },
    { match: /\b(career|job|hiring|interview|resume)\b/i, hint: "the career angle" },
    { match: /\b(engineer(ing)?|code|software|system)\b/i, hint: "the engineering lens" }
  ];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function cap(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function detectTopicHint(text) {
    if (!text) return "";
    for (const t of TOPIC_HINTS) {
      if (t.match.test(text)) return t.hint;
    }
    return "";
  }

  function generateComment(postText) {
    const opener = pick(OPENERS);
    const connector = pick(CONNECTORS);
    const closer = pick(CLOSERS);
    const hint = detectTopicHint(postText || "");

    if (hint && Math.random() > 0.25) {
      return `${opener}${connector}${cap(hint)} really stood out. ${cap(closer)}`;
    }
    return `${opener}${connector}${cap(closer)}`;
  }

  ns.commentGenerator = { generateComment };
})(globalThis);
