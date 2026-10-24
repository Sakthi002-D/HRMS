import "./Button.css"
function Button({ children, onClick,type = "button", variant = "primary", disabled = false }) {
    return(
        <button
        type={type}
        className={`common-btn ${variant}`} 
        onClick={onClick}
        disabled={disabled}
        >
            {children}
        </button>
    );
}

export default Button;