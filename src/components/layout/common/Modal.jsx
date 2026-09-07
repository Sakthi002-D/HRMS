import "./Modal.css";

function Modal ({ isOpen, onClose, title, children, closeOnOverlayClick = true }) {
    if (!isOpen) {
        return null;
    }


return(
<div
    className="modal-overlay"
    onClick={closeOnOverlayClick ? onClose : undefined}
>
        <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        >
            <div className="modal-header">
                <h2>{title}</h2>

            <button
            className="modal-close"
            onClick={onClose}
            >
                x
            </button>
        </div>
        
            <div className="modal-body">
            {children}
            </div>
        </div>
    </div>
 );
}

export default Modal;