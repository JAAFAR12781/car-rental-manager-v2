import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

/*
  Full Car Rental Tracker (localStorage)
  - records saved to localStorage (key: rental_records_v1)
  - features:
    * add record (customer, matricule, startDate, endDate, pricePerDay)
    * auto-calc days & total
    * filters by year and month
    * monthly income chart (per selected year)
    * per-car income share (selected year)
    * yearly utilization % (days / 365)
    * export visible records to CSV
*/

const STORAGE_KEY = "rental_records_v1";

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s) || isNaN(e)) return 0;
  // inclusive days (if same day counts as 1)
  const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff + 1 : 0;
}

function monthNameFromDateString(dateStr, short = true) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  return d.toLocaleString("default", { month: short ? "short" : "long" });
}

export default function App() {
  const [records, setRecords] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {}
  }, [records]);

  const [form, setForm] = useState({
    customer: "",
    matricule: "",
    startDate: "",
    endDate: "",
    pricePerDay: "",
    year: "",
  });

  // Filters
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");

  // UI helpers
  const yearsAvailable = useMemo(() => {
    const ys = new Set(records.map((r) => String(r.year)));
    return Array.from(ys).filter(Boolean).sort();
  }, [records]);

  // Add record
  function handleAddRecord(e) {
    e?.preventDefault();
    const { customer, matricule, startDate, endDate, pricePerDay, year } = form;
    if (!customer || !matricule || !startDate || !endDate || !pricePerDay || !year) {
      alert("Please fill all fields");
      return;
    }

    const days = daysBetween(startDate, endDate);
    const total = days * safeNumber(pricePerDay);

    const newRec = {
      id: Date.now(),
      customer,
      matricule,
      startDate,
      endDate,
      pricePerDay: safeNumber(pricePerDay),
      days,
      total,
      year: String(year),
    };

    setRecords((r) => [newRec, ...r]);
    setForm({
      customer: "",
      matricule: "",
      startDate: "",
      endDate: "",
      pricePerDay: "",
      year: "",
    });
  }

  function handleDelete(id) {
    if (!window.confirm("Delete this record?")) return;
    setRecords((r) => r.filter((x) => x.id !== id));
  }

  // Filtered view
  const filtered = useMemo(() => {
    return records.filter((r) => {
      const recMonth = monthNameFromDateString(r.startDate, false); // full month name
      const matchYear = !filterYear || r.year === filterYear;
      const matchMonth = !filterMonth || recMonth === filterMonth;
      return matchYear && matchMonth;
    });
  }, [records, filterYear, filterMonth]);

  // Monthly data for selected year (for chart)
  const monthlyByYear = useMemo(() => {
    // choose year: filterYear or the most recent year available
    const yearToUse = filterYear || (yearsAvailable.length ? yearsAvailable[0] : "");
    const map = {}; // key: monthShort -> income
    records.forEach((r) => {
      if (!r.startDate) return;
      if (yearToUse && String(r.year) !== String(yearToUse)) return;
      const mShort = monthNameFromDateString(r.startDate, true) || "";
      map[mShort] = (map[mShort] || 0) + safeNumber(r.total);
    });
    // ensure months order Jan..Dec (show only months that exist OR all months if you want)
    const monthsOrder = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const data = monthsOrder.map((m) => ({ month: m, income: Number((map[m] || 0).toFixed(2)) }));
    return { year: yearToUse, data };
  }, [records, filterYear, yearsAvailable]);

  // Per-car income share for selected year
  const carShareByYear = useMemo(() => {
    const yearToUse = filterYear || (yearsAvailable.length ? yearsAvailable[0] : "");
    const map = {}; // matricule -> income
    records.forEach((r) => {
      if (yearToUse && String(r.year) !== String(yearToUse)) return;
      const key = r.matricule || "Unknown";
      map[key] = (map[key] || 0) + safeNumber(r.total);
    });
    const arr = Object.entries(map).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
    return arr;
  }, [records, filterYear, yearsAvailable]);

  // Yearly utilization (days / 365)
  const yearlyUtilization = useMemo(() => {
    const map = {}; // year -> {usedDays}
    records.forEach((r) => {
      const y = String(r.year || new Date(r.startDate).getFullYear());
      map[y] = map[y] || { usedDays: 0, year: y };
      map[y].usedDays += safeNumber(r.days);
    });
    const arr = Object.values(map)
      .map((o) => ({
        year: o.year,
        usage: Number(Math.min(((o.usedDays / 365) * 100), 100).toFixed(1)),
      }))
      .sort((a,b)=>a.year.localeCompare(b.year));
    return arr;
  }, [records]);

  // Export CSV (filtered records)
  function exportCSV() {
    const header = ["customer","matricule","startDate","endDate","days","pricePerDay","total","year"];
    const rows = filtered.map(r => [
      r.customer,
      r.matricule,
      r.startDate,
      r.endDate,
      r.days,
      r.pricePerDay,
      r.total,
      r.year
    ]);
    const csv = [header, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rental_export_${filterYear || "all"}_${filterMonth || "all"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Colors for pie
  const COLORS = ["#007bff","#28a745","#ffc107","#dc3545","#17a2b8","#6f42c1","#20c997"];

  return (
    <div className="app-shell">
      <h1>🚗 Car Rental Manager</h1>

      <section className="controls">
        <form onSubmit={handleAddRecord} className="form-grid">
          <input
            name="customer"
            placeholder="Customer name"
            value={form.customer}
            onChange={e=>setForm({...form,customer:e.target.value})}
          />
          <input
            name="matricule"
            placeholder="Car matricule (plate)"
            value={form.matricule}
            onChange={e=>setForm({...form,matricule:e.target.value})}
          />
          <input
            name="startDate"
            type="date"
            value={form.startDate}
            onChange={e=>setForm({...form,startDate:e.target.value})}
          />
          <input
            name="endDate"
            type="date"
            value={form.endDate}
            onChange={e=>setForm({...form,endDate:e.target.value})}
          />
          <input
            name="pricePerDay"
            type="number"
            placeholder="Price per day (DH)"
            value={form.pricePerDay}
            onChange={e=>setForm({...form,pricePerDay:e.target.value})}
          />
          <input
            name="year"
            type="number"
            placeholder="Year (e.g. 2025)"
            value={form.year}
            onChange={e=>setForm({...form,year:e.target.value})}
          />
          <div style={{display:"flex",gap:8}}>
            <button type="submit" className="btn-primary">Add Record</button>
            <button type="button" className="btn-ghost" onClick={()=>setForm({customer:"",matricule:"",startDate:"",endDate:"",pricePerDay:"",year:""})}>Clear</button>
          </div>
        </form>

        <div className="filter-row">
          <label>
            Year:
            <select value={filterYear} onChange={e=>setFilterYear(e.target.value)}>
              <option value="">All</option>
              {yearsAvailable.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>

          <label>
            Month:
            <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}>
              <option value="">All</option>
              {["January","February","March","April","May","June","July","August","September","October","November","December"]
                .map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <button className="btn-export" onClick={exportCSV}>Export CSV (visible)</button>
        </div>
      </section>

      <section className="main-grid">
        <div className="list-panel">
          <h2>Records ({filtered.length})</h2>
          {filtered.length === 0 && <p className="muted">No records for current filters.</p>}
          <div className="cards">
            {filtered.map(r => (
              <div className="card" key={r.id}>
                <div className="card-row">
                  <strong>{r.customer}</strong>
                  <span className="muted">#{r.matricule}</span>
                </div>
                <div className="card-row small">
                  <span>{r.startDate} → {r.endDate}</span>
                  <span>{r.days} day(s)</span>
                </div>
                <div className="card-row">
                  <span>Price/day: <strong>{safeNumber(r.pricePerDay).toFixed(2)} DH</strong></span>
                  <span>Total: <strong>{safeNumber(r.total).toFixed(2)} DH</strong></span>
                </div>
                <div className="card-actions">
                  <button className="btn-delete" onClick={()=>handleDelete(r.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="charts-panel">
          <div className="chart-card">
            <h3>Monthly Income {monthlyByYear.year ? `— ${monthlyByYear.year}` : ""}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyByYear.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month"/>
                <YAxis/>
                <Tooltip/>
                <Legend />
                <Bar dataKey="income" fill="#007bff" name="Income DH"/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h3>Per-Car Income Share {filterYear ? `— ${filterYear}` : ""}</h3>
            {carShareByYear.length === 0 ? <p className="muted">No data</p> : (
              <ResponsiveContainer width="100%" height={225}>
                <PieChart>
                  <Pie data={carShareByYear} dataKey="value" nameKey="name" outerRadius={80} label>
                    {carShareByYear.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip/>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="chart-card">
            <h2>Yearly Utilization (%)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={yearlyUtilization}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year"/>
                <YAxis/>
                <Tooltip/>
                <Legend/>
                <Line type="monotone" dataKey="usage" stroke="#28a745" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <footer className="footer">
        <small>Data saved locally in your browser (localStorage).</small>
      </footer>
    </div>
  );
}
