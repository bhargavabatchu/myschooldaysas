"use client";

import { useState } from "react";
import { Link } from "wouter";
import {
  useGetClasses,
  useGetFeeCollections,
  useGetSections,
  type GetFeeCollectionsChannel,
} from "@workspace/api-client-react";
import "./fee-collection-report.css";

const money = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(paise / 100);
const pageSize = 25;

function schoolDateToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const methodLabel: Record<string, string> = {
  mock: "Online test",
  razorpay: "Razorpay",
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  other: "Other",
};

const channelLabel: Record<string, string> = {
  cash: "Cash",
  online: "Digital / online",
  cheque: "Cheque",
  other: "Other",
  test: "Test payment",
};

export function FeeCollectionReport() {
  const [date, setDate] = useState(schoolDateToday);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [channel, setChannel] = useState<GetFeeCollectionsChannel | "">("");
  const [offset, setOffset] = useState(0);
  const classes = useGetClasses({ includeArchived: true });
  const sectionParams = { classId: classId || undefined, includeArchived: true };
  const sections = useGetSections(sectionParams, {
    query: { enabled: Boolean(classId) },
  });
  const report = useGetFeeCollections(
    {
      date,
      classId: classId || undefined,
      sectionId: sectionId || undefined,
      channel: channel || undefined,
      limit: pageSize,
      offset,
    },
    { query: { refetchOnWindowFocus: false } },
  );
  const data = report.data;
  const summary = data?.summary;
  const wholeDaySummary = data?.wholeDaySummary;
  const hasFilters = Boolean(classId || sectionId || channel);
  const activeFilters = [
    classId ? classes.data?.items.find((item) => item.id === classId)?.name ?? "Selected class" : null,
    sectionId ? sections.data?.items.find((item) => item.id === sectionId)?.name ?? "Selected section" : null,
    channel ? channelLabel[channel] : null,
  ].filter(Boolean);
  const cards = summary ? [
    { label: "Total received", amount: summary.totalPaise, count: summary.paymentCount, tone: "total" },
    { label: "Cash", amount: summary.cashPaise, count: summary.cashCount, tone: "cash" },
    { label: "Digital / online", amount: summary.onlinePaise, count: summary.onlineCount, tone: "digital" },
    { label: "Cheque", amount: summary.chequePaise, count: summary.chequeCount, tone: "cheque" },
    { label: "Other", amount: summary.otherPaise, count: summary.otherCount, tone: "other" },
  ] : [];
  const firstRecord = data && data.total > 0 ? data.offset + 1 : 0;
  const lastRecord = data ? Math.min(data.offset + data.payments.length, data.total) : 0;

  return (
    <section id="collections" className="surface fee-collection-report" aria-labelledby="fee-collection-report-title">
      <header className="fee-report-header">
        <div className="fee-report-heading">
          <p className="fee-report-kicker"><span aria-hidden="true" /> Daily ledger</p>
          <h2 id="fee-collection-report-title">Collection insights</h2>
          <p className="fee-report-description">Payments recorded on the date the school received them.</p>
        </div>
        <div className="fee-report-controls">
          <label className="fee-date-field">
            <span>Collection date</span>
            <input
              className="field"
              type="date"
              value={date}
              max={schoolDateToday()}
              onChange={(event) => {
                if (!event.target.value) return;
                setDate(event.target.value);
                setClassId("");
                setSectionId("");
                setChannel("");
                setOffset(0);
              }}
            />
          </label>
          <label className="fee-filter-field">
            <span>Class</span>
            <select
              className="field"
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setSectionId("");
                setOffset(0);
              }}
              disabled={classes.isLoading || classes.isError}
            >
              <option value="">All classes</option>
              {(classes.data?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="fee-filter-field">
            <span>Section</span>
            <select
              className="field"
              value={sectionId}
              onChange={(event) => {
                setSectionId(event.target.value);
                setOffset(0);
              }}
              disabled={!classId || sections.isLoading || sections.isError}
            >
              <option value="">{classId ? "All sections" : "Choose a class"}</option>
              {(sections.data?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="fee-filter-field">
            <span>Payment channel</span>
            <select
              className="field"
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value as GetFeeCollectionsChannel | "");
                setOffset(0);
              }}
            >
              <option value="">All channels</option>
              <option value="cash">Cash</option>
              <option value="online">Digital / online</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
              <option value="test">Test payment</option>
            </select>
          </label>
          <button className="btn btn-muted fee-refresh-button" type="button" onClick={() => void report.refetch()} disabled={report.isFetching}>
            <span aria-hidden="true" className={report.isFetching ? "fee-refresh-mark is-refreshing" : "fee-refresh-mark"}>↻</span>
            {report.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {(classes.isError || (classId && sections.isError)) && (
        <div className="fee-filter-error" role="alert">
          <span>Class and section filter options could not be loaded.</span>
          <button
            className="btn btn-muted"
            type="button"
            onClick={() => {
              if (classes.isError) void classes.refetch();
              if (classId && sections.isError) void sections.refetch();
            }}
          >
            Retry filters
          </button>
        </div>
      )}

      {report.isError ? (
        <div className="fee-report-state fee-report-error" role="alert">
          <strong>Collection details are unavailable.</strong>
          <span>Refresh the report to try again.</span>
          <button className="btn btn-muted" type="button" onClick={() => void report.refetch()} disabled={report.isFetching}>
            {report.isFetching ? "Refreshing…" : "Try again"}
          </button>
        </div>
      ) : report.isLoading || !summary ? (
        <div className="fee-report-loading" aria-label="Loading daily collections" aria-busy="true">
          <div className="fee-summary-grid">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton fee-summary-skeleton" />)}
          </div>
          <div className="skeleton fee-table-skeleton" />
        </div>
      ) : (
        <div className="fee-report-body" aria-busy={report.isFetching}>
          <div className="fee-summary-grid" aria-label="Collection totals">
            {cards.map((card) => (
              <article key={card.label} className={`fee-summary-card fee-summary-${card.tone}`}>
                <p className="fee-summary-label">{card.label}</p>
                <p className="fee-summary-amount">{money(card.amount)}</p>
                <p className="fee-summary-count">{card.count} payment{card.count === 1 ? "" : "s"}</p>
              </article>
            ))}
          </div>

          <p className="fee-summary-context" role="status">
            {hasFilters
              ? <>Filtered totals for {activeFilters.join(" · ")}. Whole day: {money(wholeDaySummary!.totalPaise)} across {wholeDaySummary!.paymentCount} payment{wholeDaySummary!.paymentCount === 1 ? "" : "s"}.</>
              : <>Whole-day totals for {data.date}.</>}
          </p>

          {summary.testPaise > 0 && (
            <p className="fee-test-note">
              {money(summary.testPaise)} from {summary.testCount} mock/test payment{summary.testCount === 1 ? "" : "s"} is shown separately and is not included in digital / online totals.
            </p>
          )}

          <div className="fee-payment-heading">
            <div>
              <p className="fee-report-kicker"><span aria-hidden="true" /> Transaction register</p>
              <h3>Payment details</h3>
              <p className="fee-payment-meta">
                {data.date} <span aria-hidden="true">·</span> {data.total} {hasFilters ? "matching " : ""}payment{data.total === 1 ? "" : "s"}
              </p>
            </div>
            {data.total > pageSize && (
              <span className="fee-record-range">Showing <strong>{firstRecord}–{lastRecord}</strong> of {data.total}</span>
            )}
          </div>

          {data.payments.length === 0 ? (
            <div className="fee-report-empty" role="status">
              <span className="fee-empty-mark" aria-hidden="true">—</span>
              <strong>No payments recorded</strong>
              <span>{hasFilters ? "No payments match the selected filters." : "There are no collection entries for this date."}</span>
            </div>
          ) : (
            <>
              <div className="fee-table-wrap">
                <table className="fee-payment-table">
                  <caption className="sr-only">Fee payments received on {data.date}</caption>
                  <thead>
                  <tr>
                    <th scope="col">Receipt</th>
                    <th scope="col">Student</th>
                    <th scope="col">Class / section</th>
                    <th scope="col">Invoice</th>
                    <th scope="col">Method / channel</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Collected by</th>
                    <th scope="col" className="fee-amount-column">Amount</th>
                  </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td data-label="Receipt">
                          <Link className="fee-receipt-link" href={`/fees/receipts/${encodeURIComponent(payment.receiptNumber)}`}>
                          {payment.receiptNumber}
                          </Link>
                          <span className="fee-cell-secondary">{payment.paymentDate}</span>
                        </td>
                        <td data-label="Student"><span className="fee-cell-primary">{payment.studentName}</span></td>
                        <td data-label="Class / section">{payment.className} <span className="fee-inline-separator">·</span> {payment.sectionName}</td>
                        <td data-label="Invoice">
                          <span className="fee-cell-primary">{payment.invoiceNumber}</span>
                          <span className="fee-cell-secondary fee-description" title={payment.description}>{payment.description}</span>
                        </td>
                        <td data-label="Method / channel">
                          <span className="fee-cell-primary">{methodLabel[payment.paymentMethod] ?? payment.paymentMethod}</span>
                          <span className="fee-channel">{channelLabel[payment.channel] ?? payment.channel}</span>
                        </td>
                        <td data-label="Reference" className="fee-reference">{payment.paymentReference || "—"}</td>
                        <td data-label="Collected by">{payment.collectorName || (payment.channel === "online" ? "Online gateway" : "—")}</td>
                        <td data-label="Amount" className="fee-amount">{money(payment.amountPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="fee-payment-cards" aria-label="Payment details">
                {data.payments.map((payment) => (
                  <article className="fee-payment-card" key={`mobile-${payment.id}`}>
                    <div className="fee-mobile-payment-top">
                      <div>
                        <span className="fee-mobile-caption">Student</span>
                        <strong>{payment.studentName}</strong>
                        <span className="fee-cell-secondary">{payment.className} · {payment.sectionName}</span>
                      </div>
                      <strong className="fee-mobile-amount">{money(payment.amountPaise)}</strong>
                    </div>
                    <dl className="fee-mobile-details">
                      <div><dt>Receipt</dt><dd><Link className="fee-receipt-link" href={`/fees/receipts/${encodeURIComponent(payment.receiptNumber)}`}>{payment.receiptNumber}</Link><span>{payment.paymentDate}</span></dd></div>
                      <div><dt>Invoice</dt><dd><strong>{payment.invoiceNumber}</strong><span title={payment.description}>{payment.description}</span></dd></div>
                      <div><dt>Method / channel</dt><dd><strong>{methodLabel[payment.paymentMethod] ?? payment.paymentMethod}</strong><span>{channelLabel[payment.channel] ?? payment.channel}</span></dd></div>
                      <div><dt>Reference</dt><dd>{payment.paymentReference || "—"}</dd></div>
                      <div><dt>Collected by</dt><dd>{payment.collectorName || (payment.channel === "online" ? "Online gateway" : "—")}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}

          {data.total > pageSize && (
            <nav className="fee-pagination" aria-label="Collection report pages">
              <button className="btn btn-muted" type="button" disabled={offset === 0 || report.isFetching} onClick={() => setOffset(Math.max(0, offset - pageSize))}>
                Previous
              </button>
              <span aria-live="polite"><strong>{firstRecord}–{lastRecord}</strong> of {data.total}</span>
              <button className="btn btn-muted" type="button" disabled={offset + pageSize >= data.total || report.isFetching} onClick={() => setOffset(offset + pageSize)}>
                Next
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
