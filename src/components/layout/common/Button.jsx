import "./Button.css"
function Button({ children, onClick,type = "button", variant = "primary" }) {
    return(
        <button
        type={type}
        className={`common-btn ${variant}`} 
        onClick={onClick}
        >
            {children}
        </button>
    );
}

export default Button;