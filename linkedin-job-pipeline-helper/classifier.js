(function registerClassifier(globalObj) {
  const { textOrEmpty } = globalObj.LinkedInPipeline.utils;

  const categoryRules = [
    { category: "Backend Engineering", keywords: ["backend", "back-end", "server-side", "java", "golang", "node.js", "python"] },
    { category: "Frontend Engineering", keywords: ["frontend", "front-end", "react", "angular", "vue", "ui engineer"] },
    { category: "Fullstack Engineering", keywords: ["fullstack", "full stack", "full-stack"] },
    { category: "Mobile Development", keywords: ["ios", "android", "mobile", "react native", "flutter"] },
    { category: "DevOps / SRE", keywords: ["devops", "site reliability", "sre", "platform engineer", "infrastructure"] },
    { category: "Data Engineering", keywords: ["data engineer", "etl", "data pipeline", "analytics engineer"] },
    { category: "Machine Learning / AI", keywords: ["machine learning", "ml engineer", "ai", "llm", "deep learning"] },
    { category: "Product Management", keywords: ["product manager", "product owner", "pm "] },
    { category: "Design / UX", keywords: ["designer", "ux", "ui/ux", "product design"] },
    { category: "Quality Assurance", keywords: ["qa", "quality assurance", "test engineer", "automation engineer"] },
    { category: "Marketing", keywords: ["marketing", "growth", "demand generation", "seo"] },
    { category: "Sales", keywords: ["sales", "account executive", "business development"] },
    { category: "Operations", keywords: ["operations", "program manager", "business operations"] }
  ];

  function categorizeRole(title) {
    const normalizedTitle = textOrEmpty(title).toLowerCase();
    for (const rule of categoryRules) {
      if (rule.keywords.some((keyword) => normalizedTitle.includes(keyword))) {
        return rule.category;
      }
    }
    return "Other";
  }

  function detectJobType(location) {
    const normalizedLocation = textOrEmpty(location).toLowerCase();
    if (
      normalizedLocation.includes("remote") ||
      normalizedLocation.includes("work from home") ||
      normalizedLocation.includes("anywhere")
    ) {
      return "Remote";
    }
    if (normalizedLocation.includes("hybrid")) {
      return "Hybrid";
    }
    return "Onsite";
  }

  globalObj.LinkedInPipeline.classifier = {
    categorizeRole,
    detectJobType
  };
})(globalThis);
