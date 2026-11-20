import fs from "node:fs";
const path = "artifacts/campus-live/src/components/fees/fees-page.tsx";
let s = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// 1. imports: add fees-due hook + recharts + CreditCard icon already imported
s = s.replace(
  `  useGetAcademicYears,
  useGetLearningTerms,
  useGetSections,`,
  `  useGetAcademicYears,
  useGetFeesDueReport,
  useGetLearningTerms,
  useGetSections,`,
);
s = s.replace(
  `import { SCHOOL_NAME } from "@/lib/branding";`,
  `import { SCHOOL_NAME } from "@/lib/branding";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";`,
);

// 2. v2 header + KPI cards + donut, inserted before <FeeCollectionReport />
const anchor = `        <FeeCollectionReport />`;
const insert = `        <div className="pg-header">
          <div className="pg-title-wrap">
            <span className="pg-title-icon"><CreditCard size={26} strokeWidth={1.7} /></span>
            <div>
              <h1 className="pg-title">Fees &amp; Payments</h1>
              <p className="pg-sub">Finance · Invoices, collections, concessions / scholarships and receipts.</p>
            </div>
          </div>
        </div>
        <div className="pg-stats">
          <div className="pg-stat"><span className="pg-icon pg-icon-green"><CreditCard size={18} /></span><div><span>Total billed</span><strong>{feesDue.data?.summary.billed ?? "—"}</strong></div><em className="pg-icon-green">{feesDue.data?.summary.paid ?? 0} paid</em></div>
          <div className="pg-stat"><span className="pg-icon pg-icon-red"><CreditCard size={18} /></span><div><span>Outstanding dues</span><strong>{feesDue.data?.summary.outstanding ?? "—"}</strong></div><em className="pg-icon-red">{feesDue.data?.summary.unpaid ?? 0} not paid</em></div>
          <div className="pg-stat"><span className="pg-icon pg-icon-amber"><Percent size={18} /></span><div><span>Collected</span><strong>{feesDue.data?.summary.collected ?? "—"}</strong></div><em className="pg-icon-amber">{feesDue.data?.summary.partial ?? 0} partial</em></div>
          <div className="pg-stat"><span className="pg-icon pg-icon-blue"><CreditCard size={18} /></span><div><span>Invoices</span><strong>{feesDue.data?.total ?? "—"}</strong></div></div>
        </div>
        <section className="surface p-4 md:p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="display m-0 text-sm font-bold">Payment status — {selectedAcademicYear}</h2>
            <Link href="/admin/reports" className="dashboard-text-link text-xs">Full report <ArrowRight size={12} /></Link>
          </div>
          {feesDue.isLoading ? (
            <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">Loading fee status…</p>
          ) : (() => {
            const s = feesDue.data?.summary;
            if (!s) return null;
            const slices = [
              { name: "Paid", value: s.paid, color: "#2e8b70" },
              { name: "Partial", value: s.partial, color: "#dc8b43" },
              { name: "Not paid", value: s.unpaid, color: "#b94f47" },
            ].filter((slice) => slice.value > 0);
            return (
              <div className="flex flex-wrap items-center gap-6">
                <ResponsiveContainer width={160} height={130}>
                  <PieChart>
                    <Pie data={slices.length ? slices : [{ name: "None", value: 1, color: "#e3e1d8" }]} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={2} strokeWidth={0}>
                      {(slices.length ? slices : [{ color: "#e3e1d8" }]).map((slice, i) => <Cell key={i} fill={slice.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid gap-2 text-xs font-semibold">
                  <span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[#2e8b70]" />Paid — {s.paid} invoices</span>
                  <span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[#dc8b43]" />Partial — {s.partial}</span>
                  <span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-[#b94f47]" />Not paid — {s.unpaid}</span>
                </div>
              </div>
            );
          })()}
        </section>
        <FeeCollectionReport />`;
if (!s.includes(anchor)) throw new Error("FeeCollectionReport anchor not found");
s = s.replace(anchor, insert);

// 3. Add fees-due query next to other hooks (find admin invoice query anchor)
const hookAnchor = `  useGetAcademicYears,`;
// find where academicYears is created to place the hook after; simpler: add near top-level component — locate `const adminRoles` is outside. Add hook inside component by anchoring on a known state line.
const stateAnchor = `const invoicePageSize = 100;`;
// Hook must be inside the component; anchor on `const [targetMode` usage? Use a robust anchor: the FeeCollectionReport import position won't help. Use "function FeesPage" area — find `onlinePaymentsEnabled` import already there. Anchor on the component body: search for `useGenerateFeeInvoices(` occurrence.
if (!s.includes("useGetFeesDueReport({")) {
  const compAnchor = s.indexOf("useGenerateFeeInvoices(");
  if (compAnchor === -1) throw new Error("component anchor not found");
  // insert hook before this mutation's declaration line start
  const lineStart = s.lastIndexOf("\n", compAnchor) + 1;
  const indent = s.slice(lineStart, compAnchor).match(/^\s*/)?.[0] ?? "  ";
  const hookLine = `${indent}const feesDue = useGetFeesDueReport({ academicYear: selectedAcademicYear }, { query: { enabled: !!selectedAcademicYear } });\n`;
  s = s.slice(0, lineStart) + hookLine + s.slice(lineStart);
}

// 4. ensure ArrowRight imported from lucide
if (!s.includes("ArrowRight,")) s = s.replace("import { ChevronDown,", "import { ArrowRight, ChevronDown,");

fs.writeFileSync(path, s.replace(/\r\n/g, "\n"));
console.log("fees page patched");
