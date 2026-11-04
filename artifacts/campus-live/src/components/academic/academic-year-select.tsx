"use client";

import type { AcademicYear } from "@workspace/api-client-react";

type AcademicYearSelectProps = {
  label: string;
  items: AcademicYear[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export function AcademicYearSelect({
  label,
  items,
  value,
  onChange,
  required = true,
  disabled = false,
  placeholder = "Select an academic year",
}: AcademicYearSelectProps) {
  return (
    <label className="text-xs font-semibold">
      {label}
      <select
        className="field mt-1.5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
      >
        <option value="">{items.length ? placeholder : "Set up an academic year first"}</option>
        {items.map((item) => (
          <option key={item.id} value={item.academicYear}>
            {item.academicYear}{item.status === "current" ? " · Current" : item.status === "planned" ? " · Planned" : " · Completed"}
          </option>
        ))}
      </select>
    </label>
  );
}
