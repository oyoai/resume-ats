// all comments are in lowercase only.

// -----------------------------
// configuration
// -----------------------------

// job profiles with categories and keywords
const PROFILES = {
  none: {
    label: "no specific profile",
    categories: {}
  },
  data_ml: {
    label: "junior data / ml",
    categories: {
      languages: ["python", "r", "sql"],
      libraries: ["pandas", "numpy", "scikit-learn", "matplotlib"],
      tools: ["git", "docker", "jupyter", "linux"],
      concepts: ["regression", "classification", "statistics", "feature engineering"]
    }
  },
  software: {
    label: "junior software engineer",
    categories: {
      languages: ["python", "java", "javascript", "typescript"],
      frameworks: ["react", "node", "express", "django"],
      tools: ["git", "docker", "linux", "ci", "unit tests"],
      concepts: ["rest api", "oop", "design patterns"]
    }
  },
  general: {
    label: "general professional",
    categories: {
      skills: [
        "communication",
        "teamwork",
        "problem solving",
        "project management",
        "leadership",
        "time management",
        "excel",
        "presentation",
        "stakeholders"
      ]
    }
  }
};

// simple synonym map to approximate fuzzy matching
const SYNONYMS = {
  "machine learning": ["ml"],
  "scikit-learn": ["scikit learn", "sklearn"],
  "rest api": ["restful api"],
  "ci": ["continuous integration"],
  "unit tests": ["unit testing", "unittest"],
  sql: ["postgres", "mysql", "postgresql"],
  excel: ["spreadsheets"]
};

// patterns for section detection
const SECTION_PATTERNS = {
  education: /\beducation\b/i,
  experience: /\bexperience\b|\bwork history\b|\bemployment\b/i,
  skills: /\bskills\b|\btechnical skills\b|\bkey skills\b/i,
  projects: /\bprojects\b|\bpersonal projects\b|\bselected projects\b/i
};

// small stopword list for jd keyword extraction
const STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "for",
  "with",
  "on",
  "at",
  "as",
  "by",
  "from",
  "is",
  "are",
  "this",
  "that",
  "be",
  "will",
  "you",
  "we",
  "our",
  "your",
  "they",
  "their",
  "it",
  "have",
  "has"
]);

// -----------------------------
// helpers
// -----------------------------

function normalizeWhitespace(text) {
  // normalize windows/mac line breaks to \n
  let t = text.replace(/\r/g, "\n");

  // force newlines before each major section heading
  const sectionWords = ["SUMMARY", "SKILLS", "EDUCATION", "EXPERIENCE", "PROJECTS"];
  sectionWords.forEach((word) => {
    const re = new RegExp("\\s+" + word + "\\s+", "g");
    t = t.replace(re, "\n\n" + word + "\n");
  });

  // put each bullet on its own line
  // pdfs often encode bullets like: " •   text  •   text"
  t = t.replace(/•\s+/g, "\n• ");

  // also treat hyphen bullets similarly (if they appear in the future)
  t = t.replace(/\n\s*-\s+/g, "\n- ");

  // collapse runs of spaces and tabs, but keep newlines
  t = t.replace(/[ \t]+/g, " ");

  // collapse too many blank lines
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}


function splitLines(text) {
  return text.split("\n").map((l) => l.trim());
}

function basicLengthStats(text) {
  const chars = text.length;
  const words = text.split(/\s+/).filter((w) => w.length > 0).length;
  const lines = splitLines(text).length;
  return { chars, words, lines };
}

function isHeadingCandidate(line) {
  // approximate heading detection used by some parsers
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 50) return false;

  const noPunctuation = !/[.!?]$/.test(trimmed);
  const isUpperish =
    trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);

  return noPunctuation || isUpperish;
}

function detectSections(text) {
  const lines = splitLines(text);
  const found = {
    education: false,
    experience: false,
    skills: false,
    projects: false
  };

  for (const line of lines) {
    for (const [name, pattern] of Object.entries(SECTION_PATTERNS)) {
      if (pattern.test(line)) {
        found[name] = true;
      }
    }
  }

  return found;
}

function buildSkillVocab() {
  // collect all canonical skills across profiles
  const vocab = new Set();
  for (const profile of Object.values(PROFILES)) {
    for (const cat of Object.values(profile.categories)) {
      for (const kw of cat) vocab.add(kw.toLowerCase());
    }
  }
  // add synonyms as well
  for (const [canonical, syns] of Object.entries(SYNONYMS)) {
    vocab.add(canonical.toLowerCase());
    syns.forEach((s) => vocab.add(s.toLowerCase()));
  }
  return vocab;
}

const SKILL_VOCAB = buildSkillVocab();

function textToWordSet(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+.# ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return new Set(words);
}

function keywordPresent(keyword, resumeLower) {
  // check canonical keyword and synonyms in full text
  const keyLower = keyword.toLowerCase();
  if (resumeLower.includes(keyLower)) return true;

  const syns = SYNONYMS[keyLower] || [];
  for (const alt of syns) {
    if (resumeLower.includes(alt.toLowerCase())) return true;
  }
  return false;
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// render hidden characters as colored symbols for the raw text panel
function renderHiddenCharsHtml(text) {
  let out = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // handle explicit newline first so we still actually break lines
    if (ch === "\n") {
      out += '<span class="hc-newline">↵</span><br>';
      continue;
    }

    // tabs
    if (ch === "\t") {
      out += '<span class="hc-tab">⇥</span>';
      continue;
    }

    // carriage returns
    if (ch === "\r") {
      out += '<span class="hc-cr">\\r</span>';
      continue;
    }

    // regular space
    if (ch === " ") {
      out += '<span class="hc-space">·</span>';
      continue;
    }

    // common non-breaking / narrow spaces from pdfs
    if (ch === "\u00A0" || ch === "\u2007" || ch === "\u202F") {
      out += '<span class="hc-nbsp">⍽</span>';
      continue;
    }

    // any other weird whitespace character – show a generic symbol
    if (/\s/.test(ch)) {
      out += '<span class="hc-nbsp">⍽</span>';
      continue;
    }

    // normal visible characters
    out += escapeHtml(ch);
  }

  return out;
}


function deriveHeadline(text, name) {
  if (!name) return null;

  const idx = text.indexOf(name);
  if (idx === -1) return null;

  const after = text.slice(idx + name.length, idx + 260);
  const pipeIdx = after.indexOf("|");
  const segment = pipeIdx !== -1 ? after.slice(0, pipeIdx) : after;

  const cleaned = segment.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  return cleaned;
}
// extract lines that belong to education / experience / projects sections
function extractSectionLines(text) {
  const lines = splitLines(text);
  const sections = {};
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const upper = line.toUpperCase();

    if (upper === "EDUCATION" || upper === "EXPERIENCE" || upper === "PROJECTS") {
      current = upper;
      if (!sections[current]) sections[current] = [];
      continue;
    }

    if (!current) continue;
    sections[current].push(rawLine);
  }

  return sections;
}

// parse education lines into structured entries
function parseEducationLines(lines) {
  const entries = [];

  // join all education lines; pdfs often smoosh multiple entries into one line
  let joined = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");

  if (!joined) return entries;

  // normalize spacing and "a t" → "at"
  joined = joined.replace(/\s+/g, " ");
  joined = joined.replace(/\ba\s+t\b/gi, " at ");

  // global pattern:
  //   "<title> at <institution> (dates)"
  const re = /(.*?)(?:\s+at\s+)(.*?)(?:\s*\(([^)]+)\))/gi;
  let m;
  while ((m = re.exec(joined)) !== null) {
    entries.push({
      title: m[1].trim(),
      institution: m[2].trim(),
      dates: m[3] ? m[3].trim() : null,
      raw: m[0].trim(),
      bullets: []
    });
  }

  return entries;
}


// parse experience / projects lines into structured entries
function parseExperienceLines(lines) {
  const entries = [];
  let current = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // bullet lines attach to current entry
    if (/^\s*[•\-–—*·]\s+/.test(trimmed)) {
      if (current) {
        const bulletText = trimmed.replace(/^\s*[•\-–—*·]\s+/, "").trim();
        if (bulletText) current.bullets.push(bulletText);
      }
      continue;
    }

    // normalize weird spacing and "a t" → "at"
    let line = trimmed.replace(/\s+/g, " ");
    line = line.replace(/\ba\s+t\b/gi, " at ");

    // pattern:
    //   "<role> - extra info at <org> (dates)"
    //   "<role> at <org> (dates)"
    const m = line.match(
      /^(.*?)(?:\s*-\s*.*?)?\s+at\s+(.*?)(?:\s*\(([^)]+)\))?\s*$/i
    );

    if (m) {
      current = {
        role: m[1].trim(),
        organization: m[2].trim(),
        dates: m[3] ? m[3].trim() : null,
        raw: line,
        bullets: []
      };
      entries.push(current);
    } else {
      // continuation line for previous entry
      if (current) {
        current.raw += " " + line;
      }
    }
  }

  return entries;
}



function parseStructure(text, sectionFlags) {
  // make a variant of the text that is easier to parse
  const structureText = text
    .replace(/\s*-\s*/g, "-")    // fix spaced hyphens
    .replace(/\s+·\s+/g, " · ")
    .replace(/\s+/g, " ");       // collapse spaces

  const lines = splitLines(text);
  const firstChunk = structureText.slice(0, 400);

  // name: first capitalized multi-word phrase near start
  let name = null;
  const nameMatch = firstChunk.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/);
  if (nameMatch) {
    name = nameMatch[0].trim();
  }

  const headline = deriveHeadline(firstChunk, name);

  // email
  const emailMatch = structureText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0] : null;

  // phone
  const phoneMatch = structureText.match(/(\+?\d[\d\s\-]{7,}\d)/);
  const phone = phoneMatch ? phoneMatch[1].trim() : null;

  // urls
  const urls = [];
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  let um;
  while ((um = urlRegex.exec(structureText)) !== null) {
    let u = um[1].replace(/[.,);]+$/, "");
    if (!urls.includes(u)) urls.push(u);
  }

  // simple location candidates
  const locations = [];
  const locationWords = ["israel", "netherlands"];
  locationWords.forEach((w) => {
    if (structureText.toLowerCase().includes(w)) {
      const label = w.charAt(0).toUpperCase() + w.slice(1);
      if (!locations.includes(label)) locations.push(label);
    }
  });

  // bullet lines
  const bullets = [];

  // focus bullets on the actual EXPERIENCE / PROJECTS sections,
  // not any occurrence of the word "experience" in the summary.
  let bulletRegionText = text;

  // normalize for searching; note that normalizeWhitespace inserts
  // section headings as standalone lines: "\nEXPERIENCE\n", "\nPROJECTS\n"
  const idxExperienceHeading = text.indexOf("\nEXPERIENCE");
  const idxProjectsHeading = text.indexOf("\nPROJECTS");

  let startIdx = -1;
  if (idxExperienceHeading !== -1) startIdx = idxExperienceHeading;
  if (
    idxProjectsHeading !== -1 &&
    (startIdx === -1 || idxProjectsHeading < startIdx)
  ) {
    startIdx = idxProjectsHeading;
  }

  if (startIdx !== -1) {
    bulletRegionText = text.slice(startIdx);
  }

  const bulletLines = splitLines(bulletRegionText);

  for (const line of bulletLines) {
    // detect common bullet markers at the start of a line
    if (/^\s*[•\-–—*·]\s+/.test(line)) {
      const content = line.replace(/^\s*[•\-–—*·]\s+/, "").trim();
      if (content.length > 0) bullets.push(content);
      continue;
    }

    // fallback: if line contains a bullet in the middle (from imperfect splitting)
    if (line.includes("•")) {
      const parts = line.split("•").map((p) => p.trim());
      parts.forEach((p) => {
        if (p.length > 0) bullets.push(p);
      });
    }
  }



  // section headings as they appear in the text
  const sectionHeadings = [];
  for (const line of lines) {
    // reuse heading heuristic and avoid bullets
    if (isHeadingCandidate(line) && !/^\s*[•\-–—*·]/.test(line)) {
      const clean = line.replace(/[:]+$/, "").trim();
      if (!clean) continue;

      const lower = clean.toLowerCase();
      const exists = sectionHeadings.some(
        (h) => h.toLowerCase() === lower
      );
      if (!exists) {
        sectionHeadings.push(clean);
      }
    }
  }

  // extract per-section lines and parse them into entries
  const sectionLines = extractSectionLines(text);
  const educationEntries = parseEducationLines(sectionLines.EDUCATION || []);
  const experienceEntries = parseExperienceLines(sectionLines.EXPERIENCE || []);
  const projectEntries = parseExperienceLines(sectionLines.PROJECTS || []);

  return {
    name,
    headline,
    email,
    phone,
    urls,
    locations,
    bullets,
    sectionHeadings,
    sectionFlags,
    educationEntries,
    experienceEntries,
    projectEntries
  };
}


function renderParsedStructure(parsed) {
  const parts = [];

  parts.push('<div class="parsed-grid">');

  // contact block
  parts.push('<div class="parsed-block">');
  parts.push('<h4>contact</h4>');
  parts.push('<ul class="parsed-list">');
  if (parsed.name) {
    parts.push(
      `<li><span class="parsed-label">name:</span> ${escapeHtml(parsed.name)}</li>`
    );
  }
  if (parsed.headline) {
    parts.push(
      `<li><span class="parsed-label">headline:</span> ${escapeHtml(
        parsed.headline
      )}</li>`
    );
  }
  if (parsed.email) {
    parts.push(
      `<li><span class="parsed-label">email:</span> ${escapeHtml(
        parsed.email
      )}</li>`
    );
  }
  if (parsed.phone) {
    parts.push(
      `<li><span class="parsed-label">phone:</span> ${escapeHtml(
        parsed.phone
      )}</li>`
    );
  }
  if (parsed.locations && parsed.locations.length) {
    parts.push(
      `<li><span class="parsed-label">locations:</span> ${parsed.locations
        .map(escapeHtml)
        .join(", ")}</li>`
    );
  }
  parts.push("</ul>");
  parts.push("</div>");

  // links block
  parts.push('<div class="parsed-block">');
  parts.push('<h4>links</h4>');
  if (parsed.urls && parsed.urls.length) {
    parts.push('<ul class="parsed-list">');
    parsed.urls.forEach((u) => {
      parts.push(
        `<li><span class="parsed-label">url:</span> <a href="${escapeHtml(
          u
        )}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a></li>`
      );
    });
    parts.push("</ul>");
  } else {
    parts.push('<p class="parsed-hint">no urls detected.</p>');
  }
  parts.push("</div>");

  // sections block
  parts.push('<div class="parsed-block">');
  parts.push('<h4>sections</h4>');

  if (parsed.sectionHeadings && parsed.sectionHeadings.length) {
    parts.push('<ul class="parsed-list">');
    parsed.sectionHeadings.forEach((h) => {
      parts.push(`<li>${escapeHtml(h)}</li>`);
    });
    parts.push("</ul>");
  } else {
    parts.push('<p class="parsed-hint">no clear section headings detected.</p>');
  }

  parts.push("</div>");

  // experience entries block
  parts.push('<div class="parsed-block parsed-block-wide">');
  parts.push('<h4>experience entries</h4>');

  if (parsed.experienceEntries && parsed.experienceEntries.length) {
    const previewCount = 3;

    parts.push('<ul class="parsed-list">');
    parsed.experienceEntries.forEach((e, idx) => {
      const headerParts = [];
      if (e.role) headerParts.push(escapeHtml(e.role));
      if (e.organization) headerParts.push(escapeHtml(e.organization));
      const header = headerParts.join(" — ");
      const listId = `exp-bullets-${idx}`;

      parts.push("<li>");
      parts.push(`<div class="parsed-entry-title">${header}</div>`);
      if (e.dates) {
        parts.push(
          `<div class="parsed-entry-meta">${escapeHtml(e.dates)}</div>`
        );
      }

      if (e.bullets && e.bullets.length) {
        parts.push(`<ul class="parsed-entry-bullets" id="${listId}">`);
        e.bullets.forEach((b, bi) => {
          const extraClass = bi >= previewCount ? ' class="hidden-bullet"' : "";
          parts.push(`<li${extraClass}>${escapeHtml(b)}</li>`);
        });
        parts.push("</ul>");

        if (e.bullets.length > previewCount) {
          parts.push(
            `<button type="button" class="entry-bullet-toggle" data-target="${listId}" data-preview="${previewCount}" data-total="${e.bullets.length}" data-state="collapsed">show all ${e.bullets.length} bullets</button>`
          );
        }
      }

      parts.push("</li>");
    });
    parts.push("</ul>");
  } else {
    parts.push(
      '<p class="parsed-hint">no structured experience entries detected.</p>'
    );
  }

  parts.push("</div>");

  // education entries block
  parts.push('<div class="parsed-block parsed-block-wide">');
  parts.push('<h4>education entries</h4>');

  if (parsed.educationEntries && parsed.educationEntries.length) {
    const previewCount = 3;

    parts.push('<ul class="parsed-list">');
    parsed.educationEntries.forEach((e, idx) => {
      const headerParts = [];
      if (e.title) headerParts.push(escapeHtml(e.title));
      if (e.institution) headerParts.push(escapeHtml(e.institution));
      const header = headerParts.join(" — ");
      const listId = `edu-bullets-${idx}`;

      parts.push("<li>");
      parts.push(`<div class="parsed-entry-title">${header}</div>`);
      if (e.dates) {
        parts.push(
          `<div class="parsed-entry-meta">${escapeHtml(e.dates)}</div>`
        );
      }

      if (e.bullets && e.bullets.length) {
        parts.push(`<ul class="parsed-entry-bullets" id="${listId}">`);
        e.bullets.forEach((b, bi) => {
          const extraClass = bi >= previewCount ? ' class="hidden-bullet"' : "";
          parts.push(`<li${extraClass}>${escapeHtml(b)}</li>`);
        });
        parts.push("</ul>");

        if (e.bullets.length > previewCount) {
          parts.push(
            `<button type="button" class="entry-bullet-toggle" data-target="${listId}" data-preview="${previewCount}" data-total="${e.bullets.length}" data-state="collapsed">show all ${e.bullets.length} bullets</button>`
          );
        }
      }

      parts.push("</li>");
    });
    parts.push("</ul>");
  } else {
    parts.push(
      '<p class="parsed-hint">no structured education entries detected.</p>'
    );
  }

  parts.push("</div>");

  // global bullets block (all bullets found anywhere)
  parts.push('<div class="parsed-block parsed-block-wide">');
  parts.push('<h4>bullet points</h4>');

  if (parsed.bullets && parsed.bullets.length) {
    const previewCount = 8;
    const totalBullets = parsed.bullets.length;

    parts.push('<ul class="parsed-entry-bullets" id="all-bullets-list">');
    parsed.bullets.forEach((b, idx) => {
      const extraClass = idx >= previewCount ? ' class="hidden-bullet"' : "";
      parts.push(`<li${extraClass}>${escapeHtml(b)}</li>`);
    });
    parts.push("</ul>");

    if (totalBullets > previewCount) {
      parts.push(
        `<button type="button" class="bullet-toggle-global" data-preview="${previewCount}" data-total="${totalBullets}" data-state="collapsed">show all ${totalBullets} bullet points</button>`
      );
    }
  } else {
    parts.push('<p class="parsed-hint">no bullet-style lines detected.</p>');
  }

  parts.push("</div>");

  parts.push("</div>");

  return parts.join("");
}



// -----------------------------
// jd keyword extraction and match
// -----------------------------

function extractJdKeywords(jdText) {
  const words = jdText
    .toLowerCase()
    .replace(/[^a-z0-9+.# ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  const unique = new Set(words);
  const jdKeywords = [];

  for (const w of unique) {
    if (SKILL_VOCAB.has(w)) {
      jdKeywords.push(w);
    }
  }

  return jdKeywords;
}

function computeJdMatch(jdKeywords, resumeText) {
  if (!jdKeywords.length) {
    return {
      matchRatio: 0,
      missing: [],
      overlapCount: 0
    };
  }

  const lower = resumeText.toLowerCase();
  const present = [];
  const missing = [];

  for (const kw of jdKeywords) {
    const found = keywordPresent(kw, lower);
    if (found) {
      present.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const matchRatio = present.length / jdKeywords.length;

  return {
    matchRatio,
    missing,
    overlapCount: present.length
  };
}

// -----------------------------
// profile keyword coverage
// -----------------------------

function computeProfileCoverage(profileKey, resumeText) {
  const profile = PROFILES[profileKey];
  if (!profile || !Object.keys(profile.categories).length) {
    return { categoryStats: [], overallCoverage: 0, detailed: [], totalKeywords: 0 };
  }

  const lower = resumeText.toLowerCase();
  const categoryStats = [];
  const detailed = [];

  let totalKeywords = 0;
  let totalPresent = 0;

  for (const [catName, keywords] of Object.entries(profile.categories)) {
    let catPresent = 0;
    const catTotal = keywords.length;

    for (const kw of keywords) {
      const present = keywordPresent(kw, lower);
      if (present) catPresent += 1;
      detailed.push({
        category: catName,
        keyword: kw,
        present
      });
    }

    totalKeywords += catTotal;
    totalPresent += catPresent;

    categoryStats.push({
      category: catName,
      present: catPresent,
      total: catTotal
    });
  }

  const overallCoverage =
    totalKeywords > 0 ? totalPresent / totalKeywords : 0;

  return { categoryStats, overallCoverage, detailed, totalKeywords };
}

// -----------------------------
// scoring
// -----------------------------

function computeScore(features) {
  // structure score: up to 30 points
  let structureScore = 0;
  if (features.hasEducation) structureScore += 10;
  if (features.hasExperience) structureScore += 10;
  if (features.hasSkills) structureScore += 10;

  // length hygiene: up to 20 points
  let lengthScore = 0;
  if (features.wordCount >= 300 && features.wordCount <= 900) lengthScore += 10;
  if (features.lineCount >= 30 && features.lineCount <= 120) lengthScore += 10;

  // profile coverage: up to 25
  const profileScore = Math.round(features.profileCoverage * 25);

  // jd match: up to 25
  const jdScore = Math.round(features.jdMatch * 25);

  // dynamic weighting so optional pieces do not punish the score
  let subtotal = structureScore + lengthScore;
  let totalWeight = 30 + 20; // structure + length always active

  if (features.includeProfile) {
    subtotal += profileScore;
    totalWeight += 25;
  }

  if (features.jdProvided) {
    subtotal += jdScore;
    totalWeight += 25;
  }

  // rescale to 0–100
  const scaled = (subtotal * 100) / totalWeight;
  let finalScore = Math.round(scaled);

  if (finalScore > 100) finalScore = 100;
  if (finalScore < 0) finalScore = 0;

  return finalScore;
}

function explainScore(features, profileLabel) {
  const parts = [];

  if (features.includeProfile) {
    parts.push(
      `profile: ${profileLabel}. structure score is based on having education, experience, and skills sections.`
    );
  } else {
    parts.push(
      `no specific job profile selected. structure score is based on having education, experience, and skills sections.`
    );
  }

  parts.push(
    `length is evaluated by word and line count to keep the resume within a typical one to two page range.`
  );

  if (features.includeProfile) {
    parts.push(
      `profile keyword coverage captures how many core technologies and concepts for the chosen profile appear in the resume.`
    );
  } else {
    parts.push(
      `because no job profile was selected, profile-specific keyword coverage is not included in the score.`
    );
  }

  if (features.jdProvided) {
    parts.push(
      `job description match compares extracted keywords from the jd with those present in the resume.`
    );
  } else {
    parts.push(
      `no job description was provided, so jd matching is not included in the score.`
    );
  }

  return parts.join(" ");
}

// -----------------------------
// pdf extraction
// -----------------------------

async function extractTextFromPdf(file) {
  // uses pdf.js to extract text from all pages
  const buffer = await file.arrayBuffer();
  const typedArray = new Uint8Array(buffer);

  const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
  const pages = pdf.numPages;
  let fullText = "";

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str);
    fullText += strings.join(" ") + "\n";
  }

  return fullText;
}
// state for raw text display
let lastDisplayText = "";
let showHiddenChars = false;

// -----------------------------
// dom wiring
// -----------------------------


document.addEventListener("DOMContentLoaded", () => {
  const profileToggle = document.getElementById("toggle-profile");
  const jdToggle = document.getElementById("toggle-jd");
  const profileInputBlock = document.getElementById("profile-input-block");
  const jdInputBlock = document.getElementById("jd-input-block");

  const profileSelect = document.getElementById("profile-select");
  const jdInput = document.getElementById("jd-input");
  const fileInput = document.getElementById("file-input");
  const analyzeBtn = document.getElementById("analyze-btn");

  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");
  const scoreValueEl = document.getElementById("score-value");
  const scoreExplanationEl = document.getElementById("score-explanation");
  const summaryListEl = document.getElementById("summary-list");

  const profileResultsSection = document.getElementById("profile-results-section");
  const keywordTableBody = document.querySelector("#keyword-table tbody");

  const jdResultsSection = document.getElementById("jd-results-section");
  const jdSummaryEl = document.getElementById("jd-summary");
  const jdMissingListEl = document.getElementById("jd-missing-list");

//   const sectionsListEl = document.getElementById("sections-list");
  const rawTextEl = document.getElementById("raw-text");
  const parsedStructureEl = document.getElementById("parsed-structure");

  // pdf preview elements
  const pdfPreviewContainer = document.getElementById("pdf-preview-container");
  const pdfEmbed = document.getElementById("pdf-embed");
  const pdfFilenameEl = document.getElementById("pdf-filename");
  const pdfRemoveBtn = document.getElementById("pdf-remove-btn");
  const uploadDrop = document.querySelector(".upload-drop");

  const hiddenCharsToggle = document.getElementById("toggle-hidden-chars");
  if (hiddenCharsToggle) {
    hiddenCharsToggle.addEventListener("change", () => {
      showHiddenChars = hiddenCharsToggle.checked;
      updateRawText();
    });
  }



  let currentPdfUrl = null;
  // update the raw text panel according to the toggle state
  function updateRawText() {
    if (!lastDisplayText) {
      rawTextEl.innerHTML = "";
      return;
    }

    if (showHiddenChars) {
      rawTextEl.innerHTML = renderHiddenCharsHtml(lastDisplayText);
    } else {
      rawTextEl.textContent = lastDisplayText;
    }
  }

  // generic helper to clear file + preview + results
  function clearFileAndPreview() {
    if (currentPdfUrl) {
      URL.revokeObjectURL(currentPdfUrl);
      currentPdfUrl = null;
    }

    fileInput.value = "";
    analyzeBtn.disabled = true;

    pdfPreviewContainer.classList.add("hidden");
    pdfEmbed.removeAttribute("src");
    pdfFilenameEl.textContent = "";

    // show the dropzone again when there is no file
    if (uploadDrop) {
      uploadDrop.classList.remove("hidden");
    }

    resultsEl.classList.add("hidden");
    statusEl.textContent = "";
  }


  // sync visibility of optional input blocks based on toggles
  function syncToggles() {
    if (profileToggle.checked) {
      profileInputBlock.classList.remove("hidden");
    } else {
      profileInputBlock.classList.add("hidden");
    }

    if (jdToggle.checked) {
      jdInputBlock.classList.remove("hidden");
    } else {
      jdInputBlock.classList.add("hidden");
    }
  }

  profileToggle.addEventListener("change", syncToggles);
  jdToggle.addEventListener("change", syncToggles);
  syncToggles();

  // handle file selection: enable button, show preview, hide old results
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];

    if (!file) {
      clearFileAndPreview();
      return;
    }

    if (file.type !== "application/pdf") {
      statusEl.textContent = "please upload a pdf file.";
      clearFileAndPreview();
      return;
    }

    // clear old url if exists
    if (currentPdfUrl) {
      URL.revokeObjectURL(currentPdfUrl);
      currentPdfUrl = null;
    }

    currentPdfUrl = URL.createObjectURL(file);
    pdfEmbed.src = currentPdfUrl;
    pdfFilenameEl.textContent = file.name;

    // hide the dropzone when a valid pdf is selected
    if (uploadDrop) {
      uploadDrop.classList.add("hidden");
    }

    pdfPreviewContainer.classList.remove("hidden");

    analyzeBtn.disabled = false;
    resultsEl.classList.add("hidden");
    statusEl.textContent = "";
  });


  // remove pdf when clicking the x button
  pdfRemoveBtn.addEventListener("click", () => {
    clearFileAndPreview();
  });

  analyzeBtn.addEventListener("click", async () => {
    if (analyzeBtn.disabled) {
      return;
    }

    statusEl.textContent = "parsing resume...";
    resultsEl.classList.add("hidden");

    try {
      const file = fileInput.files[0];
      if (!file) {
        statusEl.textContent = "please upload a pdf resume first.";
        return;
      }

      let resumeText = await extractTextFromPdf(file);
      const normalized = normalizeWhitespace(resumeText);

      if (!normalized) {
        statusEl.textContent = "no text could be extracted from the resume.";
        return;
      }

      // basic stats
      const stats = basicLengthStats(normalized);

      // sections
      const sectionFlags = detectSections(normalized);

      // profile usage
      const profileKey = profileSelect.value || "none";
      const profileInfo = PROFILES[profileKey] || PROFILES.none;
      const useProfile = profileToggle.checked && profileKey !== "none";

      const coverage = useProfile
        ? computeProfileCoverage(profileKey, normalized)
        : { categoryStats: [], overallCoverage: 0, detailed: [], totalKeywords: 0 };

      const includeProfile = useProfile && coverage.totalKeywords > 0;

      // jd usage
      const jdTextRaw = jdInput.value.trim();
      const jdToggleOn = jdToggle.checked;
      const jdProvided = jdToggleOn && jdTextRaw.length > 0;

      let jdKeywords = [];
      let jdMatchInfo = { matchRatio: 0, missing: [], overlapCount: 0 };

      if (jdProvided) {
        jdKeywords = extractJdKeywords(jdTextRaw);
        jdMatchInfo = computeJdMatch(jdKeywords, normalized);
      }

      // build features for scoring
      const features = {
        hasEducation: sectionFlags.education,
        hasExperience: sectionFlags.experience,
        hasSkills: sectionFlags.skills,
        wordCount: stats.words,
        lineCount: stats.lines,
        profileCoverage: includeProfile ? coverage.overallCoverage : 0,
        jdMatch: jdProvided ? jdMatchInfo.matchRatio : 0,
        jdProvided,
        includeProfile
      };

      const score = computeScore(features);
      const explanation = explainScore(features, profileInfo.label);

      // score + explanation
      scoreValueEl.textContent = `${score}`;
      scoreExplanationEl.textContent = explanation;

      // summary list
      summaryListEl.innerHTML = "";
      const summaryItems = [
        `characters: ${stats.chars}`,
        `words: ${stats.words}`,
        `lines: ${stats.lines}`
      ];

      if (includeProfile) {
        summaryItems.push(
          `profile: ${profileInfo.label}`,
          `profile keyword coverage: ${(coverage.overallCoverage * 100).toFixed(1)} %`
        );
      }

      if (jdProvided) {
        summaryItems.push(
          `jd match coverage: ${(jdMatchInfo.matchRatio * 100).toFixed(1)} %`
        );
      }

      summaryItems.forEach((txt) => {
        const li = document.createElement("li");
        li.textContent = txt;
        summaryListEl.appendChild(li);
      });

      // profile results section
      keywordTableBody.innerHTML = "";
      if (includeProfile && coverage.detailed.length) {
        coverage.detailed.forEach((row) => {
          const tr = document.createElement("tr");

          const tdCat = document.createElement("td");
          tdCat.textContent = row.category;
          tr.appendChild(tdCat);

          const tdKw = document.createElement("td");
          tdKw.textContent = row.keyword;
          tr.appendChild(tdKw);

          const tdPresent = document.createElement("td");
          tdPresent.textContent = row.present ? "yes" : "no";
          tdPresent.className = row.present
            ? "keyword-present"
            : "keyword-missing";
          tr.appendChild(tdPresent);

          keywordTableBody.appendChild(tr);
        });
        profileResultsSection.classList.remove("hidden");
      } else {
        profileResultsSection.classList.add("hidden");
      }

      // jd results section
      jdMissingListEl.innerHTML = "";
      if (jdProvided) {
        jdSummaryEl.textContent = jdKeywords.length
          ? `extracted ${jdKeywords.length} jd keywords, ${jdMatchInfo.overlapCount} found in the resume.`
          : "no relevant jd keywords were detected using the current heuristic.";

        jdMatchInfo.missing
          .sort()
          .forEach((kw) => {
            const li = document.createElement("li");
            li.textContent = kw;
            jdMissingListEl.appendChild(li);
          });

        if (!jdMatchInfo.missing.length) {
          const li = document.createElement("li");
          li.textContent = "no obvious missing jd keywords were detected.";
          jdMissingListEl.appendChild(li);
        }

        jdResultsSection.classList.remove("hidden");
      } else {
        jdResultsSection.classList.add("hidden");
      }

    //   // section detection list
    //   sectionsListEl.innerHTML = "";
    //   const sectionLabels = {
    //     education: "education",
    //     experience: "experience / work history",
    //     skills: "skills",
    //     projects: "projects"
    //   };
    //   for (const [key, label] of Object.entries(sectionLabels)) {
    //     const li = document.createElement("li");
    //     const present = sectionFlags[key];
    //     li.textContent = `${label}: ${present ? "detected" : "not detected"}`;
    //     sectionsListEl.appendChild(li);
    //   }

      // raw text display
      const maxChars = 8000;
      const displayText =
        normalized.length > maxChars
          ? normalized.slice(0, maxChars) + "\n\n[truncated...]"
          : normalized;

      lastDisplayText = displayText;
      updateRawText();


      // parsed structure for debug-style view
const parsed = parseStructure(normalized, sectionFlags);
parsedStructureEl.innerHTML = renderParsedStructure(parsed);

// wire up global bullet expansion toggle
const globalBulletToggle =
  parsedStructureEl.querySelector(".bullet-toggle-global");
if (globalBulletToggle) {
  const previewCount = parseInt(globalBulletToggle.dataset.preview || "0", 10);
  const total = parseInt(globalBulletToggle.dataset.total || "0", 10);
  const list = parsedStructureEl.querySelector("#all-bullets-list");

  globalBulletToggle.addEventListener("click", () => {
    const expanded = globalBulletToggle.dataset.state === "expanded";
    const items = list ? Array.from(list.querySelectorAll("li")) : [];

    items.forEach((li, idx) => {
      if (idx >= previewCount) {
        li.style.display = expanded ? "none" : "list-item";
      }
    });

    globalBulletToggle.dataset.state = expanded ? "collapsed" : "expanded";
    globalBulletToggle.textContent = expanded
      ? `show all ${total} bullet points`
      : "show fewer bullet points";
  });
}

// wire up per-entry bullet toggles for experience and education
const entryToggles = parsedStructureEl.querySelectorAll(".entry-bullet-toggle");
entryToggles.forEach((btn) => {
  const previewCount = parseInt(btn.dataset.preview || "0", 10);
  const total = parseInt(btn.dataset.total || "0", 10);
  const targetId = btn.dataset.target;
  const list = parsedStructureEl.querySelector("#" + targetId);

  btn.addEventListener("click", () => {
    if (!list) return;

    const expanded = btn.dataset.state === "expanded";
    const items = Array.from(list.querySelectorAll("li"));

    items.forEach((li, idx) => {
      if (idx >= previewCount) {
        li.style.display = expanded ? "none" : "list-item";
      }
    });

    btn.dataset.state = expanded ? "collapsed" : "expanded";
    btn.textContent = expanded
      ? `show all ${total} bullets`
      : "show fewer bullets";
  });
});



      statusEl.textContent = "analysis complete.";
      resultsEl.classList.remove("hidden");
    } catch (err) {
      console.error(err);
      statusEl.textContent =
        "an error occurred while parsing the resume. check the console for details.";
      resultsEl.classList.add("hidden");
    }
  });
});
