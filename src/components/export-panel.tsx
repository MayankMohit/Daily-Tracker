"use client";

// Data export UI (plan §6, §7): pick a date range + format, download CSV/JSON.
// Hits /api/export which streams a file download.

import { useState } from "react";
import { Card, Field, inputClass, Button } from "./ui";
import { todayKey, lastNDays } from "@/lib/date";
import { useOnline } from "@/lib/use-online";
import { OfflineNotice } from "./offline-notice";

export function ExportPanel() {
  const [from, setFrom] = useState(lastNDays(30)[0]);
  const [to, setTo] = useState(todayKey());
  const online = useOnline();

  function download(format: "csv" | "json") {
    const url = `/api/export?format=${format}&from=${from}&to=${to}`;
    // Let the browser handle the attachment download.
    window.location.href = url;
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Data export</h3>
        <p className="text-xs text-muted">
          Download your task, mood, journal, and activity history.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input
            className={inputClass}
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            className={inputClass}
            type="date"
            value={to}
            min={from}
            max={todayKey()}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      {!online && <OfflineNotice feature="Data export" />}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => download("csv")} disabled={!online}>
          Export CSV
        </Button>
        <Button variant="secondary" onClick={() => download("json")} disabled={!online}>
          Export JSON
        </Button>
      </div>
    </Card>
  );
}
