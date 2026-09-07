import "./SearchBar.css";
import { Search } from "lucide-react";

function SearchBar({ value, onChange, placeholder = "Search...", id }) {
  return (
    <div className="search-bar">
      <Search className="search-bar-icon" size={17} aria-hidden="true" />
      <input
        type="text"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export default SearchBar;