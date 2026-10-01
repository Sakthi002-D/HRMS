// Same footer as the landing page, for the public Careers pages.
import "../../pages/Home.css";

function CareersFooter() {
    return (
        <footer className="footer">
            <div className="footer-logo">
                <img src="/shelter logo.png" alt="Shelter Group" />
            </div>
            <p>© 2026 Shelter Group. All rights reserved.</p>
            <p>Careers at Shelter Group</p>
        </footer>
    );
}

export default CareersFooter;
