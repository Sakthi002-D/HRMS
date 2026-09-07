function ReportChart({ title, labels, series, type = "bars" }) {
  return (
    <section className={`report-chart report-chart-${type}`}>
      <div className="report-chart-heading">
        <h2>{title}</h2>
        <select aria-label={`${title} period`} defaultValue="year">
          <option value="year">This Year</option>
          <option value="month">This Month</option>
        </select>
      </div>
      <div className="report-chart-legend">
        {series.map((item) => (
          <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>
        ))}
      </div>
      <div className="report-chart-area">
        <div className="report-chart-grid" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="report-chart-bars">
          {labels.map((label, index) => (
            <div className="report-chart-column" key={label}>
              <div className="report-chart-values">
                {series.map((item) => <b key={item.name} style={{ height: `${item.values[index] || 0}%`, background: item.color }} />)}
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ReportChart;
