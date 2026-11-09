export type AdminAssistantIntent =
  | { kind: "fee_collections"; range: "today" | "month" | "year" }
  | { kind: "fee_outstanding"; overdueOnly: boolean; listStudents: boolean; classTerm: string | null }
  | { kind: "student_count"; classTerm: string | null; classBreakdown: boolean }
  | { kind: "student_lookup"; term: string }
  | { kind: "attendance_today" }
  | { kind: "help" };

function normalizeQuestion(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getClassTerm(question: string): string | null {
  const match = /(?:class|grade)\s+([\p{L}\p{N}-]+)/u.exec(question);
  return match?.[1] ?? null;
}

function asksForUnsupportedPeriod(question: string): boolean {
  return /\b(yesterday|last\s+(?:week|month|year)|previous\s+(?:week|month|year)|(?:19|20)\d{2})\b/u.test(question);
}

export function classifyAdminAssistantQuestion(value: string): AdminAssistantIntent {
  const question = normalizeQuestion(value);
  const classTerm = getClassTerm(question);

  if (
    /\battendance\b/u.test(question)
    && !classTerm
    && !asksForUnsupportedPeriod(question)
    && !/\b(section|week|month|year)\b/u.test(question)
  ) {
    return { kind: "attendance_today" };
  }

  if (/\b(outstanding|overdue|dues|unpaid)\b/u.test(question)) {
    if (asksForUnsupportedPeriod(question)) return { kind: "help" };
    return {
      kind: "fee_outstanding",
      overdueOnly: /\b(overdue|late)\b/u.test(question),
      listStudents: /\b(who|which|students|names|list)\b/u.test(question),
      classTerm,
    };
  }

  if (
    /\b(how many|counts?|total|number of)\b/u.test(question)
    && /\bstudents?\b/u.test(question)
  ) {
    if (asksForUnsupportedPeriod(question) || /\b(withdrawn|archived|inactive)\b/u.test(question)) {
      return { kind: "help" };
    }
    return {
      kind: "student_count",
      classTerm,
      classBreakdown: /\b(by class|class wise|class-wise|each class|each grade|by grade)\b/u.test(question),
    };
  }

  const lookup = /\b(?:find|search(?: for)?|look up|lookup|locate|show)\s+(?:the\s+)?(?:student\s+)?(?:named\s+)?(.+)$/u.exec(question);
  if (lookup && /\b(student|admission|name|named)\b/u.test(question.slice(0, lookup.index + lookup[0].indexOf(lookup[1])))) {
    if (/\b(withdrawn|archived|inactive|last|previous|yesterday)\b/u.test(question)) return { kind: "help" };
    const term = lookup[1]
      .replace(/^(?:called|named|admission(?: number| no)?|number)\s+/u, "")
      .replace(/\s+(?:in|from)\s+(?:class|grade)\s+[\p{L}\p{N}-]+.*$/u, "")
      .trim();
    const genericSearch = /^(?:by name|by admission(?: number| no)?|by name or admission(?: number| no)?|name or admission(?: number| no)?)$/u;
    return { kind: "student_lookup", term: genericSearch.test(term) ? "" : term };
  }

  if (
    /\b(fee|fees|collection|collect|collected|received|cash|online|payment|payments)\b/u.test(question)
    && /\b(collection|collect|collected|received|cash|online|payments?)\b/u.test(question)
  ) {
    if (asksForUnsupportedPeriod(question)) return { kind: "help" };
    const range = /\b(today|daily|today's)\b/u.test(question)
      ? "today"
      : /\b(this year|academic year|annual|yearly)\b/u.test(question)
        ? "year"
        : "month";
    return { kind: "fee_collections", range };
  }

  return { kind: "help" };
}
