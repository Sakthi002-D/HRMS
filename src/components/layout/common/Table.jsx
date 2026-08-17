
import "./Table.css";

function Table({ columns, data }) {
  return (
    <table className="common-table">

      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {data.map((row, index) => (
          <tr key={row.id || index}>

            {columns.map((column) => (
              <td key={column.key}>
                {column.render
                  ? column.render(row)
                : row[column.key]}
              </td>
            ))}

          </tr>
        ))}
      </tbody>

    </table>
  );
}

export default Table;