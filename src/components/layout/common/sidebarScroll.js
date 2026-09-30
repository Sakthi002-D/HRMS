// Scrolls a sidebar menu container (not the page) so its active item is visible.
export function scrollActiveIntoView(container, activeSelector) {
  const active = container?.querySelector(activeSelector);
  if (!active) return;
  const box = container.getBoundingClientRect();
  const item = active.getBoundingClientRect();
  if (item.top < box.top) container.scrollTop -= box.top - item.top;
  else if (item.bottom > box.bottom) container.scrollTop += item.bottom - box.bottom;
}
