import { useEffect } from "react";

// Locks page scroll while any modal or dialog is open. A counter lets a dialog
// open on top of a modal: the page unlocks only when the last one closes.
let openCount = 0;
let previousOverflow = "";

export default function useScrollLock(active) {
    useEffect(() => {
        if (!active) return undefined;
        if (openCount === 0) {
            previousOverflow = document.documentElement.style.overflow;
            document.documentElement.style.overflow = "hidden";
        }
        openCount += 1;
        return () => {
            openCount -= 1;
            if (openCount === 0) document.documentElement.style.overflow = previousOverflow;
        };
    }, [active]);
}
