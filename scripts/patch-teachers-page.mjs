import fs from "node:fs";
const path = "artifacts/campus-live/src/components/academic/teachers-page.tsx";
let t = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n"); // normalize to LF

const replacements = [
  [
    `      ) : !records.data?.items.length ? (\n        <p className="mb-0 text-sm text-[hsl(var(--muted-foreground))]">No staff members yet.</p>\n      ) : (\n        <div className="divide-y divide-[hsl(var(--border))]">\n          {records.data.items.map((staff) => (`,
    `      ) : !records.data?.items.length ? (\n        <p className="mb-0 text-sm text-[hsl(var(--muted-foreground))]">No staff members yet.</p>\n      ) : (\n        <>\n        <div className="mb-4 flex flex-wrap gap-2">\n          <button type="button" className={\`btn min-h-8 px-3 text-xs \${categoryFilter === "" ? "btn-primary" : "btn-muted"}\`} onClick={() => setCategoryFilter("")}>All ({records.data.items.length})</button>\n          {STAFF_CATEGORIES.map((cat) => {\n            const count = records.data.items.filter((s) => s.category === cat).length;\n            return <button key={cat} type="button" className={\`btn min-h-8 px-3 text-xs \${categoryFilter === cat ? "btn-primary" : "btn-muted"}\`} onClick={() => setCategoryFilter(cat)}>{cat} ({count})</button>;\n          })}\n        </div>\n        <div className="divide-y divide-[hsl(var(--border))]">\n          {records.data.items.filter((staff) => !categoryFilter || staff.category === categoryFilter).map((staff) => (`,
  ],
  [
    `[staff.employeeCode && \`Code \${staff.employeeCode}\`, staff.phone,`,
    `[staff.category, staff.employeeCode && \`Code \${staff.employeeCode}\`, staff.phone,`,
  ],
  [
    `            ))}\n          </div>\n        </div>\n      )}\n    </section>\n  );\n}`,
    `            ))}\n          </div>\n        </>\n      )}\n    </section>\n  );\n}`,
  ],
  [
    `                  <label className="text-xs font-semibold">Joining date\n                    <input type="date" className="field mt-1.5" value={draft.joiningDate} onChange={(e) => setDraft({ ...draft, joiningDate: e.target.value })} />\n                  </label>`,
    `                  <label className="text-xs font-semibold">Joining date\n                    <input type="date" className="field mt-1.5" value={draft.joiningDate} onChange={(e) => setDraft({ ...draft, joiningDate: e.target.value })} />\n                  </label>\n                  <label className="text-xs font-semibold">Category\n                    <select className="field mt-1.5" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>\n                      <option value="">Select…</option>\n                      {STAFF_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}\n                    </select>\n                  </label>`,
  ],
];

for (const [anchor, replacement] of replacements) {
  if (!t.includes(anchor)) throw new Error("anchor not found: " + anchor.slice(0, 60));
  t = t.replace(anchor, replacement);
}
fs.writeFileSync(path, t, { encoding: "utf8" });
console.log("teachers page: category UI applied");
